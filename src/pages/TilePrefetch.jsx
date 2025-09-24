import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Rectangle, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/*
Dev utility page to prefetch map raster tiles for an airport's bounding box.
- Enter ICAO
- Fetch airport metadata (bbox_* fields) from https://v2.stopbars.com/airports?icao=XXXX
- For zoom levels 14..19 compute all tile x/y covering bbox
- Prefetch from https://maps.stopbars.com/{z}/{x}/{y}.png (HEAD first optional skip; we'll just GET)
- Show counts, progress, errors. Allow cancel.
THIS IS A DEV PAGE; keep out of production nav.
*/

const ZOOMS = [14, 15, 16, 17, 18, 19];

// Convert lat/lon to XYZ tile numbers (slippy tiles)
function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
function lat2tile(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

const concurrencyDefault = 15;

const TilePrefetch = () => {
  // Raw multi-ICAO input (comma/space separated)
  const [icaoInput, setIcaoInput] = useState('');
  // Airports array: each { code, data, status, tiles, zoomBboxes, progress:{completed,total,errors}, fetchMetaError }
  const [airports, setAirports] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [metaError, setMetaError] = useState(''); // global meta error summary
  const [globalStatus, setGlobalStatus] = useState('idle'); // idle|ready|running|canceled|done
  const controllerRef = useRef({ canceled: false });
  const [concurrency, setConcurrency] = useState(concurrencyDefault);
  const [maxShrinkPercent, setMaxShrinkPercent] = useState(15);
  const [fetchOrder, setFetchOrder] = useState('low-first'); // 'high-first' | 'low-first'
  const [autoFollow, setAutoFollow] = useState(true);
  const [selectedAirportIndex, setSelectedAirportIndex] = useState(null); // for map preview
  const [selectedZoom, setSelectedZoom] = useState(Math.max(...ZOOMS));
  const currentFetchingZoomRef = useRef(null);
  const zoomPendingRef = useRef({}); // per-airport? (reused per active prefetch)
  const mapRef = useRef(null);
  const [initialFitted, setInitialFitted] = useState(false);
  const prefetchIndexRef = useRef(-1); // current airport index during run
  const globalStartRef = useRef(null); // timestamp when overall prefetch started
  const [tick, setTick] = useState(0); // heartbeat to update ETA every second
  // Memory / network tuning
  const [useHead, setUseHead] = useState(false); // attempt HEAD instead of full GET for tiles
  const [retainFinishedTiles, setRetainFinishedTiles] = useState(false); // keep tile objects after airport completes
  const [memoryNotes, setMemoryNotes] = useState([]); // array of strings

  // Cap for rectangles drawn (to avoid UI freeze when bbox is large at high zoom)
  const MAX_RECTANGLES = 2000;

  // Derived helpers
  const activeAirport = selectedAirportIndex != null ? airports[selectedAirportIndex] : null;
  const activeTiles = activeAirport?.tiles || [];
  const zoomBboxes = activeAirport?.zoomBboxes || {};
  const now = Date.now();

  // Utility to clamp

  // Build tiles for a single airport metadata object
  const buildTilesForAirport = useCallback(
    (airportData) => {
      if (!airportData) return { tiles: [], zoomBboxes: {} };
      const { bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon } = airportData;
      const list = [];
      const minZoom = Math.min(...ZOOMS);
      const maxZoom = Math.max(...ZOOMS);
      const maxShrinkFraction = clamp(maxShrinkPercent / 100, 0, 0.9);
      const zb = {};
      ZOOMS.forEach((z) => {
        const progress = (z - minZoom) / (maxZoom - minZoom || 1);
        const shrinkFrac = maxShrinkFraction * progress;
        const latSpan = bbox_max_lat - bbox_min_lat;
        const lonSpan = bbox_max_lon - bbox_min_lon;
        const latPad = (latSpan * shrinkFrac) / 2;
        const lonPad = (lonSpan * shrinkFrac) / 2;
        const shrMinLat = bbox_min_lat + latPad;
        const shrMaxLat = bbox_max_lat - latPad;
        const shrMinLon = bbox_min_lon + lonPad;
        const shrMaxLon = bbox_max_lon - lonPad;
        zb[z] = { minLat: shrMinLat, maxLat: shrMaxLat, minLon: shrMinLon, maxLon: shrMaxLon };
        const minX = lon2tile(shrMinLon, z);
        const maxX = lon2tile(shrMaxLon, z);
        const minY = lat2tile(shrMaxLat, z);
        const maxY = lat2tile(shrMinLat, z);
        const maxIndex = Math.pow(2, z) - 1;
        for (let x = clamp(minX, 0, maxIndex); x <= clamp(maxX, 0, maxIndex); x++) {
          for (let y = clamp(minY, 0, maxIndex); y <= clamp(maxY, 0, maxIndex); y++) {
            list.push({
              z,
              x,
              y,
              url: `https://maps.stopbars.com/${z}/${x}/${y}.png`,
              status: 'pending',
            });
          }
        }
      });
      list.sort((a, b) => {
        if (fetchOrder === 'high-first') return b.z - a.z || a.x - b.x || a.y - b.y;
        return a.z - b.z || a.x - b.x || a.y - b.y;
      });
      return { tiles: list, zoomBboxes: zb };
    },
    [maxShrinkPercent, fetchOrder]
  );

  const fetchAirports = useCallback(async () => {
    const codes = Array.from(
      new Set(
        icaoInput
          .split(/[,\s]+/)
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)
      )
    );
    if (!codes.length) return;
    setLoadingMeta(true);
    setMetaError('');
    controllerRef.current.canceled = false;
    try {
      const results = await Promise.allSettled(
        codes.map(async (code) => {
          const resp = await fetch(
            `https://v2.stopbars.com/airports?icao=${encodeURIComponent(code)}`
          );
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          if (!data || !data.bbox_min_lat) throw new Error('No bbox in response');
          return { code, data };
        })
      );
      const built = results.map((r, idx) => {
        if (r.status === 'fulfilled') {
          const { tiles, zoomBboxes } = buildTilesForAirport(r.value.data);
          return {
            code: r.value.code,
            data: r.value.data,
            tiles,
            zoomBboxes,
            status: 'ready',
            fetchMetaError: '',
            progress: { completed: 0, total: tiles.length, errors: 0 },
          };
        } else {
          return {
            code: codes[idx],
            data: null,
            tiles: [],
            zoomBboxes: {},
            status: 'error',
            fetchMetaError: r.reason?.message || 'Meta fetch failed',
            progress: { completed: 0, total: 0, errors: 0 },
          };
        }
      });
      // Sort by largest tile count descending so biggest jobs appear first
      built.sort((a, b) => (b.progress.total || 0) - (a.progress.total || 0));
      setAirports(built);
      setSelectedAirportIndex(built.findIndex((a) => a.status === 'ready') || 0);
      setSelectedZoom(fetchOrder === 'high-first' ? Math.max(...ZOOMS) : Math.min(...ZOOMS));
      setGlobalStatus('ready');
      setInitialFitted(false);
      const errs = built.filter((b) => b.status === 'error');
      if (errs.length) setMetaError(`${errs.length} airport(s) failed to load.`);
    } catch (e) {
      setMetaError(e.message || 'Unknown error');
      setAirports([]);
      setGlobalStatus('idle');
    } finally {
      setLoadingMeta(false);
    }
  }, [icaoInput, buildTilesForAirport, fetchOrder]);

  // Rebuild tiles for all airports when shrink/order changes if not running
  useEffect(() => {
    if (globalStatus === 'running') return; // avoid mutating mid-run
    if (!airports.length) return;
    setAirports((prev) =>
      // Recompute tiles then sort again by descending size
      prev
        .map((a) => {
          if (!a.data || a.status === 'error') return a;
          const { tiles, zoomBboxes } = buildTilesForAirport(a.data);
          return {
            ...a,
            tiles,
            zoomBboxes,
            progress: { completed: 0, total: tiles.length, errors: 0 },
            status: 'ready',
          };
        })
        .sort((a, b) => (b.progress.total || 0) - (a.progress.total || 0))
    );
    setInitialFitted(false);
  }, [airports.length, buildTilesForAirport, globalStatus, maxShrinkPercent, fetchOrder]);

  const prefetchOneAirport = useCallback(
    async (airportIdx) => {
      const airportObj = airports[airportIdx];
      if (!airportObj || !airportObj.tiles.length || airportObj.status !== 'ready') return;
      // Initialize per-airport zoom pending
      const pendingCounts = {};
      ZOOMS.forEach((z) => {
        pendingCounts[z] = airportObj.tiles.filter((t) => t.z === z).length;
      });
      zoomPendingRef.current = pendingCounts;
      currentFetchingZoomRef.current =
        fetchOrder === 'high-first' ? Math.max(...ZOOMS) : Math.min(...ZOOMS);
      if (autoFollow && selectedAirportIndex === airportIdx) {
        setSelectedZoom(currentFetchingZoomRef.current);
      }
      // Mark airport as prefetching
      setAirports((prev) =>
        prev.map((a, i) => (i === airportIdx ? { ...a, status: 'prefetching' } : a))
      );
      // Set start time if not already
      setAirports((prev) =>
        prev.map((a, i) => (i === airportIdx ? { ...a, startedAt: a.startedAt || Date.now() } : a))
      );
      let completed = 0;
      let errors = 0;
      const total = airportObj.tiles.length;
      const queue = [...airportObj.tiles];
      const workers = Math.max(1, Math.min(concurrency, 64));
      const runOne = async () => {
        if (controllerRef.current.canceled) return;
        const item = queue.shift();
        if (!item) return;
        try {
          const method = useHead ? 'HEAD' : 'GET';
          const resp = await fetch(item.url, { cache: 'no-cache', method });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        } catch {
          errors++;
          item.status = 'error';
        } finally {
          if (item.status !== 'error') item.status = 'ok';
          completed++;
          if (zoomPendingRef.current[item.z] != null) {
            zoomPendingRef.current[item.z] -= 1;
            if (zoomPendingRef.current[item.z] === 0) {
              const remainingZoom = ZOOMS.filter((z) => zoomPendingRef.current[z] > 0).sort(
                (a, b) => (fetchOrder === 'high-first' ? b - a : a - b)
              )[0];
              currentFetchingZoomRef.current = remainingZoom || null;
              if (autoFollow && remainingZoom && selectedAirportIndex === airportIdx) {
                setSelectedZoom(remainingZoom);
              }
            }
          }
          if (completed % 50 === 0 || completed === total) {
            setAirports((prev) =>
              prev.map((a, i) =>
                i === airportIdx ? { ...a, progress: { completed, total, errors } } : a
              )
            );
          }
        }
        if (!controllerRef.current.canceled && queue.length) return runOne();
      };
      const promises = Array.from({ length: workers }, () => runOne());
      await Promise.all(promises);
      setAirports((prev) =>
        prev.map((a, i) =>
          i === airportIdx
            ? {
                ...a,
                status: controllerRef.current.canceled ? 'canceled' : 'done',
                progress: { completed, total, errors },
                finishedAt: Date.now(),
                // Optionally prune tile objects to free memory if not selected
                tiles: retainFinishedTiles || selectedAirportIndex === airportIdx ? a.tiles : [],
              }
            : a
        )
      );
      if (!retainFinishedTiles && selectedAirportIndex !== airportIdx) {
        setMemoryNotes((prev) => [
          ...prev.slice(-4),
          `Pruned tiles for ${airportObj.code} (${total.toLocaleString()} objects)`,
        ]);
      }
    },
    [
      airports,
      concurrency,
      autoFollow,
      fetchOrder,
      selectedAirportIndex,
      retainFinishedTiles,
      useHead,
    ]
  );

  const startPrefetch = useCallback(async () => {
    if (!airports.length || globalStatus === 'running') return;
    const anyReady = airports.some((a) => a.status === 'ready');
    if (!anyReady) return;
    controllerRef.current.canceled = false;
    globalStartRef.current = Date.now();
    setGlobalStatus('running');
    for (let i = 0; i < airports.length; i++) {
      if (controllerRef.current.canceled) break;
      prefetchIndexRef.current = i;
      if (airports[i].status === 'ready') {
        await prefetchOneAirport(i); // sequential
      }
    }
    setGlobalStatus(controllerRef.current.canceled ? 'canceled' : 'done');
  }, [airports, globalStatus, prefetchOneAirport]);

  // Sync map zoom when selectedZoom changes under auto-follow
  useEffect(() => {
    if (!mapRef.current) return;
    if (!autoFollow) return;
    // attempt gentle zoom without changing center drastically
    try {
      const currentZoom = mapRef.current.getZoom();
      if (Math.abs(currentZoom - selectedZoom) > 0.2) {
        mapRef.current.setZoom(selectedZoom, { animate: false });
      }
    } catch {
      /* ignore */
    }
  }, [selectedZoom, autoFollow]);

  const cancel = () => {
    controllerRef.current.canceled = true;
  };

  const resetAll = () => {
    controllerRef.current.canceled = true;
    setGlobalStatus('idle');
    setAirports([]);
    setSelectedAirportIndex(null);
    setSelectedZoom(Math.max(...ZOOMS));
    setInitialFitted(false);
  };

  // Global aggregated progress
  const aggregate = airports.reduce(
    (acc, a) => {
      acc.total += a.progress.total;
      acc.completed += a.progress.completed;
      acc.errors += a.progress.errors;
      return acc;
    },
    { completed: 0, total: 0, errors: 0 }
  );
  const pct = aggregate.total ? ((aggregate.completed / aggregate.total) * 100).toFixed(1) : '0.0';
  const elapsedSec = globalStartRef.current ? (now - globalStartRef.current) / 1000 : 0;
  const rate = elapsedSec > 0 ? aggregate.completed / elapsedSec : 0;
  const remaining = aggregate.total - aggregate.completed;
  const etaSec = rate > 0 ? remaining / rate : 0;

  function formatDuration(sec) {
    if (!isFinite(sec) || sec <= 0) return '0s';
    const s = Math.floor(sec % 60);
    const m = Math.floor((sec / 60) % 60);
    const h = Math.floor(sec / 3600);
    const parts = [];
    if (h) parts.push(h + 'h');
    if (m) parts.push(m + 'm');
    if (s || (!h && !m)) parts.push(s + 's');
    return parts.join(' ');
  }

  // Heartbeat interval while running to refresh ETA display
  useEffect(() => {
    if (globalStatus !== 'running') return; // only run during active prefetch
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, [globalStatus]);

  // Consume tick so linter recognizes usage (recalculation already happens because now is Date.now())
  useEffect(() => {
    if (tick === -1) console.log(''); // no-op
  }, [tick]);

  // Helpers for tile to lat/lon
  const tile2lon = (x, z) => (x / Math.pow(2, z)) * 360 - 180;
  const tile2lat = (y, z) => {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };

  const zoomTiles = activeTiles.filter((t) => t.z === selectedZoom);
  const zoomTilesLimited =
    zoomTiles.length > MAX_RECTANGLES ? zoomTiles.slice(0, MAX_RECTANGLES) : zoomTiles;
  const completionByZoom = ZOOMS.reduce((acc, z) => {
    const sub = activeTiles.filter((t) => t.z === z);
    const done = sub.filter((t) => t.status === 'ok').length;
    const errs = sub.filter((t) => t.status === 'error').length;
    acc[z] = { total: sub.length, done, errs };
    return acc;
  }, {});

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto text-sm text-zinc-200">
      <h1 className="text-2xl font-semibold mb-4">Tile Prefetch Dev Tool</h1>
      <div className="space-y-6">
        <section className="bg-zinc-900 border border-zinc-700 rounded p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs uppercase tracking-wide text-zinc-400 mb-1">
                ICAO Code(s)
              </label>
              <input
                value={icaoInput}
                onChange={(e) => setIcaoInput(e.target.value.toUpperCase())}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 focus:outline-none focus:border-blue-500 w-full"
                placeholder="OMDB, EGLL KJFK"
                maxLength={400}
              />
              <div className="text-[10px] text-zinc-500 mt-1">
                Enter one or many ICAO codes separated by commas or spaces.
              </div>
            </div>
            <label className="flex items-center gap-1 text-[10px] mt-4 mb-1 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-blue-500"
                checked={useHead}
                onChange={(e) => setUseHead(e.target.checked)}
                disabled={globalStatus === 'running'}
              />
              <span>Use HEAD</span>
            </label>
            <button
              onClick={fetchAirports}
              disabled={!icaoInput.trim() || loadingMeta || globalStatus === 'running'}
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                loadingMeta || !icaoInput.trim() || globalStatus === 'running'
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {loadingMeta ? 'Loading…' : 'Fetch Airports'}
            </button>
            <div>
              <label className="block text-xs uppercase tracking-wide text-zinc-400 mb-1">
                Concurrency
              </label>
              <input
                type="number"
                min={1}
                max={64}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 w-24"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-zinc-400 mb-1">
                Max Shrink % (hi zoom)
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={maxShrinkPercent}
                disabled={globalStatus === 'running'}
                onChange={(e) => setMaxShrinkPercent(clamp(Number(e.target.value) || 0, 0, 50))}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 w-28"
                title="Percentage by which the full bbox is reduced at the highest zoom level to avoid fetching edge tiles. Lower zooms shrink proportionally less."
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-zinc-400 mb-1">
                Order
              </label>
              <select
                value={fetchOrder}
                disabled={globalStatus === 'running'}
                onChange={(e) => setFetchOrder(e.target.value)}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs"
                title="Choose whether to prefetch higher zooms first or lower zooms first"
              >
                <option value="high-first">High → Low</option>
                <option value="low-first">Low → High</option>
              </select>
            </div>
            <label className="flex items-center gap-1 text-[10px] cursor-pointer select-none mt-4">
              <input
                type="checkbox"
                className="accent-blue-500"
                checked={retainFinishedTiles}
                onChange={(e) => setRetainFinishedTiles(e.target.checked)}
                disabled={globalStatus === 'running'}
              />
              <span>Retain finished tile grids</span>
            </label>
            <button
              onClick={resetAll}
              disabled={globalStatus === 'running'}
              className="px-3 py-1.5 rounded text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
          {metaError && <div className="text-red-400 text-xs pt-2">{metaError}</div>}
          {memoryNotes.length > 0 && (
            <div className="text-amber-400 text-[10px] space-y-0.5 mt-1">
              {memoryNotes.map((m, i) => (
                <div key={i}>{m}</div>
              ))}
            </div>
          )}
          {airports.length > 0 && (
            <div className="overflow-auto mt-3 max-h-56 text-[11px]">
              <table className="w-full border-collapse">
                <thead className="text-zinc-400">
                  <tr className="border-b border-zinc-700">
                    <th className="text-left py-1 pr-3 font-medium">Code</th>
                    <th className="text-left py-1 pr-3 font-medium">Name</th>
                    <th className="text-left py-1 pr-3 font-medium">Tiles</th>
                    <th className="text-left py-1 pr-3 font-medium">Done</th>
                    <th className="text-left py-1 pr-3 font-medium">Err</th>
                    <th className="text-left py-1 pr-3 font-medium">Status</th>
                    <th className="text-left py-1 pr-3 font-medium">ETA/Time</th>
                    <th className="text-left py-1 pr-3 font-medium">Select</th>
                  </tr>
                </thead>
                <tbody>
                  {airports.map((a, idx) => (
                    <tr
                      key={a.code}
                      className={`border-b border-zinc-800 hover:bg-zinc-800/40 ${
                        idx === selectedAirportIndex ? 'bg-zinc-800/60' : ''
                      }`}
                    >
                      <td className="py-1 pr-3 font-mono">{a.code}</td>
                      <td className="py-1 pr-3 truncate max-w-[180px]" title={a.data?.name || ''}>
                        {a.data?.name || '—'}
                      </td>
                      <td className="py-1 pr-3">{a.progress.total}</td>
                      <td className="py-1 pr-3 text-emerald-400">{a.progress.completed}</td>
                      <td className="py-1 pr-3 text-red-400">{a.progress.errors}</td>
                      <td className="py-1 pr-3 capitalize">{a.status}</td>
                      <td className="py-1 pr-3 font-mono">
                        {(() => {
                          if (a.status === 'prefetching' && a.startedAt) {
                            const aElapsed = (now - a.startedAt) / 1000;
                            const aRate = aElapsed > 0 ? a.progress.completed / aElapsed : 0;
                            const aRemaining = a.progress.total - a.progress.completed;
                            if (aRate > 0 && aRemaining > 0)
                              return formatDuration(aRemaining / aRate);
                            return '—';
                          }
                          if (a.status === 'done' && a.startedAt && a.finishedAt) {
                            return formatDuration((a.finishedAt - a.startedAt) / 1000);
                          }
                          return '—';
                        })()}
                      </td>
                      <td className="py-1 pr-3">
                        <button
                          onClick={() => {
                            setSelectedAirportIndex(idx);
                            setInitialFitted(false);
                            setAutoFollow(true);
                            setSelectedZoom(
                              fetchOrder === 'high-first' ? Math.max(...ZOOMS) : Math.min(...ZOOMS)
                            );
                          }}
                          className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-[10px]"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-zinc-900 border border-zinc-700 rounded p-4 space-y-3">
          <h2 className="text-sm font-semibold tracking-wide">Overall Progress</h2>
          {globalStatus === 'idle' && (
            <div className="text-xs text-zinc-400">Fetch airports to compute tiles.</div>
          )}
          {globalStatus !== 'idle' && (
            <div className="text-xs flex flex-wrap gap-4">
              <div>Total tiles: {aggregate.total}</div>
              <div>Completed: {aggregate.completed}</div>
              <div>Errors: {aggregate.errors}</div>
              <div>Percent: {pct}%</div>
              <div>Elapsed: {elapsedSec ? formatDuration(elapsedSec) : '0s'}</div>
              <div>Rate: {rate ? rate.toFixed(1) + ' t/s' : '—'}</div>
              <div>ETA: {rate > 0 && remaining > 0 ? formatDuration(etaSec) : '—'}</div>
            </div>
          )}
          {globalStatus !== 'idle' && (
            <div className="h-2 w-full bg-zinc-800 rounded overflow-hidden">
              <div
                className={`h-full ${
                  globalStatus === 'done'
                    ? 'bg-emerald-500'
                    : globalStatus === 'canceled'
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
                } transition-all duration-200`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              disabled={globalStatus !== 'ready'}
              onClick={startPrefetch}
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                globalStatus !== 'ready'
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              Start Prefetch (All)
            </button>
            <button
              disabled={globalStatus !== 'running'}
              onClick={cancel}
              className={`px-3 py-1.5 rounded text-sm font-medium ${
                globalStatus !== 'running'
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-500 text-white'
              }`}
            >
              Cancel
            </button>
          </div>
          {activeTiles.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-zinc-400">
                Preview first 25 tiles (selected airport)
              </summary>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {activeTiles.slice(0, 25).map((t) => (
                  <div
                    key={`${t.z}-${t.x}-${t.y}`}
                    className="text-[10px] font-mono bg-zinc-800/50 p-1 rounded"
                  >
                    z{t.z} {t.x}/{t.y}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>
        {activeAirport && activeAirport.data && (
          <section className="bg-zinc-900 border border-zinc-700 rounded p-4 space-y-3">
            <div className="flex flex-wrap gap-4 items-end">
              <h2 className="text-sm font-semibold tracking-wide">Map Preview</h2>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-zinc-400 mb-1">
                  Zoom
                </label>
                <select
                  value={selectedZoom}
                  onChange={(e) => {
                    setSelectedZoom(Number(e.target.value));
                    setAutoFollow(false);
                  }}
                  className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs"
                  title={
                    autoFollow
                      ? 'Auto-follow is active; selecting manually disables it.'
                      : 'Manual zoom selection'
                  }
                >
                  {ZOOMS.map((z) => (
                    <option key={z} value={z}>
                      {z} ({completionByZoom[z]?.done || 0}/{completionByZoom[z]?.total || 0}
                      {completionByZoom[z]?.errs ? ` e${completionByZoom[z].errs}` : ''})
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1 text-[10px] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoFollow}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAutoFollow(checked);
                    if (checked) {
                      const targetZoom = currentFetchingZoomRef.current;
                      if (targetZoom != null) {
                        setSelectedZoom(targetZoom);
                        // also adjust map zoom immediately if map exists
                        try {
                          mapRef.current && mapRef.current.setZoom(targetZoom, { animate: false });
                        } catch {
                          /* ignore */
                        }
                      }
                    }
                  }}
                  className="accent-blue-500"
                />
                <span>Auto-follow</span>
              </label>
              <div className="text-[10px] flex gap-3 text-zinc-400">
                <div>
                  <span className="inline-block w-2 h-2 bg-emerald-500 mr-1 align-middle rounded-sm" />
                  done
                </div>
                <div>
                  <span className="inline-block w-2 h-2 bg-red-500 mr-1 align-middle rounded-sm" />
                  error
                </div>
                <div>
                  <span className="inline-block w-2 h-2 bg-zinc-600 mr-1 align-middle rounded-sm" />
                  pending
                </div>
              </div>
            </div>
            <div className="h-[420px] w-full rounded overflow-hidden relative">
              <MapContainer
                whenCreated={(m) => {
                  mapRef.current = m;
                }}
                center={[activeAirport.data.latitude, activeAirport.data.longitude]}
                zoom={Math.min(...ZOOMS)}
                className="h-full w-full"
                preferCanvas
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                />
                {/* Original full bbox outline */}
                <Polygon
                  positions={[
                    [activeAirport.data.bbox_min_lat, activeAirport.data.bbox_min_lon],
                    [activeAirport.data.bbox_min_lat, activeAirport.data.bbox_max_lon],
                    [activeAirport.data.bbox_max_lat, activeAirport.data.bbox_max_lon],
                    [activeAirport.data.bbox_max_lat, activeAirport.data.bbox_min_lon],
                  ]}
                  pathOptions={{ color: 'orange', weight: 1, fill: false }}
                />
                {/* Shrunk bbox for selected zoom (if any shrink applied) */}
                {zoomBboxes[selectedZoom] && (
                  <Polygon
                    positions={[
                      [zoomBboxes[selectedZoom].minLat, zoomBboxes[selectedZoom].minLon],
                      [zoomBboxes[selectedZoom].minLat, zoomBboxes[selectedZoom].maxLon],
                      [zoomBboxes[selectedZoom].maxLat, zoomBboxes[selectedZoom].maxLon],
                      [zoomBboxes[selectedZoom].maxLat, zoomBboxes[selectedZoom].minLon],
                    ]}
                    pathOptions={{ color: 'deepskyblue', weight: 1, dashArray: '4 4', fill: false }}
                  />
                )}
                {zoomTilesLimited.map((t) => {
                  const west = tile2lon(t.x, t.z);
                  const east = tile2lon(t.x + 1, t.z);
                  const north = tile2lat(t.y, t.z);
                  const south = tile2lat(t.y + 1, t.z);
                  let fill = 'rgba(120,120,120,0.35)';
                  if (t.status === 'ok') fill = 'rgba(16,185,129,0.45)';
                  else if (t.status === 'error') fill = 'rgba(239,68,68,0.55)';
                  return (
                    <Rectangle
                      key={`${t.z}-${t.x}-${t.y}`}
                      bounds={[
                        [south, west],
                        [north, east],
                      ]}
                      pathOptions={{ color: '#222', weight: 0.2, fillColor: fill, fillOpacity: 1 }}
                    />
                  );
                })}
              </MapContainer>
            </div>
            {/* Replace full zoomTiles render with limited list to avoid UI freeze */}
            <div className="hidden">{/* Placeholder to keep JSX structure valid */}</div>
            {activeAirport && activeAirport.data && (
              <div className="text-[10px] text-zinc-500">
                Rendering {zoomTilesLimited.length.toLocaleString()} rectangle(s) for zoom{' '}
                {selectedZoom}
                {zoomTilesLimited.length !== zoomTiles.length && (
                  <span className="text-amber-400">
                    {' '}
                    (capped from {zoomTiles.length.toLocaleString()} for performance)
                  </span>
                )}
              </div>
            )}
            {/* One-time fit to selected zoom's bbox (or original) after map ready */}
            {activeAirport &&
              mapRef.current &&
              !initialFitted &&
              (() => {
                const zb = zoomBboxes[selectedZoom] || {
                  minLat: activeAirport.data.bbox_min_lat,
                  maxLat: activeAirport.data.bbox_max_lat,
                  minLon: activeAirport.data.bbox_min_lon,
                  maxLon: activeAirport.data.bbox_max_lon,
                };
                const bounds = [
                  [zb.minLat, zb.minLon],
                  [zb.maxLat, zb.maxLon],
                ];
                try {
                  mapRef.current.fitBounds(bounds, { padding: [12, 12] });
                } catch {
                  /* ignore */
                }
                setInitialFitted(true);
                return null;
              })()}
          </section>
        )}
      </div>
    </div>
  );
};

export default TilePrefetch;
/* NOTE: The rectangle rendering block above was refactored; limited rectangles are drawn for performance and memory. */
