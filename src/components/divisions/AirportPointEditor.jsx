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
const COLORS = ['green', 'yellow', 'green-yellow', 'green-orange', 'green-blue'];

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
}) => {
  const map = useMap();
  const drawingLayerRef = useRef(null);
  const lastClickPollRef = useRef(null);
  const lastReportedLenRef = useRef(0);

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
          const coords = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }));
          onDrawingCoordsUpdate && onDrawingCoordsUpdate(coords);
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

    const clickHandler = () => {
      if (!drawingLayerRef.current) return;
      let frames = 0;
      const maxFrames = 6;
      if (lastClickPollRef.current) cancelAnimationFrame(lastClickPollRef.current);
      const poll = () => {
        if (!drawingLayerRef.current) return;
        const latlngs = drawingLayerRef.current.getLatLngs?.();
        if (Array.isArray(latlngs)) {
          const len = latlngs.length;
          if (len !== lastReportedLenRef.current) {
            lastReportedLenRef.current = len;
            const coords = latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng }));
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
    map.on('zoom viewreset move', onChange);
    return () => {
      map.off('zoom viewreset move', onChange);
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

const PolylineVisualizationOverlay = ({
  featureLayerMapRef,
  changeset,
  existingMap,
  selectedId,
  registerSelect,
  formState,
  drawingCoords,
}) => {
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

  const overlayPoints = (() => {
    const list = [];
    Object.values(existingMap).forEach((base) => {
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
    changeset.create.forEach((c) => {
      const merged =
        selectedId === c._tempId && formState
          ? { ...c, ...formState, id: c._tempId }
          : { ...c, id: c._tempId };
      list.push(merged);
    });
    if (
      selectedId &&
      selectedId.startsWith('new_') &&
      !changeset.create.find((c) => c._tempId === selectedId)
    ) {
      const layer = featureLayerMapRef.current[selectedId];
      if (layer) {
        const coords = extractCoords(layer);
        list.push({ id: selectedId, _tempId: selectedId, coordinates: coords, ...formState });
      }
    }
    if (drawingCoords && drawingCoords.length >= 2) {
      list.push({
        id: '__drawing_preview__',
        coordinates: drawingCoords,
        ...(formState || {}),
        type: formState?.type || 'stopbar',
      });
    }
    return list;
  })();

  return (
    <>
      {overlayPoints.map((pt) => {
        const coords = pt?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return null;
        const safe = coords.filter((c) => typeof c?.lat === 'number' && typeof c?.lng === 'number');
        if (safe.length < 2) return null;
        const positions = safe.map((c) => [c.lat, c.lng]);
        const segments = [];
        for (let i = 0; i < safe.length - 1; i++)
          segments.push({ baseId: pt.id, idx: i, p1: safe[i], p2: safe[i + 1] });
        const { topColor, bottomColor } = getPolylineColors(pt);
        const isSelected = selectedId === pt.id || pt.id === '__drawing_preview__';
        const isDeleted = changeset.delete.includes(pt.id);
        const onClick =
          pt.id === '__drawing_preview__'
            ? undefined
            : () => {
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
                opacity: isDeleted ? 0.5 : isSelected ? 0.9 : 0.7,
                dashArray: isDeleted ? '8 6' : undefined,
                lineCap: 'round',
                lineJoin: 'round',
              }}
              eventHandlers={onClick ? { click: onClick } : undefined}
            />
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

  if (!Array.isArray(pt.coordinates) || pt.coordinates.length < 1) {
    errors.push('At least one coordinate required.');
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
  const { airportId } = useParams();
  const icao = (airportId || '').toUpperCase();
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

  const startAddPoint = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    map.pm.disableDraw();
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

  const handleRemoveUnsavedNew = useCallback(
    (targetId) => {
      if (!targetId || !targetId.startsWith('new_')) return;
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

  const existingMap = useMemo(() => {
    const map = {};
    existingPoints.forEach((p) => (map[p.id] = p));
    return map;
  }, [existingPoints]);

  const extractCoords = (layer) => {
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
  };

  const pushGeometryChange = useCallback((layer) => {
    if (!layer) return;
    const id = layer.options.pointId;
    const coords = extractCoords(layer);
    setChangeset((prev) => {
      if (id.startsWith('new_')) {
        const clone = { ...prev };
        clone.create = clone.create.map((c) =>
          c._tempId === id ? { ...c, coordinates: coords } : c
        );
        return clone;
      }
      const m = { ...(prev.modify[id] || {}) };
      m.coordinates = coords;
      return { ...prev, modify: { ...prev.modify, [id]: m } };
    });
  }, []);

  const registerSelect = useCallback(
    (layer, id, isNew = false) => {
      setSelectedId(id);
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
    [existingMap, changeset, pushGeometryChange]
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
          const diff = {};
          ['type', 'name', 'directionality', 'color', 'elevated', 'ihp'].forEach((k) => {
            if (pointObj[k] !== undefined && pointObj[k] !== original[k]) diff[k] = pointObj[k];
          });
          if (!arraysEqualCoords(pointObj.coordinates, original.coordinates))
            diff.coordinates = pointObj.coordinates;
          if (Object.keys(diff).length > 0) {
            next.modify = { ...next.modify, [selectedId]: diff };
          } else {
            if (next.modify[selectedId]) {
              const cloneMod = { ...next.modify };
              delete cloneMod[selectedId];
              next.modify = cloneMod;
            }
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
    featureLayerMapRef.current.current = {};
    setChangeset(defaultChangeset());
    setSelectedId(null);
    setFormState(emptyFormState);
    setCreatingNew(false);
    if (mapInstanceRef.current) mapInstanceRef.current.pm.disableDraw();
  };

  const prettyJson = useMemo(
    () => JSON.stringify(serializeChangeset(changeset), null, 2),
    [changeset, serializeChangeset]
  );

  useEffect(() => {
    Object.entries(featureLayerMapRef.current).forEach(([pid, lyr]) => {
      const isDeleted = changeset.delete.includes(pid);
      const pointData = existingMap[pid] ||
        changeset.create.find((c) => c._tempId === pid) || { type: 'stopbar' };
      styleLayerByPoint(lyr, pointData, pid === selectedId, isDeleted);
    });
  }, [changeset.delete, changeset.create, existingMap, selectedId]);

  const displayPoints = [
    ...existingPoints.map((p) => ({
      ...p,
      state: changeset.delete.includes(p.id)
        ? 'delete'
        : changeset.modify[p.id]
          ? 'modify'
          : 'existing',
    })),
    ...changeset.create.map((c) => ({ ...c, id: c._tempId, state: 'create' })),
  ];

  const copyChangeset = async () => {
    try {
      await navigator.clipboard.writeText(prettyJson);
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  };

  const allExistingCoords = useMemo(
    () => existingPoints.flatMap((p) => p.coordinates),
    [existingPoints]
  );
  const BoundsFitter = () => {
    const map = useMap();
    useEffect(() => {
      if (allExistingCoords.length > 0) {
        const latlngs = allExistingCoords.map((c) => [c.lat, c.lng]);
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds.pad(0.1));
      }
    }, [map]);
    return null;
  };

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

  const MAX_BOUNDS_RADIUS_KM = 25;
  const maxBounds = useMemo(() => {
    if (!parsedAirportCenter) return null;
    const [clat, clon] = parsedAirportCenter;
    const radiusKm = MAX_BOUNDS_RADIUS_KM;
    const latDelta = radiusKm / 111.32 / 2;
    const cosLat = Math.cos((clat * Math.PI) / 180) || 1;
    const lngDelta = radiusKm / (111.32 * cosLat) / 2;
    return L.latLngBounds([clat - latDelta, clon - lngDelta], [clat + latDelta, clon + lngDelta]);
  }, [parsedAirportCenter]);

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

  const BoundsController = ({ bounds }) => {
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
        if (!bounds.contains(map.getCenter())) {
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
        <button
          onClick={() => {
            if (!selectedId && !creatingNew) startAddPoint();
          }}
          disabled={!!selectedId || creatingNew}
          className={`shrink-0 inline-flex items-center rounded-md text-sm font-medium px-4 py-2 border transition-colors ${selectedId || creatingNew ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed' : 'bg-white hover:bg-zinc-100 text-zinc-900 border-zinc-300 shadow'}`}
        >
          + Add New Object
        </button>
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
                  <span className="text-[11px] text-red-300 max-w-xs break-words">
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
              <>
                {mapboxToken ? (
                  <TileLayer
                    url={`${'https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}'}?access_token=${mapboxToken}`}
                    tileSize={512}
                    zoomOffset={-1}
                    maxZoom={22}
                    attribution="Imagery © Mapbox, © OpenStreetMap contributors"
                  />
                ) : (
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                    attribution="© OpenStreetMap contributors"
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
                      <option key={t}>{t}</option>
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
                    onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                    placeholder="SB A5"
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
                        <option key={d}>{d}</option>
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
                        <option key={c}>{c}</option>
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
                  Click on the map to add vertices. Finish with the last click, adjust if needed,
                  then press Save.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingNew(false);
                      setDrawingCoords([]);
                      if (selectedId && selectedId.startsWith('new_')) {
                        const layer = featureLayerMapRef.current[selectedId];
                        if (layer?.pm) layer.pm.disable();
                        setSelectedId(null);
                        setFormState(emptyFormState);
                      }
                    }}
                    className="text-amber-400 underline-offset-2 hover:underline ml-1"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                'Click + Add New Object to start creating a new object polyline on the map.'
              )}
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
              {displayPoints.map((p) => (
                <li
                  key={p.id}
                  className={`px-2 py-1 rounded cursor-pointer flex items-center justify-between transition-colors ${p.id === selectedId ? 'bg-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700'}`}
                  onClick={() => {
                    const layer = featureLayerMapRef.current[p.id];
                    if (layer) registerSelect(layer, p.id, p.id.startsWith('new_'));
                  }}
                >
                  <span className="truncate">
                    {p.name || '(unnamed)'}{' '}
                    <span className="text-xs text-zinc-400">[{p.type}]</span>
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wide rounded px-1 ml-2 ${p.state === 'create' && 'bg-green-700 text-green-100'} ${p.state === 'modify' && 'bg-blue-700 text-blue-100'} ${p.state === 'delete' && 'bg-red-700 text-red-100'} ${p.state === 'existing' && 'bg-zinc-600 text-zinc-200'}`}
                  >
                    {p.state}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-2 flex gap-2">
            <button
              onClick={resetAll}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded px-3 py-1.5"
            >
              Reset
            </button>
            <button
              onClick={copyChangeset}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded px-3 py-1.5"
            >
              Copy JSON
            </button>
          </div>
          <div className="pt-1">
            <button
              disabled={
                changeset.create.length === 0 &&
                Object.keys(changeset.modify).length === 0 &&
                changeset.delete.length === 0
              }
              onClick={() => {
                console.log('Upload placeholder', serializeChangeset(changeset));
              }}
              className={`w-full text-xs rounded px-3 py-2 font-medium mt-1 transition-colors ${changeset.create.length === 0 && Object.keys(changeset.modify).length === 0 && changeset.delete.length === 0 ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
            >
              Save & Upload (placeholder)
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
