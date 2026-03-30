import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import { MapContainer, TileLayer, useMap, Rectangle, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { getVatsimToken } from '../../utils/cookieUtils';
import {
  X,
  ExternalLink,
  Check,
  Plus,
  SquarePen,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Route,
  CircleFadingPlus,
  Loader,
  MapPinPlus,
  ImageUp,
  Lock,
  LockOpen,
} from 'lucide-react';
import { Dropdown } from '../shared/Dropdown';
import { Layout } from '../layout/Layout';
import { Toast } from '../shared/Toast';
import { Button } from '../shared/Button';
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

/**
 * Parse a coordinate string in either decimal or DMS format.
 * Decimal examples: "-27.3815, 153.1314"  or  "-27.3815 153.1314"
 * DMS examples:     "27°22'53.5"S 153°07'53.0"E"  or  "37°39'47.52"S 144°50'51.69"E"
 * Returns { lat, lng } or null if unparseable.
 */
const parseCoordinateString = (input) => {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Try DMS format: 27°22'53.5"S 153°07'53.0"E  (various quote styles)
  const dmsRegex =
    /(-?\d+)[°]\s*(\d+)[′']\s*([\d.]+)[″"]\s*([NSns])\s*[,;\s]+\s*(-?\d+)[°]\s*(\d+)[′']\s*([\d.]+)[″"]\s*([EWew])/;
  const dmsMatch = trimmed.match(dmsRegex);
  if (dmsMatch) {
    let lat =
      parseFloat(dmsMatch[1]) + parseFloat(dmsMatch[2]) / 60 + parseFloat(dmsMatch[3]) / 3600;
    if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
    let lng =
      parseFloat(dmsMatch[5]) + parseFloat(dmsMatch[6]) / 60 + parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
      return { lat, lng };
  }

  // Try decimal format: "-27.3815, 153.1314" or "-27.3815 153.1314"
  const parts = trimmed.split(/[,;\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
      return { lat, lng };
  }

  return null;
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

const MIN_OVERLAY_SIZE_PX = 24;
const PICK_DRAG_THRESHOLD_PX = 6;
const ROTATION_HANDLE_OFFSET_PX = 28;
const OVERLAY_ROTATION_TRANSFORM_REGEX =
  /\stranslate\([^)]*\)\srotate\([^)]*\)\stranslate\([^)]*\)\s*$/;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeAngle = (value) => {
  if (!Number.isFinite(value)) return 0;
  let next = value % 360;
  if (next > 180) next -= 360;
  if (next <= -180) next += 360;
  return next;
};

const rotatePointOffset = (point, angleDeg) => {
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return L.point(point.x * cos - point.y * sin, point.x * sin + point.y * cos);
};

const getOverlayMetricsFromBounds = (map, overlayBounds) => {
  const swPoint = map.latLngToLayerPoint(overlayBounds.getSouthWest());
  const nePoint = map.latLngToLayerPoint(overlayBounds.getNorthEast());
  const center = L.point((swPoint.x + nePoint.x) / 2, (swPoint.y + nePoint.y) / 2);

  return {
    center,
    width: Math.max(Math.abs(nePoint.x - swPoint.x), MIN_OVERLAY_SIZE_PX),
    height: Math.max(Math.abs(swPoint.y - nePoint.y), MIN_OVERLAY_SIZE_PX),
  };
};

const buildBoundsFromMetrics = (map, center, width, height) => {
  const swPoint = L.point(center.x - width / 2, center.y + height / 2);
  const nePoint = L.point(center.x + width / 2, center.y - height / 2);
  return L.latLngBounds(map.layerPointToLatLng(swPoint), map.layerPointToLatLng(nePoint));
};

const getUnitOverlayPoint = (normalizedPoint, aspectRatio = 1) =>
  L.point(
    ((normalizedPoint?.x ?? 0.5) - 0.5) * (aspectRatio > 0 ? aspectRatio : 1),
    (normalizedPoint?.y ?? 0.5) - 0.5
  );

const getDisplayedOverlayLayerPoint = ({ map, bounds, rotation = 0, normalizedPoint }) => {
  if (!map || !bounds || !normalizedPoint) return null;
  const { center, width, height } = getOverlayMetricsFromBounds(map, bounds);
  const localOffset = L.point(
    ((normalizedPoint.x ?? 0.5) - 0.5) * width,
    ((normalizedPoint.y ?? 0.5) - 0.5) * height
  );
  const rotatedOffset = rotatePointOffset(localOffset, rotation);
  return L.point(center.x + rotatedOffset.x, center.y + rotatedOffset.y);
};

const solveBestFitOverlayTransform = (sourcePoints, targetPoints) => {
  if (
    !Array.isArray(sourcePoints) ||
    !Array.isArray(targetPoints) ||
    sourcePoints.length !== targetPoints.length ||
    sourcePoints.length < 2
  ) {
    return null;
  }

  const count = sourcePoints.length;
  const sourceCentroid = sourcePoints.reduce(
    (sum, point) => L.point(sum.x + point.x, sum.y + point.y),
    L.point(0, 0)
  );
  sourceCentroid.x /= count;
  sourceCentroid.y /= count;

  const targetCentroid = targetPoints.reduce(
    (sum, point) => L.point(sum.x + point.x, sum.y + point.y),
    L.point(0, 0)
  );
  targetCentroid.x /= count;
  targetCentroid.y /= count;

  let dot = 0;
  let cross = 0;
  let sourceVariance = 0;

  for (let index = 0; index < count; index += 1) {
    const sourceDelta = L.point(
      sourcePoints[index].x - sourceCentroid.x,
      sourcePoints[index].y - sourceCentroid.y
    );
    const targetDelta = L.point(
      targetPoints[index].x - targetCentroid.x,
      targetPoints[index].y - targetCentroid.y
    );

    dot += sourceDelta.x * targetDelta.x + sourceDelta.y * targetDelta.y;
    cross += sourceDelta.x * targetDelta.y - sourceDelta.y * targetDelta.x;
    sourceVariance += sourceDelta.x * sourceDelta.x + sourceDelta.y * sourceDelta.y;
  }

  if (sourceVariance < 0.000001) return null;

  const heightScale = Math.hypot(dot, cross) / sourceVariance;
  const rotation = normalizeAngle((Math.atan2(cross, dot) * 180) / Math.PI);
  const rotatedSourceCentroid = rotatePointOffset(
    L.point(sourceCentroid.x * heightScale, sourceCentroid.y * heightScale),
    rotation
  );
  const center = L.point(
    targetCentroid.x - rotatedSourceCentroid.x,
    targetCentroid.y - rotatedSourceCentroid.y
  );

  return { center, heightScale, rotation };
};

// ---------------------------------------------------------------------------
// ImageOverlayTool
// Renders a draggable, resizable, rotatable, lockable image overlay inside the MapContainer.
// ---------------------------------------------------------------------------
const ImageOverlayTool = ({
  imageUrl,
  bounds,
  onBoundsChange,
  locked,
  opacity,
  rotation = 0,
  onRotationChange,
  aspectRatio = 1,
  autoAlignExpectingOverlayPoint = false,
  onAutoAlignOverlayPoint,
}) => {
  const map = useMap();
  const overlayRef = useRef(null);
  const dragMarkerRef = useRef(null);
  const cornerMarkersRef = useRef([]);
  const rotationMarkerRef = useRef(null);
  const rotationRef = useRef(normalizeAngle(rotation));
  const aspectRatioRef = useRef(aspectRatio > 0 ? aspectRatio : 1);
  const shiftPressedRef = useRef(false);
  const syncPresentationRef = useRef(() => {});
  const autoAlignGestureRef = useRef({
    active: false,
    moved: false,
    suppressClick: false,
    startX: 0,
    startY: 0,
  });

  const makeHandleIcon = (
    cursor = 'move',
    { size = 14, fill = '#3b82f6', outline = '#1e40af', radius = '50%' } = {}
  ) =>
    L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;border-radius:${radius};background:${fill};border:2px solid #fff;box-shadow:0 0 0 1px ${outline};cursor:${cursor};"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });

  const makeCornerIcon = () =>
    L.divIcon({
      className: '',
      html: `<div style="width:10px;height:10px;background:#f59e0b;border:2px solid #fff;box-shadow:0 0 0 1px #b45309;cursor:nwse-resize;"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    });

  const makeRotationIcon = () =>
    makeHandleIcon('grab', {
      size: 12,
      fill: '#10b981',
      outline: '#047857',
    });

  useEffect(() => {
    rotationRef.current = normalizeAngle(rotation);
    syncPresentationRef.current();
  }, [rotation]);

  useEffect(() => {
    aspectRatioRef.current = aspectRatio > 0 ? aspectRatio : 1;
  }, [aspectRatio]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Shift') shiftPressedRef.current = true;
    };
    const onKeyUp = (e) => {
      if (e.key === 'Shift') shiftPressedRef.current = false;
    };
    const resetShiftState = () => {
      shiftPressedRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', resetShiftState);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', resetShiftState);
    };
  }, []);

  useEffect(() => {
    if (!map || !imageUrl || !bounds) return;

    // Create the image overlay
    const overlay = L.imageOverlay(imageUrl, bounds, {
      opacity,
      interactive: false,
      className: 'bars-image-overlay',
    }).addTo(map);
    overlayRef.current = overlay;

    const getDisplayGeometry = (overlayBounds = overlay.getBounds()) => {
      const { center, width, height } = getOverlayMetricsFromBounds(map, overlayBounds);
      const cornerOffsets = [
        L.point(-width / 2, height / 2), // SW
        L.point(width / 2, height / 2), // SE
        L.point(width / 2, -height / 2), // NE
        L.point(-width / 2, -height / 2), // NW
      ];
      const corners = cornerOffsets.map((offset) => {
        const rotatedOffset = rotatePointOffset(offset, rotationRef.current);
        return L.point(center.x + rotatedOffset.x, center.y + rotatedOffset.y);
      });
      const rotationOffset = rotatePointOffset(
        L.point(0, -height / 2 - ROTATION_HANDLE_OFFSET_PX),
        rotationRef.current
      );

      return {
        center,
        width,
        height,
        corners,
        rotationHandle: L.point(center.x + rotationOffset.x, center.y + rotationOffset.y),
      };
    };

    const applyOverlayRotation = () => {
      const element = overlay.getElement();
      if (!element) return;
      const overlayBounds = overlay.getBounds();
      const { width, height } = getOverlayMetricsFromBounds(map, overlayBounds);
      const baseTransform = (element.style.transform || '')
        .replace(OVERLAY_ROTATION_TRANSFORM_REGEX, '')
        .trim();
      const pivotX = width / 2;
      const pivotY = height / 2;
      const rotationTransform =
        rotationRef.current === 0
          ? ''
          : ` translate(${pivotX}px, ${pivotY}px) rotate(${rotationRef.current}deg) translate(${-pivotX}px, ${-pivotY}px)`;

      // Keep Leaflet's top-left transform origin intact so animated zoom can scale from the
      // correct anchor, then add our center-based rotation as an extra transform segment.
      element.style.transformOrigin = '0 0';
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.transform = `${baseTransform}${rotationTransform}`.trim();
    };

    const syncPresentation = () => {
      applyOverlayRotation();

      if (locked) return;

      const geometry = getDisplayGeometry();
      dragMarkerRef.current?.setLatLng(map.layerPointToLatLng(geometry.center));
      cornerMarkersRef.current.forEach((marker, index) => {
        marker.setLatLng(map.layerPointToLatLng(geometry.corners[index]));
      });
      rotationMarkerRef.current?.setLatLng(map.layerPointToLatLng(geometry.rotationHandle));
    };
    syncPresentationRef.current = syncPresentation;
    map.on('zoomanim zoomend viewreset resize', syncPresentation);

    if (!locked) {
      // Center drag handle
      const geometry = getDisplayGeometry();
      const dragMarker = L.marker(map.layerPointToLatLng(geometry.center), {
        icon: makeHandleIcon('move'),
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);
      dragMarkerRef.current = dragMarker;

      dragMarker.on('drag', () => {
        const { width, height } = getOverlayMetricsFromBounds(map, overlay.getBounds());
        const centerPoint = map.latLngToLayerPoint(dragMarker.getLatLng());
        const newBounds = buildBoundsFromMetrics(map, centerPoint, width, height);
        overlay.setBounds(newBounds);
        syncPresentation();
      });

      dragMarker.on('dragend', () => {
        onBoundsChange(overlay.getBounds());
      });

      // Corner resize handles
      const cornerDirections = [
        { x: -1, y: 1 }, // SW
        { x: 1, y: 1 }, // SE
        { x: 1, y: -1 }, // NE
        { x: -1, y: -1 }, // NW
      ];
      const cornerMarkers = geometry.corners.map((corner, idx) => {
        const m = L.marker(map.layerPointToLatLng(corner), {
          icon: makeCornerIcon(),
          draggable: true,
          zIndexOffset: 1001,
        }).addTo(map);

        m.on('drag', () => {
          const geometry = getDisplayGeometry();
          const anchorPoint = geometry.corners[(idx + 2) % 4];
          const pointerPoint = map.latLngToLayerPoint(m.getLatLng());
          const localVector = rotatePointOffset(
            L.point(pointerPoint.x - anchorPoint.x, pointerPoint.y - anchorPoint.y),
            -rotationRef.current
          );
          const direction = cornerDirections[idx];

          let nextWidth = Math.max(
            direction.x > 0 ? localVector.x : -localVector.x,
            MIN_OVERLAY_SIZE_PX
          );
          let nextHeight = Math.max(
            direction.y > 0 ? localVector.y : -localVector.y,
            MIN_OVERLAY_SIZE_PX
          );

          if (!shiftPressedRef.current) {
            const lockedAspectRatio = aspectRatioRef.current || 1;
            if (nextWidth / nextHeight > lockedAspectRatio) {
              nextHeight = nextWidth / lockedAspectRatio;
            } else {
              nextWidth = nextHeight * lockedAspectRatio;
            }
          }

          const resizedOffset = rotatePointOffset(
            L.point(direction.x * nextWidth, direction.y * nextHeight),
            rotationRef.current
          );
          const draggedCornerPoint = L.point(
            anchorPoint.x + resizedOffset.x,
            anchorPoint.y + resizedOffset.y
          );
          const nextCenter = L.point(
            (anchorPoint.x + draggedCornerPoint.x) / 2,
            (anchorPoint.y + draggedCornerPoint.y) / 2
          );
          const newBounds = buildBoundsFromMetrics(map, nextCenter, nextWidth, nextHeight);

          overlay.setBounds(newBounds);
          syncPresentation();
        });

        m.on('dragend', () => {
          syncPresentation();
          onBoundsChange(overlay.getBounds());
        });

        return m;
      });
      cornerMarkersRef.current = cornerMarkers;

      const rotationMarker = L.marker(map.layerPointToLatLng(geometry.rotationHandle), {
        icon: makeRotationIcon(),
        draggable: true,
        zIndexOffset: 1002,
      }).addTo(map);
      rotationMarkerRef.current = rotationMarker;

      rotationMarker.on('drag', () => {
        const { center } = getOverlayMetricsFromBounds(map, overlay.getBounds());
        const pointerPoint = map.latLngToLayerPoint(rotationMarker.getLatLng());
        const dx = pointerPoint.x - center.x;
        const dy = pointerPoint.y - center.y;
        if (dx === 0 && dy === 0) return;

        const nextRotation = normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI + 90);
        rotationRef.current = nextRotation;
        onRotationChange?.(nextRotation);
        syncPresentation();
      });

      rotationMarker.on('dragend', () => {
        syncPresentation();
      });
    }

    overlay.once('load', syncPresentation);
    syncPresentation();

    return () => {
      map.off('zoomanim zoomend viewreset resize', syncPresentation);
      overlay.remove();
      dragMarkerRef.current?.remove();
      dragMarkerRef.current = null;
      cornerMarkersRef.current.forEach((m) => m.remove());
      cornerMarkersRef.current = [];
      rotationMarkerRef.current?.remove();
      rotationMarkerRef.current = null;
      syncPresentationRef.current = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, imageUrl, bounds, locked]);

  // Update opacity without remounting
  useEffect(() => {
    overlayRef.current?.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    syncPresentationRef.current();
  }, [locked]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!map || !overlay) return undefined;

    const element = overlay.getElement();
    if (!element) return undefined;

    const shouldCaptureOverlayPoint = autoAlignExpectingOverlayPoint;
    const gesture = autoAlignGestureRef.current;
    const handlePointerDown = (event) => {
      gesture.active = true;
      gesture.moved = false;
      gesture.suppressClick = false;
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
    };
    const handlePointerMove = (event) => {
      if (!gesture.active || gesture.moved) return;
      if (
        Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >
        PICK_DRAG_THRESHOLD_PX
      ) {
        gesture.moved = true;
      }
    };
    const finishPointerGesture = () => {
      if (gesture.active && gesture.moved) {
        gesture.suppressClick = true;
      }
      gesture.active = false;
    };
    const handleOverlayClick = (event) => {
      if (!shouldCaptureOverlayPoint) return;
      if (gesture.suppressClick || gesture.moved) {
        gesture.suppressClick = false;
        gesture.moved = false;
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const containerRect = map.getContainer().getBoundingClientRect();
      const containerPoint = L.point(
        event.clientX - containerRect.left,
        event.clientY - containerRect.top
      );
      const layerPoint = map.containerPointToLayerPoint(containerPoint);
      const { center, width, height } = getOverlayMetricsFromBounds(map, overlay.getBounds());
      const localOffset = rotatePointOffset(
        L.point(layerPoint.x - center.x, layerPoint.y - center.y),
        -rotationRef.current
      );

      onAutoAlignOverlayPoint?.({
        x: clamp(localOffset.x / width + 0.5, 0, 1),
        y: clamp(localOffset.y / height + 0.5, 0, 1),
      });
    };

    element.style.pointerEvents = shouldCaptureOverlayPoint ? 'auto' : 'none';
    element.style.cursor = shouldCaptureOverlayPoint ? 'crosshair' : '';
    element.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', finishPointerGesture, true);
    window.addEventListener('pointercancel', finishPointerGesture, true);
    element.addEventListener('click', handleOverlayClick);

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', finishPointerGesture, true);
      window.removeEventListener('pointercancel', finishPointerGesture, true);
      element.removeEventListener('click', handleOverlayClick);
      element.style.pointerEvents = 'none';
      element.style.cursor = '';
      gesture.active = false;
      gesture.moved = false;
      gesture.suppressClick = false;
    };
  }, [autoAlignExpectingOverlayPoint, map, onAutoAlignOverlayPoint, rotation, bounds]);

  return null;
};

ImageOverlayTool.propTypes = {
  imageUrl: PropTypes.string,
  bounds: PropTypes.object,
  onBoundsChange: PropTypes.func.isRequired,
  locked: PropTypes.bool,
  opacity: PropTypes.number,
  rotation: PropTypes.number,
  onRotationChange: PropTypes.func,
  aspectRatio: PropTypes.number,
  autoAlignExpectingOverlayPoint: PropTypes.bool,
  onAutoAlignOverlayPoint: PropTypes.func,
};

const OverlayAutoAlignController = ({ expectingMapPoint, onMapPointAdd }) => {
  const map = useMap();
  const pointerGestureRef = useRef({
    active: false,
    moved: false,
    suppressClick: false,
    startX: 0,
    startY: 0,
  });

  useEffect(() => {
    const container = map.getContainer();
    const previousCursor = container.style.cursor;

    container.style.cursor = expectingMapPoint ? 'crosshair' : previousCursor;

    return () => {
      container.style.cursor = previousCursor;
    };
  }, [expectingMapPoint, map]);

  useEffect(() => {
    if (!expectingMapPoint) return undefined;

    const container = map.getContainer();
    const gesture = pointerGestureRef.current;
    const handlePointerDown = (event) => {
      gesture.active = true;
      gesture.moved = false;
      gesture.suppressClick = false;
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
    };
    const handlePointerMove = (event) => {
      if (!gesture.active || gesture.moved) return;
      if (
        Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >
        PICK_DRAG_THRESHOLD_PX
      ) {
        gesture.moved = true;
      }
    };
    const finishPointerGesture = () => {
      if (gesture.active && gesture.moved) {
        gesture.suppressClick = true;
      }
      gesture.active = false;
    };
    const handleMapClick = (event) => {
      if (gesture.suppressClick || gesture.moved) {
        gesture.suppressClick = false;
        gesture.moved = false;
        return;
      }
      if (event.originalEvent) {
        L.DomEvent.stop(event.originalEvent);
      }
      gesture.suppressClick = false;
      gesture.moved = false;
      onMapPointAdd?.(event.latlng);
    };

    container.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', finishPointerGesture, true);
    window.addEventListener('pointercancel', finishPointerGesture, true);
    map.on('click', handleMapClick);
    return () => {
      container.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', finishPointerGesture, true);
      window.removeEventListener('pointercancel', finishPointerGesture, true);
      map.off('click', handleMapClick);
      gesture.active = false;
      gesture.moved = false;
      gesture.suppressClick = false;
    };
  }, [expectingMapPoint, map, onMapPointAdd]);

  return null;
};

OverlayAutoAlignController.propTypes = {
  expectingMapPoint: PropTypes.bool,
  onMapPointAdd: PropTypes.func,
};

const OverlayAutoAlignPreview = ({ bounds, rotation = 0, matches }) => {
  const map = useMap();

  const overlayLatLngs = useMemo(() => {
    if (!map || !bounds || matches.length === 0) return [];

    return matches
      .map((match) =>
        getDisplayedOverlayLayerPoint({
          map,
          bounds,
          rotation,
          normalizedPoint: match.overlayPoint,
        })
      )
      .filter(Boolean)
      .map((layerPoint, index) => ({
        latlng: map.layerPointToLatLng(layerPoint),
        complete: Boolean(matches[index]?.mapPoint),
      }));
  }, [bounds, map, matches, rotation]);

  const mapLatLngs = useMemo(
    () =>
      matches
        .filter((match) => match.mapPoint)
        .map((match) => ({
          latlng: match.mapPoint,
          complete: true,
        })),
    [matches]
  );

  if (overlayLatLngs.length === 0 && mapLatLngs.length === 0) return null;

  return (
    <>
      {overlayLatLngs.map(({ latlng, complete }, index) => (
        <CircleMarker
          key={`overlay-align-point-${index}`}
          center={latlng}
          radius={7}
          pathOptions={{
            color: complete ? '#e0f2fe' : '#bae6fd',
            weight: 2,
            fillColor: complete ? '#38bdf8' : '#0ea5e9',
            fillOpacity: 1,
          }}
        />
      ))}
      {mapLatLngs.map(({ latlng }, index) => (
        <CircleMarker
          key={`map-align-point-${index}`}
          center={latlng}
          radius={7}
          pathOptions={{
            color: '#fdf2f8',
            weight: 2,
            fillColor: '#f472b6',
            fillOpacity: 1,
          }}
        />
      ))}
    </>
  );
};

OverlayAutoAlignPreview.propTypes = {
  bounds: PropTypes.object,
  rotation: PropTypes.number,
  matches: PropTypes.arrayOf(
    PropTypes.shape({
      overlayPoint: PropTypes.shape({
        x: PropTypes.number.isRequired,
        y: PropTypes.number.isRequired,
      }),
      mapPoint: PropTypes.shape({
        lat: PropTypes.number.isRequired,
        lng: PropTypes.number.isRequired,
      }),
    })
  ),
};

const AirportPointEditor = ({ existingPoints = [], onChangesetChange, height = 'dynamic' }) => {
  const navigate = useNavigate();
  const [remotePoints, setRemotePoints] = useState(null); // null = not loaded
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [, setRemoteError] = useState(null);
  const [uploadState, setUploadState] = useState({ status: 'idle', message: '' }); // uploading|success|error|idle
  const [showToast, setShowToast] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    title: '',
    description: '',
    variant: 'default',
  });
  const fetchInFlightRef = useRef(false);
  const { airportId, divisionId } = useParams();
  const token = getVatsimToken();
  const icao = (airportId || '').toUpperCase();

  const [isLeadDev, setIsLeadDev] = useState(false);
  const [isDivisionMember, setIsDivisionMember] = useState(false);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  useEffect(() => {
    if (!token || !divisionId) {
      setPermissionsLoading(false);
      return;
    }
    let aborted = false;
    const checkPermissions = async () => {
      try {
        const staffResponse = await fetch('https://v2.stopbars.com/auth/is-staff', {
          headers: { Authorization: `Bearer ${token}` },
        });
        let leadDev = false;
        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          leadDev = staffData.isStaff && staffData.role?.toLowerCase() === 'lead_developer';
        }
        if (!aborted) setIsLeadDev(leadDev);

        const accountResponse = await fetch('https://v2.stopbars.com/auth/account', {
          headers: { 'X-Vatsim-Token': token },
        });
        let currentUserId = null;
        if (accountResponse.ok) {
          const accountData = await accountResponse.json();
          currentUserId = accountData.vatsim_id;
        }

        const membersResponse = await fetch(
          `https://v2.stopbars.com/divisions/${divisionId}/members`,
          { headers: { 'X-Vatsim-Token': token } }
        );
        let isMember = false;
        if (membersResponse.ok && currentUserId) {
          const members = await membersResponse.json();
          isMember = members.some((m) => String(m.vatsim_id) === String(currentUserId));
        }
        if (!aborted) setIsDivisionMember(isMember);
      } catch {
        // Permission check failed, will redirect
      } finally {
        if (!aborted) setPermissionsLoading(false);
      }
    };
    checkPermissions();
    return () => {
      aborted = true;
    };
  }, [token, divisionId]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!isLeadDev && !isDivisionMember) {
      navigate('/account');
    }
  }, [permissionsLoading, isLeadDev, isDivisionMember, navigate]);

  const isEuroscopeOnly = useMemo(() => {
    const prefixes = ['K', 'M', 'Y', 'N', 'A'];
    const first = icao?.[0];
    if (!first) return false;
    return !prefixes.includes(first);
  }, [icao]);
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const [airportMeta, setAirportMeta] = useState(null);
  const [airportMetaError, setAirportMetaError] = useState(null);
  const [airportMetaLoading, setAirportMetaLoading] = useState(false);
  // Automatic base map fallback state. 0 = primary (BARS/Azure), then Mapbox satellite (if token), then OSM.
  const [providerIndex, setProviderIndex] = useState(0);
  const tileLoadSuccessRef = useRef(false); // whether current provider has at least one loaded tile
  const attemptedFallbackRef = useRef(false); // prevent infinite loop

  useEffect(() => {
    if (!icao || isEuroscopeOnly) return;
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
  }, [icao, isEuroscopeOnly]);
  const [changeset, setChangeset] = useState(defaultChangeset);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
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
  // Image overlay reference layer state
  const [refImageUrl, setRefImageUrl] = useState(null);
  const [refImageBounds, setRefImageBounds] = useState(null);
  const [refImageLocked, setRefImageLocked] = useState(false);
  const [refImageOpacity, setRefImageOpacity] = useState(0.5);
  const [refImageRotation, setRefImageRotation] = useState(0);
  const [refImageAspectRatio, setRefImageAspectRatio] = useState(1);
  const [refImageAutoAlignActive, setRefImageAutoAlignActive] = useState(false);
  const [refImageAutoAlignMatches, setRefImageAutoAlignMatches] = useState([]);
  const [refImageOpacityInput, setRefImageOpacityInput] = useState('50');
  const [refImageRotationInput, setRefImageRotationInput] = useState('0');
  const refImageInputRef = useRef(null);
  const refImageObjectUrlRef = useRef(null);
  const [manualCoordsMode, setManualCoordsMode] = useState(false);
  const [manualCoords, setManualCoords] = useState([{ value: '' }, { value: '' }]);
  const [manualCoordsErrors, setManualCoordsErrors] = useState([]);
  const [manualGenerateState, setManualGenerateState] = useState('idle'); // idle | generating | generated
  const [manualPlacedId, setManualPlacedId] = useState(null); // temp id of placed-but-not-yet-continued feature
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

  useEffect(() => {
    setRefImageOpacityInput(String(Math.round(refImageOpacity * 100)));
  }, [refImageOpacity]);

  useEffect(() => {
    setRefImageRotationInput(String(Math.round(refImageRotation)));
  }, [refImageRotation]);

  const commitRefImageOpacityInput = useCallback(
    (rawValue) => {
      const parsedPercent = parseFloat(rawValue);
      if (!Number.isFinite(parsedPercent)) {
        setRefImageOpacityInput(String(Math.round(refImageOpacity * 100)));
        return;
      }

      const nextOpacity = clamp(parsedPercent / 100, 0.05, 1);
      setRefImageOpacity(nextOpacity);
      setRefImageOpacityInput(String(Math.round(nextOpacity * 100)));
    },
    [refImageOpacity]
  );

  const commitRefImageRotationInput = useCallback(
    (rawValue) => {
      const parsedDegrees = parseFloat(rawValue);
      if (!Number.isFinite(parsedDegrees)) {
        setRefImageRotationInput(String(Math.round(refImageRotation)));
        return;
      }

      const nextRotation = clamp(parsedDegrees, -180, 180);
      setRefImageRotation(nextRotation);
      setRefImageRotationInput(String(Math.round(nextRotation)));
    },
    [refImageRotation]
  );

  const resetRefImageAutoAlignMatches = useCallback(() => {
    setRefImageAutoAlignMatches([]);
  }, []);

  const cancelRefImageAutoAlign = useCallback(() => {
    setRefImageAutoAlignActive(false);
    resetRefImageAutoAlignMatches();
  }, [resetRefImageAutoAlignMatches]);

  const startRefImageAutoAlign = useCallback(() => {
    setRefImageAutoAlignActive(true);
    resetRefImageAutoAlignMatches();
  }, [resetRefImageAutoAlignMatches]);

  const refImageLatestAutoAlignMatch =
    refImageAutoAlignMatches[refImageAutoAlignMatches.length - 1] || null;
  const refImageAutoAlignExpectingOverlayPoint =
    refImageAutoAlignActive &&
    (!refImageLatestAutoAlignMatch || Boolean(refImageLatestAutoAlignMatch.mapPoint));
  const refImageAutoAlignExpectingMapPoint =
    refImageAutoAlignActive &&
    Boolean(refImageLatestAutoAlignMatch?.overlayPoint) &&
    !refImageLatestAutoAlignMatch?.mapPoint;
  const refImageCompletedAutoAlignMatches = useMemo(
    () =>
      refImageAutoAlignMatches.filter(
        (match) => Boolean(match.overlayPoint) && Boolean(match.mapPoint)
      ),
    [refImageAutoAlignMatches]
  );

  const handleRefImageAutoAlignOverlayPoint = useCallback(
    (normalizedPoint) => {
      if (!refImageAutoAlignActive) return;
      setRefImageAutoAlignMatches((prev) => {
        const lastMatch = prev[prev.length - 1];
        if (lastMatch && !lastMatch.mapPoint) return prev;
        return [...prev, { overlayPoint: normalizedPoint, mapPoint: null }];
      });
    },
    [refImageAutoAlignActive]
  );

  const handleRefImageAutoAlignMapPoint = useCallback(
    (latlng) => {
      if (!refImageAutoAlignActive) return;
      setRefImageAutoAlignMatches((prev) => {
        const lastIndex = prev.length - 1;
        const lastMatch = prev[lastIndex];
        if (!lastMatch || !lastMatch.overlayPoint || lastMatch.mapPoint) return prev;

        const next = [...prev];
        next[lastIndex] = { ...lastMatch, mapPoint: latlng };
        return next;
      });
    },
    [refImageAutoAlignActive]
  );

  const handleRefImageAutoAlignUndo = useCallback(() => {
    setRefImageAutoAlignMatches((prev) => {
      if (prev.length === 0) return prev;

      const lastMatch = prev[prev.length - 1];
      if (!lastMatch.mapPoint) return prev.slice(0, -1);

      const next = [...prev];
      next[next.length - 1] = { ...lastMatch, mapPoint: null };
      return next;
    });
  }, []);

  const handleRefImageAutoAlignApply = useCallback(() => {
    const map = mapInstanceRef.current;
    const aspectRatio = refImageAspectRatio > 0 ? refImageAspectRatio : 1;
    if (!map) return;

    if (refImageCompletedAutoAlignMatches.length < 2) {
      setToastConfig({
        title: 'Need More Point Matches',
        description:
          'Add at least two completed overlay-to-basemap point matches before applying alignment.',
        variant: 'destructive',
      });
      setShowToast(true);
      return;
    }

    const sourcePoints = refImageCompletedAutoAlignMatches.map((match) =>
      getUnitOverlayPoint(match.overlayPoint, aspectRatio)
    );
    const targetPoints = refImageCompletedAutoAlignMatches.map((match) =>
      map.latLngToLayerPoint(match.mapPoint)
    );
    const transform = solveBestFitOverlayTransform(sourcePoints, targetPoints);

    if (!transform || !Number.isFinite(transform.heightScale)) {
      setToastConfig({
        title: 'Alignment Failed',
        description:
          'The selected points could not produce a stable alignment. Try spreading the matches further apart.',
        variant: 'destructive',
      });
      setShowToast(true);
      return;
    }

    const nextHeight = Math.max(
      transform.heightScale,
      MIN_OVERLAY_SIZE_PX,
      MIN_OVERLAY_SIZE_PX / Math.max(aspectRatio, 1)
    );
    const nextWidth = nextHeight * aspectRatio;

    setRefImageBounds(buildBoundsFromMetrics(map, transform.center, nextWidth, nextHeight));
    setRefImageRotation(transform.rotation);
    setToastConfig({
      title: 'Overlay Aligned',
      description: `Applied best-fit alignment from ${refImageCompletedAutoAlignMatches.length} point matches.`,
      variant: 'default',
    });
    setShowToast(true);
    setRefImageAutoAlignActive(false);
    resetRefImageAutoAlignMatches();
  }, [refImageAspectRatio, refImageCompletedAutoAlignMatches, resetRefImageAutoAlignMatches]);

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
      const key = (e.key || '').toLowerCase();
      if (key === 'escape') {
        if (creatingNew && !selectedId) {
          e.preventDefault();
          e.stopPropagation();
          // Inline cancel logic (cancelNewDrawing is defined after this effect)
          if (manualPlacedId) {
            const layer = featureLayerMapRef.current[manualPlacedId];
            if (layer) layer.remove();
            setChangeset((prev) => ({
              ...prev,
              create: prev.create.filter((c) => c._tempId !== manualPlacedId),
            }));
            delete featureLayerMapRef.current[manualPlacedId];
          }
          setCreatingNew(false);
          setDrawingCoords([]);
          setManualCoordsMode(false);
          setManualCoords([{ value: '' }, { value: '' }]);
          setManualCoordsErrors([]);
          setManualGenerateState('idle');
          setManualPlacedId(null);
          if (mapInstanceRef.current?.pm) {
            mapInstanceRef.current.pm.disableDraw();
          }
        }
        return;
      }
      if (!mod) return;
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
  }, [performUndo, creatingNew, selectedId, manualPlacedId]);

  const handleRefImageUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = '';

      // 1. Validate MIME type
      const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!ALLOWED_TYPES.includes(file.type)) {
        setToastConfig({
          title: 'Invalid Format',
          description: 'Unsupported file type. Please upload a JPEG, PNG, GIF, or WebP image.',
          variant: 'destructive',
        });
        setShowToast(true);
        return;
      }

      // 2. Enforce a 20 MB file size cap to prevent browser freeze on huge files
      const MAX_BYTES = 20 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        setToastConfig({
          title: 'File Too Large',
          description: 'Image exceeds the 20 MB limit.',
          variant: 'destructive',
        });
        setShowToast(true);
        return;
      }

      // 3. Verify the file is actually a decodable image before committing state
      const candidateUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const nextAspectRatio =
          img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
        // Revoke previous object URL
        if (refImageObjectUrlRef.current) {
          URL.revokeObjectURL(refImageObjectUrlRef.current);
        }
        refImageObjectUrlRef.current = candidateUrl;
        setRefImageAutoAlignActive(false);
        resetRefImageAutoAlignMatches();
        // Place the image centred on current map view while preserving its natural aspect ratio.
        const map = mapInstanceRef.current;
        if (map) {
          const center = map.getCenter();
          const centerPoint = map.latLngToContainerPoint(center);
          const mapSize = map.getSize();
          const maxWidthPx = mapSize.x * 0.3;
          const maxHeightPx = mapSize.y * 0.3;
          let widthPx = maxWidthPx;
          let heightPx = widthPx / nextAspectRatio;
          if (heightPx > maxHeightPx) {
            heightPx = maxHeightPx;
            widthPx = heightPx * nextAspectRatio;
          }

          const southWest = map.containerPointToLatLng(
            L.point(centerPoint.x - widthPx / 2, centerPoint.y + heightPx / 2)
          );
          const northEast = map.containerPointToLatLng(
            L.point(centerPoint.x + widthPx / 2, centerPoint.y - heightPx / 2)
          );
          setRefImageBounds(L.latLngBounds(southWest, northEast));
        }
        setRefImageAspectRatio(nextAspectRatio);
        setRefImageRotation(0);
        setRefImageUrl(candidateUrl);
        setRefImageLocked(false);
      };
      img.onerror = () => {
        URL.revokeObjectURL(candidateUrl);
        setToastConfig({
          title: 'Decode Failed',
          description:
            'The file could not be read as an image. It may be corrupt or an unsupported format.',
          variant: 'destructive',
        });
        setShowToast(true);
      };
      img.src = candidateUrl;
    },
    [resetRefImageAutoAlignMatches, setToastConfig, setShowToast]
  );

  const handleRefImageRemove = useCallback(() => {
    if (refImageObjectUrlRef.current) {
      URL.revokeObjectURL(refImageObjectUrlRef.current);
      refImageObjectUrlRef.current = null;
    }
    setRefImageUrl(null);
    setRefImageBounds(null);
    setRefImageLocked(false);
    setRefImageRotation(0);
    setRefImageAspectRatio(1);
    setRefImageAutoAlignActive(false);
    resetRefImageAutoAlignMatches();
  }, [resetRefImageAutoAlignMatches]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (refImageObjectUrlRef.current) {
        URL.revokeObjectURL(refImageObjectUrlRef.current);
      }
    };
  }, []);

  const startAddPoint = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    map.pm.disableDraw();
    // entering drawing mode — undo/redo uses drawing stacks only
    setCreatingNew(true);
    setDrawingCoords([]);
    // Ensure manual coords state is clean
    setManualCoordsMode(false);
    setManualCoords([{ value: '' }, { value: '' }]);
    setManualCoordsErrors([]);
    setManualGenerateState('idle');
    setManualPlacedId(null);
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
    // If we placed a manual-coords feature but haven't continued yet, remove it
    if (manualPlacedId) {
      const layer = featureLayerMapRef.current[manualPlacedId];
      if (layer) layer.remove();
      setChangeset((prev) => ({
        ...prev,
        create: prev.create.filter((c) => c._tempId !== manualPlacedId),
      }));
      delete featureLayerMapRef.current[manualPlacedId];
    }
    setCreatingNew(false);
    setDrawingCoords([]);
    setManualCoordsMode(false);
    setManualCoords([{ value: '' }, { value: '' }]);
    setManualCoordsErrors([]);
    setManualGenerateState('idle');
    setManualPlacedId(null);
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
  }, [selectedId, manualPlacedId]);

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
      if (!icao || isEuroscopeOnly) return;
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
    [icao, remotePoints, isEuroscopeOnly]
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

  const getOutOfBoundsCoordinates = useCallback(
    (coords = []) => {
      if (
        !airportMeta ||
        !Number.isFinite(airportMeta.bbox_min_lat) ||
        !Number.isFinite(airportMeta.bbox_min_lon) ||
        !Number.isFinite(airportMeta.bbox_max_lat) ||
        !Number.isFinite(airportMeta.bbox_max_lon)
      ) {
        return [];
      }

      return coords.filter(
        (c) =>
          c.lat < airportMeta.bbox_min_lat ||
          c.lat > airportMeta.bbox_max_lat ||
          c.lng < airportMeta.bbox_min_lon ||
          c.lng > airportMeta.bbox_max_lon
      );
    },
    [airportMeta]
  );

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
      if (creatingNew && !isNew) {
        return;
      }
      // If user clicks a manually-placed feature directly on the map (bypassing Next Step),
      // reset the manual coords state so the next Add New Object starts fresh.
      if (manualCoordsMode) {
        setManualCoordsMode(false);
        setManualCoords([{ value: '' }, { value: '' }]);
        setManualCoordsErrors([]);
        setManualGenerateState('idle');
        setManualPlacedId(null);
      }
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
    [existingMap, changeset, pushGeometryChange, extractCoords, creatingNew, manualCoordsMode]
  );

  // Place a new object on the map from manually-entered coordinates (generate step)
  const handleManualCoordsPlace = useCallback(() => {
    const parsed = manualCoords.map((c) => parseCoordinateString(c.value));
    const errors = [];
    parsed.forEach((p, idx) => {
      if (!p) errors.push(`Vertex ${idx + 1}: invalid or unrecognised coordinate format.`);
    });
    const validCoords = parsed.filter(Boolean);
    if (validCoords.length < 2 && errors.length === 0) {
      errors.push('At least 2 valid coordinates are required.');
    }
    if (errors.length > 0) {
      setManualCoordsErrors(errors);
      return;
    }

    // Validate that all coordinates fall within the airport bounding box
    const outOfBounds = getOutOfBoundsCoordinates(validCoords);
    if (outOfBounds.length > 0) {
      setManualCoordsErrors([
        `${outOfBounds.length === validCoords.length ? 'All' : outOfBounds.length} of the entered coordinates are outside the airport boundary. Please check your coordinates and try again.`,
      ]);
      setToastConfig({
        title: 'Coordinates Not Allowed',
        description:
          'One or more vertices are outside the airport boundary box. Coordinates must be within the defined airport area.',
        variant: 'warning',
      });
      setShowToast(true);
      return;
    }

    setManualCoordsErrors([]);
    setManualGenerateState('generating');

    const map = mapInstanceRef.current;
    if (!map) {
      setManualGenerateState('idle');
      return;
    }
    map.pm.disableDraw();

    // If a previous generation exists, remove it first
    if (manualPlacedId) {
      const oldLayer = featureLayerMapRef.current[manualPlacedId];
      if (oldLayer) oldLayer.remove();
      setChangeset((prev) => ({
        ...prev,
        create: prev.create.filter((c) => c._tempId !== manualPlacedId),
      }));
      delete featureLayerMapRef.current[manualPlacedId];
    }

    const latlngs = validCoords.map((c) => [c.lat, c.lng]);
    const assignedId = `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const layer = L.polyline(latlngs, { pointId: assignedId, color: '#3b82f6' });
    layer.addTo(map);
    featureLayerMapRef.current[assignedId] = layer;

    // Fit map to show the new polyline
    try {
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.5));
    } catch {
      /* ignore */
    }

    // Push initial geometry into changeset so overlay picks it up
    const coords = latlngs.map(([lat, lng]) => ({ lat, lng }));
    setChangeset((prev) => ({
      ...prev,
      create: [
        ...prev.create,
        { _tempId: assignedId, type: 'stopbar', name: '', coordinates: coords },
      ],
    }));

    setManualPlacedId(assignedId);
    // Small delay for visual feedback
    setTimeout(() => setManualGenerateState('generated'), 350);
  }, [manualCoords, manualPlacedId, getOutOfBoundsCoordinates]);

  // Continue from manual coords generate step → select the placed feature and enter edit form
  const handleManualCoordsContinue = useCallback(() => {
    if (!manualPlacedId) return;
    const layer = featureLayerMapRef.current[manualPlacedId];
    if (!layer) return;

    // Register selection (sets selectedId, populates form, enables vertex editing)
    registerSelect(layer, manualPlacedId, true);

    // Push geometry change to changeset
    try {
      pushGeometryChange(layer);
    } catch {
      /* ignore */
    }

    // Reset manual entry state
    setManualCoordsMode(false);
    setManualCoords([{ value: '' }, { value: '' }]);
    setManualCoordsErrors([]);
    setManualGenerateState('idle');
    setManualPlacedId(null);
    setDrawingCoords([]);
  }, [manualPlacedId, registerSelect, pushGeometryChange]);

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

    const outOfBoundsCoordinates = getOutOfBoundsCoordinates(coordinates);
    if (outOfBoundsCoordinates.length > 0) {
      setToastConfig({
        title: 'Coordinates Not Allowed',
        description:
          'One or more vertices are outside the airport boundary box. Coordinates must be within the defined airport area.',
        variant: 'warning',
      });
      setShowToast(true);
      return;
    }

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

  const revertChange = useCallback(
    (type, id) => {
      if (type === 'create') {
        setChangeset((prev) => ({ ...prev, create: prev.create.filter((c) => c._tempId !== id) }));
        const layer = featureLayerMapRef.current[id];
        if (layer?.remove) layer.remove();
        delete featureLayerMapRef.current[id];
        if (selectedId === id) {
          setSelectedId(null);
          setFormState(emptyFormState);
        }
      } else if (type === 'modify') {
        setChangeset((prev) => {
          const nextModify = { ...prev.modify };
          delete nextModify[id];
          return { ...prev, modify: nextModify };
        });
        const original = existingMap[id];
        if (original) {
          const layer = featureLayerMapRef.current[id];
          if (layer) {
            const latlngs = original.coordinates.map((c) => [c.lat, c.lng]);
            if (layer.setLatLngs && latlngs.length >= 2) layer.setLatLngs(latlngs);
            else if (layer.setLatLng && latlngs.length === 1) layer.setLatLng(latlngs[0]);
            styleLayerByPoint(layer, original);
          }
        }
      } else if (type === 'delete') {
        setChangeset((prev) => ({ ...prev, delete: prev.delete.filter((d) => d !== id) }));
        const original = existingMap[id];
        if (original) {
          const layer = featureLayerMapRef.current[id];
          if (layer) styleLayerByPoint(layer, original);
        }
      }
    },
    [selectedId, existingMap]
  );

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
    setShowReviewPanel(false);
    if (mapInstanceRef.current) mapInstanceRef.current.pm.disableDraw();
    editUndoStackRef.current = {};
    lastEditCoordsRef.current = {};
  };

  const handleUpload = async () => {
    const token = getVatsimToken();
    if (!token) {
      setToastConfig({
        title: 'Login Required',
        description: 'Please login to upload changes.',
        variant: 'destructive',
      });
      setShowToast(true);
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
      setToastConfig({
        title: 'Changes Saved',
        description: 'Your changes have been successfully uploaded.',
        variant: 'success',
      });
      setShowToast(true);
      Object.entries(featureLayerMapRef.current).forEach(([, layer]) => {
        if (layer?.remove) layer.remove();
      });
      featureLayerMapRef.current = {};
      resetAll();
      setRemotePoints(null);
      triggerFetchPoints(true);
    } catch (e) {
      setUploadState({ status: 'error', message: e.message });
      setToastConfig({
        title: 'Upload Failed',
        description: e.message || 'An error occurred while uploading your changes.',
        variant: 'destructive',
      });
      setShowToast(true);
    }
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
    if (!icao || isEuroscopeOnly) return;
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
  }, [icao, refreshTick, isEuroscopeOnly]);

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
  const hasPendingChanges =
    changeset.create.length > 0 ||
    Object.keys(changeset.modify).length > 0 ||
    changeset.delete.length > 0;
  const totalChanges =
    changeset.create.length + Object.keys(changeset.modify).length + changeset.delete.length;
  const refImagePendingAutoAlignMatch =
    refImageLatestAutoAlignMatch && !refImageLatestAutoAlignMatch.mapPoint
      ? refImageLatestAutoAlignMatch
      : null;
  useEffect(() => {
    if (showReviewPanel && !hasPendingChanges) {
      setShowReviewPanel(false);
    }
  }, [hasPendingChanges, showReviewPanel]);

  if (permissionsLoading) {
    return (
      <Layout>
        <div className="min-h-[70vh] pt-28 pb-16 flex items-center justify-center">
          <div className="container mx-auto px-4 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-zinc-600 border-t-white rounded-full mx-auto" />
          </div>
        </div>
      </Layout>
    );
  }

  if (isEuroscopeOnly) {
    const euroscopeUrl = `https://euroscope.stopbars.com?icao=${encodeURIComponent(icao)}`;
    return (
      <Layout>
        <div className="min-h-[70vh] pt-28 pb-16 flex items-center justify-center">
          <div className="container mx-auto px-4 max-w-208">
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl shadow-xl p-12 text-center flex flex-col gap-5">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold text-white tracking-tight">
                  Use the EuroScope Editor
                </h1>
                <p className="text-sm text-zinc-300">
                  This airport is managed via EuroScope. To edit BARS object data for {icao}, please
                  use the EuroScope editor.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-sm text-white transition-colors"
                >
                  Go Back
                </button>
                <a
                  href={euroscopeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors shadow inline-flex items-center justify-center gap-2"
                >
                  Open EuroScope Editor
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <div
      className="flex flex-col px-4 py-6 lg:px-8 pt-12 lg:pt-16 lg:h-(--editor-h)"
      style={{ '--editor-h': resolvedHeightValue }}
    >
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(`/divisions/${divisionId}/manage`)}
              className="inline-flex items-center justify-center rounded-md p-1 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
              aria-label="Back to division management"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <span>{icao ? `${icao} Editor` : 'Editor'}</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage airport lighting data for {icao || 'ICAO'}
          </p>
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
              className={`shrink-0 inline-flex items-center rounded-md text-sm font-medium px-4 py-2 border transition-colors mt-2 ${disabled ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' : isPlacing ? 'bg-red-600 hover:bg-red-500 text-white border-red-500' : 'bg-white hover:bg-zinc-100 text-zinc-900 border-zinc-300 shadow'}`}
            >
              {isPlacing ? (
                <>
                  <X className="w-4 h-4 mr-1.5" />
                  Cancel
                </>
              ) : (
                '+ Add New Object'
              )}
            </button>
          );
        })()}
      </div>
      <div className="flex flex-col lg:flex-row gap-6 lg:flex-1 lg:min-h-0">
        <div className="h-[70vh] min-h-72 lg:h-auto lg:max-h-none lg:flex-1 relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900">
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
              {refImageUrl && refImageBounds && (
                <ImageOverlayTool
                  imageUrl={refImageUrl}
                  bounds={refImageBounds}
                  onBoundsChange={setRefImageBounds}
                  locked={refImageLocked}
                  opacity={refImageOpacity}
                  rotation={refImageRotation}
                  onRotationChange={setRefImageRotation}
                  aspectRatio={refImageAspectRatio}
                  autoAlignExpectingOverlayPoint={refImageAutoAlignExpectingOverlayPoint}
                  onAutoAlignOverlayPoint={handleRefImageAutoAlignOverlayPoint}
                />
              )}
              <OverlayAutoAlignController
                expectingMapPoint={refImageAutoAlignExpectingMapPoint}
                onMapPointAdd={handleRefImageAutoAlignMapPoint}
              />
              <OverlayAutoAlignPreview
                bounds={refImageBounds}
                rotation={refImageRotation}
                matches={refImageAutoAlignMatches}
              />
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
        <div className="flex flex-col gap-5 min-h-0 h-[60vh] lg:h-auto overflow-y-auto p-5 bg-zinc-900/80 backdrop-blur border border-zinc-700 rounded-lg lg:w-96 lg:flex-none lg:overflow-y-auto">
          {(selectedId || creatingNew) && (
            <div className="flex items-center gap-2.5">
              {creatingNew && !selectedId && (
                <button
                  type="button"
                  onClick={cancelNewDrawing}
                  className="p-1 -ml-1 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                  aria-label="Back to objects"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <h3 className="text-lg font-medium text-white">
                {selectedId && !selectedId.startsWith('new_') ? 'Edit Object' : 'Add New Object'}
              </h3>
            </div>
          )}
          {selectedId ? (
            <>
              <div className="space-y-4">
                {!creatingNew && selectedId.startsWith('new_') && (
                  <div className="text-[10px] text-amber-300 bg-amber-900/40 px-2 py-1 rounded">
                    New geometry captured. Fill details and save.
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1.5">
                    Type
                  </label>
                  <Dropdown
                    options={POINT_TYPES.map((t) => ({ value: t, label: formatLabel(t) }))}
                    value={formState.type}
                    onChange={(newType) =>
                      setFormState((s) => {
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
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1.5">
                    Name
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
                    <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1.5">
                      Directionality
                    </label>
                    <Dropdown
                      options={DIRECTIONALITY.map((d) => ({ value: d, label: formatLabel(d) }))}
                      value={formState.directionality}
                      onChange={(nextDir) =>
                        setFormState((s) => {
                          const next = { ...s, directionality: nextDir };
                          if (s.type === 'stopbar' && nextDir === 'bi-directional' && s.elevated) {
                            next.elevated = false;
                          }
                          return next;
                        })
                      }
                    />
                  </div>
                )}
                {formState.type === 'taxiway' && (
                  <div>
                    <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1.5">
                      Color
                    </label>
                    <Dropdown
                      options={COLORS.map((c) => ({ value: c, label: formatLabel(c) }))}
                      value={formState.color}
                      onChange={(color) => setFormState((s) => ({ ...s, color: color || 'green' }))}
                    />
                  </div>
                )}
                {formState.type === 'stopbar' && (
                  <div>
                    <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1.5">
                      Other
                    </label>
                    <div className="space-y-3.5">
                      {formState.directionality === 'uni-directional' && (
                        <label className="flex items-center gap-3 text-[15px] cursor-pointer select-none">
                          <input
                            id="elevated"
                            type="checkbox"
                            className="sr-only peer"
                            checked={formState.elevated}
                            onChange={(e) =>
                              setFormState((s) => ({
                                ...s,
                                elevated: e.target.checked,
                                directionality: 'uni-directional', // enforce
                              }))
                            }
                          />
                          <span
                            className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${formState.elevated ? 'bg-emerald-500 border-emerald-500' : 'bg-zinc-800 border-zinc-600'}`}
                          >
                            {formState.elevated && (
                              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                            )}
                          </span>
                          <span className="text-zinc-300">Elevated Stopbar Lights</span>
                        </label>
                      )}
                      <label className="flex items-center gap-3 text-[15px] cursor-pointer select-none">
                        <input
                          id="ihp"
                          type="checkbox"
                          className="sr-only peer"
                          checked={formState.ihp}
                          onChange={(e) => setFormState((s) => ({ ...s, ihp: e.target.checked }))}
                        />
                        <span
                          className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${formState.ihp ? 'bg-emerald-500 border-emerald-500' : 'bg-zinc-800 border-zinc-600'}`}
                        >
                          {formState.ihp && (
                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                          )}
                        </span>
                        <span className="text-zinc-300">Intermediate Holding Point (IHP)</span>
                      </label>
                    </div>
                  </div>
                )}
                {formErrors.length > 0 && (
                  <ul className="text-xs text-red-400 list-disc pl-4">
                    {formErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 pt-1">
                  <Button onClick={handleSave} className="flex-1 px-3! py-1.5! text-sm">
                    Save
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleCancelEdit}
                    className="px-3! py-1.5! text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleReverse}
                    disabled={!selectedId}
                    className="px-3! py-1.5! text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reverse
                  </Button>
                  {selectedId.startsWith('new_') ? (
                    <Button
                      variant="destructive"
                      onClick={() => handleRemoveUnsavedNew(selectedId)}
                      className="px-3! py-1.5! text-sm"
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      onClick={handleDeleteToggle}
                      className={`px-3! py-1.5! text-sm ${changeset.delete.includes(selectedId) ? 'bg-amber-600! hover:bg-amber-500! border-transparent!' : ''}`}
                    >
                      {changeset.delete.includes(selectedId) ? 'Undo Delete' : 'Delete'}
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : (
            creatingNew && (
              <>
                {!manualCoordsMode ? (
                  <>
                    <div className="text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700 rounded p-3">
                      <span>
                        Click on the map to add vertices. To finish, Ctrl+Left Click anywhere on the
                        map or click on a vertex. Press Escape or Cancel to stop placing.
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setManualCoordsMode(true);
                        setManualGenerateState('idle');
                        setManualPlacedId(null);
                        if (mapInstanceRef.current?.pm) mapInstanceRef.current.pm.disableDraw();
                      }}
                      className="w-full flex items-center p-3 rounded-lg border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                    >
                      <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                        <CircleFadingPlus className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="ml-3 text-left">
                        <p className="text-sm font-medium text-white">Vertices by Coordinates</p>
                        <p className="text-xs text-zinc-400">
                          Manually place vertices on the map by entering coordinates. Useful when
                          the map imagery is outdated or when you need exact positioning.
                        </p>
                      </div>
                    </button>
                  </>
                ) : (
                  <div className="flex flex-col gap-4 min-h-0 flex-1">
                    <div className="text-xs text-blue-300 bg-blue-900/30 border border-blue-500/30 rounded p-3">
                      <p className="text-blue-300/90">
                        You can place vertices on the map using manual coordinate input. Open any
                        maps service like Google Maps, navigate to your desired location, and copy
                        the coordinates then paste them below. Both decimal and DMS formats are
                        supported.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 min-h-0">
                      <label className="block text-[13px] font-medium tracking-wide text-zinc-300">
                        Vertices
                      </label>
                      <div className="flex flex-col gap-2 overflow-y-auto max-h-52 pr-0.5">
                        {manualCoords.map((coord, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="shrink-0 w-7 h-7 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-semibold text-zinc-300 tabular-nums">
                              {idx + 1}
                            </span>
                            <input
                              type="text"
                              value={coord.value}
                              onChange={(e) => {
                                const next = [...manualCoords];
                                next[idx] = { value: e.target.value };
                                setManualCoords(next);
                                // Reset generate state when coords change after generation
                                if (manualGenerateState === 'generated')
                                  setManualGenerateState('idle');
                              }}
                              placeholder="-27.3815, 153.1314"
                              className="flex-1 min-w-0 bg-zinc-800/70 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-2 py-1.5 text-sm font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (manualCoords.length <= 2) return;
                                setManualCoords(manualCoords.filter((_, i) => i !== idx));
                                if (manualGenerateState === 'generated')
                                  setManualGenerateState('idle');
                              }}
                              disabled={manualCoords.length <= 2}
                              className="shrink-0 p-1.5 rounded text-zinc-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              title="Remove vertex"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setManualCoords([...manualCoords, { value: '' }]);
                          if (manualGenerateState === 'generated') setManualGenerateState('idle');
                        }}
                        className="w-full text-xs text-zinc-400 hover:text-zinc-200 border border-dashed border-zinc-700 hover:border-zinc-500 rounded px-2 py-2 transition-colors"
                      >
                        + Add Vertex
                      </button>
                    </div>

                    {manualCoordsErrors.length > 0 && (
                      <ul className="text-xs text-red-400 list-disc pl-4">
                        {manualCoordsErrors.map((err) => (
                          <li key={err}>{err}</li>
                        ))}
                      </ul>
                    )}

                    <div className="flex flex-col gap-2 mt-auto">
                      <Button
                        onClick={handleManualCoordsPlace}
                        disabled={
                          manualGenerateState === 'generating' ||
                          manualGenerateState === 'generated'
                        }
                        variant="secondary"
                        className="w-full"
                      >
                        {manualGenerateState === 'generating' ? (
                          <div className="flex items-center justify-center">
                            <Loader className="w-4 h-4 mr-2 animate-spin" />
                            <span>Mapping Coordinates…</span>
                          </div>
                        ) : manualGenerateState === 'generated' ? (
                          <div className="flex items-center justify-center">
                            <Check className="w-4 h-4 mr-2" />
                            <span>Coordinates Mapped</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <MapPinPlus className="w-4 h-4 mr-2" />
                            <span>Map Coordinates</span>
                          </div>
                        )}
                      </Button>
                      <Button
                        onClick={handleManualCoordsContinue}
                        disabled={manualGenerateState !== 'generated'}
                        className={`w-full ${manualGenerateState !== 'generated' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span>Next Step</span>
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )
          )}
          {!selectedId && !creatingNew && !showReviewPanel && (
            <>
              <div className="flex items-center mt-0 gap-2">
                <Route className="w-5 h-5 text-zinc-300" aria-hidden="true" />
                <h3 className="text-xl font-semibold text-zinc-100 tracking-tight">Objects</h3>
              </div>
              {/* Image Overlay panel */}
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 gap-2">
                  <div className="flex items-center gap-2">
                    <ImageUp className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
                    <span className="text-xs font-medium text-zinc-300">Image Overlay</span>
                  </div>
                  {refImageUrl ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title={refImageLocked ? 'Unlock overlay' : 'Lock overlay position'}
                        onClick={() => setRefImageLocked((v) => !v)}
                        className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        {refImageLocked ? (
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <LockOpen className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        title="Remove image overlay"
                        onClick={handleRefImageRemove}
                        className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => refImageInputRef.current?.click()}
                      className="text-[11px] px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white transition-colors"
                    >
                      Upload
                    </button>
                  )}
                  <input
                    ref={refImageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="sr-only"
                    onChange={handleRefImageUpload}
                  />
                </div>
                {refImageUrl && (
                  <div className="px-3 pb-3 flex flex-col gap-2 border-t border-zinc-700/60 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-400 w-14 shrink-0">Opacity</span>
                      <input
                        type="range"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={refImageOpacity}
                        onChange={(e) => setRefImageOpacity(parseFloat(e.target.value))}
                        className="flex-1 h-1.5 accent-blue-500 cursor-pointer rounded-full bg-zinc-600"
                      />
                      <input
                        type="number"
                        min={5}
                        max={100}
                        step={1}
                        inputMode="numeric"
                        value={refImageOpacityInput}
                        onChange={(e) => setRefImageOpacityInput(e.target.value)}
                        onBlur={(e) => commitRefImageOpacityInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                        }}
                        className="w-12 shrink-0 bg-zinc-900 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-1.5 py-1 text-[11px] text-right text-zinc-300 tabular-nums"
                        aria-label="Overlay opacity percent"
                      />
                      <span className="text-[11px] text-zinc-400 shrink-0">%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-400 w-14 shrink-0">Rotate</span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={refImageRotation}
                        onChange={(e) => setRefImageRotation(parseInt(e.target.value, 10) || 0)}
                        className="flex-1 h-1.5 accent-emerald-500 cursor-pointer rounded-full bg-zinc-600"
                      />
                      <input
                        type="number"
                        min={-180}
                        max={180}
                        step={1}
                        inputMode="numeric"
                        value={refImageRotationInput}
                        onChange={(e) => setRefImageRotationInput(e.target.value)}
                        onBlur={(e) => commitRefImageRotationInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                        }}
                        className="w-12 shrink-0 bg-zinc-900 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-1.5 py-1 text-[11px] text-right text-zinc-300 tabular-nums"
                        aria-label="Overlay rotation degrees"
                      />
                      <button
                        type="button"
                        onClick={() => setRefImageRotation(0)}
                        title="Reset rotation"
                        className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={Math.round(refImageRotation) === 0}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-2.5 flex flex-col gap-2.5">
                      {/* Header */}
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-semibold text-zinc-200">Auto Align</span>
                        {!refImageAutoAlignActive ? (
                          <button
                            type="button"
                            onClick={startRefImageAutoAlign}
                            className="shrink-0 rounded bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 px-2 py-1 text-[10px] font-medium text-zinc-200 transition-colors"
                          >
                            Start
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={cancelRefImageAutoAlign}
                            className="shrink-0 p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                            aria-label="Cancel auto align"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {refImageAutoAlignActive && (
                        <>
                          {/* Step instructions */}
                          <div className="mt-1 flex flex-col gap-2.5">
                            {refImageAutoAlignExpectingOverlayPoint && (
                              <div className="flex flex-col gap-1">
                                <p className="text-xs font-semibold text-zinc-100">Overlay</p>
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                  Click a point on your image overlay. Use a clear landmark like a
                                  building corner, runway threshold, or intersection.
                                </p>
                              </div>
                            )}
                            {refImageAutoAlignExpectingMapPoint && (
                              <div className="flex flex-col gap-1">
                                <p className="text-xs font-semibold text-zinc-100">Basemap</p>
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                  Click that same landmark on the basemap. You may need to lower the
                                  overlay opacity to see the basemap clearly. Repeat process for
                                  more pairs to improve accuracy.
                                </p>
                              </div>
                            )}
                            {!refImageAutoAlignExpectingOverlayPoint &&
                              !refImageAutoAlignExpectingMapPoint && (
                                <p className="text-xs text-zinc-400">
                                  Add more pairs or apply the alignment below.
                                </p>
                              )}
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={handleRefImageAutoAlignApply}
                              disabled={
                                refImageCompletedAutoAlignMatches.length < 2 ||
                                Boolean(refImagePendingAutoAlignMatch)
                              }
                              className="flex-1 rounded bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 px-2 py-1 text-[10px] font-medium text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Apply Alignment
                            </button>
                            <button
                              type="button"
                              onClick={handleRefImageAutoAlignUndo}
                              disabled={refImageAutoAlignMatches.length === 0}
                              className="rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Undo
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-0.5 relative">
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
              <div className="flex-1 min-h-0">
                {combinedObjects.length === 0 ? (
                  <div className="mt-1 rounded-lg border border-zinc-700 bg-zinc-800/70 px-4 py-5 text-center">
                    <p className="text-sm font-medium text-zinc-200">No objects found</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      {searchQuery?.trim()
                        ? 'Try a different search term.'
                        : 'Objects will appear here once loaded or created.'}
                    </p>
                  </div>
                ) : (
                  <ul className="mt-1 flex h-full flex-col gap-1.5 overflow-y-auto pr-1 text-[13px]">
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
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] tracking-wide shrink-0 font-semibold ${p.state === 'create' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : ''} ${p.state === 'modify' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : ''} ${p.state === 'delete' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : ''} ${p.state === 'existing' ? 'bg-zinc-700/60 text-zinc-300 border border-zinc-600/40' : ''}`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${p.state === 'create' ? 'bg-green-400' : ''} ${p.state === 'modify' ? 'bg-blue-400' : ''} ${p.state === 'delete' ? 'bg-red-400' : ''} ${p.state === 'existing' ? 'bg-zinc-400' : ''}`}
                                style={{ animationDuration: '4s' }}
                              />
                              {p.state.charAt(0).toUpperCase() + p.state.slice(1)}
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
              </div>
              <div className="pt-1">
                <button
                  disabled={!hasPendingChanges}
                  onClick={() => setShowReviewPanel(true)}
                  className={`w-full text-xs rounded px-3 py-2 font-medium mt-1 inline-flex items-center justify-center gap-2 transition-colors ${!hasPendingChanges ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-orange-500/60 hover:bg-orange-500/80 text-white'}`}
                >
                  <span>Review Changes</span>
                  {hasPendingChanges && (
                    <span className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] rounded-full bg-white/25 text-[10px] font-bold px-1 tabular-nums">
                      {totalChanges}
                    </span>
                  )}
                </button>
              </div>
            </>
          )}
          {!selectedId && !creatingNew && showReviewPanel && (
            <>
              {/* Review Changes Header */}
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowReviewPanel(false)}
                  className="p-1 -ml-1 rounded-md hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                  aria-label="Back to objects"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h3 className="text-xl font-semibold text-zinc-100 tracking-tight">
                  Review Changes
                </h3>
              </div>

              {/* Change list */}
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3.5 pr-1">
                {/* Creates */}
                {changeset.create.map((c) => (
                  <div
                    key={c._tempId}
                    className="relative rounded-lg border border-green-500/30 bg-green-500/5 pl-4 pr-3 py-2.5 flex flex-col gap-1"
                  >
                    <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-green-500 rounded-r-full" />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-green-500/20 border border-green-500/40">
                          <Plus className="w-3 h-3 text-green-400" strokeWidth={2.5} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium text-zinc-100 truncate">
                              {c.name || '(Unnamed)'}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300 tracking-wide shrink-0">
                              {formatLabel(c.type || '')}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-500 font-mono leading-tight mt-0.5">
                            Unsaved
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => revertChange('create', c._tempId)}
                        title="Revert this change"
                        className="shrink-0 flex items-center gap-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 px-1.5 py-1 rounded transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Revert</span>
                      </button>
                    </div>
                  </div>
                ))}

                {/* Modifies */}
                {Object.entries(changeset.modify).map(([id, diff]) => {
                  const original = existingMap[id] || {};
                  return (
                    <div
                      key={id}
                      className="relative rounded-lg border border-blue-500/30 bg-blue-500/5 pl-4 pr-3 py-2.5 flex flex-col gap-1"
                    >
                      <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-r-full" />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/40">
                            <SquarePen className="w-3 h-3 text-blue-400" strokeWidth={2.5} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-medium text-zinc-100 truncate">
                                {diff.name ?? original.name ?? '(Unnamed)'}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300 tracking-wide shrink-0">
                                {formatLabel(diff.type || original.type || '')}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500 font-mono leading-tight mt-0.5 truncate">
                              {id}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => revertChange('modify', id)}
                          title="Revert this change"
                          className="shrink-0 flex items-center gap-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 px-1.5 py-1 rounded transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Revert</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Deletes */}
                {changeset.delete.map((id) => {
                  const original = existingMap[id] || {};
                  return (
                    <div
                      key={id}
                      className="relative rounded-lg border border-red-500/30 bg-red-500/5 pl-4 pr-3 py-2.5 flex flex-col gap-1"
                    >
                      <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-red-500 rounded-r-full" />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40">
                            <Trash2 className="w-3 h-3 text-red-400" strokeWidth={2.5} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-medium text-zinc-100 truncate">
                                {original.name || '(Unnamed)'}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300 tracking-wide shrink-0">
                                {formatLabel(original.type || '')}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500 font-mono leading-tight mt-0.5 truncate">
                              {id}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => revertChange('delete', id)}
                          title="Revert this change"
                          className="shrink-0 flex items-center gap-1 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 px-1.5 py-1 rounded transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Revert</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Save & Upload */}
              <div className="mt-3 pt-3 border-t border-zinc-700/60">
                <button
                  disabled={uploadState.status === 'uploading' || !hasPendingChanges}
                  onClick={handleUpload}
                  className={`w-full text-xs rounded px-3 py-2 font-medium inline-flex items-center justify-center gap-2 transition-colors ${uploadState.status === 'uploading' || !hasPendingChanges ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-orange-500/60 hover:bg-orange-500/80 text-white'}`}
                >
                  {uploadState.status === 'uploading' && (
                    <span
                      className="h-3 w-3 rounded-full border border-current border-t-transparent animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  <span>{uploadState.status === 'uploading' ? 'Uploading…' : 'Save & Upload'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <Toast
        title={toastConfig.title}
        description={toastConfig.description}
        variant={toastConfig.variant}
        show={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  );
};

AirportPointEditor.propTypes = {
  existingPoints: PropTypes.array,
  onChangesetChange: PropTypes.func,
  height: PropTypes.string,
};

export default AirportPointEditor;
