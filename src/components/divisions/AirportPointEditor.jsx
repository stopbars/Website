import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import PropTypes from 'prop-types';
import { MapContainer, TileLayer, useMap, Rectangle, Polyline } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';

const POINT_TYPES = ['stopbar', 'lead_on', 'taxiway', 'stand'];
const DIRECTIONALITY = ['bi-directional', 'uni-directional'];
const COLORS = ['yellow', 'green', 'green-yellow', 'green-orange', 'green-blue'];

const defaultChangeset = () => ({ create: [], modify: {}, delete: [] });


// --- Map logic encapsulated in a child hook component to access useMap --- //
const GeomanController = ({
  existingPoints, featureLayerMapRef, registerSelect, pushGeometryChange, mapStyle, mapInstanceRef, onFeatureCreated,
  onDrawingCoordsUpdate, onDrawingComplete, onLiveEdit, redrawTargetRef
}) => {
  const map = useMap();
  const drawingLayerRef = useRef(null);
  const lastClickPollRef = useRef(null);
  const lastReportedLenRef = useRef(0);

  useEffect(() => {
    // Expose map instance upward for programmatic control
    if (mapInstanceRef) {
      mapInstanceRef.current = map;
    }

    // Style overrides
    if (mapStyle) {
      Object.entries(mapStyle).forEach(([k, v]) => map.getContainer().style[k] = v);
    }

    // Register existing points as layers (visualization)
    existingPoints.forEach(pt => {
      if (featureLayerMapRef.current[pt.id]) return; // already added
      let layer;
      const latlngs = pt.coordinates.map(c => [c.lat, c.lng]);
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

    // Event: creation of new geometry
    map.on('pm:create', (e) => {
      const layer = e.layer; // new layer
      let assignedId;
      if (redrawTargetRef?.current) {
        // reusing an existing (new_) id for redraw
        assignedId = redrawTargetRef.current;
        layer.options.pointId = assignedId;
        // remove old layer if existed
        const old = featureLayerMapRef.current[assignedId];
        if (old && old.remove) old.remove();
        featureLayerMapRef.current[assignedId] = layer;
        registerSelect(layer, assignedId, true);
        redrawTargetRef.current = null;
      } else {
        assignedId = `new_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
        layer.options.pointId = assignedId;
        featureLayerMapRef.current[assignedId] = layer;
        registerSelect(layer, assignedId, true);
      }
      if (onFeatureCreated) onFeatureCreated(layer, assignedId);
      // Ensure freshly created (including redraw placeholder) geometry coordinates are synced
      // so overlays (gradient preview) have >=2 vertices immediately and do not disappear until save.
  try { pushGeometryChange(layer); } catch { /* no-op */ }
      if (onDrawingComplete) onDrawingComplete();
    });

    // Drawing lifecycle for live preview (works for Line only)
    map.on('pm:drawstart', (e) => {
      // Geoman draws shape "Line" for enabled draw('Line')
      if (e.shape === 'Line') {
        drawingLayerRef.current = e.workingLayer || e.layer || null;
        onDrawingCoordsUpdate && onDrawingCoordsUpdate([]);
        lastReportedLenRef.current = 0;
      }
    });
    const updateWorking = (e) => {
      const layer = e?.workingLayer || e?.layer || drawingLayerRef.current;
      if (!layer) return;
      const read = () => {
        const latlngs = layer.getLatLngs?.();
        if (Array.isArray(latlngs)) {
          const coords = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
          onDrawingCoordsUpdate && onDrawingCoordsUpdate(coords);
          drawingLayerRef.current = layer; // keep ref fresh
        }
      };
      // Read immediately
      read();
      // Some Geoman internals update latlngs after the event cycle; schedule a next-frame read
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(read);
      } else {
        setTimeout(read, 0);
      }
      // If editing existing (not drawing), trigger live edit re-render
      if (!drawingLayerRef.current && onLiveEdit) onLiveEdit();
    };
    map.on('pm:vertexadded', updateWorking);
    map.on('pm:vertexremoved', updateWorking);
    // While moving mouse between clicks Geoman adds a temporary hint line; poll for smoother preview
    const moveHandler = () => {
      if (!drawingLayerRef.current) return;
      const latlngs = drawingLayerRef.current.getLatLngs?.();
      if (Array.isArray(latlngs)) {
        const coords = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
        onDrawingCoordsUpdate && onDrawingCoordsUpdate(coords);
      }
    };
    map.on('mousemove', moveHandler);

    // After each map click during drawing, poll a few frames to catch newly committed vertex
    const clickHandler = () => {
      if (!drawingLayerRef.current) return; // not drawing
      let frames = 0;
      const maxFrames = 6; // ~100ms at 60fps
      if (lastClickPollRef.current) cancelAnimationFrame(lastClickPollRef.current);
      const poll = () => {
        if (!drawingLayerRef.current) return;
        const latlngs = drawingLayerRef.current.getLatLngs?.();
        if (Array.isArray(latlngs)) {
          const len = latlngs.length;
            if (len !== lastReportedLenRef.current) {
              lastReportedLenRef.current = len;
              const coords = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
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
      onDrawingCoordsUpdate && onDrawingCoordsUpdate([]);
    });

    // Global edit vertex drag for live updates (fallback if individual layer listeners not established)
    map.on('pm:markerdrag', () => { onLiveEdit && onLiveEdit(); });
    map.on('pm:snapdrag', () => { onLiveEdit && onLiveEdit(); });

    return () => {
      // no controls to remove now; clean listeners
      map.off('pm:create');
      map.off('pm:drawstart');
      map.off('pm:vertexadded');
      map.off('pm:vertexremoved');
      map.off('pm:drawend');
      map.off('mousemove', moveHandler);
      map.off('click', clickHandler);
      map.off('pm:markerdrag');
      map.off('pm:snapdrag');
    };
  }, [map, existingPoints, featureLayerMapRef, registerSelect, pushGeometryChange, mapStyle, mapInstanceRef, onFeatureCreated, onDrawingCoordsUpdate, onDrawingComplete, onLiveEdit, redrawTargetRef]);

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
  redrawTargetRef: PropTypes.object
};
GeomanController.propTypes.onDrawingCoordsUpdate = PropTypes.func;
GeomanController.propTypes.onDrawingComplete = PropTypes.func;
GeomanController.propTypes.onLiveEdit = PropTypes.func;

// Layer styling based on type / state
const styleLayerByPoint = (layer, pt, isSelected = false, isDeleted = false) => {
  const baseColor = (() => {
    switch (pt.type) {
      case 'stopbar': return '#ef4444';
      case 'lead_on': return '#facc15';
      case 'taxiway': return '#22c55e';
      case 'stand': return '#f59e0b';
      default: return '#64748b';
    }
  })();
  const color = isDeleted ? '#dc2626' : baseColor;
  // For polylines we hide the base stroke so our overlay can render gradients / outlines.
  // Keep minimal stroke when selected so edit handles remain obvious.
  const weight = isSelected ? 2 : 1;
  if (layer.setStyle && layer.getLatLngs) {
    layer.setStyle({ color, weight, opacity: 0.15 });
  } else if (layer.setStyle) {
    layer.setStyle({ color, weight: isSelected ? 18 : 14, opacity: 0.9 });
  }
  if (layer.setIcon && pt.type) {
    const iconHtml = `<div style="background:${color};width:${isSelected?18:14}px;height:${isSelected?18:14}px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px ${isDeleted? '#dc2626':'#334155'};"></div>`;
    layer.setIcon(L.divIcon({ className: 'point-icon', html: iconHtml, iconSize: [isSelected?18:14, isSelected?18:14] }));
  }
};

// Polyline gradient color logic copied from ContributeMap
const POLYLINE_COLORS = {
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: 'rgb(63, 63, 255)',
  orange: 'rgb(255, 141, 35)',
  red: '#ef4444',
  gray: '#999999'
};

const getPolylineColors = (point) => {
  let topColor = POLYLINE_COLORS.gray;
  let bottomColor = POLYLINE_COLORS.red;
  if (!point || !point.type) return { topColor, bottomColor };
  switch (point.type) {
    case 'taxiway': {
      const style = point.color || 'green';
      if (style === 'green') {
        topColor = POLYLINE_COLORS.green; bottomColor = POLYLINE_COLORS.green;
      } else if (style === 'green-yellow') {
        topColor = POLYLINE_COLORS.green; bottomColor = POLYLINE_COLORS.yellow;
      } else if (style === 'green-blue') {
        topColor = POLYLINE_COLORS.green; bottomColor = POLYLINE_COLORS.blue;
      } else if (style === 'green-orange') {
        topColor = POLYLINE_COLORS.green; bottomColor = POLYLINE_COLORS.orange;
      } else {
        topColor = POLYLINE_COLORS.green; bottomColor = POLYLINE_COLORS.green;
      }
      break;
    }
    case 'lead_on': {
      topColor = POLYLINE_COLORS.green; bottomColor = POLYLINE_COLORS.yellow; break;
    }
    case 'stand': {
      topColor = POLYLINE_COLORS.orange; bottomColor = POLYLINE_COLORS.orange; break;
    }
    case 'stopbar':
    default: {
      if (point.directionality === 'bi-directional') {
        topColor = POLYLINE_COLORS.red; bottomColor = POLYLINE_COLORS.red;
      } else {
        topColor = POLYLINE_COLORS.gray; bottomColor = POLYLINE_COLORS.red;
      }
      break;
    }
  }
  return { topColor, bottomColor };
};

// --- Segmented gradient defs component (mirrors ContributeMap implementation) --- //
const SegmentedDefs = ({ segments = [], topColor = '#ef4444', bottomColor = '#999999', strokeWidth = 10 }) => {
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
      [...defs.querySelectorAll(`linearGradient[data-generated="seg"][data-owner="${ownerId}"]`)].forEach(n => n.remove());
      segments.forEach(seg => {
        const gradId = `seggrad-${seg.baseId}-${seg.idx}`;
        const lp1 = map.latLngToLayerPoint(L.latLng(seg.p1.lat, seg.p1.lng));
        const lp2 = map.latLngToLayerPoint(L.latLng(seg.p2.lat, seg.p2.lng));
        const mx = (lp1.x + lp2.x) / 2; const my = (lp1.y + lp2.y) / 2;
        const dx = lp2.x - lp1.x; const dy = lp2.y - lp1.y; const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const px = -dy / len; const py = dx / len; // perpendicular
        const half = Math.max(1, strokeWidth / 2); const span = half * 1.2;
        const x1 = mx - px * span; const y1 = my - py * span; const x2 = mx + px * span; const y2 = my + py * span;
        const lg = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        lg.setAttribute('id', gradId);
        lg.setAttribute('gradientUnits', 'userSpaceOnUse');
        lg.setAttribute('x1', x1); lg.setAttribute('y1', y1); lg.setAttribute('x2', x2); lg.setAttribute('y2', y2);
        lg.setAttribute('data-generated', 'seg'); lg.setAttribute('data-owner', ownerId);
        lg.innerHTML = `\n          <stop offset="50%" stop-color="${topColor}" stop-opacity="1"/>\n          <stop offset="50%" stop-color="${bottomColor}" stop-opacity="1"/>\n        `;
        defs.appendChild(lg);
      });
    };
    build();
    const onChange = () => build();
    map.on('zoom viewreset move', onChange);
    return () => {
      map.off('zoom viewreset move', onChange);
      [...defs.querySelectorAll(`linearGradient[data-generated="seg"][data-owner="${ownerId}"]`)].forEach(n => n.remove());
    };
  }, [map, segments, topColor, bottomColor, strokeWidth]);
  return null;
};
SegmentedDefs.propTypes = {
  segments: PropTypes.array,
  topColor: PropTypes.string,
  bottomColor: PropTypes.string,
  strokeWidth: PropTypes.number
};

// Overlay that renders gradient polylines for each multi-coordinate point
const PolylineVisualizationOverlay = ({ featureLayerMapRef, changeset, existingMap, selectedId, registerSelect, formState, drawingCoords }) => {
  // Helper to pull coordinates live from a layer (for unsaved new geometry)
  const extractCoords = useCallback((layer) => {
    if (!layer) return [];
    if (layer.getLatLng) { const { lat, lng } = layer.getLatLng(); return [{ lat, lng }]; }
    if (layer.getLatLngs) { return layer.getLatLngs().map(ll => ({ lat: ll.lat, lng: ll.lng })); }
    return [];
  }, []);

  // Build fresh each render for simplicity (dataset expected small). liveEditTick triggers parent re-render.
  const overlayPoints = (() => {
    const list = [];
    Object.values(existingMap).forEach(base => {
      if (!base) return;
      const mod = changeset.modify[base.id] || {};
      let merged = { ...base, ...mod };
      if (selectedId === base.id && formState) merged = { ...merged, ...formState };
      if (selectedId === base.id && featureLayerMapRef.current[base.id]) {
        const liveCoords = extractCoords(featureLayerMapRef.current[base.id]);
        if (liveCoords.length >= 2) merged.coordinates = liveCoords;
      }
      list.push(merged);
    });
    changeset.create.forEach(c => list.push({ ...c, id: c._tempId }));
    if (selectedId && selectedId.startsWith('new_') && !changeset.create.find(c => c._tempId === selectedId)) {
      const layer = featureLayerMapRef.current[selectedId];
      if (layer) {
        const coords = extractCoords(layer);
        list.push({ id: selectedId, _tempId: selectedId, coordinates: coords, ...formState });
      }
    }
    if (drawingCoords && drawingCoords.length >= 2) {
      list.push({ id: '__drawing_preview__', coordinates: drawingCoords, ...(formState || {}), type: formState?.type || 'stopbar' });
    }
    return list;
  })();

  return (
    <>
      {overlayPoints.map(pt => {
        const coords = pt?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return null; // only render polylines
        const safe = coords.filter(c => typeof c?.lat === 'number' && typeof c?.lng === 'number');
        if (safe.length < 2) return null;
        const positions = safe.map(c => [c.lat, c.lng]);
        const segments = [];
        for (let i = 0; i < safe.length - 1; i++) segments.push({ baseId: pt.id, idx: i, p1: safe[i], p2: safe[i + 1] });
        const { topColor, bottomColor } = getPolylineColors(pt);
        const isSelected = selectedId === pt.id || pt.id === '__drawing_preview__';
        const isDeleted = changeset.delete.includes(pt.id);
        const onClick = pt.id === '__drawing_preview__' ? undefined : () => {
          const layer = featureLayerMapRef.current[pt.id];
          if (layer) registerSelect(layer, pt.id, pt.id.startsWith('new_'));
        };
        return (
          <React.Fragment key={pt.id}>
            <Polyline
              positions={positions}
              pathOptions={{
                color: isDeleted ? '#dc2626' : '#ffffff',
                weight: 15,
                opacity: isDeleted ? 0.5 : (isSelected ? 0.9 : 0.7),
                dashArray: isDeleted ? '8 6' : undefined,
                lineCap: 'round',
                lineJoin: 'round'
              }}
              eventHandlers={onClick ? { click: onClick } : undefined}
            />
            <SegmentedDefs segments={segments} topColor={topColor} bottomColor={bottomColor} strokeWidth={10} />
            {segments.map(seg => {
              const gradId = `seggrad-${seg.baseId}-${seg.idx}`;
              const segPositions = [[seg.p1.lat, seg.p1.lng], [seg.p2.lat, seg.p2.lng]];
              return (
                <Polyline
                  key={`${pt.id}-seg-${seg.idx}`}
                  positions={segPositions}
                  pathOptions={{
                    color: `url(#${gradId})`,
                    weight: 10,
                    opacity: isDeleted ? 0.25 : 1,
                    lineCap: 'round',
                    lineJoin: 'round'
                  }}
                  eventHandlers={onClick ? { click: onClick } : undefined}
                />
              );
            })}
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
};

// Validation following schema conditional rules
const validatePoint = (pt) => {
  const errors = [];
  if (!pt.type || !POINT_TYPES.includes(pt.type)) errors.push('Type required.');
  if (!pt.name) errors.push('Name required.');
  if (!Array.isArray(pt.coordinates) || pt.coordinates.length < 1) errors.push('At least one coordinate required.');
  if (pt.type === 'stopbar' && !pt.directionality) errors.push('Directionality required for stopbar.');
  if (pt.type === 'taxiway') {
    if (!pt.directionality) errors.push('Directionality required for taxiway.');
    if (!pt.color) errors.push('Color required for taxiway.');
  }
  if (pt.elevated) {
    if (pt.directionality && pt.directionality !== 'uni-directional') {
      errors.push('Elevated stopbars must be uni-directional.');
    }
  }
  return errors;
};

const emptyFormState = {
  type: 'stopbar',
  name: '',
  directionality: 'uni-directional',
  color: '',
  elevated: false,
  ihp: false
};

const AirportPointEditor = ({ existingPoints = [], onChangesetChange, height = 'dynamic' }) => {
  const { airportId } = useParams(); // route defines this param (contains ICAO)
  const icao = (airportId || '').toUpperCase();
  // Mapbox token (satellite imagery). Ensure .env contains VITE_MAPBOX_TOKEN
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
  const [airportMeta, setAirportMeta] = useState(null);
  const [airportMetaError, setAirportMetaError] = useState(null);
  const [airportMetaLoading, setAirportMetaLoading] = useState(false);

  useEffect(() => {
    if (!icao) return;
    let aborted = false;
    const fetchAirport = async () => {
      try {
        setAirportMetaLoading(true);
        setAirportMetaError(null);
        const resp = await fetch(`https://v2.stopbars.com/airports?icao=${encodeURIComponent(icao)}`);
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
    return () => { aborted = true; };
  }, [icao]);
  const [changeset, setChangeset] = useState(defaultChangeset);
  const [selectedId, setSelectedId] = useState(null); // id or temp id
  // Track if selected feature is new (implicit via id prefix; state var removed)
  const [formState, setFormState] = useState(emptyFormState);
  const [formErrors, setFormErrors] = useState([]);
  const featureLayerMapRef = useRef({});
  const mapInstanceRef = useRef(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [drawingCoords, setDrawingCoords] = useState([]); // live vertices while drawing
  // Store original geometry snapshot for existing feature editing so we can restore on cancel
  const originalGeometryRef = useRef({});
  // If a polyline is wiped (<=1 vertices) we enable redraw and reuse this temp id
  const redrawTargetRef = useRef(null);
  // Map of temporary redraw IDs to their original existing feature IDs for restoration on cancel
  const redrawOriginRef = useRef({});
  // live edit re-render now handled by forcing state changes through changeset modifications

  // Start drawing a new polyline point
  const startAddPoint = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    // Ensure no existing drawing in progress
    map.pm.disableDraw();
    setCreatingNew(true);
    setDrawingCoords([]);
    setFormState(emptyFormState); // reset form for new object defaults
    map.pm.enableDraw('Line', {
      snappable: true,
      snapDistance: 12,
      snapSegment: true,
      snapMiddle: true,
      requireSnapToFinish: false,
      templineStyle: { color: '#3b82f6' },
      hintlineStyle: { color: '#60a5fa', dashArray: '5,5' }
    });
  }, []);

  // Remove unsaved new geometry helper (hoisted above cancelCreate for reference)
  const handleRemoveUnsavedNew = useCallback((targetId) => {
    if (!targetId || !targetId.startsWith('new_')) return;
    const layer = featureLayerMapRef.current[targetId];
    if (layer) layer.remove();
    setChangeset(prev => ({ ...prev, create: prev.create.filter(c => c._tempId !== targetId) }));
    delete featureLayerMapRef.current[targetId];
    if (selectedId === targetId) {
      setSelectedId(null);
      setCreatingNew(false);
      setFormState(emptyFormState);
      setFormErrors([]);
    }
  }, [selectedId]);


  // Quick lookup for existing point data
  const existingMap = useMemo(() => {
    const map = {}; existingPoints.forEach(p => map[p.id] = p); return map;
  }, [existingPoints]);

  // Get coordinates from a layer
  const extractCoords = (layer) => {
    if (!layer) return [];
    if (layer.getLatLng) { // marker
      const { lat, lng } = layer.getLatLng();
      return [{ lat, lng }];
    }
    if (layer.getLatLngs) {
      const latlngs = layer.getLatLngs();
      // Polyline returns array of LatLng
      return latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
    }
    return [];
  };

  // When a geometry is edited for an existing point, push to modify (moved earlier to avoid TDZ issues)
  const pushGeometryChange = useCallback((layer) => {
    if (!layer) return;
    const id = layer.options.pointId;
    const coords = extractCoords(layer);
    setChangeset(prev => {
      if (id.startsWith('new_')) {
        const clone = { ...prev }; // update in create array
        clone.create = clone.create.map(c => c._tempId === id ? { ...c, coordinates: coords } : c);
        return clone;
      }
      const m = { ...(prev.modify[id] || {}) }; m.coordinates = coords;
      return { ...prev, modify: { ...prev.modify, [id]: m } };
    });
  }, []);

  // Register selecting a layer (either existing or new)
  const registerSelect = useCallback((layer, id, isNew = false) => {
    setSelectedId(id);
    // For newly created (temp id) objects, attempt to pull the saved create entry (so we retain name & properties after saving once)
    let basePoint;
    if (isNew) {
      const createEntry = changeset.create.find(c => c._tempId === id);
      if (createEntry) {
        basePoint = { ...createEntry, id: createEntry._tempId, coordinates: createEntry.coordinates || extractCoords(layer) };
      } else {
        // Freshly drawn, not yet saved
        basePoint = { ...emptyFormState, name: '', type: 'stopbar', coordinates: extractCoords(layer) };
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
        directionality: effective.directionality || (effective.type === 'stopbar' || effective.type === 'taxiway' ? 'uni-directional' : ''),
        color: effective.color || '',
        elevated: !!effective.elevated,
        ihp: !!effective.ihp
      });
    }

    // Enable editing on this layer only
    if (layer?.pm) {
      Object.values(featureLayerMapRef.current).forEach(l => { if (l.pm && l !== layer) l.pm.disable(); });
      // While editing, disable snapping to avoid grid/magnetic feel.
      layer.pm.enable({ allowSelfIntersection: false, snappable: false, snapDistance: 0 });
      // Capture original geometry snapshot for existing points (only once per selection)
      if (isNew) {
        // Snapshot initial drawn geometry for temp so Cancel can revert (not delete)
        const coords = extractCoords(layer);
        originalGeometryRef.current[id] = coords.map(c => ({ ...c }));
      } else if (existingMap[id]) {
        originalGeometryRef.current[id] = (existingMap[id].coordinates || []).map(c => ({ ...c }));
      }
      // Live edit tick bump during vertex drag
      const bump = () => {
        // push current geometry into modify so overlay re-renders with live shape
        pushGeometryChange(layer);
        // After updating, check if geometry became empty (all vertices removed)
        const ll = layer.getLatLngs ? layer.getLatLngs() : (layer.getLatLng ? [layer.getLatLng()] : []);
        const count = Array.isArray(ll) ? ll.length : 0;
        // Treat 0 or 1 vertices as effectively removed (cannot form a valid polyline)
        if (count <= 1) { // geometry wiped/invalid -> start redraw keeping form
          if (layer?.pm) layer.pm.disable();
          // Only allow redraw for new_ objects; for existing we revert to original geometry snapshot then allow redraw of copy as new
          if (id.startsWith('new_')) {
            redrawTargetRef.current = id; // reuse same id
          } else {
            // Create a fresh temp id to redraw, keeping current formState
            const newId = `new_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
            redrawTargetRef.current = newId;
            // Store create record placeholder using original properties so Save works later
            setChangeset(prev => {
              const next = { ...prev };
              next.create = [...next.create, { _tempId: newId, ...existingMap[id], coordinates: [] }];
              return next;
            });
            // Track original so we can restore if user cancels redraw
            redrawOriginRef.current[newId] = id;
            setSelectedId(newId);
          }
          setCreatingNew(true);
          // Re-enable draw mode for line
          if (mapInstanceRef.current) {
            mapInstanceRef.current.pm.disableDraw();
            mapInstanceRef.current.pm.enableDraw('Line', {
              snappable: true,
              snapDistance: 12,
              snapSegment: true,
              snapMiddle: true,
              requireSnapToFinish: false,
              templineStyle: { color: '#3b82f6' },
              hintlineStyle: { color: '#60a5fa', dashArray: '5,5' }
            });
          }
          return; // stop further bump processing
        }
      };
      layer.on('pm:markerdrag', bump);
      layer.on('pm:snapdrag', bump);
      // Vertex add/remove events during edit mode
      layer.on('pm:vertexadded', () => {
        bump();
      });
      layer.on('pm:vertexremoved', () => {
        bump();
      });
    }

    // If newly created feature selected, ensure form opens and we are in creating state
    if (isNew) setCreatingNew(true); else setCreatingNew(false);

    // Visual highlight
    Object.entries(featureLayerMapRef.current).forEach(([pid, lyr]) => {
      const isDeleted = changeset.delete.includes(pid);
      const ptData = existingMap[pid] || changeset.create.find(c => c._tempId === pid) || { type: 'stopbar' };
      styleLayerByPoint(lyr, ptData, pid === id, isDeleted);
    });
  }, [existingMap, changeset, pushGeometryChange]);

  // Cancel editing (different behaviour for new vs existing)
  const handleCancelEdit = useCallback(() => {
    if (!selectedId) return;
    if (selectedId.startsWith('new_')) {
      // Revert geometry to snapshot if exists; keep feature
      const layer = featureLayerMapRef.current[selectedId];
      const snapshot = originalGeometryRef.current[selectedId];
      if (layer && snapshot && snapshot.length) {
        if (layer.setLatLngs && snapshot.length >= 2) {
          layer.setLatLngs(snapshot.map(c => [c.lat, c.lng]));
        } else if (layer.setLatLng && snapshot.length === 1) {
          const { lat, lng } = snapshot[0];
          layer.setLatLng([lat, lng]);
        }
      }
      // If this temp id was spawned from an existing feature redraw, restore original geometry & remove temp placeholder
      const originId = redrawOriginRef.current[selectedId];
      if (originId) {
        const originLayer = featureLayerMapRef.current[originId];
        const originSnapshot = originalGeometryRef.current[originId] || existingMap[originId]?.coordinates;
        if (originLayer && originSnapshot && originSnapshot.length) {
          if (originLayer.setLatLngs && originSnapshot.length >= 2) originLayer.setLatLngs(originSnapshot.map(c => [c.lat, c.lng]));
          else if (originLayer.setLatLng && originSnapshot.length === 1) {
            const { lat, lng } = originSnapshot[0];
            originLayer.setLatLng([lat, lng]);
          }
        }
        // Remove temp layer & create entry since user canceled redraw
        if (layer) layer.remove();
        setChangeset(prev => ({ ...prev, create: prev.create.filter(c => c._tempId !== selectedId) }));
        delete featureLayerMapRef.current[selectedId];
        delete redrawOriginRef.current[selectedId];
      } else {
        // If snapshot missing or coordinates invalid (<2), treat as abort and remove the unsaved temp feature
        const coordsNow = (layer && layer.getLatLngs) ? layer.getLatLngs() : [];
        if (!snapshot && (!coordsNow || coordsNow.length < 2)) {
          if (layer) layer.remove();
          setChangeset(prev => ({ ...prev, create: prev.create.filter(c => c._tempId !== selectedId) }));
          delete featureLayerMapRef.current[selectedId];
        }
      }
      // Remove any create entry modifications (leave create array as-is with original coordinates)
      setChangeset(prev => {
        const next = { ...prev };
        next.create = next.create.map(c => {
          if (c._tempId === selectedId && snapshot && snapshot.length) {
            return { ...c, coordinates: snapshot.map(s => ({ ...s })) };
          }
          return c;
        });
        return next;
      });
      // Exit editing
      if (layer?.pm) layer.pm.disable();
      // Always disable global draw mode (in case we were mid-redraw)
      if (mapInstanceRef.current?.pm) mapInstanceRef.current.pm.disableDraw();
      setSelectedId(null);
      setFormState(emptyFormState);
      setFormErrors([]);
      setCreatingNew(false);
      return;
    }
    const layer = featureLayerMapRef.current[selectedId];
    const original = existingMap[selectedId];
    if (layer && original) {
      const snapshot = originalGeometryRef.current[selectedId] || original.coordinates;
      if (layer.setLatLngs && Array.isArray(snapshot) && snapshot.length >= 2) {
        layer.setLatLngs(snapshot.map(c => [c.lat, c.lng]));
      } else if (layer.setLatLng && Array.isArray(snapshot) && snapshot.length === 1) {
        const { lat, lng } = snapshot[0];
        layer.setLatLng([lat, lng]);
      }
    }
    // Remove any unsaved modifications (both geometry and property diffs) for this point
    setChangeset(prev => {
      if (!prev.modify[selectedId]) return prev; // nothing to revert
      const clone = { ...prev, modify: { ...prev.modify } };
      delete clone.modify[selectedId];
      return clone;
    });
    // Clear stored snapshot after cancel
    delete originalGeometryRef.current[selectedId];
    // Disable editing mode on layer
    if (layer?.pm) layer.pm.disable();
  if (mapInstanceRef.current?.pm) mapInstanceRef.current.pm.disableDraw();
    // Deselect & reset form
    setSelectedId(null);
    setFormState(emptyFormState);
    setFormErrors([]);
    // Restyle all layers to clear selection highlight
    Object.entries(featureLayerMapRef.current).forEach(([pid, lyr]) => {
      const isDeleted = changeset.delete.includes(pid);
      const pointData = existingMap[pid] || changeset.create.find(c => c._tempId === pid) || { type: 'stopbar' };
      styleLayerByPoint(lyr, pointData, false, isDeleted);
    });
  }, [selectedId, existingMap, changeset.create, changeset.delete]);

  // When selection cleared we should disable editing on all layers
  useEffect(() => {
    if (!selectedId) {
      Object.values(featureLayerMapRef.current).forEach(l => { if (l.pm) l.pm.disable(); });
    }
  }, [selectedId]);

  // (pushGeometryChange defined earlier)
  // Keep parent informed
  useEffect(() => {
    onChangesetChange && onChangesetChange(serializeChangeset(changeset));
  }, [changeset, onChangesetChange]);

  // Create/update point from form submission
  const handleSave = () => {
    if (!selectedId) return;
    // Compose point object
    const layer = featureLayerMapRef.current[selectedId];
    const coordinates = extractCoords(layer);
    const pointObj = { ...formState, coordinates };
    const errors = validatePoint(pointObj);
    setFormErrors(errors);
    if (errors.length) return;

    setChangeset(prev => {
      const next = { ...prev };
      if (selectedId.startsWith('new_')) {
        // find existing temp entry or add
        if (!next.create.find(c => c._tempId === selectedId)) {
          next.create = [...next.create, { ...pointObj, _tempId: selectedId }];
        } else {
          next.create = next.create.map(c => c._tempId === selectedId ? { ...c, ...pointObj } : c);
        }
      } else {
        // existing point: add partial diff vs original
        const original = existingMap[selectedId];
        if (original) {
          const diff = {};
          ['type','name','directionality','color','elevated','ihp'].forEach(k => {
            if (pointObj[k] !== undefined && pointObj[k] !== original[k]) diff[k] = pointObj[k];
          });
          if (!arraysEqualCoords(pointObj.coordinates, original.coordinates)) diff.coordinates = pointObj.coordinates;
          if (Object.keys(diff).length > 0) {
            next.modify = { ...next.modify, [selectedId]: diff };
          } else {
            // remove modification if diff empty
            if (next.modify[selectedId]) {
              const cloneMod = { ...next.modify }; delete cloneMod[selectedId]; next.modify = cloneMod;
            }
          }
        }
      }
      return next;
    });

    // After saving: close form / deselect while keeping pending changes
    if (layer?.pm) layer.pm.disable();
    setSelectedId(null);
    setFormState(emptyFormState);
    setCreatingNew(false);
    setFormErrors([]);
  };

  const arraysEqualCoords = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((p,i) => p.lat === b[i].lat && p.lng === b[i].lng);
  };

  const handleDeleteToggle = () => {
    if (!selectedId || selectedId.startsWith('new_')) return; // cannot delete new (remove from create instead)
    setChangeset(prev => {
      const next = { ...prev };
      if (next.delete.includes(selectedId)) {
        next.delete = next.delete.filter(i => i !== selectedId);
      } else {
        next.delete = [...next.delete, selectedId];
        // if previously modified, remove modification (delete supersedes)
        if (next.modify[selectedId]) {
          const m = { ...next.modify }; delete m[selectedId]; next.modify = m;
        }
      }
      return next;
    });
  };

  // (Moved earlier) handleRemoveUnsavedNew defined with useCallback above

  const serializeChangeset = (cs) => {
    // Remove helper keys (_tempId) before export
    return {
  create: cs.create.map(({ _tempId, ...rest }) => rest), // eslint-disable-line no-unused-vars
      modify: cs.modify,
      delete: cs.delete
    };
  };

  const resetAll = () => {
    // Remove temp layers
    Object.keys(featureLayerMapRef.current).forEach(id => {
      if (id.startsWith('new_')) featureLayerMapRef.current[id].remove();
    });
    featureLayerMapRef.current.current = {};
    setChangeset(defaultChangeset());
    setSelectedId(null);
    setFormState(emptyFormState);
    setCreatingNew(false);
    if (mapInstanceRef.current) mapInstanceRef.current.pm.disableDraw();
  };

  const prettyJson = JSON.stringify(serializeChangeset(changeset), null, 2);

  // Keep style highlight updated when changeset delete list changes
  useEffect(() => {
    Object.entries(featureLayerMapRef.current).forEach(([pid, lyr]) => {
      const isDeleted = changeset.delete.includes(pid);
      const pointData = existingMap[pid] || changeset.create.find(c => c._tempId === pid) || { type: 'stopbar' };
      styleLayerByPoint(lyr, pointData, pid === selectedId, isDeleted);
    });
  }, [changeset.delete, changeset.create, existingMap, selectedId]);

  // Derived list of display points (existing + new)
  const displayPoints = [
    ...existingPoints.map(p => ({ ...p, state: changeset.delete.includes(p.id) ? 'delete' : (changeset.modify[p.id] ? 'modify' : 'existing') })),
    ...changeset.create.map(c => ({ ...c, id: c._tempId, state: 'create' }))
  ];

  const copyChangeset = async () => {
    try {
      await navigator.clipboard.writeText(prettyJson);
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  };

  // Fit bounds to existing points once
  const allExistingCoords = useMemo(() => existingPoints.flatMap(p => p.coordinates), [existingPoints]);
  const BoundsFitter = () => {
    const map = useMap();
    useEffect(() => {
      if (allExistingCoords.length > 0) {
        const latlngs = allExistingCoords.map(c => [c.lat, c.lng]);
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds.pad(0.1));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, allExistingCoords.length]);
    return null;
  };

  // Determine map center: prefer fetched airport lat/lon; freeze first valid center to avoid later recenter
  const parsedAirportCenter = useMemo(() => {
    if (!airportMeta) return null;
    const lat = parseFloat(airportMeta.latitude);
    const lon = parseFloat(airportMeta.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return [lat, lon];
    }
    return null;
  }, [airportMeta]);
  const frozenCenterRef = useRef(null);
  if (!frozenCenterRef.current && parsedAirportCenter) {
    frozenCenterRef.current = parsedAirportCenter; // set once
  }
  const derivedCenter = frozenCenterRef.current;

  const MAX_BOUNDS_RADIUS_KM = 25;
  const maxBounds = useMemo(() => {
    if (!parsedAirportCenter) return null;
    const [clat, clon] = parsedAirportCenter;
    const radiusKm = MAX_BOUNDS_RADIUS_KM;
    const latDelta = radiusKm / 111.32 / 2;
    const cosLat = Math.cos(clat * Math.PI / 180) || 1;
    const lngDelta = radiusKm / (111.32 * cosLat) / 2;
    return L.latLngBounds(
      [clat - latDelta, clon - lngDelta],
      [clat + latDelta, clon + lngDelta]
    );
  }, [parsedAirportCenter]);

  // Refetch support (retry button)
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    if (!icao) return;
    let aborted = false;
    const fetchAirport = async () => {
      try {
        setAirportMetaLoading(true);
        setAirportMetaError(null);
        const resp = await fetch(`https://v2.stopbars.com/airports?icao=${encodeURIComponent(icao)}`);
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
    return () => { aborted = true; };
  }, [icao, refreshTick]);

  // Component to enforce bounds & adjust min zoom so user cannot zoom out to world
  const BoundsController = ({ bounds }) => {
    const map = useMap();
    useEffect(() => {
      if (!bounds) return;
      map.setMaxBounds(bounds);
      const computeMinZoom = () => {
        const FIT_PADDING = 24; // px padding for computing the tight fit
        const fitZoom = map.getBoundsZoom(bounds, true, [FIT_PADDING, FIT_PADDING]);
        const ALLOW_ZOOM_OUT_LEVELS = 1;
        let minZoom = Math.max(3, fitZoom - ALLOW_ZOOM_OUT_LEVELS);
        const maxZoom = map.getMaxZoom?.() ?? 22;
        if (minZoom > maxZoom) minZoom = maxZoom - 1;
        map.setMinZoom(minZoom);
        if (map.getZoom() < minZoom) map.setZoom(minZoom);
      };
      computeMinZoom();
      // Helper to clamp map center inside bounds during user drag to avoid fetching outside tiles
      const clampCenter = () => {
        if (!bounds.contains(map.getCenter())) {
          // panInsideBounds will adjust center without animation
            map.panInsideBounds(bounds, { animate: false });
        }
      };
      map.on('drag', clampCenter);
      const onResize = () => computeMinZoom();
      map.on('resize', onResize);
      return () => {
        map.off('resize', onResize);
        map.off('drag', clampCenter);
      };
    }, [bounds, map]);
    return null;
  };
  BoundsController.propTypes = { bounds: PropTypes.object };

  // Track last user view; useful if external actions attempt to recenter
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

  // --- Dynamic height handling (CSS driven to avoid resize-triggered re-renders) --- //
  const HEIGHT_OFFSET = 120; // px reserved for any global nav / top padding
  const resolvedHeightValue = useMemo(() => {
    if (!height || height === 'dynamic') {
      // Use clamp so we keep a minimum without triggering JS resize calculations.
      return `clamp(650px, calc(100vh - ${HEIGHT_OFFSET}px), 100vh)`;
    }
    return height;
  }, [height]);

  return (
    // Apply resolved (possibly dynamic) height so the map + sidebar resize with viewport
  <div className="flex flex-col px-4 py-6 lg:px-8 pt-16" style={{ height: resolvedHeightValue }}>
      {/* Page Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">{icao ? `${icao} Object Editor` : 'Airport Object Editor'}</h1>
          <p className="text-sm text-zinc-400 mt-1">Manage objects for BARS system integration</p>
        </div>
        <button
          onClick={() => { if (!selectedId && !creatingNew) startAddPoint(); }}
          disabled={!!selectedId || creatingNew}
          className={`shrink-0 inline-flex items-center rounded-md text-sm font-medium px-4 py-2 border transition-colors ${(selectedId || creatingNew) ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-white hover:bg-zinc-100 text-zinc-900 border-zinc-300 shadow'}`}
        >+ Add New Object</button>
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
                <span className="text-sm font-medium text-red-400">Unable to load airport position</span>
                {airportMetaError && <span className="text-[11px] text-red-300 max-w-xs break-words">{airportMetaError}</span>}
                <button
                  onClick={() => { setRefreshTick(t => t + 1); }}
                  className="px-3 py-1.5 text-xs rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-200"
                >Retry</button>
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
              <>
                {mapboxToken ? (
                  <TileLayer
                    url={`${'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}'}?access_token=${mapboxToken}`}
                    tileSize={512}
                    zoomOffset={-1}
                    maxZoom={22}
                    attribution='Imagery © Mapbox, © OpenStreetMap contributors'
                  />
                ) : (
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                    attribution='© OpenStreetMap contributors'
                  />
                )}
              </>
              <ViewTracker />
              <BoundsFitter />
              <GeomanController
                existingPoints={existingPoints}
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
              />
              {/* Gradient polyline visualization overlay replicating ContributeMap styles */}
              <PolylineVisualizationOverlay
                featureLayerMapRef={featureLayerMapRef}
                changeset={changeset}
                existingMap={existingMap}
                selectedId={selectedId}
                registerSelect={registerSelect}
                formState={formState}
            drawingCoords={drawingCoords}
              />
              {maxBounds && <BoundsController bounds={maxBounds} />}
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
          {selectedId ? (
            <>
              <div className="space-y-3">
                {!creatingNew && selectedId.startsWith('new_') && (
                  <div className="text-[10px] text-amber-300 bg-amber-900/40 px-2 py-1 rounded">New geometry captured. Fill details and save.</div>
                )}
                <div>
                  <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1">Object Type</label>
                  <select
                    className="w-full bg-zinc-800/70 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-2 py-1 text-sm"
                    value={formState.type}
                    onChange={e => setFormState(s => ({ ...s, type: e.target.value }))}
                  >
                    {POINT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1">Object Name</label>
                  <input
                    className="w-full bg-zinc-800/70 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-2 py-1 text-sm"
                    value={formState.name}
                    onChange={e => setFormState(s => ({ ...s, name: e.target.value }))}
                    placeholder="SB A5"
                  />
                </div>
                {(formState.type === 'stopbar' || formState.type === 'taxiway') && (
                  <div>
                    <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1">Directionality</label>
                    <select
                      className="w-full bg-zinc-800/70 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-2 py-1 text-sm"
                      value={formState.directionality}
                      onChange={e => setFormState(s => ({ ...s, directionality: e.target.value }))}
                    >
                      {DIRECTIONALITY.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                )}
                {formState.type === 'taxiway' && (
                  <div>
                    <label className="block text-xs font-medium tracking-wide text-zinc-300 mb-1">Color</label>
                    <select
                      className="w-full bg-zinc-800/70 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded px-2 py-1 text-sm"
                      value={formState.color}
                      onChange={e => setFormState(s => ({ ...s, color: e.target.value }))}
                    >
                      <option value="">-- select --</option>
                      {COLORS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <input
                    id="elevated"
                    type="checkbox"
                    checked={formState.elevated}
                    onChange={e => setFormState(s => ({ ...s, elevated: e.target.checked, directionality: e.target.checked ? 'uni-directional' : s.directionality }))}
                  />
                  <label htmlFor="elevated" className="text-zinc-300">Has Elevated Bar?</label>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <input
                    id="ihp"
                    type="checkbox"
                    checked={formState.ihp}
                    onChange={e => setFormState(s => ({ ...s, ihp: e.target.checked }))}
                  />
                  <label htmlFor="ihp" className="text-zinc-300">Is Intermediate Holding Point?</label>
                </div>
                {formErrors.length > 0 && (
                  <ul className="text-xs text-red-400 list-disc pl-4">
                    {formErrors.map(err => <li key={err}>{err}</li>)}
                  </ul>
                )}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded px-3 py-1.5">Save</button>
                  <button onClick={handleCancelEdit} className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded px-3 py-1.5">Cancel</button>
                  {selectedId.startsWith('new_') ? (
                    <button onClick={handleRemoveUnsavedNew} className="text-white text-sm rounded px-3 py-1.5 bg-red-600 hover:bg-red-500">Remove</button>
                  ) : (
                    <button onClick={handleDeleteToggle} className={`text-white text-sm rounded px-3 py-1.5 ${changeset.delete.includes(selectedId) ? 'bg-amber-600 hover:bg-amber-500' : 'bg-red-600 hover:bg-red-500'}`}>{changeset.delete.includes(selectedId) ? 'Undo Delete' : 'Delete'}</button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700 rounded p-3">
              {creatingNew ? (
                <span>
                  Click on the map to add vertices. Finish with the last click, adjust if needed, then press Save.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      // Abort creation: just clear state & keep any temp layer (user can remove later)
                      setCreatingNew(false);
                      setDrawingCoords([]);
                      if (selectedId && selectedId.startsWith('new_')) {
                        // deselect but keep geometry
                        const layer = featureLayerMapRef.current[selectedId];
                        if (layer?.pm) layer.pm.disable();
                        setSelectedId(null);
                        setFormState(emptyFormState);
                      }
                    }}
                    className="text-amber-400 underline-offset-2 hover:underline ml-1"
                  >Cancel</button>
                </span>
              ) : 'Click + Add New Object to start creating a new object polyline on the map.'}
            </div>
          )}
          <hr className="border-zinc-800" />
          <h3 className="text-sm font-medium text-zinc-200">Managed Objects</h3>
          {displayPoints.length === 0 ? (
            <div className="text-xs text-zinc-400 bg-zinc-800/60 border border-zinc-700 rounded px-3 py-4 text-center">
              No objects added yet. Add your first object to get started.
            </div>
          ) : (
            <ul className="flex flex-col gap-1 text-sm max-h-60 overflow-y-auto pr-1">
              {displayPoints.map(p => (
                <li key={p.id} className={`px-2 py-1 rounded cursor-pointer flex items-center justify-between transition-colors ${p.id===selectedId?'bg-zinc-700':'bg-zinc-800 hover:bg-zinc-700'}`}
                  onClick={() => {
                    const layer = featureLayerMapRef.current[p.id];
                    if (layer) registerSelect(layer, p.id, p.id.startsWith('new_'));
                  }}
                >
                  <span className="truncate">{p.name || '(unnamed)'} <span className="text-xs text-zinc-400">[{p.type}]</span></span>
                  <span className={`text-[10px] uppercase tracking-wide rounded px-1 ml-2 ${p.state==='create' && 'bg-green-700 text-green-100'} ${p.state==='modify' && 'bg-blue-700 text-blue-100'} ${p.state==='delete' && 'bg-red-700 text-red-100'} ${p.state==='existing' && 'bg-zinc-600 text-zinc-200'}`}>{p.state}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-2 flex gap-2">
            <button onClick={resetAll} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded px-3 py-1.5">Reset</button>
            <button onClick={copyChangeset} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded px-3 py-1.5">Copy JSON</button>
          </div>
          <div className="pt-1">
            <button
              disabled={changeset.create.length===0 && Object.keys(changeset.modify).length===0 && changeset.delete.length===0}
              onClick={() => { console.log('Upload placeholder', serializeChangeset(changeset)); }}
              className={`w-full text-xs rounded px-3 py-2 font-medium mt-1 transition-colors ${ (changeset.create.length===0 && Object.keys(changeset.modify).length===0 && changeset.delete.length===0) ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
            >Save & Upload (placeholder)</button>
          </div>
        </div>
      </div>
    </div>
  );
};

AirportPointEditor.propTypes = {
  existingPoints: PropTypes.array,
  onChangesetChange: PropTypes.func,
  height: PropTypes.string
};

export default AirportPointEditor;
