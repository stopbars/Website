import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Toast } from '../components/shared/Toast';
import {
  Search,
  Loader,
  Download,
  AlertCircle,
  Info,
  FileCode2,
  Copy,
  Check,
  Settings,
  ChevronDown,
  ChevronUp,
  Layers,
  Map as MapIcon,
} from 'lucide-react';
import Map, { Source, Layer, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const STREET_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    mapbox: {
      type: 'raster',
      tiles: [
        `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`,
      ],
      tileSize: 512,
      attribution: 'Imagery &copy; <a href="https://www.mapbox.com/">Mapbox</a>',
    },
  },
  layers: [
    {
      id: 'mapbox',
      type: 'raster',
      source: 'mapbox',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

// Geo utilities
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// Compute destination point given start, bearing (degrees), and distance (meters)
const computeDestination = (lng, lat, bearing, distanceMeters) => {
  const R = 6371000; // Earth radius in meters
  const brng = toRad(bearing);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);
  const d = distanceMeters / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [toDeg(lng2), toDeg(lat2)];
};

// Calculate bearing between two points
const calculateBearing = (lng1, lat1, lng2, lat2) => {
  const dLon = toRad(lng2 - lng1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

// Create a buffered polygon around a polyline with given padding
const createBufferedPolygon = (coordinates, paddingMeters) => {
  if (coordinates.length < 2) return null;

  const leftPoints = [];
  const rightPoints = [];

  for (let i = 0; i < coordinates.length; i++) {
    const [lng, lat] = coordinates[i];

    let bearing;
    if (i === 0) {
      bearing = calculateBearing(lng, lat, coordinates[i + 1][0], coordinates[i + 1][1]);
    } else if (i === coordinates.length - 1) {
      bearing = calculateBearing(coordinates[i - 1][0], coordinates[i - 1][1], lng, lat);
    } else {
      const bearingIn = calculateBearing(coordinates[i - 1][0], coordinates[i - 1][1], lng, lat);
      const bearingOut = calculateBearing(lng, lat, coordinates[i + 1][0], coordinates[i + 1][1]);

      let diff = bearingOut - bearingIn;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      bearing = bearingIn + diff / 2;
    }

    const leftBearing = (bearing - 90 + 360) % 360;
    const rightBearing = (bearing + 90) % 360;

    leftPoints.push(computeDestination(lng, lat, leftBearing, paddingMeters));
    rightPoints.push(computeDestination(lng, lat, rightBearing, paddingMeters));
  }

  const startBearing = calculateBearing(
    coordinates[0][0],
    coordinates[0][1],
    coordinates[1][0],
    coordinates[1][1]
  );
  const endBearing = calculateBearing(
    coordinates[coordinates.length - 2][0],
    coordinates[coordinates.length - 2][1],
    coordinates[coordinates.length - 1][0],
    coordinates[coordinates.length - 1][1]
  );

  const startLeft = leftPoints[0];
  const startRight = rightPoints[0];
  const startCapLeft = computeDestination(
    startLeft[0],
    startLeft[1],
    (startBearing + 180) % 360,
    paddingMeters
  );
  const startCapRight = computeDestination(
    startRight[0],
    startRight[1],
    (startBearing + 180) % 360,
    paddingMeters
  );

  const endLeft = leftPoints[leftPoints.length - 1];
  const endRight = rightPoints[rightPoints.length - 1];
  const endCapLeft = computeDestination(endLeft[0], endLeft[1], endBearing, paddingMeters);
  const endCapRight = computeDestination(endRight[0], endRight[1], endBearing, paddingMeters);

  const polygon = [
    startCapRight,
    ...rightPoints,
    endCapRight,
    endCapLeft,
    ...leftPoints.reverse(),
    startCapLeft,
  ];

  polygon.push(polygon[0]);
  return polygon;
};

// Generate XML for MSFS polygon
const generatePolygonXML = (displayName, groupIndex, altitude, vertices) => {
  const vertexLines = vertices
    .slice(0, -1)
    .map(([lng, lat]) => `\t\t<Vertex lat="${lat.toFixed(14)}" lon="${lng.toFixed(14)}"/>`)
    .join('\n');

  return `\t<Polygon version="0.4.0" displayName="${displayName}" groupIndex="${groupIndex}" altitude="${altitude.toFixed(11)}">
\t\t<Attribute name="UniqueGUID" guid="{359C73E8-06BE-4FB2-ABCB-EC942F7761D0}" type="GUID" value="{${generateGUID()}}"/>
${vertexLines}
\t</Polygon>`;
};

// Generate a random GUID
const generateGUID = () => {
  const s4 = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
      .toUpperCase();
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
};

const XMLGenerator = () => {
  const { icao: urlIcao } = useParams();
  const mapRef = useRef(null);

  // State
  const [icao, setIcao] = useState(urlIcao?.toUpperCase() || '');
  const [isSearching, setIsSearching] = useState(false);
  const [airport, setAirport] = useState(null);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [generatedXML, setGeneratedXML] = useState('');
  const [copied, setCopied] = useState(false);
  const [paddingMeters, setPaddingMeters] = useState(1);
  const [baseAltitude, setBaseAltitude] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [mapStyle, setMapStyle] = useState(SATELLITE_STYLE);
  const [styleName, setStyleName] = useState('Satellite');
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 14,
  });

  // Store generated polygon data for map display
  const [generatedPolygons, setGeneratedPolygons] = useState({ bars: [], remove: [] });

  // Auto-search if ICAO provided via URL
  useEffect(() => {
    if (urlIcao && /^[A-Za-z0-9]{4}$/.test(urlIcao)) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search for airport
  const handleSearch = async (e) => {
    e?.preventDefault();

    if (!icao) {
      setError('Please enter an airport ICAO code');
      setShowErrorToast(true);
      return;
    }

    if (!/^[A-Za-z0-9]{4}$/.test(icao)) {
      setError('ICAO code must be exactly 4 characters');
      setShowErrorToast(true);
      return;
    }

    setIsSearching(true);
    setError('');
    setGeneratedXML('');
    setPoints([]);

    try {
      const airportResponse = await fetch(`https://v2.stopbars.com/airports?icao=${icao}`);
      if (!airportResponse.ok) {
        throw new Error('Airport not found');
      }
      const airportData = await airportResponse.json();

      setAirport({
        icao: airportData.icao,
        name: airportData.name,
        latitude: airportData.latitude,
        longitude: airportData.longitude,
        elevation_m: airportData.elevation_m,
      });

      // Set map view to airport location
      setViewState((prev) => ({
        ...prev,
        latitude: airportData.latitude,
        longitude: airportData.longitude,
        zoom: 14,
      }));

      if (typeof airportData.elevation_m === 'number') {
        setBaseAltitude(airportData.elevation_m);
      }

      const pointsResponse = await fetch(`https://v2.stopbars.com/airports/${icao}/points`);
      if (!pointsResponse.ok) {
        throw new Error('Failed to fetch airport points');
      }
      const pointsData = await pointsResponse.json();

      setPoints(
        pointsData.map((point) => ({
          id: point.id,
          type: point.type,
          name: point.name,
          coordinates: point.coordinates,
          directionality: point.directionality,
          color: point.color || undefined,
          elevated: point.elevated,
          ihp: point.ihp,
        }))
      );
    } catch (err) {
      setError(err.message || 'Failed to load airport data');
      setShowErrorToast(true);
      setAirport(null);
    } finally {
      setIsSearching(false);
    }
  };

  // Generate XML from points
  const generateXML = useCallback(() => {
    if (points.length === 0) return;

    setLoading(true);

    try {
      const polylines = [];
      const removePolygons = [];
      let groupIndex = 1;

      for (const point of points) {
        const coords = point.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;

        const lineCoords = coords
          .filter((c) => typeof c?.lat === 'number' && typeof c?.lng === 'number')
          .map((c) => [c.lng, c.lat]);

        if (lineCoords.length < 2) continue;

        // If only 2 points, add a midpoint so MSFS has at least 3 vertices for the polygon
        let finalCoords = lineCoords;
        if (lineCoords.length === 2) {
          const midLng = (lineCoords[0][0] + lineCoords[1][0]) / 2;
          const midLat = (lineCoords[0][1] + lineCoords[1][1]) / 2;
          finalCoords = [lineCoords[0], [midLng, midLat], lineCoords[1]];
        }

        polylines.push({
          id: point.id,
          name: point.id,
          coordinates: finalCoords,
          groupIndex: groupIndex++,
        });
      }

      const bufferedPolygons = [];
      for (const line of polylines) {
        const buffered = createBufferedPolygon(line.coordinates, paddingMeters);
        if (buffered) {
          bufferedPolygons.push(buffered);
        }
      }

      // For now, use individual polygons without merging
      // Merging overlapping polygons requires expensive computation
      // and at small padding values, overlaps are rare anyway
      for (const polygon of bufferedPolygons) {
        removePolygons.push({
          name: 'remove',
          polygon: polygon,
          groupIndex: groupIndex++,
        });
      }

      // Store polygon data for map display
      setGeneratedPolygons({
        bars: polylines.map((p) => ({
          id: p.id,
          coordinates: [...p.coordinates, p.coordinates[0]],
        })),
        remove: removePolygons.map((r, i) => ({
          id: `remove-${i}`,
          coordinates: r.polygon,
        })),
      });

      const allPolygonXML = [];

      for (const p of polylines) {
        const closedPath = [...p.coordinates, p.coordinates[0]];
        allPolygonXML.push(generatePolygonXML(p.name, p.groupIndex, baseAltitude, closedPath));
      }

      for (const r of removePolygons) {
        allPolygonXML.push(generatePolygonXML(r.name, r.groupIndex, baseAltitude, r.polygon));
      }

      const xmlContent = `<?xml version="1.0"?>
<FSData version="9.0">
${allPolygonXML.join('\n')}
</FSData>`;

      setGeneratedXML(xmlContent);
    } catch (err) {
      setError('Failed to generate XML: ' + err.message);
      setShowErrorToast(true);
    } finally {
      setLoading(false);
    }
  }, [points, paddingMeters, baseAltitude]);

  // Auto-generate when points change
  useEffect(() => {
    if (points.length > 0) {
      generateXML();
    }
  }, [points, generateXML]);

  // Download XML
  const handleDownload = () => {
    if (!generatedXML) return;

    const blob = new Blob([generatedXML], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${airport?.icao || 'airport'}-draft.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy XML to clipboard
  const handleCopy = async () => {
    if (!generatedXML) return;

    try {
      await navigator.clipboard.writeText(generatedXML);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
      setShowErrorToast(true);
    }
  };

  // Count polygons in generated XML
  const polygonCount = generatedXML ? (generatedXML.match(/<Polygon/g) || []).length : 0;
  const barsCount = generatedXML
    ? (generatedXML.match(/displayName="(?!remove)/g) || []).length
    : 0;
  const removeCount = generatedXML ? (generatedXML.match(/displayName="remove"/g) || []).length : 0;

  // Toggle map style
  const toggleStyle = () => {
    if (styleName === 'Satellite') {
      setMapStyle(STREET_STYLE);
      setStyleName('Street Map');
    } else {
      setMapStyle(SATELLITE_STYLE);
      setStyleName('Satellite');
    }
  };

  // Generate GeoJSON for map display
  const barsGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: generatedPolygons.bars.map((bar) => ({
        type: 'Feature',
        properties: { id: bar.id },
        geometry: {
          type: 'LineString',
          // Remove the closing point for display (it's added for XML)
          coordinates: bar.coordinates.slice(0, -1),
        },
      })),
    }),
    [generatedPolygons.bars]
  );

  const removeGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: generatedPolygons.remove.map((r) => ({
        type: 'Feature',
        properties: { id: r.id },
        geometry: {
          type: 'Polygon',
          coordinates: [r.coordinates],
        },
      })),
    }),
    [generatedPolygons.remove]
  );

  return (
    <Layout>
      <div className="min-h-screen pt-40 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">MSFS XML Generator</h1>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              Generate draft MSFS scenery XML files from BARS airport lighting data. These files
              will require manual adjustments before submitting as a contribution.
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto mb-12">
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={icao}
                  onChange={(e) => setIcao(e.target.value.toUpperCase())}
                  placeholder="Enter ICAO code (e.g., EGLL)"
                  maxLength={4}
                  className="w-full pl-12 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 text-white placeholder:text-zinc-500 uppercase tracking-wider"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
              </div>
              <Button type="submit" disabled={isSearching}>
                {isSearching ? <Loader className="w-4 h-4 animate-spin" /> : 'Generate'}
              </Button>
            </form>
          </div>

          {/* Results */}
          {airport && (
            <>
              {/* Airport Info Card */}
              <Card className="p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-semibold">{airport.icao}</h2>
                    <p className="text-zinc-400">{airport.name}</p>
                  </div>
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className="flex items-center space-x-2 px-4 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Settings</span>
                    {showSettings ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Settings Panel */}
                {showSettings && (
                  <div className="mb-6 p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          Remove Area Padding (m)
                        </label>
                        <input
                          type="number"
                          value={paddingMeters}
                          onChange={(e) =>
                            setPaddingMeters(Math.max(1, parseInt(e.target.value) || 1))
                          }
                          min={1}
                          max={50}
                          className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Base Altitude (m)</label>
                        <input
                          type="number"
                          value={baseAltitude}
                          onChange={(e) => setBaseAltitude(parseFloat(e.target.value) || 0)}
                          step={0.1}
                          className="w-full px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={generateXML}
                      variant="secondary"
                      className="mt-4"
                      disabled={loading || points.length === 0}
                    >
                      {loading ? (
                        <>
                          <Loader className="w-4 h-4 mr-2 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        'Regenerate XML'
                      )}
                    </Button>
                  </div>
                )}

                {/* Statistics */}
                {generatedXML && (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-white">{points.length}</div>
                      <div className="text-sm text-zinc-500">Objects Loaded</div>
                    </div>
                    <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-blue-400">{barsCount}</div>
                      <div className="text-sm text-zinc-500">BARS Polygons</div>
                    </div>
                    <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-red-400">{removeCount}</div>
                      <div className="text-sm text-zinc-500">Remove Areas</div>
                    </div>
                  </div>
                )}

                {/* No points warning */}
                {points.length === 0 && !isSearching && (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center space-x-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-amber-500">
                      No points found for this airport. The division may not have added lighting
                      data yet.
                    </p>
                  </div>
                )}

                {/* Download Actions */}
                {generatedXML && (
                  <div className="flex gap-3">
                    <Button onClick={handleDownload} className="flex-1">
                      <Download className="w-4 h-4 mr-2" />
                      Download XML
                    </Button>
                    <Button onClick={handleCopy} variant="secondary" className="flex-1">
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy to Clipboard
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </Card>

              {/* Map Preview */}
              {generatedXML && (
                <Card className="p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <MapIcon className="w-5 h-5 text-zinc-400" />
                      <h3 className="text-lg font-medium">Map Preview</h3>
                    </div>
                    <span className="text-sm text-zinc-500">{polygonCount} total polygons</span>
                  </div>
                  <div className="h-[400px] rounded-lg overflow-hidden border border-zinc-800 relative">
                    <Map
                      ref={mapRef}
                      {...viewState}
                      onMove={(evt) => setViewState(evt.viewState)}
                      mapStyle={mapStyle}
                      style={{ width: '100%', height: '100%' }}
                    >
                      <NavigationControl position="top-left" />
                      <ScaleControl />

                      {/* Remove Areas (render first, underneath) */}
                      <Source id="remove-polygons" type="geojson" data={removeGeoJSON}>
                        <Layer
                          id="remove-polygons-fill"
                          type="fill"
                          paint={{
                            'fill-color': '#ef4444',
                            'fill-opacity': 0.3,
                          }}
                        />
                        <Layer
                          id="remove-polygons-outline"
                          type="line"
                          paint={{
                            'line-color': '#ef4444',
                            'line-width': 1,
                            'line-opacity': 0.6,
                          }}
                        />
                      </Source>

                      {/* BARS Lines (render on top) */}
                      <Source id="bars-lines" type="geojson" data={barsGeoJSON}>
                        <Layer
                          id="bars-lines-layer"
                          type="line"
                          paint={{
                            'line-color': '#3b82f6',
                            'line-width': 3,
                          }}
                          layout={{
                            'line-cap': 'round',
                            'line-join': 'round',
                          }}
                        />
                      </Source>
                    </Map>

                    {/* Layer Control */}
                    <div className="absolute top-4 right-4 bg-zinc-900/90 border border-zinc-700 rounded-md p-1 z-10">
                      <button
                        onClick={toggleStyle}
                        className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-zinc-200 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                      >
                        <Layers className="w-4 h-4" />
                        <span>{styleName}</span>
                      </button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Info Notice */}
              {generatedXML && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center space-x-3">
                  <Info className="w-5 h-5 text-blue-400 shrink-0" />
                  <p className="text-blue-400 text-sm">
                    This is a draft XML file. You may need to adjust altitudes and fine-tune polygon
                    positions in your scenery editor for best results.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Empty State */}
          {!airport && !isSearching && (
            <Card className="p-12 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-center">
              <FileCode2 className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-zinc-300 mb-2">No Airport Selected</h3>
              <p className="text-zinc-500">
                Enter an ICAO code above to generate XML for an airport
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Error Toast */}
      <Toast
        title="Error"
        description={error}
        variant="destructive"
        show={showErrorToast}
        onClose={() => {
          setShowErrorToast(false);
          setError('');
        }}
      />
    </Layout>
  );
};

export default XMLGenerator;
