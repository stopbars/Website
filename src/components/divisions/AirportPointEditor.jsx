import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import { MapContainer, TileLayer, useMap, Rectangle, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { getVatsimToken } from '../../utils/cookieUtils';
import { X } from 'lucide-react';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';
import ArrowDecorator from '../shared/ArrowDecorator';
import useSearchQuery from '../../hooks/useSearchQuery';

const POINT_TYPES = ['stopbar', 'lead_on', 'taxiway', 'stand'];
const DIRECTIONALITY = ['bi-directional', 'uni-directional'];
const COLORS = ['green', 'yellow', 'green-yellow', 'green-orange', 'green-blue'];

// Visual label formatter (does not alter underlying values)
const formatLabel = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/_/g, ' ') // underscores to spaces
    .split(' ') // split words
    .map((w) =>
      w
        .split('-') // preserve hyphenated segments while capitalizing each part
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join('-')
    )
    .join(' ');
};

const MIN_SEGMENT_POINT_DISTANCE_METERS = 1; // 1 meter

const defaultChangeset = () => ({ create: [], modify: {}, delete: [] });

const GeomanController = ({
  existingPoints,
  featureLayerMapRef,
  registerSelect,
  pushGeometryChange,
  mapStyle,
  mapInstanceRef,
  onFeatureCreated,
  onDrawingCoordsUpdate,
  onDrawingComplete,
  onLiveEdit,
  redrawTargetRef,
  geomanAPIRef,
}) => {
  const map = useMap();
  const drawingLayerRef = useRef(null);
  const drawingShapeRef = useRef(null);
  const lastClickPollRef = useRef(null);
  const lastReportedLenRef = useRef(0);
  // Drawing history stack for Undo while actively drawing
  const drawingUndoStackRef = useRef([]); // array of coords arrays
  const lastDrawCoordsRef = useRef([]);

  useEffect(() => {
    if (mapInstanceRef) {
      mapInstanceRef.current = map;
    }

    if (mapStyle) {
      Object.entries(mapStyle).forEach(([k, v]) => (map.getContainer().style[k] = v));
    }

    existingPoints.forEach((pt) => {
      if (featureLayerMapRef.current[pt.id]) return;
      let layer;
      const latlngs = pt.coordinates.map((c) => [c.lat, c.lng]);
      if (latlngs.length === 1) {
        layer = L.marker(latlngs[0], { pointId: pt.id });
      } else {
        layer = L.polyline(latlngs, { pointId: pt.id });
      }
      styleLayerByPoint(layer, pt);
      layer.addTo(map);
      featureLayerMapRef.current[pt.id] = layer;

      layer.on('click', () => registerSelect(layer, pt.id));
      layer.on('pm:edit', () => pushGeometryChange(layer));
    });

    map.on('pm:create', (e) => {
      const layer = e.layer;
      let assignedId;
      if (redrawTargetRef?.current) {
        assignedId = redrawTargetRef.current;
        layer.options.pointId = assignedId;

        const old = featureLayerMapRef.current[assignedId];
        if (old && old.remove) old.remove();
        featureLayerMapRef.current[assignedId] = layer;
        registerSelect(layer, assignedId, true);
        redrawTargetRef.current = null;
      } else {
        assignedId = `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        layer.options.pointId = assignedId;
        featureLayerMapRef.current[assignedId] = layer;
        registerSelect(layer, assignedId, true);
      }
      if (onFeatureCreated) onFeatureCreated(layer, assignedId);

      try {
        pushGeometryChange(layer);
      } catch (err) {
        console.error('Error pushing geometry change:', err);
      }
      if (onDrawingComplete) onDrawingComplete();
    });

    map.on('pm:drawstart', (e) => {
      drawingShapeRef.current = e.shape;
      if (e.shape === 'Line') {
        drawingLayerRef.current = e.workingLayer || e.layer || null;
        onDrawingCoordsUpdate && onDrawingCoordsUpdate([]);
        lastReportedLenRef.current = 0;
        // reset drawing history; start with empty to allow undo back to blank
        drawingUndoStackRef.current = [[]];
        lastDrawCoordsRef.current = [];
        // expose API for Undo while drawing
        if (geomanAPIRef) {
          geomanAPIRef.current = {
            undoDrawing: () => {
              // Prefer Geoman's native removal to keep vertex markers in sync
              try {
                // Only attempt while drawing a Line
                if (drawingShapeRef.current !== 'Line') return false;
                const drawLine = map.pm?.Draw?.Line || map.pm?.Draw?.Poly;
                if (drawLine && typeof drawLine._removeLastVertex === 'function') {
                  drawLine._removeLastVertex();
                  // Refresh preview/overlay after Geoman mutates vertices
                  const refresh = () => {
                    const layer = drawingLayerRef.current;
                    const latlngs = layer?.getLatLngs?.();
                    if (Array.isArray(latlngs)) {
                      const coords = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }));
                      lastDrawCoordsRef.current = coords;
                      onDrawingCoordsUpdate && onDrawingCoordsUpdate(coords);
                    } else {
                      lastDrawCoordsRef.current = [];
                      onDrawingCoordsUpdate && onDrawingCoordsUpdate([]);
                    }
                  };
                  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(refresh);
                  else setTimeout(refresh, 0);
                  return true;
                }
              } catch {
                // Fallback to manual coords approach
              }
              const layer = drawingLayerRef.current;
              if (!layer) return false;
              const prev = drawingUndoStackRef.current.pop();
              if (!prev) return false;
              if (layer.setLatLngs) {
                const latlngs = Array.isArray(prev) ? prev.map((c) => [c.lat, c.lng]) : [];
                layer.setLatLngs(latlngs);
              }
              lastDrawCoordsRef.current = prev;
              onDrawingCoordsUpdate && onDrawingCoordsUpdate(prev);
              return true;
            },
          };
        }
      }
    });
    const updateWorking = (e) => {
      const layer = e?.workingLayer || e?.layer || drawingLayerRef.current;
      if (!layer) return;
      const read = () => {
        const latlngs = layer.getLatLngs?.();
        if (Array.isArray(latlngs)) {
          const coords = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }));
          onDrawingCoordsUpdate && onDrawingCoordsUpdate(coords);
          // record drawing step when vertex count or coords changed
          const prev = lastDrawCoordsRef.current || [];
          const changed =
            coords.length !== prev.length ||
            coords.some((c, i) => !prev[i] || c.lat !== prev[i].lat || c.lng !== prev[i].lng);
          if (changed) {
            // push previous into undo stack
            drawingUndoStackRef.current.push(prev);
            lastDrawCoordsRef.current = coords;
          }
          drawingLayerRef.current = layer;
        }
      };

      read();

      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(read);
      } else {
        setTimeout(read, 0);
      }

      if (!drawingLayerRef.current && onLiveEdit) onLiveEdit();
    };
    map.on('pm:vertexadded', updateWorking);
    map.on('pm:vertexremoved', updateWorking);

    const moveHandler = () => {
      if (!drawingLayerRef.current) return;
      const latlngs = drawingLayerRef.current.getLatLngs?.();
      if (Array.isArray(latlngs)) {
        const coords = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }));
        onDrawingCoordsUpdate && onDrawingCoordsUpdate(coords);
      }
    };
    map.on('mousemove', moveHandler);

    // Precapture Ctrl+Click to finish drawing before a new vertex is added
    const preclickHandler = (e) => {
      if (!drawingLayerRef.current) return;
      if (
        drawingShapeRef.current === 'Line' &&
        e &&
        e.originalEvent &&
        e.originalEvent.ctrlKey === true
      ) {
        try {
          e.originalEvent.preventDefault && e.originalEvent.preventDefault();
          e.originalEvent.stopPropagation && e.originalEvent.stopPropagation();
        } catch {
          /* ignore */
        }
        let finished = false;
        try {
          const pm = map?.pm;
          const drawLine = pm?.Draw?.Line;
          if (drawLine) {
            if (typeof drawLine.finish === 'function') {
              drawLine.finish();
              finished = true;
            } else if (typeof drawLine._finishShape === 'function') {
              drawLine._finishShape();
              finished = true;
            } else if (typeof drawLine._finish === 'function') {
              drawLine._finish();
              finished = true;
            }
          }
        } catch {
          /* ignore */
        }
        if (!finished) {
          try {
            const enterEvt = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
            });
            const container = map?.getContainer?.();
            if (container && typeof container.dispatchEvent === 'function') {
              container.dispatchEvent(enterEvt);
            }
            document.dispatchEvent(enterEvt);
          } catch {
            /* ignore */
          }
        }
      }
    };
    map.on('preclick', preclickHandler);

    const clickHandler = (e) => {
      if (!drawingLayerRef.current) return;
      // Ctrl+Click anywhere on canvas finishes the current Line drawing
      if (
        drawingShapeRef.current === 'Line' &&
        e &&
        e.originalEvent &&
        e.originalEvent.ctrlKey === true
      ) {
        try {
          // Prevent default and stop bubbling to avoid adding another vertex
          e.originalEvent.preventDefault && e.originalEvent.preventDefault();
          e.originalEvent.stopPropagation && e.originalEvent.stopPropagation();
        } catch {
          /* ignore */
        }
        try {
          // Leaflet-Geoman listens for Enter to finish drawing
          const enterEvt = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
          });
          document.dispatchEvent(enterEvt);
        } catch {
          // Fallback: gracefully end draw mode if key dispatch fails
          try {
            if (map?.pm) map.pm.disableDraw();
          } catch {
            /* ignore */
          }
        }
        return;
      }
      let frames = 0;
      const maxFrames = 6;
      if (lastClickPollRef.current) cancelAnimationFrame(lastClickPollRef.current);
      const poll = () => {
        const layer = drawingLayerRef.current;
        if (!layer) return;
        const latlngs = layer.getLatLngs?.();
        if (Array.isArray(latlngs)) {
          const len = latlngs.length;
          if (len !== lastReportedLenRef.current) {
            // Vertex count changed -> record undo step
            lastReportedLenRef.current = len;
            const coords = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }));
            const prev = lastDrawCoordsRef.current || [];
            drawingUndoStackRef.current.push(prev);
            lastDrawCoordsRef.current = coords;
            drawingLayerRef.current = layer;
            onDrawingCoordsUpdate && onDrawingCoordsUpdate(coords);
          }
        }
        frames++;
        if (frames < maxFrames) {
          lastClickPollRef.current = requestAnimationFrame(poll);
        }
      };
      poll();
    };
    map.on('click', clickHandler);
    map.on('pm:drawend', () => {
      drawingLayerRef.current = null;
      drawingShapeRef.current = null;
      onDrawingCoordsUpdate && onDrawingCoordsUpdate([]);
      // clear drawing API on finish
      if (geomanAPIRef?.current) geomanAPIRef.current = null;
    });

    map.on('pm:markerdrag', () => {
      onLiveEdit && onLiveEdit();
    });
    map.on('pm:snapdrag', () => {
      onLiveEdit && onLiveEdit();
    });

    return () => {
      map.off('pm:create');
      map.off('pm:drawstart');
      map.off('pm:vertexadded');
      map.off('pm:vertexremoved');
      map.off('pm:drawend');
      map.off('mousemove', moveHandler);
      map.off('click', clickHandler);
      map.off('preclick', preclickHandler);
      map.off('pm:markerdrag');
      map.off('pm:snapdrag');
    };
  }, [
    map,
    existingPoints,
    featureLayerMapRef,
    registerSelect,
    pushGeometryChange,
    mapStyle,
    mapInstanceRef,
    onFeatureCreated,
    onDrawingCoordsUpdate,
    onDrawingComplete,
    onLiveEdit,
    redrawTargetRef,
    geomanAPIRef,
  ]);

  return null;
};

GeomanController.propTypes = {
  existingPoints: PropTypes.array.isRequired,
  featureLayerMapRef: PropTypes.object.isRequired,
  registerSelect: PropTypes.func.isRequired,
  pushGeometryChange: PropTypes.func.isRequired,
  getPointForLayer: PropTypes.func,
  mapStyle: PropTypes.object,
  mapInstanceRef: PropTypes.object,
  onFeatureCreated: PropTypes.func,
  redrawTargetRef: PropTypes.object,
};
GeomanController.propTypes.onDrawingCoordsUpdate = PropTypes.func;
GeomanController.propTypes.onDrawingComplete = PropTypes.func;
GeomanController.propTypes.onLiveEdit = PropTypes.func;
GeomanController.propTypes.geomanAPIRef = PropTypes.object;

const styleLayerByPoint = (layer, pt, isSelected = false, isDeleted = false) => {
  const baseColor = (() => {
    switch (pt.type) {
      case 'stopbar':
        return '#ef4444';
      case 'lead_on':
        return '#facc15';
      case 'taxiway':
        return '#22c55e';
      case 'stand':
        return '#f59e0b';
      default:
        return '#64748b';
    }
  })();
  const color = isDeleted ? '#dc2626' : baseColor;
  const weight = isSelected ? 2 : 1;
  if (layer.setStyle && layer.getLatLngs) {
    layer.setStyle({ color, weight, opacity: 0.15 });
  } else if (layer.setStyle) {
    layer.setStyle({ color, weight: isSelected ? 18 : 14, opacity: 0.9 });
  }
  if (layer.setIcon && pt.type) {
    const iconHtml = `<div style="background:${color};width:${isSelected ? 18 : 14}px;height:${isSelected ? 18 : 14}px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px ${isDeleted ? '#dc2626' : '#334155'};"></div>`;
    layer.setIcon(
      L.divIcon({
        className: 'point-icon',
        html: iconHtml,
        iconSize: [isSelected ? 18 : 14, isSelected ? 18 : 14],
      })
    );
  }
};

const POLYLINE_COLORS = {
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: 'rgb(63, 63, 255)',
  orange: 'rgb(255, 141, 35)',
  red: '#ef4444',
  gray: '#999999',
};

const getPolylineColors = (point) => {
  let topColor = POLYLINE_COLORS.gray;
  let bottomColor = POLYLINE_COLORS.red;
  if (!point || !point.type) return { topColor, bottomColor };
  switch (point.type) {
    case 'taxiway': {
      const style = point.color || 'green';
      if (style === 'green') {
        topColor = POLYLINE_COLORS.green;
        bottomColor = POLYLINE_COLORS.green;
      } else if (style === 'yellow') {
        topColor = POLYLINE_COLORS.yellow;
        bottomColor = POLYLINE_COLORS.yellow;
      } else if (style === 'green-yellow') {
        topColor = POLYLINE_COLORS.green;
        bottomColor = POLYLINE_COLORS.yellow;
      } else if (style === 'green-blue') {
        topColor = POLYLINE_COLORS.green;
        bottomColor = POLYLINE_COLORS.blue;
      } else if (style === 'green-orange') {
        topColor = POLYLINE_COLORS.green;
        bottomColor = POLYLINE_COLORS.orange;
      } else {
        topColor = POLYLINE_COLORS.green;
        bottomColor = POLYLINE_COLORS.green;
      }
      break;
    }
    case 'lead_on': {
      topColor = POLYLINE_COLORS.green;
      bottomColor = POLYLINE_COLORS.yellow;
      break;
    }
    case 'stand': {
      topColor = POLYLINE_COLORS.orange;
      bottomColor = POLYLINE_COLORS.orange;
      break;
    }
    case 'stopbar':
    default: {
      if (point.directionality === 'bi-directional') {
        topColor = POLYLINE_COLORS.red;
        bottomColor = POLYLINE_COLORS.red;
      } else {
        topColor = POLYLINE_COLORS.gray;
        bottomColor = POLYLINE_COLORS.red;
      }
      break;
    }
  }
  return { topColor, bottomColor };
};

const ARROW_SPACING_METERS = 75;
const MIN_ARROW_REPEAT_PERCENT = 2;
const MAX_ARROW_REPEAT_PERCENT = 50;

const computeArrowPattern = (positions, mapInstance) => {
  if (!mapInstance || !Array.isArray(positions) || positions.length < 2) return null;

  let totalLengthMeters = 0;
  for (let i = 0; i < positions.length - 1; i += 1) {
    const start = L.latLng(positions[i][0], positions[i][1]);
    const end = L.latLng(positions[i + 1][0], positions[i + 1][1]);
    totalLengthMeters += mapInstance.distance(start, end);
  }

  if (!Number.isFinite(totalLengthMeters) || totalLengthMeters <= 0) return null;
  if (totalLengthMeters <= ARROW_SPACING_METERS * 1.5) return { offset: '50%', repeat: '100%' };

  const desiredRepeatPercent = (ARROW_SPACING_METERS / totalLengthMeters) * 100;
  const repeatPercent = Math.min(
    MAX_ARROW_REPEAT_PERCENT,
    Math.max(MIN_ARROW_REPEAT_PERCENT, desiredRepeatPercent)
  );
  const offsetPercent = Math.min(50, Math.max(5, repeatPercent / 2));

  return {
    offset: `${offsetPercent}%`,
    repeat: `${repeatPercent}%`,
  };
};

const SegmentedDefs = ({
  segments = [],
  topColor = '#ef4444',
  bottomColor = '#999999',
  strokeWidth = 10,
}) => {
  const map = useMap();
  useEffect(() => {
    if (!map || !segments || segments.length === 0) return;
    const ownerId = segments[0]?.baseId || 'unknown';
    const svg = map.getPanes().overlayPane.querySelector('svg');
    if (!svg) return;
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.prepend(defs);
    }
    const build = () => {
      [
        ...defs.querySelectorAll(`linearGradient[data-generated="seg"][data-owner="${ownerId}"]`),
      ].forEach((n) => n.remove());
      segments.forEach((seg) => {
        const gradId = `seggrad-${seg.baseId}-${seg.idx}`;
        const lp1 = map.latLngToLayerPoint(L.latLng(seg.p1.lat, seg.p1.lng));
        const lp2 = map.latLngToLayerPoint(L.latLng(seg.p2.lat, seg.p2.lng));
        const mx = (lp1.x + lp2.x) / 2;
        const my = (lp1.y + lp2.y) / 2;
        const dx = lp2.x - lp1.x;
        const dy = lp2.y - lp1.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const half = Math.max(1, strokeWidth / 2);
        const span = half * 1.2;
        const x1 = mx - px * span;
        const y1 = my - py * span;
        const x2 = mx + px * span;
        const y2 = my + py * span;
        const lg = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        lg.setAttribute('id', gradId);
        lg.setAttribute('gradientUnits', 'userSpaceOnUse');
        lg.setAttribute('x1', x1);
        lg.setAttribute('y1', y1);
        lg.setAttribute('x2', x2);
        lg.setAttribute('y2', y2);
        lg.setAttribute('data-generated', 'seg');
        lg.setAttribute('data-owner', ownerId);
        lg.innerHTML = `\n          <stop offset="50%" stop-color="${topColor}" stop-opacity="1"/>\n          <stop offset="50%" stop-color="${bottomColor}" stop-opacity="1"/>\n        `;
        defs.appendChild(lg);
      });
    };
    build();
    const onChange = () => build();
    map.on('zoomend viewreset moveend', onChange);
    return () => {
      map.off('zoomend viewreset moveend', onChange);
      [
        ...defs.querySelectorAll(`linearGradient[data-generated="seg"][data-owner="${ownerId}"]`),
      ].forEach((n) => n.remove());
    };
  }, [map, segments, topColor, bottomColor, strokeWidth]);
  return null;
};
SegmentedDefs.propTypes = {
  segments: PropTypes.array,
  topColor: PropTypes.string,
  bottomColor: PropTypes.string,
  strokeWidth: PropTypes.number,
};

// MapAttributionUpdater
// Fetches attribution snippets from maps.stopbars.com and updates Leaflet's native attribution control
const MapAttributionUpdater = ({ bounds }) => {
  const map = useMap();
  const abortRef = useRef(null);
  const timeoutRef = useRef(null);
  const lastParamsRef = useRef({ zoom: null, boundsStr: null });
  const currentAttrRef = useRef('');

  useEffect(() => {
    if (!map) return;

    if (!map.attributionControl) {
      try {
        L.control.attribution({ prefix: '' }).addTo(map);
      } catch {
        // ignore
      }
    }
    if (!map.attributionControl) return; // still not available; bail

    const computeParams = () => {
      // Floor and clamp to native zoom range to avoid server errors (max native zoom = 19)
      const rawZoom = map.getZoom();
      const zoom = Math.min(19, Math.max(0, Math.floor(rawZoom)));
      const b = map.getBounds();
      const sw = b.getSouthWest();
      const ne = b.getNorthEast();
      const boundsStr = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
      return { zoom, boundsStr };
    };

    const setAttribution = (html) => {
      const ctrl = map.attributionControl;
      if (!ctrl) return;
      if (currentAttrRef.current) {
        try {
          ctrl.removeAttribution(currentAttrRef.current);
        } catch {
          // ignore
        }
      }
      currentAttrRef.current = html || '';
      if (currentAttrRef.current) {
        try {
          ctrl.addAttribution(currentAttrRef.current);
        } catch {
          // ignore
        }
      }
    };

    const doFetch = async (zoom, boundsStr) => {
      // Abort previous
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const url = `https://maps.stopbars.com/map/attribution?zoom=${encodeURIComponent(
          zoom
        )}&bounds=${encodeURIComponent(boundsStr)}`;
        const resp = await fetch(url, { signal: ac.signal, cache: 'no-store' });
        if (!resp.ok) throw new Error('Attribution fetch failed');
        const ct = resp.headers.get('content-type') || '';
        let html = '';
        if (ct.includes('application/json')) {
          const data = await resp.json();
          const parts = Array.isArray(data?.copyrights) ? data.copyrights : [];
          html = parts.join(' ');
        } else {
          html = await resp.text();
        }
        if (html !== currentAttrRef.current) setAttribution(html);
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    };

    const schedule = () => {
      const { zoom, boundsStr } = computeParams();
      const last = lastParamsRef.current;
      if (last.zoom === zoom && last.boundsStr === boundsStr) return; // no change
      lastParamsRef.current = { zoom, boundsStr };
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // debounce 300ms
      timeoutRef.current = setTimeout(() => doFetch(zoom, boundsStr), 300);
    };

    const immediateFetch = () => {
      const { zoom, boundsStr } = computeParams();
      lastParamsRef.current = { zoom, boundsStr };
      doFetch(zoom, boundsStr);
    };

    if (map._loaded) {
      immediateFetch();
    } else {
      map.once('load', immediateFetch);
    }

    schedule();

    map.on('moveend zoomend resize', schedule);

    return () => {
      map.off('moveend zoomend resize', schedule);
      map.off('load', immediateFetch);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (abortRef.current) abortRef.current.abort();
      if (map.attributionControl && currentAttrRef.current) {
        try {
          map.attributionControl.removeAttribution(currentAttrRef.current);
        } catch {
          // ignore
        }
      }
      currentAttrRef.current = '';
    };
  }, [map, bounds]);

  return null;
};

MapAttributionUpdater.propTypes = {
  bounds: PropTypes.object,
};

const PolylineVisualizationOverlay = ({
  featureLayerMapRef,
  changeset,
  existingMap,
  selectedId,
  registerSelect,
  formState,
  drawingCoords,
  liveGeometryTick, // used to trigger re-render on live geometry edits
}) => {
  // Read liveGeometryTick so React registers it; no other action needed.
  liveGeometryTick;
  const map = useMap();
  const [isInteracting, setIsInteracting] = useState(false);
  const [viewBounds, setViewBounds] = useState(null);
  const [overlayPoints, setOverlayPoints] = useState([]);
  const [layerSyncTick, setLayerSyncTick] = useState(0);
  useEffect(() => {
    if (!map) return;
    const start = () => setIsInteracting(true);
    const end = () => {
      setIsInteracting(false);
      try {
        const nextBounds = map.getBounds();
        const schedule = () => setViewBounds(nextBounds);
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(schedule);
        else setTimeout(schedule, 0);
      } catch {
        /* ignore */
      }
    };
    // Initial bounds
    try {
      const initialBounds = map.getBounds();
      const schedule = () => setViewBounds(initialBounds);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(schedule);
      else setTimeout(schedule, 0);
    } catch {
      /* ignore */
    }
    map.on('movestart zoomstart dragstart', start);
    map.on('moveend zoomend viewreset', end);
    return () => {
      map.off('movestart zoomstart dragstart', start);
      map.off('moveend zoomend viewreset', end);
    };
  }, [map]);

  const paddedBounds = useMemo(() => {
    if (!viewBounds) return null;
    try {
      const sw = viewBounds.getSouthWest();
      const ne = viewBounds.getNorthEast();
      const latPad = Math.max(0.001, (ne.lat - sw.lat) * 0.2);
      const lngPad = Math.max(0.001, (ne.lng - sw.lng) * 0.2);
      return L.latLngBounds([sw.lat - latPad, sw.lng - lngPad], [ne.lat + latPad, ne.lng + lngPad]);
    } catch {
      return null;
    }
  }, [viewBounds]);

  const isAnyCoordInBounds = useCallback(
    (coords) => {
      if (!paddedBounds || !Array.isArray(coords)) return true; // no culling if unknown
      for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        if (
          typeof c?.lat === 'number' &&
          typeof c?.lng === 'number' &&
          paddedBounds.contains([c.lat, c.lng])
        )
          return true;
      }
      return false;
    },
    [paddedBounds]
  );
  const extractCoords = useCallback((layer) => {
    if (!layer) return [];
    if (layer.getLatLng) {
      const { lat, lng } = layer.getLatLng();
      return [{ lat, lng }];
    }
    if (layer.getLatLngs) {
      return layer.getLatLngs().map((ll) => ({ lat: ll.lat, lng: ll.lng }));
    }
    return [];
  }, []);

  useEffect(() => {
    const layers = featureLayerMapRef.current || {};
    const list = [];

    Object.values(existingMap).forEach((base) => {
      if (!base) return;
      const mod = changeset.modify[base.id] || {};
      let merged = { ...base, ...mod };
      if (selectedId === base.id && formState) merged = { ...merged, ...formState };
      const liveLayer = layers[base.id];
      if (selectedId === base.id && liveLayer) {
        const liveCoords = extractCoords(liveLayer);
        if (liveCoords.length >= 2) merged.coordinates = liveCoords;
      }
      list.push({ ...merged, layerRef: liveLayer });
    });

    changeset.create.forEach((c) => {
      const merged =
        selectedId === c._tempId && formState
          ? { ...c, ...formState, id: c._tempId }
          : { ...c, id: c._tempId };
      const liveLayer = layers[c._tempId];
      list.push({ ...merged, layerRef: liveLayer });
    });

    if (
      selectedId &&
      selectedId.startsWith('new_') &&
      !changeset.create.find((c) => c._tempId === selectedId)
    ) {
      const liveLayer = layers[selectedId];
      if (liveLayer) {
        const coords = extractCoords(liveLayer);
        list.push({
          id: selectedId,
          _tempId: selectedId,
          coordinates: coords,
          ...formState,
          layerRef: liveLayer,
        });
      }
    }

    if (drawingCoords && drawingCoords.length >= 2) {
      list.push({
        id: '__drawing_preview__',
        coordinates: drawingCoords,
        ...(formState || {}),
        type: formState?.type || 'stopbar',
        layerRef: null,
      });
    }

    const updateHandle = setTimeout(() => {
      setOverlayPoints(list);
    }, 0);

    let retryHandle;
    const needsLayerSync = list.some((pt) => pt.id !== '__drawing_preview__' && !pt.layerRef);
    if (needsLayerSync) {
      retryHandle = setTimeout(() => {
        setLayerSyncTick((tick) => tick + 1);
      }, 50);
    }

    return () => {
      clearTimeout(updateHandle);
      if (retryHandle) clearTimeout(retryHandle);
    };
  }, [
    existingMap,
    changeset,
    selectedId,
    formState,
    drawingCoords,
    liveGeometryTick,
    extractCoords,
    featureLayerMapRef,
    layerSyncTick,
  ]);

  return (
    <>
      {overlayPoints.map((pt) => {
        const coords = pt?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const safe = coords.filter((c) => typeof c?.lat === 'number' && typeof c?.lng === 'number');
        if (safe.length < 2) return null;
        const isSelected = selectedId === pt.id || pt.id === '__drawing_preview__';
        if (!isSelected && !isAnyCoordInBounds(safe)) return null;
        const positions = safe.map((c) => [c.lat, c.lng]);
        const arrowPattern = map ? computeArrowPattern(positions, map) : null;
        const segments = [];
        for (let i = 0; i < safe.length - 1; i++)
          segments.push({ baseId: pt.id, idx: i, p1: safe[i], p2: safe[i + 1] });
        const { topColor, bottomColor } = getPolylineColors(pt);
        const isDeleted = changeset.delete.includes(pt.id);
        const onClick =
          pt.id === '__drawing_preview__'
            ? undefined
            : () => {
                if (pt.layerRef) {
                  registerSelect(pt.layerRef, pt.id, pt.id.startsWith('new_'));
                }
              };
        const renderDetailed = !isInteracting || isSelected;
        return (
          <React.Fragment key={pt.id}>
            <Polyline
              positions={positions}
              pathOptions={{
                color: isDeleted ? '#dc2626' : '#ffffff',
                weight: 15,
                opacity: isDeleted ? 0.5 : isSelected ? 0.9 : 0.7,
                dashArray: isDeleted ? '8 6' : undefined,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              eventHandlers={onClick ? { click: onClick } : undefined}
            />
            {renderDetailed && (
              <>
                <SegmentedDefs
                  segments={segments}
                  topColor={topColor}
                  bottomColor={bottomColor}
                  strokeWidth={10}
                />
                {segments.map((seg) => {
                  const gradId = `seggrad-${seg.baseId}-${seg.idx}`;
                  const segPositions = [
                    [seg.p1.lat, seg.p1.lng],
                    [seg.p2.lat, seg.p2.lng],
                  ];
                  return (
                    <Polyline
                      key={`${pt.id}-seg-${seg.idx}`}
                      positions={segPositions}
                      pathOptions={{
                        color: `url(#${gradId})`,
                        weight: 10,
                        opacity: isDeleted ? 0.25 : 1,
                        lineCap: 'round',
                        lineJoin: 'round',
                      }}
                      eventHandlers={onClick ? { click: onClick } : undefined}
                    />
                  );
                })}
              </>
            )}
            {/* Direction arrows on top: render only for selected/preview to save CPU */}
            {!isDeleted && isSelected && (
              <ArrowDecorator
                positions={positions}
                offset={arrowPattern?.offset ?? '5%'}
                repeat={arrowPattern?.repeat ?? '10%'}
                pixelSize={10}
                color="#ffffff"
                weight={1.5}
                opacity={0.9}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
};

PolylineVisualizationOverlay.propTypes = {
  featureLayerMapRef: PropTypes.object.isRequired,
  changeset: PropTypes.object.isRequired,
  existingMap: PropTypes.object.isRequired,
  selectedId: PropTypes.string,
  registerSelect: PropTypes.func.isRequired,
  formState: PropTypes.object,
  drawingCoords: PropTypes.array,
  liveGeometryTick: PropTypes.number,
};

const TYPE_RULES = {
  stopbar: {
    required: ['type', 'name', 'coordinates', 'directionality'],
    optional: ['elevated', 'ihp'],
    forbidden: ['color'],
  },
  lead_on: {
    required: ['type', 'name', 'coordinates'],
    optional: [],
    forbidden: ['color', 'elevated', 'ihp', 'directionality'],
  },
  taxiway: {
    required: ['type', 'name', 'coordinates', 'directionality', 'color'],
    optional: [],
    forbidden: ['elevated', 'ihp'],
  },
  stand: {
    required: ['type', 'name', 'coordinates'],
    optional: [],
    forbidden: ['color', 'elevated', 'ihp', 'directionality'],
  },
};

const sanitizePoint = (pt) => {
  if (!pt || typeof pt !== 'object') return pt;
  const copy = { ...pt };
  if (!copy.type || !TYPE_RULES[copy.type]) return copy; // let validation handle invalid type later
  copy.name = (copy.name || '').trim();
  if (Array.isArray(copy.coordinates)) {
    copy.coordinates = copy.coordinates.filter(
      (c) => typeof c?.lat === 'number' && typeof c?.lng === 'number'
    );
  } else if (copy.coordinates && typeof copy.coordinates === 'object') {
    const c = copy.coordinates;
    if (typeof c.lat === 'number' && typeof c.lng === 'number') copy.coordinates = [c];
    else copy.coordinates = [];
  } else copy.coordinates = [];

  // Apply defaults
  if (copy.type === 'stopbar') {
    copy.elevated = !!copy.elevated;
    copy.ihp = !!copy.ihp;
    if (copy.elevated) copy.directionality = 'uni-directional';
  }
  if (copy.type === 'taxiway') {
    if (!copy.color) copy.color = 'green';
  }
  const { forbidden } = TYPE_RULES[copy.type];
  forbidden.forEach((f) => {
    if (f in copy) delete copy[f];
  });
  if (copy.directionality === '' && copy.type !== 'stopbar' && copy.type !== 'taxiway') {
    delete copy.directionality;
  }
  return copy;
};

const buildSanitizedChangeset = (rawChangeset, existingMap) => {
  const create = rawChangeset.create.map((c) => {
    const { _tempId: _ignore, ...rest } = c; // eslint-disable-line no-unused-vars
    return sanitizePoint({ ...rest });
  });
  const modify = {};
  Object.entries(rawChangeset.modify).forEach(([id, partial]) => {
    const base = existingMap[id];
    if (!base) return; // skip unknown
    const merged = sanitizePoint({ ...base, ...partial });
    const diff = {};
    ['type', 'name', 'coordinates', 'directionality', 'color', 'elevated', 'ihp'].forEach((k) => {
      if (merged[k] === undefined) return;
      const baseSanitized = sanitizePoint(base)[k];
      const val = merged[k];
      const same = (() => {
        if (k === 'coordinates') {
          if (!Array.isArray(val) || !Array.isArray(baseSanitized)) return false;
          if (val.length !== baseSanitized.length) return false;
          return val.every(
            (p, i) => p.lat === baseSanitized[i].lat && p.lng === baseSanitized[i].lng
          );
        }
        return val === baseSanitized;
      })();
      if (!same) diff[k] = val;
    });
    if (Object.keys(diff).length > 0) modify[id] = diff;
  });
  const del = rawChangeset.delete.slice();
  return { create, modify, delete: del };
};

const validatePoint = (pt) => {
  const errors = [];
  if (!pt || typeof pt !== 'object') return ['Point data missing.'];
  const type = pt.type;
  if (!type || !POINT_TYPES.includes(type)) {
    errors.push('Invalid or missing type.');
    return errors;
  }
  const rules = TYPE_RULES[type];

  const name = (pt.name || '').trim();
  if (!name) errors.push('Name required (non-empty after trimming).');

  if (!Array.isArray(pt.coordinates) || pt.coordinates.length < 2) {
    errors.push('At least two coordinates required.');
  } else {
    pt.coordinates.forEach((c, idx) => {
      const latOk = typeof c?.lat === 'number' && c.lat >= -90 && c.lat <= 90;
      const lngOk = typeof c?.lng === 'number' && c.lng >= -180 && c.lng <= 180;
      if (!latOk || !lngOk)
        errors.push(`Coordinate ${idx} out of range (lat -90..90, lng -180..180).`);
    });
    const distanceMeters = (a, b) => {
      if (!a || !b) return Infinity;
      const R = 6371000;
      const toRad = (d) => (d * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const sinDLat = Math.sin(dLat / 2);
      const sinDLng = Math.sin(dLng / 2);
      const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
      const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      return R * c;
    };
    if (pt.coordinates.length >= 2) {
      for (let i = 0; i < pt.coordinates.length - 1; i++) {
        const d = distanceMeters(pt.coordinates[i], pt.coordinates[i + 1]);
        if (d < MIN_SEGMENT_POINT_DISTANCE_METERS) {
          errors.push(
            `Coordinate ${i} and ${i + 1} are only ${d.toFixed(
              2
            )}m apart (< ${MIN_SEGMENT_POINT_DISTANCE_METERS}m). Remove duplicate/overlapping point.`
          );
        }
      }
    }
  }

  rules.required.forEach((field) => {
    if (field === 'name') return;
    if (pt[field] === undefined || pt[field] === '') {
      errors.push(`Field '${field}' is required for ${type}.`);
    }
  });

  if (pt.directionality) {
    if (!DIRECTIONALITY.includes(pt.directionality))
      errors.push("directionality must be 'bi-directional' or 'uni-directional'.");
  }
  if ((type === 'lead_on' || type === 'stand') && pt.directionality) {
    errors.push('directionality is forbidden for this type.');
  }
  if (type === 'taxiway') {
    if (!pt.color) errors.push('color required for taxiway.');
    else if (!COLORS.includes(pt.color)) errors.push('Invalid taxiway color.');
  }
  if (type !== 'taxiway' && pt.color) {
    errors.push('color is forbidden for this type and will be ignored.');
  }
  if (type === 'stopbar') {
    if (!pt.directionality) errors.push('directionality required for stopbar.');
    if (pt.elevated && pt.directionality !== 'uni-directional')
      errors.push("Elevated stopbars must be 'uni-directional'.");
  } else {
    if (pt.elevated) errors.push('elevated is only valid for stopbar.');
    if (pt.ihp) errors.push('ihp is only valid for stopbar.');
  }

  return errors;
};

const emptyFormState = {
  type: 'stopbar',
  name: '',
  directionality: 'uni-directional',
  color: '',
  elevated: false,
  ihp: false,
};

const AirportPointEditor = ({ existingPoints = [], onChangesetChange, height = 'dynamic' }) => {
  const [remotePoints, setRemotePoints] = useState(null); // null = not loaded
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(null);
  const [uploadState, setUploadState] = useState({ status: 'idle', message: '' }); // uploading|success|error|idle
  const fetchInFlightRef = useRef(false);
  const { airportId } = useParams();
  const icao = (airportId || '').toUpperCase();
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const [airportMeta, setAirportMeta] = useState(null);
  const [airportMetaError, setAirportMetaError] = useState(null);
  const [airportMetaLoading, setAirportMetaLoading] = useState(false);
  // Automatic base map fallback state. 0 = primary (BARS/Azure), then Mapbox satellite (if token), then OSM.
  const [providerIndex, setProviderIndex] = useState(0);
  const tileLoadSuccessRef = useRef(false); // whether current provider has at least one loaded tile
  const attemptedFallbackRef = useRef(false); // prevent infinite loop

  useEffect(() => {
    if (!icao) return;
    let aborted = false;
    const fetchAirport = async () => {
      try {
        setAirportMetaLoading(true);
        setAirportMetaError(null);
        const resp = await fetch(
          `https://v2.stopbars.com/airports?icao=${encodeURIComponent(icao)}`
        );
        if (!resp.ok) throw new Error(`Failed to fetch airport (${resp.status})`);
        const data = await resp.json();
        if (!aborted) setAirportMeta(data);
      } catch (e) {
        if (!aborted) setAirportMetaError(e.message);
      } finally {
        if (!aborted) setAirportMetaLoading(false);
      }
    };
    fetchAirport();
    return () => {
      aborted = true;
    };
  }, [icao]);
  const [changeset, setChangeset] = useState(defaultChangeset);
  const [selectedId, setSelectedId] = useState(null);
  const [formState, setFormState] = useState(emptyFormState);
  const [formErrors, setFormErrors] = useState([]);
  const featureLayerMapRef = useRef({});
  const mapInstanceRef = useRef(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [drawingCoords, setDrawingCoords] = useState([]);
  const originalGeometryRef = useRef({});
  const redrawTargetRef = useRef(null);
  const redrawOriginRef = useRef({});
  const [liveGeometryTick, setLiveGeometryTick] = useState(0);
  const geomanAPIRef = useRef(null);
  const editUndoStackRef = useRef({});
  const lastEditCoordsRef = useRef({});
  const drawingCoordsRef = useRef([]);
  useEffect(() => {
    drawingCoordsRef.current = drawingCoords;
  }, [drawingCoords]);
  useEffect(() => {
    if (uploadState.status === 'success') {
      const t = setTimeout(() => {
        setUploadState({ status: 'idle', message: '' });
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [uploadState.status]);

  // No global snapshots; undo only in drawing or when editing a selected geometry

  const performUndo = useCallback(() => {
    // Drawing-time undo
    if (geomanAPIRef.current?.undoDrawing && geomanAPIRef.current.undoDrawing()) {
      setTimeout(() => {
        if (creatingNew && !selectedId && (drawingCoordsRef.current?.length || 0) === 0) {
          const pm = mapInstanceRef.current?.pm;
          if (pm) {
            try {
              pm.disableDraw();
            } catch (e) {
              void e; /* ignore */
            }
            pm.enableDraw('Line', {
              snappable: true,
              snapDistance: 12,
              snapSegment: true,
              snapMiddle: true,
              requireSnapToFinish: false,
              templineStyle: { color: '#3b82f6' },
              hintlineStyle: { color: '#60a5fa', dashArray: '5,5' },
            });
          }
        }
      }, 0);
      return true;
    }
    // Edit-time undo for selected feature
    if (selectedId) {
      const layer = featureLayerMapRef.current[selectedId];
      const stack = editUndoStackRef.current[selectedId] || [];
      if (layer && stack.length > 0) {
        const prevCoords = stack.pop();
        if (layer.setLatLngs && prevCoords.length >= 2) {
          layer.setLatLngs(prevCoords.map((c) => [c.lat, c.lng]));
        } else if (layer.setLatLng && prevCoords.length === 1) {
          const { lat, lng } = prevCoords[0];
          layer.setLatLng([lat, lng]);
        }
        lastEditCoordsRef.current[selectedId] = prevCoords;
        setChangeset((prev) => {
          const next = { ...prev };
          if (selectedId.startsWith('new_')) {
            next.create = next.create.map((c) =>
              c._tempId === selectedId ? { ...c, coordinates: prevCoords } : c
            );
          } else {
            const cur = next.modify[selectedId] || {};
            next.modify = { ...next.modify, [selectedId]: { ...cur, coordinates: prevCoords } };
          }

          return next;
        });
        setLiveGeometryTick((t) => t + 1);
        return true;
      }
    }
    return false;
  }, [creatingNew, selectedId]);

  // Redo removed

  useEffect(() => {
    const onKey = (e) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const key = (e.key || '').toLowerCase();
      // Undo: Ctrl/Cmd+Z
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        performUndo();
        return;
      }
    };
    // Use capture phase to win over any handlers inside the map canvas
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [performUndo]);

  const startAddPoint = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    map.pm.disableDraw();
    // entering drawing mode — undo/redo uses drawing stacks only
    setCreatingNew(true);
    setDrawingCoords([]);
    setFormState(emptyFormState);
    map.pm.enableDraw('Line', {
      snappable: true,
      snapDistance: 12,
      snapSegment: true,
      snapMiddle: true,
      requireSnapToFinish: false,
      templineStyle: { color: '#3b82f6' },
      hintlineStyle: { color: '#60a5fa', dashArray: '5,5' },
    });
  }, []);

  // Cancel in-progress placement (before a new temp feature is created/selected)
  const cancelNewDrawing = useCallback(() => {
    setCreatingNew(false);
    setDrawingCoords([]);
    if (mapInstanceRef.current?.pm) {
      mapInstanceRef.current.pm.disableDraw();
    }
    // If somehow a new temp layer got selected, just clear selection state
    if (selectedId && selectedId.startsWith('new_')) {
      const layer = featureLayerMapRef.current[selectedId];
      if (layer?.pm) layer.pm.disable();
      setSelectedId(null);
      setFormState(emptyFormState);
    }
  }, [selectedId]);

  const handleRemoveUnsavedNew = useCallback(
    (targetId) => {
      if (!targetId || !targetId.startsWith('new_')) return;
      // removing an unsaved new feature; no edit history needed here
      const layer = featureLayerMapRef.current[targetId];
      if (layer) layer.remove();
      setChangeset((prev) => ({
        ...prev,
        create: prev.create.filter((c) => c._tempId !== targetId),
      }));
      delete featureLayerMapRef.current[targetId];
      if (selectedId === targetId) {
        setSelectedId(null);
        setCreatingNew(false);
        setFormState(emptyFormState);
        setFormErrors([]);
      }
    },
    [selectedId]
  );

  const activeExistingPoints = useMemo(
    () => (remotePoints !== null ? remotePoints : existingPoints),
    [remotePoints, existingPoints]
  );
  const existingMap = useMemo(() => {
    const map = {};
    activeExistingPoints.forEach((p) => (map[p.id] = p));
    return map;
  }, [activeExistingPoints]);

  const triggerFetchPoints = useCallback(
    async (force = false) => {
      if (!icao) return;
      if (fetchInFlightRef.current && !force) return; // already fetching
      if (!force && remotePoints !== null) return; // already loaded
      fetchInFlightRef.current = true;
      try {
        setRemoteLoading(true);
        setRemoteError(null);
        const resp = await fetch(
          `https://v2.stopbars.com/airports/${encodeURIComponent(icao)}/points`
        );
        if (!resp.ok) throw new Error(`Failed to load points (${resp.status})`);
        const data = await resp.json();
        if (!Array.isArray(data)) throw new Error('Invalid points response format');
        // Remove non-new layers so they rebuild with fresh data
        Object.entries(featureLayerMapRef.current).forEach(([id, layer]) => {
          if (!id.startsWith('new_') && layer?.remove) layer.remove();
        });
        featureLayerMapRef.current = Object.fromEntries(
          Object.entries(featureLayerMapRef.current).filter(([id]) => id.startsWith('new_'))
        );
        setRemotePoints(data);
      } catch (e) {
        setRemoteError(e.message);
      } finally {
        setRemoteLoading(false);
        fetchInFlightRef.current = false;
      }
    },
    [icao, remotePoints]
  );

  useEffect(() => {
    if (existingPoints.length === 0 && remotePoints === null && !remoteLoading) {
      triggerFetchPoints();
    }
  }, [existingPoints.length, remotePoints, remoteLoading, triggerFetchPoints]);

  const extractCoords = useCallback((layer) => {
    if (!layer) return [];
    if (layer.getLatLng) {
      const { lat, lng } = layer.getLatLng();
      return [{ lat, lng }];
    }
    if (layer.getLatLngs) {
      const latlngs = layer.getLatLngs();

      return latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }));
    }
    return [];
  }, []);

  const pushGeometryChange = useCallback(
    (layer) => {
      if (!layer) return;
      const id = layer.options.pointId;
      const coords = extractCoords(layer);
      // Edit mode history: record previous coords when selected layer changes
      if (selectedId === id) {
        const last = lastEditCoordsRef.current[id];
        if (last) {
          if (!editUndoStackRef.current[id]) editUndoStackRef.current[id] = [];
          editUndoStackRef.current[id].push(last);
        }
        lastEditCoordsRef.current[id] = coords;
      }
      setChangeset((prev) => {
        if (id.startsWith('new_')) {
          const clone = { ...prev };
          clone.create = clone.create.map((c) =>
            c._tempId === id ? { ...c, coordinates: coords } : c
          );
          return clone;
        }
        setLiveGeometryTick((t) => t + 1);
        return prev;
      });
    },
    [setLiveGeometryTick, extractCoords, selectedId]
  );

  const registerSelect = useCallback(
    (layer, id, isNew = false) => {
      setSelectedId(id);
      // initialize per-object edit history
      const currentCoords = extractCoords(layer);
      lastEditCoordsRef.current[id] = currentCoords;
      editUndoStackRef.current[id] = [];
      let basePoint;
      if (isNew) {
        const createEntry = changeset.create.find((c) => c._tempId === id);
        if (createEntry) {
          basePoint = {
            ...createEntry,
            id: createEntry._tempId,
            coordinates: createEntry.coordinates || extractCoords(layer),
          };
        } else {
          basePoint = {
            ...emptyFormState,
            name: '',
            type: 'stopbar',
            coordinates: extractCoords(layer),
          };
        }
      } else {
        basePoint = existingMap[id];
      }
      if (basePoint) {
        const currentModify = changeset.modify[id];
        const effective = currentModify ? { ...basePoint, ...currentModify } : basePoint;
        setFormState({
          type: effective.type || 'stopbar',
          name: effective.name || '',
          directionality:
            effective.directionality ||
            (effective.type === 'stopbar' || effective.type === 'taxiway' ? 'uni-directional' : ''),
          color: effective.color || '',
          elevated: !!effective.elevated,
          ihp: !!effective.ihp,
        });
      }

      if (layer?.pm) {
        Object.values(featureLayerMapRef.current).forEach((l) => {
          if (l.pm && l !== layer) l.pm.disable();
        });
        layer.pm.enable({ allowSelfIntersection: false, snappable: false, snapDistance: 0 });
        if (isNew) {
          const coords = extractCoords(layer);
          originalGeometryRef.current[id] = coords.map((c) => ({ ...c }));
        } else if (existingMap[id]) {
          originalGeometryRef.current[id] = (existingMap[id].coordinates || []).map((c) => ({
            ...c,
          }));
        }
        const bump = () => {
          pushGeometryChange(layer);
          const ll = layer.getLatLngs
            ? layer.getLatLngs()
            : layer.getLatLng
              ? [layer.getLatLng()]
              : [];
          const count = Array.isArray(ll) ? ll.length : 0;
          if (count <= 1) {
            if (layer?.pm) layer.pm.disable();
            if (id.startsWith('new_')) {
              redrawTargetRef.current = id;
            } else {
              const newId = `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              redrawTargetRef.current = newId;
              setChangeset((prev) => {
                const next = { ...prev };
                next.create = [
                  ...next.create,
                  { _tempId: newId, ...existingMap[id], coordinates: [] },
                ];
                return next;
              });
              redrawOriginRef.current[newId] = id;
              setSelectedId(newId);
            }
            setCreatingNew(true);
            if (mapInstanceRef.current) {
              mapInstanceRef.current.pm.disableDraw();
              mapInstanceRef.current.pm.enableDraw('Line', {
                snappable: true,
                snapDistance: 12,
                snapSegment: true,
                snapMiddle: true,
                requireSnapToFinish: false,
                templineStyle: { color: '#3b82f6' },
                hintlineStyle: { color: '#60a5fa', dashArray: '5,5' },
              });
            }
            return;
          }
        };
        layer.on('pm:markerdrag', bump);
        layer.on('pm:snapdrag', bump);

        layer.on('pm:vertexadded', () => {
          bump();
        });
        layer.on('pm:vertexremoved', () => {
          bump();
        });
      }

      if (isNew) setCreatingNew(true);
      else setCreatingNew(false);

      Object.entries(featureLayerMapRef.current).forEach(([pid, lyr]) => {
        const isDeleted = changeset.delete.includes(pid);
        const ptData = existingMap[pid] ||
          changeset.create.find((c) => c._tempId === pid) || { type: 'stopbar' };
        styleLayerByPoint(lyr, ptData, pid === id, isDeleted);
      });
    },
    [existingMap, changeset, pushGeometryChange, extractCoords]
  );

  const handleCancelEdit = useCallback(() => {
    if (!selectedId) return;
    if (selectedId.startsWith('new_')) {
      const createEntry = changeset.create.find((c) => c._tempId === selectedId);
      const tempLayer = featureLayerMapRef.current[selectedId];
      if (createEntry) {
        const snapshot = originalGeometryRef.current[selectedId] || createEntry.coordinates || [];
        if (tempLayer && snapshot && snapshot.length) {
          if (tempLayer.setLatLngs && snapshot.length >= 2) {
            tempLayer.setLatLngs(snapshot.map((c) => [c.lat, c.lng]));
          } else if (tempLayer.setLatLng && snapshot.length === 1) {
            const { lat, lng } = snapshot[0];
            tempLayer.setLatLng([lat, lng]);
          }
        }
        setChangeset((prev) => ({
          ...prev,
          create: prev.create.map((c) =>
            c._tempId === selectedId ? { ...c, coordinates: snapshot } : c
          ),
        }));
        setFormState((s) => ({
          ...s,
          type: createEntry.type || s.type,
          name: createEntry.name || '',
          directionality:
            createEntry.directionality ||
            (createEntry.type === 'stopbar' || createEntry.type === 'taxiway'
              ? 'uni-directional'
              : ''),
          color: createEntry.color || '',
          elevated: !!createEntry.elevated,
          ihp: !!createEntry.ihp,
        }));
        if (tempLayer?.pm) tempLayer.pm.disable();
        if (mapInstanceRef.current?.pm) mapInstanceRef.current.pm.disableDraw();
        setSelectedId(null);
        setFormErrors([]);
        setCreatingNew(false);
        return;
      } else {
        const originId = redrawOriginRef.current[selectedId];
        if (originId) {
          const originLayer = featureLayerMapRef.current[originId];
          const originSnapshot =
            originalGeometryRef.current[originId] || existingMap[originId]?.coordinates;
          if (originLayer && originSnapshot && originSnapshot.length) {
            if (originLayer.setLatLngs && originSnapshot.length >= 2)
              originLayer.setLatLngs(originSnapshot.map((c) => [c.lat, c.lng]));
            else if (originLayer.setLatLng && originSnapshot.length === 1) {
              const { lat, lng } = originSnapshot[0];
              originLayer.setLatLng([lat, lng]);
            }
          }
          delete redrawOriginRef.current[selectedId];
        }
        if (tempLayer) {
          if (tempLayer.pm) tempLayer.pm.disable();
          tempLayer.remove();
        }
        setChangeset((prev) => ({
          ...prev,
          create: prev.create.filter((c) => c._tempId !== selectedId),
        }));
        delete featureLayerMapRef.current[selectedId];
        if (mapInstanceRef.current?.pm) mapInstanceRef.current.pm.disableDraw();
        setSelectedId(null);
        setFormState(emptyFormState);
        setFormErrors([]);
        setCreatingNew(false);
        return;
      }
    }
    const layer = featureLayerMapRef.current[selectedId];
    const original = existingMap[selectedId];
    if (layer && original) {
      const snapshot = originalGeometryRef.current[selectedId] || original.coordinates;
      if (layer.setLatLngs && Array.isArray(snapshot) && snapshot.length >= 2) {
        layer.setLatLngs(snapshot.map((c) => [c.lat, c.lng]));
      } else if (layer.setLatLng && Array.isArray(snapshot) && snapshot.length === 1) {
        const { lat, lng } = snapshot[0];
        layer.setLatLng([lat, lng]);
      }
    }
    setChangeset((prev) => {
      if (!prev.modify[selectedId]) return prev;
      const clone = { ...prev, modify: { ...prev.modify } };
      delete clone.modify[selectedId];
      return clone;
    });

    delete originalGeometryRef.current[selectedId];

    if (layer?.pm) layer.pm.disable();
    if (mapInstanceRef.current?.pm) mapInstanceRef.current.pm.disableDraw();

    setSelectedId(null);
    setFormState(emptyFormState);
    setFormErrors([]);

    Object.entries(featureLayerMapRef.current).forEach(([pid, lyr]) => {
      const isDeleted = changeset.delete.includes(pid);
      const pointData = existingMap[pid] ||
        changeset.create.find((c) => c._tempId === pid) || { type: 'stopbar' };
      styleLayerByPoint(lyr, pointData, false, isDeleted);
    });
  }, [selectedId, existingMap, changeset.create, changeset.delete]);

  useEffect(() => {
    if (!selectedId) {
      Object.values(featureLayerMapRef.current).forEach((l) => {
        if (l.pm) l.pm.disable();
      });
    }
  }, [selectedId]);

  const serializeChangeset = useCallback(
    (cs) => buildSanitizedChangeset(cs, existingMap),
    [existingMap]
  );

  useEffect(() => {
    onChangesetChange && onChangesetChange(serializeChangeset(changeset));
  }, [changeset, onChangesetChange, serializeChangeset]);

  const handleSave = () => {
    if (!selectedId) return;
    const layer = featureLayerMapRef.current[selectedId];
    const coordinates = extractCoords(layer);
    const pointObj = { ...formState, coordinates };
    if (pointObj.type === 'taxiway' && !pointObj.color) pointObj.color = 'green';
    const errors = validatePoint(pointObj);
    setFormErrors(errors);
    if (errors.length) return;

    setChangeset((prev) => {
      const next = { ...prev };
      if (selectedId.startsWith('new_')) {
        if (!next.create.find((c) => c._tempId === selectedId)) {
          next.create = [...next.create, { ...pointObj, _tempId: selectedId }];
        } else {
          next.create = next.create.map((c) =>
            c._tempId === selectedId ? { ...c, ...pointObj } : c
          );
        }
      } else {
        const original = existingMap[selectedId];
        if (original) {
          const originalSan = sanitizePoint(original);
          const newSan = sanitizePoint(pointObj);
          const diff = {};
          ['type', 'name', 'directionality', 'color', 'elevated', 'ihp'].forEach((k) => {
            const oVal = originalSan[k];
            const nVal = newSan[k];
            if (k === 'name') {
              if (nVal !== oVal) diff[k] = nVal;
              return;
            }
            const norm = (v) => (v === '' ? undefined : v);
            if (norm(nVal) !== norm(oVal)) diff[k] = nVal;
          });
          // Coordinates diff (compare sanitized arrays)
          if (!arraysEqualCoords(newSan.coordinates, originalSan.coordinates)) {
            diff.coordinates = newSan.coordinates;
          }
          if (Object.keys(diff).length > 0) {
            next.modify = { ...next.modify, [selectedId]: diff };
          } else if (next.modify[selectedId]) {
            const cloneMod = { ...next.modify };
            delete cloneMod[selectedId];
            next.modify = cloneMod;
          }
        }
      }
      return next;
    });

    if (layer?.pm) layer.pm.disable();
    setSelectedId(null);
    setFormState(emptyFormState);
    setCreatingNew(false);
    setFormErrors([]);
  };

  const arraysEqualCoords = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((p, i) => p.lat === b[i].lat && p.lng === b[i].lng);
  };

  const handleReverse = useCallback(() => {
    if (!selectedId) return;
    const layer = featureLayerMapRef.current[selectedId];
    const coords = extractCoords(layer);
    if (!Array.isArray(coords) || coords.length < 2) return;
    const rev = [...coords].reverse();

    // update visual layer
    if (layer) {
      if (layer.setLatLngs && rev.length >= 2) {
        layer.setLatLngs(rev.map((c) => [c.lat, c.lng]));
      } else if (layer.setLatLng && rev.length === 1) {
        layer.setLatLng([rev[0].lat, rev[0].lng]);
      }
    }

    // persist to changeset
    setChangeset((prev) => {
      const next = { ...prev };
      if (selectedId.startsWith('new_')) {
        next.create = next.create.map((c) =>
          c._tempId === selectedId ? { ...c, coordinates: rev } : c
        );
      } else {
        const cur = next.modify[selectedId] || {};
        next.modify = { ...next.modify, [selectedId]: { ...cur, coordinates: rev } };
      }
      return next;
    });

    // notify live geometry changed
    setLiveGeometryTick((t) => t + 1);
  }, [selectedId, extractCoords]);

  const handleDeleteToggle = () => {
    if (!selectedId || selectedId.startsWith('new_')) return;
    setChangeset((prev) => {
      const next = { ...prev };
      if (next.delete.includes(selectedId)) {
        next.delete = next.delete.filter((i) => i !== selectedId);
      } else {
        next.delete = [...next.delete, selectedId];
        if (next.modify[selectedId]) {
          const m = { ...next.modify };
          delete m[selectedId];
          next.modify = m;
        }
      }
      return next;
    });
  };

  // (serializeChangeset already defined earlier)

  const resetAll = () => {
    Object.keys(featureLayerMapRef.current).forEach((id) => {
      if (id.startsWith('new_')) featureLayerMapRef.current[id].remove();
    });
    setChangeset(defaultChangeset());
    setSelectedId(null);
    setFormState(emptyFormState);
    setCreatingNew(false);
    if (mapInstanceRef.current) mapInstanceRef.current.pm.disableDraw();
    editUndoStackRef.current = {};
    lastEditCoordsRef.current = {};
  };

  useEffect(() => {
    Object.entries(featureLayerMapRef.current).forEach(([pid, lyr]) => {
      const isDeleted = changeset.delete.includes(pid);
      const pointData = existingMap[pid] ||
        changeset.create.find((c) => c._tempId === pid) || { type: 'stopbar' };
      styleLayerByPoint(lyr, pointData, pid === selectedId, isDeleted);
    });
  }, [changeset.delete, changeset.create, existingMap, selectedId]);

  // Build pending and existing lists for sidebar
  const pendingCreates = changeset.create.map((c) => ({ ...c, id: c._tempId, state: 'create' }));
  const pendingModifies = Object.keys(changeset.modify).map((id) => {
    const base = existingMap[id] || { id };
    const diff = changeset.modify[id] || {};
    return { ...base, ...diff, id, state: 'modify' };
  });
  const pendingDeletes = changeset.delete.map((id) => ({
    ...(existingMap[id] || { id }),
    id,
    state: 'delete',
  }));
  const pendingIds = new Set([
    ...pendingCreates.map((p) => p.id),
    ...pendingModifies.map((p) => p.id),
    ...pendingDeletes.map((p) => p.id),
  ]);
  const existingStable = activeExistingPoints
    .filter((p) => !pendingIds.has(p.id))
    .map((p) => ({ ...p, state: 'existing' }));

  const [searchQuery, setSearchQuery] = useSearchQuery();
  const searchInputRef = useRef(null);
  const combinedObjects = useMemo(() => {
    let list = [...pendingCreates, ...pendingModifies, ...pendingDeletes, ...existingStable];
    if (selectedId && formState && selectedId.startsWith('new_')) {
      list = list.map((p) => (p.id === selectedId ? { ...p, ...formState } : p));
    }
    const q = (searchQuery || '').trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const name = (p.name || '').toLowerCase();
        const type = (p.type || '').toLowerCase();
        const id = (p.id || '').toLowerCase();
        return name.includes(q) || type.includes(q) || id.includes(q);
      });
    }
    return list.sort((a, b) => {
      const na = (a.name || '').toLowerCase();
      const nb = (b.name || '').toLowerCase();
      if (na < nb) return -1;
      if (na > nb) return 1;
      return a.id.localeCompare(b.id);
    });
  }, [
    pendingCreates,
    pendingModifies,
    pendingDeletes,
    existingStable,
    selectedId,
    formState,
    searchQuery,
  ]);

  const parsedAirportCenter = useMemo(() => {
    if (!airportMeta) return null;
    const lat = parseFloat(airportMeta.latitude);
    const lon = parseFloat(airportMeta.longitude);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      return [lat, lon];
    }
    return null;
  }, [airportMeta]);
  const frozenCenterRef = useRef(null);
  if (!frozenCenterRef.current && parsedAirportCenter) {
    frozenCenterRef.current = parsedAirportCenter;
  }
  const derivedCenter = frozenCenterRef.current;

  const MAX_BOUNDS_RADIUS_KM = 25; // fallback radius if bbox not present
  const maxBounds = useMemo(() => {
    // Prefer explicit bbox from airport metadata if available
    if (
      airportMeta &&
      Number.isFinite(airportMeta.bbox_min_lat) &&
      Number.isFinite(airportMeta.bbox_min_lon) &&
      Number.isFinite(airportMeta.bbox_max_lat) &&
      Number.isFinite(airportMeta.bbox_max_lon)
    ) {
      const minLat = airportMeta.bbox_min_lat;
      const minLon = airportMeta.bbox_min_lon;
      const maxLat = airportMeta.bbox_max_lat;
      const maxLon = airportMeta.bbox_max_lon;
      if (
        Math.abs(minLat) <= 90 &&
        Math.abs(maxLat) <= 90 &&
        Math.abs(minLon) <= 180 &&
        Math.abs(maxLon) <= 180 &&
        maxLat > minLat &&
        maxLon > minLon
      ) {
        // Add a small padding (10%) similar to prior logic to avoid tight edges
        const padLat = (maxLat - minLat) * 0.1 || 0.001;
        const padLon = (maxLon - minLon) * 0.1 || 0.001;
        return L.latLngBounds(
          [minLat - padLat, minLon - padLon],
          [maxLat + padLat, maxLon + padLon]
        );
      }
    }
    // Fallback: old synthetic radius around center
    if (!parsedAirportCenter) return null;
    const [clat, clon] = parsedAirportCenter;
    const radiusKm = MAX_BOUNDS_RADIUS_KM;
    const latDelta = radiusKm / 111.32 / 3;
    const cosLat = Math.cos((clat * Math.PI) / 180) || 1;
    const lngDelta = radiusKm / (111.32 * cosLat) / 3;
    return L.latLngBounds([clat - latDelta, clon - lngDelta], [clat + latDelta, clon + lngDelta]);
  }, [airportMeta, parsedAirportCenter]);

  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    if (!icao) return;
    let aborted = false;
    const fetchAirport = async () => {
      try {
        setAirportMetaLoading(true);
        setAirportMetaError(null);
        const resp = await fetch(
          `https://v2.stopbars.com/airports?icao=${encodeURIComponent(icao)}`
        );
        if (!resp.ok) throw new Error(`Failed to fetch airport (${resp.status})`);
        const data = await resp.json();
        if (!aborted) setAirportMeta(data);
      } catch (e) {
        if (!aborted) setAirportMetaError(e.message);
      } finally {
        if (!aborted) setAirportMetaLoading(false);
      }
    };
    fetchAirport();
    return () => {
      aborted = true;
    };
  }, [icao, refreshTick]);

  const BoundsController = ({ bounds, suppressClamp }) => {
    const map = useMap();
    useEffect(() => {
      if (!bounds) return;
      map.setMaxBounds(bounds);
      const computeMinZoom = () => {
        const FIT_PADDING = 24;
        const fitZoom = map.getBoundsZoom(bounds, true, [FIT_PADDING, FIT_PADDING]);
        const ALLOW_ZOOM_OUT_LEVELS = 1;
        let minZoom = Math.max(3, fitZoom - ALLOW_ZOOM_OUT_LEVELS);
        const maxZoom = map.getMaxZoom?.() ?? 22;
        if (minZoom > maxZoom) minZoom = maxZoom - 1;
        map.setMinZoom(minZoom);
        if (map.getZoom() < minZoom) map.setZoom(minZoom);
      };
      computeMinZoom();
      const clampCenter = () => {
        if (suppressClamp) return; // Don't fight user while editing
        const center = map.getCenter();
        if (!bounds.contains(center)) {
          map.panInsideBounds(bounds, { animate: false });
        }
      };
      if (!suppressClamp) map.on('drag', clampCenter);
      const onResize = () => computeMinZoom();
      map.on('resize', onResize);
      return () => {
        map.off('resize', onResize);
        map.off('drag', clampCenter);
      };
    }, [bounds, map, suppressClamp]);
    return null;
  };
  BoundsController.propTypes = { bounds: PropTypes.object, suppressClamp: PropTypes.bool };

  const lastViewRef = useRef({ center: null, zoom: null });
  const ViewTracker = () => {
    const map = useMap();
    useEffect(() => {
      if (!lastViewRef.current.center && derivedCenter) {
        lastViewRef.current = { center: map.getCenter(), zoom: map.getZoom() };
      }
      const handler = () => {
        lastViewRef.current = { center: map.getCenter(), zoom: map.getZoom() };
      };
      map.on('moveend', handler);
      map.on('zoomend', handler);
      return () => {
        map.off('moveend', handler);
        map.off('zoomend', handler);
      };
    }, [map]);
    return null;
  };

  const HEIGHT_OFFSET = 120;
  const resolvedHeightValue = useMemo(() => {
    if (!height || height === 'dynamic') {
      return `clamp(650px, calc(100vh - ${HEIGHT_OFFSET}px), 100vh)`;
    }
    return height;
  }, [height]);

  return (
    <div className="flex flex-col px-4 py-6 lg:px-8 pt-16" style={{ height: resolvedHeightValue }}>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">
            {icao ? `${icao} Object Editor` : 'Airport Object Editor'}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Manage objects for BARS system integration</p>
        </div>
        {(() => {
          const isPlacing = creatingNew && !selectedId; // only toggle to Cancel while actively placing
          const disabled = !!selectedId; // disabled when editing an object
          return (
            <button
              onClick={() => {
                if (isPlacing) return cancelNewDrawing();
                if (!selectedId && !creatingNew) startAddPoint();
              }}
              disabled={disabled}
              className={`shrink-0 inline-flex items-center rounded-md text-sm font-medium px-4 py-2 border transition-colors ${disabled ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' : isPlacing ? 'bg-red-600 hover:bg-red-500 text-white border-red-500' : 'bg-white hover:bg-zinc-100 text-zinc-900 border-zinc-300 shadow'}`}
            >
              {isPlacing ? 'Cancel' : '+ Add New Object'}
            </button>
          );
        })()}
      </div>
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        <div className="flex-1 relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900">
          {airportMetaLoading && !derivedCenter && (
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 rounded-full border-4 border-zinc-700 border-t-blue-500 animate-spin" />
                <p className="text-xs text-zinc-400 tracking-wide">Loading airport map…</p>
              </div>
            </div>
          )}
          {!airportMetaLoading && !derivedCenter && (
            <div className="w-full h-full flex items-center justify-center p-4">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="text-sm font-medium text-red-400">
                  Unable to load airport position
                </span>
                {airportMetaError && (
                  <span className="text-[11px] text-red-300 max-w-xs wrap-break-word">
                    {airportMetaError}
                  </span>
                )}
                <button
                  onClick={() => {
                    setRefreshTick((t) => t + 1);
                  }}
                  className="px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          {derivedCenter && (
            <MapContainer
              center={derivedCenter}
              zoom={13}
              maxZoom={22}
              style={{ height: '100%', width: '100%' }}
              worldCopyJump={false}
              maxBounds={maxBounds || undefined}
              maxBoundsViscosity={maxBounds ? 1.0 : undefined}
              inertia={false}
            >
              {(() => {
                const providers = [
                  {
                    key: 'azure',
                    // maps.stopbars.com base layer -- attribution is dynamic and loaded by MapAttributionUpdater
                    element: (
                      <>
                        <TileLayer
                          url="https://maps.stopbars.com/{z}/{x}/{y}.png"
                          tileSize={256}
                          maxZoom={22}
                          maxNativeZoom={19}
                          attribution={false}
                          eventHandlers={{
                            tileload: () => {
                              tileLoadSuccessRef.current = true;
                            },
                            tileerror: () => {
                              if (!tileLoadSuccessRef.current) {
                                setProviderIndex((idx) => {
                                  return idx + 1;
                                });
                              }
                            },
                          }}
                        />
                        <MapAttributionUpdater bounds={maxBounds} />
                      </>
                    ),
                  },
                ];
                if (mapboxToken) {
                  providers.push({
                    key: 'satellite',
                    element: (
                      <TileLayer
                        url={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`}
                        tileSize={512}
                        zoomOffset={-1}
                        maxZoom={22}
                        attribution="Imagery © Mapbox"
                        eventHandlers={{
                          tileload: () => {
                            tileLoadSuccessRef.current = true;
                          },
                          tileerror: () => {
                            if (!tileLoadSuccessRef.current) {
                              setProviderIndex((idx) => idx + 1);
                            }
                          },
                        }}
                      />
                    ),
                  });
                }
                providers.push({
                  key: 'osm',
                  element: (
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      maxZoom={19}
                      attribution="© OpenStreetMap contributors"
                      eventHandlers={{
                        tileload: () => {
                          tileLoadSuccessRef.current = true;
                        },
                        tileerror: () => {
                          // Last provider; nothing further to do
                        },
                      }}
                    />
                  ),
                });

                const current = providers[Math.min(providerIndex, providers.length - 1)];
                // Reset flags when provider changes
                if (!attemptedFallbackRef.current) {
                  attemptedFallbackRef.current = true;
                }
                return current.element;
              })()}
              <ViewTracker />
              {/* Removed automatic BoundsFitter to prevent unwanted recentering while editing */}
              <GeomanController
                existingPoints={activeExistingPoints}
                featureLayerMapRef={featureLayerMapRef}
                registerSelect={registerSelect}
                pushGeometryChange={pushGeometryChange}
                mapInstanceRef={mapInstanceRef}
                onFeatureCreated={() => {
                  if (mapInstanceRef.current) mapInstanceRef.current.pm.disableDraw();
                }}
                onDrawingCoordsUpdate={setDrawingCoords}
                onDrawingComplete={() => setDrawingCoords([])}
                redrawTargetRef={redrawTargetRef}
                geomanAPIRef={geomanAPIRef}
              />
              <PolylineVisualizationOverlay
                featureLayerMapRef={featureLayerMapRef}
                changeset={changeset}
                existingMap={existingMap}
                selectedId={selectedId}
                registerSelect={registerSelect}
                formState={formState}
                drawingCoords={drawingCoords}
                liveGeometryTick={liveGeometryTick}
              />
              {maxBounds && <BoundsController bounds={maxBounds} suppressClamp={!!selectedId} />}
              {maxBounds && (
                <Rectangle
                  bounds={maxBounds}
                  pathOptions={{ color: '#dc2626', weight: 2, dashArray: '6 4', fill: false }}
                />
              )}
            </MapContainer>
          )}
        </div>
        <div className="w-full lg:w-96 flex flex-col gap-5 overflow-y-auto p-5 bg-zinc-900/80 backdrop-blur border border-zinc-700 rounded-lg">
          <h3 className="text-lg font-medium text-white">
            {selectedId && !selectedId.startsWith('new_') ? 'Edit Object' : 'Add New Object'}
          </h3>
          {remoteLoading && (
            <div className="text-[11px] text-blue-300 bg-blue-900/30 rounded px-2 py-1">
              Loading existing points…
            </div>
          )}
          {remoteError && (
            <div className="text-[11px] text-red-300 bg-red-900/40 rounded px-2 py-1 flex items-start gap-2">
              <span className="flex-1">Failed to load points: {remoteError}</span>
              <button type="button" className="underline" onClick={() => triggerFetchPoints(true)}>
                Retry
              </button>
            </div>
          )}
          {uploadState.status === 'error' && (
            <div className="text-[11px] text-red-300 bg-red-900/40 rounded px-2 py-1">
              {uploadState.message || 'Upload failed.'}
            </div>
          )}
          {uploadState.status === 'success' && (
            <div className="text-[11px] text-emerald-300 bg-emerald-900/30 rounded px-2 py-1">
              {uploadState.message || 'Changes saved.'}
            </div>
          )}
          {selectedId ? (
            <>
              <div className="space-y-3">
                {!creatingNew && selectedId.startsWith('new_') && (
                  <div className="text-[10px] text-amber-300 bg-amber-900/40 px-2 py-1 rounded">
                    New geometry captured. Fill details and save.
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1">
                    Object Type
                  </label>
                  <select
                    className="w-full bg-zinc-800/70 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-2 py-1 text-sm"
                    value={formState.type}
                    onChange={(e) =>
                      setFormState((s) => {
                        const newType = e.target.value;
                        let next = { ...s, type: newType };
                        if (newType === 'stopbar') {
                          if (!next.directionality) next.directionality = 'uni-directional';
                        } else if (newType === 'taxiway') {
                          if (!next.directionality) next.directionality = 'uni-directional';
                          if (!next.color) next.color = 'green';
                        } else {
                          next.directionality = '';
                        }
                        if (newType !== 'taxiway') next.color = '';
                        if (newType !== 'stopbar') {
                          next.elevated = false;
                          next.ihp = false;
                        }
                        return next;
                      })
                    }
                  >
                    {POINT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {formatLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1">
                    Object Name
                  </label>
                  <input
                    className="w-full bg-zinc-800/70 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-2 py-1 text-sm"
                    value={formState.name}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        name: (e.target.value || '').toUpperCase(),
                      }))
                    }
                    placeholder="A1"
                  />
                </div>
                {(formState.type === 'stopbar' || formState.type === 'taxiway') && (
                  <div>
                    <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1">
                      Directionality
                    </label>
                    <select
                      className="w-full bg-zinc-800/70 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-2 py-1 text-sm"
                      value={formState.directionality}
                      onChange={(e) =>
                        setFormState((s) => {
                          const nextDir = e.target.value;
                          const next = { ...s, directionality: nextDir };
                          if (s.type === 'stopbar' && nextDir === 'bi-directional' && s.elevated) {
                            next.elevated = false;
                          }
                          return next;
                        })
                      }
                    >
                      {DIRECTIONALITY.map((d) => (
                        <option key={d} value={d}>
                          {formatLabel(d)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {formState.type === 'taxiway' && (
                  <div>
                    <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1">
                      Color
                    </label>
                    <select
                      className="w-full bg-zinc-800/70 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-2 py-1 text-sm"
                      value={formState.color}
                      onChange={(e) =>
                        setFormState((s) => ({ ...s, color: e.target.value || 'green' }))
                      }
                    >
                      {COLORS.map((c) => (
                        <option key={c} value={c}>
                          {formatLabel(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {formState.type === 'stopbar' && (
                  <>
                    {formState.directionality === 'uni-directional' && (
                      <div className="flex items-center gap-2 text-sm">
                        <input
                          id="elevated"
                          type="checkbox"
                          checked={formState.elevated}
                          onChange={(e) =>
                            setFormState((s) => ({
                              ...s,
                              elevated: e.target.checked,
                              directionality: 'uni-directional', // enforce
                            }))
                          }
                        />
                        <label htmlFor="elevated" className="text-zinc-300">
                          Add Elevated stopbar lights?
                        </label>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <input
                        id="ihp"
                        type="checkbox"
                        checked={formState.ihp}
                        onChange={(e) => setFormState((s) => ({ ...s, ihp: e.target.checked }))}
                      />
                      <label htmlFor="ihp" className="text-zinc-300">
                        Intermediate Holding Point (IHP)
                      </label>
                    </div>
                  </>
                )}
                {formErrors.length > 0 && (
                  <ul className="text-xs text-red-400 list-disc pl-4">
                    {formErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSave}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded px-3 py-1.5"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReverse}
                    disabled={!selectedId}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded px-3 py-1.5"
                  >
                    Reverse
                  </button>
                  {selectedId.startsWith('new_') ? (
                    <button
                      onClick={() => handleRemoveUnsavedNew(selectedId)}
                      className="text-white text-sm rounded px-3 py-1.5 bg-red-600 hover:bg-red-500"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      onClick={handleDeleteToggle}
                      className={`text-white text-sm rounded px-3 py-1.5 ${changeset.delete.includes(selectedId) ? 'bg-amber-600 hover:bg-amber-500' : 'bg-red-600 hover:bg-red-500'}`}
                    >
                      {changeset.delete.includes(selectedId) ? 'Undo Delete' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700 rounded p-3">
              {creatingNew ? (
                <span>
                  Click on the map to add vertices. To finish, Ctrl+Left Click anywhere on the map
                  or click on a vertex. Adjust if needed, then press Save.
                </span>
              ) : (
                'Click + Add New Object to start creating a new object polyline on the map.'
              )}
            </div>
          )}
          <hr className="border-zinc-800" />
          <div className="flex items-center mt-2">
            <h3 className="text-sm font-medium text-zinc-200">Objects</h3>
          </div>
          <div className="mt-1 relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, type, or ID"
              className="w-full bg-zinc-800/70 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded pl-2 pr-8 py-1 text-sm"
            />
            {searchQuery?.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute inset-y-0 right-0 flex items-center pr-2 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
          {combinedObjects.length === 0 ? (
            <div className="text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700 rounded px-3 py-3 text-center">
              No objects.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 text-[13px] max-h-72 overflow-y-auto pr-1">
              {combinedObjects.map((p) => {
                const isSelected = p.id === selectedId;
                const isNew = p.id.startsWith('new_');
                const typeLabel = formatLabel(p.type || '');
                const barsId = !isNew ? p.id : 'Unsaved';
                return (
                  <li
                    key={`obj-${p.id}-${p.state}`}
                    className={`group rounded border flex flex-col gap-1 px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'border-blue-500 bg-zinc-700/80' : 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700/70'}`}
                    onClick={() => {
                      const layer = featureLayerMapRef.current[p.id];
                      if (layer) registerSelect(layer, p.id, isNew);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-zinc-100 truncate text-[12px]">
                          {p.name || '(Unnamed)'}
                        </span>
                        <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-600/60 text-zinc-100 tracking-wide">
                          {typeLabel}
                        </span>
                      </div>
                      <span
                        className={`text-[9px] uppercase tracking-wide rounded px-1 py-0.5 shrink-0 ${p.state === 'create' && 'bg-green-700 text-green-100'} ${p.state === 'modify' && 'bg-blue-700 text-blue-100'} ${p.state === 'delete' && 'bg-red-700 text-red-100'} ${p.state === 'existing' && 'bg-zinc-600 text-zinc-200'}`}
                      >
                        {p.state}
                      </span>
                    </div>
                    <div className="flex items-center justify-start text-[10px] text-zinc-400 font-mono">
                      <span className="truncate" title={barsId}>
                        {barsId}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="pt-1">
            <button
              disabled={
                uploadState.status === 'uploading' ||
                (changeset.create.length === 0 &&
                  Object.keys(changeset.modify).length === 0 &&
                  changeset.delete.length === 0)
              }
              onClick={async () => {
                const token = getVatsimToken();
                if (!token) {
                  setUploadState({ status: 'error', message: 'Login required to upload.' });
                  return;
                }
                const payload = serializeChangeset(changeset);
                if (
                  payload.create.length === 0 &&
                  Object.keys(payload.modify).length === 0 &&
                  payload.delete.length === 0
                )
                  return;
                setUploadState({ status: 'uploading', message: 'Uploading changes…' });
                try {
                  const resp = await fetch(
                    `https://v2.stopbars.com/airports/${encodeURIComponent(icao)}/points/batch`,
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-Vatsim-Token': token,
                      },
                      body: JSON.stringify(payload),
                    }
                  );
                  if (!resp.ok) {
                    let msg = '';
                    try {
                      const j = await resp.json();
                      msg = j?.error || j?.message || '';
                    } catch {
                      /* ignore */
                    }
                    throw new Error(msg || `Upload failed (${resp.status})`);
                  }
                  setUploadState({ status: 'success', message: 'Changes saved.' });
                  // Clear local layers and refetch
                  Object.entries(featureLayerMapRef.current).forEach(([, layer]) => {
                    if (layer?.remove) layer.remove();
                  });
                  featureLayerMapRef.current = {};
                  resetAll();
                  setRemotePoints(null);
                  triggerFetchPoints(true);
                } catch (e) {
                  setUploadState({ status: 'error', message: e.message });
                }
              }}
              className={`w-full text-xs rounded px-3 py-2 font-medium mt-1 transition-colors ${uploadState.status === 'uploading' || (changeset.create.length === 0 && Object.keys(changeset.modify).length === 0 && changeset.delete.length === 0) ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
            >
              {uploadState.status === 'uploading' ? 'Uploading…' : 'Save & Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

AirportPointEditor.propTypes = {
  existingPoints: PropTypes.array,
  onChangesetChange: PropTypes.func,
  height: PropTypes.string,
};

export default AirportPointEditor;
