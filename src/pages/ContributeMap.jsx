import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Breadcrumb, BreadcrumbItem } from '../components/shared/Breadcrumb';
import { AlertCircle, ChevronRight, CopyIcon, Info, Loader, Check } from 'lucide-react';
import {
  MapContainer,
  TileLayer,
  Marker,
  LayersControl,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

// Color palette used across markers and polylines
const COLORS = {
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: 'rgb(63, 63, 255)',
  orange: 'rgb(255, 141, 35)',
  red: '#ef4444',
  white: '#ffffff',
  gray: '#999999',
};

// Helper: support coordinates as object {lat,lng} or array of such; return [lat, lng] or null
const toLatLngPair = (coords) => {
  if (!coords) return null;
  if (Array.isArray(coords)) {
    const c = coords[0];
    return c && typeof c.lat === 'number' && typeof c.lng === 'number' ? [c.lat, c.lng] : null;
  }
  return typeof coords.lat === 'number' && typeof coords.lng === 'number'
    ? [coords.lat, coords.lng]
    : null;
};

function SegmentedDefs({
  segments = [],
  topColor = '#ef4444',
  bottomColor = '#999999',
  strokeWidth = 10,
}) {
  const map = useMap();
  const gradientCacheRef = useRef(new Map());
  const defsRef = useRef(null);

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

    const gradientCache = gradientCacheRef.current;

    // If defs node changes between renders, reattach cached gradients.
    if (defsRef.current && defsRef.current !== defs) {
      gradientCache.forEach((node) => {
        if (!defs.contains(node)) {
          defs.appendChild(node);
        }
      });
    }
    defsRef.current = defs;

    const build = (zoomEvent = null) => {
      const hasNewLayerPoint = typeof map.latLngToNewLayerPoint === 'function';
      const toLayerPoint =
        zoomEvent && hasNewLayerPoint
          ? (latlng) => map.latLngToNewLayerPoint(latlng, zoomEvent.zoom, zoomEvent.center)
          : (latlng) => map.latLngToLayerPoint(latlng);

      const activeIds = new Set();

      segments.forEach((seg) => {
        const gradId = `seggrad-${seg.baseId}-${seg.idx}`;
        activeIds.add(gradId);

        let lg = gradientCache.get(gradId);
        if (!lg) {
          lg = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
          lg.setAttribute('id', gradId);
          lg.setAttribute('gradientUnits', 'userSpaceOnUse');
          lg.setAttribute('data-generated', 'seg');
          lg.setAttribute('data-owner', ownerId);

          const topStop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
          topStop.setAttribute('offset', '50%');
          topStop.setAttribute('data-pos', 'top');
          lg.appendChild(topStop);

          const bottomStop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
          bottomStop.setAttribute('offset', '50%');
          bottomStop.setAttribute('data-pos', 'bottom');
          lg.appendChild(bottomStop);

          defs.appendChild(lg);
          gradientCache.set(gradId, lg);
        } else if (!defs.contains(lg)) {
          defs.appendChild(lg);
        }

        // convert lat/lng to SVG layer points (pixels)
        const lp1 = toLayerPoint(L.latLng(seg.p1.lat, seg.p1.lng));
        const lp2 = toLayerPoint(L.latLng(seg.p2.lat, seg.p2.lng));

        const mx = (lp1.x + lp2.x) / 2;
        const my = (lp1.y + lp2.y) / 2;

        // direction vector p1 -> p2
        const dx = lp2.x - lp1.x;
        const dy = lp2.y - lp1.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;

        // perpendicular unit vector
        const px = -dy / len;
        const py = dx / len;

        // make the gradient span across the stroke width in pixels
        const half = Math.max(1, strokeWidth / 2);
        const span = half * 1.2; // little extra so stops fully cover stroke

        const x1 = mx - px * span;
        const y1 = my - py * span;
        const x2 = mx + px * span;
        const y2 = my + py * span;

        lg.setAttribute('x1', x1);
        lg.setAttribute('y1', y1);
        lg.setAttribute('x2', x2);
        lg.setAttribute('y2', y2);
        const topStop = lg.querySelector('stop[data-pos="top"]');
        const bottomStop = lg.querySelector('stop[data-pos="bottom"]');
        if (topStop) {
          topStop.setAttribute('stop-color', topColor);
          topStop.setAttribute('stop-opacity', '1');
        }
        if (bottomStop) {
          bottomStop.setAttribute('stop-color', bottomColor);
          bottomStop.setAttribute('stop-opacity', '1');
        }
      });

      gradientCache.forEach((node, id) => {
        if (!activeIds.has(id)) {
          node.remove();
          gradientCache.delete(id);
        }
      });
    };

    build();

    let frameToken = null;
    let suppressUpdates = false;
    let pendingZoomEvent = null;

    const scheduleBuild = (event = null) => {
      if (event) {
        pendingZoomEvent = event;
      }
      const isZoomAnim = event && event.type === 'zoomanim';
      if (suppressUpdates && !isZoomAnim) {
        return;
      }
      if (frameToken) {
        return;
      }
      frameToken = requestAnimationFrame(() => {
        frameToken = null;
        const eventToUse = pendingZoomEvent;
        pendingZoomEvent = null;
        build(eventToUse);
      });
    };

    const onInteractionStart = () => {
      suppressUpdates = true;
      if (frameToken) {
        cancelAnimationFrame(frameToken);
        frameToken = null;
      }
    };

    const onInteractionEnd = () => {
      suppressUpdates = false;
      scheduleBuild();
    };

    const onResize = () => scheduleBuild();
    const onZoomAnim = (event) => scheduleBuild(event);

    map.on('movestart zoomstart', onInteractionStart);
    map.on('moveend zoomend viewreset', onInteractionEnd);
    map.on('resize', onResize);
    map.on('zoomanim', onZoomAnim);

    return () => {
      map.off('movestart zoomstart', onInteractionStart);
      map.off('moveend zoomend viewreset', onInteractionEnd);
      map.off('resize', onResize);
      map.off('zoomanim', onZoomAnim);
      if (frameToken) {
        cancelAnimationFrame(frameToken);
      }
      pendingZoomEvent = null;
      suppressUpdates = false;
      gradientCache.forEach((node) => node.remove());
      gradientCache.clear();
    };
  }, [map, segments, topColor, bottomColor, strokeWidth]);

  return null;
}

SegmentedDefs.propTypes = {
  segments: PropTypes.arrayOf(
    PropTypes.shape({
      baseId: PropTypes.string.isRequired,
      idx: PropTypes.number.isRequired,
      p1: PropTypes.shape({
        lat: PropTypes.number.isRequired,
        lng: PropTypes.number.isRequired,
      }).isRequired,
      p2: PropTypes.shape({
        lat: PropTypes.number.isRequired,
        lng: PropTypes.number.isRequired,
      }).isRequired,
    })
  ),
  topColor: PropTypes.string,
  bottomColor: PropTypes.string,
  strokeWidth: PropTypes.number,
};

const formatPointType = (type) => {
  switch (type) {
    case 'lead_on':
      return 'Lead-On Light';
    case 'stopbar':
      return 'Stopbar';
    case 'taxiway':
      return 'Taxiway Segment';
    case 'stand':
      return 'Stand Lead-In Light';
    default:
      return type;
  }
};

const formatPointColorStyle = (color) => {
  switch (color) {
    case 'green-yellow':
      return 'Enhanced (Green-Yellow)';
    case 'green-blue':
      return 'Enhanced (Green-Blue)';
    case 'green-orange':
      return 'Enhanced (Green-Orange)';
    case 'green':
    default:
      return 'Standard (Green)';
  }
};

const PointPopupContent = React.memo(({ point, copiedId, onCopy }) => (
  <div className="p-3 -m-3 bg-zinc-900 rounded-lg shadow-lg">
    <h3 className="font-bold text-white mb-1">{point.name}</h3>

    <div className="bg-zinc-800/50 rounded px-3 py-2 mb-3 flex items-center justify-between">
      <code className="text-sm text-zinc-300">{point.id}</code>
      <button
        onClick={(event) => onCopy(point.id, event)}
        className={`text-zinc-400 hover:text-white transition-colors p-1 rounded ${copiedId === point.id ? 'text-green-500' : ''}`}
        title="Copy ID"
      >
        {copiedId === point.id ? <Check className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
      </button>
    </div>

    <div className="space-y-2">
      <div className="flex justify-between">
        <span className="text-sm text-zinc-400">Type:</span>
        <span className="text-sm text-white">{formatPointType(point.type)}</span>
      </div>

      {point.type === 'stopbar' && (
        <>
          <div className="flex justify-between">
            <span className="text-sm text-zinc-400">Directionality:</span>
            <span className="text-sm text-white capitalize">{point.directionality}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-zinc-400">Elevated Bar:</span>
            <span className="text-sm text-white">{point.elevated ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-zinc-400">IHP:</span>
            <span className="text-sm text-white">{point.ihp ? 'Yes' : 'No'}</span>
          </div>
        </>
      )}

      {point.type === 'taxiway' && (
        <>
          <div className="flex justify-between">
            <span className="text-sm text-zinc-400">Directionality:</span>
            <span className="text-sm text-white capitalize">{point.directionality}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-zinc-400">Color Style:</span>
            <span className="text-sm text-white">{formatPointColorStyle(point.color)}</span>
          </div>
        </>
      )}
    </div>
  </div>
));

PointPopupContent.displayName = 'PointPopupContent';

PointPopupContent.propTypes = {
  point: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    directionality: PropTypes.string,
    elevated: PropTypes.bool,
    ihp: PropTypes.bool,
    color: PropTypes.string,
  }).isRequired,
  copiedId: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
};

// Get point color based on type and color properties
const getPointColor = (point) => {
  switch (point.type) {
    case 'lead_on':
      return '#fbbf24';
    case 'stopbar':
      return '#ef4444';
    case 'taxiway':
      switch (point.color) {
        case 'green-yellow':
          return '#FFD700'; // Green-Yellow
        case 'green-blue':
          return '#0000FF'; // Green-Blue
        case 'green-orange':
          return '#FFA500'; // Green-Orange
        default:
          return '#00FF00'; // Normal green
      }
    case 'stand':
      return 'rgb(255, 141, 35)';
    default:
      return '#ef4444';
  }
};

// Create custom markers based on point type
const createCustomIcon = (point) => {
  const color = getPointColor(point);
  let html = '';

  if (point.type === 'stopbar') {
    html = `
      <div class="marker-container">
        <div class="marker-circle stopbar-marker ${point.orientation || 'left'}">
          ${
            point.directionality === 'uni-directional'
              ? point.orientation === 'left'
                ? '<div class="marker-quarter marker-quarter-4"></div>'
                : '<div class="marker-quarter marker-quarter-1"></div>'
              : ''
          }
        </div>
      </div>
    `;
  } else if (point.type === 'lead_on') {
    html = `
      <div class="marker-container">
        <div class="marker-circle lead-on-marker">
          <div class="marker-quarter marker-quarter-1"></div>
          <div class="marker-quarter marker-quarter-2"></div>
          <div class="marker-quarter marker-quarter-3"></div>
          <div class="marker-quarter marker-quarter-4"></div>
        </div>
      </div>
    `;
  } else if (point.type === 'taxiway') {
    if (point.directionality === 'bi-directional') {
      if (point.color === 'green') {
        html = `
        <div class="marker-container">
          <div class="marker-circle lead-on-marker taxiway-green">
          </div>
        </div>
      `;
      } else if (point.color === 'green-yellow') {
        html = `
        <div class="marker-container">
          <div class="marker-circle lead-on-marker">
            <div class="marker-quarter taxiway-yellow-quarter-1"></div>
            <div class="marker-quarter taxiway-yellow-quarter-2"></div>
            <div class="marker-quarter taxiway-yellow-quarter-3"></div>
            <div class="marker-quarter taxiway-yellow-quarter-4"></div>
          </div>
        </div>
      `;
      } else if (point.color === 'green-blue') {
        html = `
        <div class="marker-container">
          <div class="marker-circle lead-on-marker">
            <div class="marker-quarter taxiway-blue-quarter-1"></div>
            <div class="marker-quarter taxiway-blue-quarter-2"></div>
            <div class="marker-quarter taxiway-blue-quarter-3"></div>
            <div class="marker-quarter taxiway-blue-quarter-4"></div>
          </div>
        </div>
      `;
      } else if (point.color === 'green-orange') {
        html = `
        <div class="marker-container">
          <div class="marker-circle lead-on-marker">
            <div class="marker-quarter taxiway-orange-quarter-1"></div>
            <div class="marker-quarter taxiway-orange-quarter-2"></div>
            <div class="marker-quarter taxiway-orange-quarter-3"></div>
            <div class="marker-quarter taxiway-orange-quarter-4"></div>
          </div>
        </div>
      `;
      }
    } else if (point.directionality === 'uni-directional') {
      if (point.color === 'green') {
        html = `
        <div class="marker-container">
          <div class="marker-circle taxiway-green ${point.orientation || 'left'}">
            ${
              point.directionality === 'uni-directional'
                ? point.orientation === 'left'
                  ? `<div class="marker-quarter taxiway-quarter-L"></div>`
                  : `<div class="marker-quarter taxiway-quarter-R"></div>`
                : ''
            }
          </div>
        </div>
      `;
      } else if (point.color === 'green-yellow') {
        html = `
            <div class="marker-container">
              <div class="marker-circle ${point.orientation || 'left'}">
                ${
                  point.directionality === 'uni-directional'
                    ? point.orientation === 'left'
                      ? `
                    <div class="marker-quarter taxiway-yellow-quarter-1"></div>
                    <div class="marker-quarter taxiway-yellow-quarter-2"></div>
                    <div class="marker-quarter taxiway-yellow-quarter-3"></div>
                    <div class="marker-quarter taxiway-quarter-L"></div>`
                      : `<div class="marker-quarter taxiway-quarter-R"></div>
                    <div class="marker-quarter taxiway-yellow-quarter-2"></div>
                    <div class="marker-quarter taxiway-yellow-quarter-3"></div>
                    <div class="marker-quarter taxiway-yellow-quarter-4"></div>`
                    : ''
                }
              </div>
            </div>
          `;
      } else if (point.color === 'green-blue') {
        html = `
        <div class="marker-container">
          <div class="marker-circle ${point.orientation || 'left'}">
            ${
              point.directionality === 'uni-directional'
                ? point.orientation === 'left'
                  ? `<div class="marker-quarter taxiway-blue-quarter-1"></div>
                <div class="marker-quarter taxiway-blue-quarter-2"></div>
                <div class="marker-quarter taxiway-blue-quarter-3"></div>
                <div class="marker-quarter taxiway-quarter-L"></div>`
                  : `<div class="marker-quarter taxiway-quarter-R"></div>
                <div class="marker-quarter taxiway-blue-quarter-2"></div>
                <div class="marker-quarter taxiway-blue-quarter-3"></div>
                <div class="marker-quarter taxiway-blue-quarter-4"></div>`
                : ''
            }
          </div>
        </div>
      `;
      } else if (point.color === 'green-orange') {
        html = `
        <div class="marker-container">
          <div class="marker-circle ${point.orientation || 'left'}">
            ${
              point.directionality === 'uni-directional'
                ? point.orientation === 'left'
                  ? `<div class="marker-quarter taxiway-orange-quarter-1"></div>
                <div class="marker-quarter taxiway-orange-quarter-2"></div>
                <div class="marker-quarter taxiway-orange-quarter-3"></div>
                <div class="marker-quarter taxiway-quarter-L"></div>`
                  : `<div class="marker-quarter taxiway-quarter-R"></div>
                <div class="marker-quarter taxiway-orange-quarter-2"></div>
                <div class="marker-quarter taxiway-orange-quarter-3"></div>
                <div class="marker-quarter taxiway-orange-quarter-4"></div>`
                : ''
            }
          </div>
        </div>
      `;
      }
    }
  } else {
    html = `
      <div class="marker-container">
        <div class="marker-circle" style="background-color: ${color};"></div>
      </div>
    `;
  }

  return L.divIcon({
    className: 'custom-div-icon',
    html: html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

// Add required CSS styles - similar to AirportPointEditor
const style = document.createElement('style');
style.textContent = `
  .marker-container {
    position: relative;
    width: 24px;
    height: 24px;
  }
  .marker-circle {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 2px solid #ffffff;
    overflow: hidden;
  }
  .stopbar-marker {
    background-color: #ef4444;
  }
  .stopbar-marker .marker-quarter {
    background-color: #ffffff !important;
  }
  .taxiway-quarter-L {
    bottom: 0;
    right: 0;
    background-color: #ffffff !important;
 }
  .taxiway-quarter-R {
    top: 0;
    left: 0;
    background-color: #ffffff !important;
  }
    .taxiway-green {
    background-color: #4ade80 !important;
    }
  .taxiway-yellow-quarter-1 {
    top: 0;
    left: 0;
    background-color: #4ade80 !important;
  }
  .taxiway-yellow-quarter-2 {
    top: 0;
    right: 0;
    background-color: #fbbf24 !important;
  }
  .taxiway-yellow-quarter-3 {
    bottom: 0;
    left: 0;
    background-color: #fbbf24 !important;
  }
  .taxiway-yellow-quarter-4 {
    bottom: 0;
    right: 0;
    background-color: #4ade80 !important;
  }
  .taxiway-blue-quarter-1 {
    top: 0;
    left: 0;
    background-color: #4ade80 !important;
  }
  .taxiway-blue-quarter-2 {
    top: 0;
    right: 0;
    background-color:rgb(63, 63, 255) !important;
  }
  .taxiway-blue-quarter-3 {
    bottom: 0;
    left: 0;
    background-color: rgb(63, 63, 255) !important;
  }
  .taxiway-blue-quarter-4 {
    bottom: 0;
    right: 0;
    background-color: #4ade80 !important;
  }
  .taxiway-orange-quarter-1 {
    top: 0;
    left: 0;
    background-color: #4ade80 !important;
  }
  .taxiway-orange-quarter-2 {
    top: 0;
    right: 0;
    background-color: rgb(255, 141, 35) !important;
  }
  .taxiway-orange-quarter-3 {
    bottom: 0;
    left: 0;
    background-color:rgb(255, 141, 35) !important;
  }
  .taxiway-orange-quarter-4 {
    bottom: 0;
    right: 0;
    background-color: #4ade80 !important;
  }
  .lead-on-marker {
    position: relative;
  }
  .marker-quarter {
    position: absolute;
    width: 50%;
    height: 50%;
  }
  .marker-quarter-1 {
    top: 0;
    left: 0;
    background-color: #4ade80 !important;
  }
  .marker-quarter-2 {
    top: 0;
    right: 0;
    background-color: #fbbf24 !important;
  }
  .marker-quarter-3 {
    bottom: 0;
    left: 0;
    background-color: #fbbf24 !important;
  }
  .marker-quarter-4 {
    bottom: 0;
    right: 0;
    background-color: #4ade80 !important;
  }
  .leaflet-container.editing-mode {
    cursor: pointer !important;
  }
`;
document.head.appendChild(style);

// Fix for Leaflet icon issue in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Determine polyline gradient colors to mirror single-point styles
const getPolylineColors = (point) => {
  // Default to stopbar behavior if unspecified type
  let topColor = COLORS.gray;
  let bottomColor = COLORS.red;

  if (!point || !point.type) {
    return { topColor, bottomColor };
  }

  switch (point.type) {
    case 'taxiway': {
      const style = point.color || 'green';
      if (style === 'green') {
        topColor = COLORS.green;
        bottomColor = COLORS.green;
      } else if (style === 'green-yellow') {
        topColor = COLORS.green;
        bottomColor = COLORS.yellow;
      } else if (style === 'green-blue') {
        topColor = COLORS.green;
        bottomColor = COLORS.blue;
      } else if (style === 'green-orange') {
        topColor = COLORS.green;
        bottomColor = COLORS.orange;
      } else {
        // Fallback to solid green
        topColor = COLORS.green;
        bottomColor = COLORS.green;
      }
      // NOTE: If later we want to honor orientation (left/right) for uni-directional
      // segments, we can flip top/bottom here based on point.orientation.
      break;
    }
    case 'lead_on': {
      // Lead-on lights mix green/yellow
      topColor = COLORS.green;
      bottomColor = COLORS.yellow;
      break;
    }
    case 'stand': {
      // Stand lead-in: orange
      topColor = COLORS.orange;
      bottomColor = COLORS.orange;
      break;
    }
    case 'stopbar':
    default: {
      // Render bi-directional stopbars as solid red, otherwise keep gray/red split
      if (point.directionality === 'bi-directional') {
        topColor = COLORS.red;
        bottomColor = COLORS.red;
      } else {
        topColor = COLORS.gray;
        bottomColor = COLORS.red;
      }
      break;
    }
  }

  return { topColor, bottomColor };
};

const ContributeMap = () => {
  const { icao } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [airport, setAirport] = useState(null);
  const [points, setPoints] = useState([]);
  const [activePointId, setActivePointId] = useState(null);
  const [mapCenter, setMapCenter] = useState([0, 0]);
  const [mapZoom] = useState(14);
  const [copiedId, setCopiedId] = useState(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [viewBounds, setViewBounds] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [minZoom, setMinZoom] = useState(10);

  // Clear active selection when clicking the map background
  const ClearSelectionOnMapClick = ({ onClear }) => {
    useMapEvents({
      click: () => onClear && onClear(),
    });
    return null;
  };

  ClearSelectionOnMapClick.propTypes = {
    onClear: PropTypes.func,
  };

  const MapInteractionTracker = () => {
    const map = useMap();

    useEffect(() => {
      if (!map) return;
      let frameId = null;

      const queueBoundsUpdate = () => {
        if (frameId) cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(() => {
          try {
            setViewBounds(map.getBounds());
          } catch {
            /* ignore */
          }
        });
      };

      const handleInteractionStart = () => {
        setIsInteracting(true);
      };

      const handleInteractionEnd = () => {
        setIsInteracting(false);
        queueBoundsUpdate();
      };

      queueBoundsUpdate();
      map.on('movestart zoomstart', handleInteractionStart);
      map.on('moveend zoomend viewreset', handleInteractionEnd);
      map.on('resize', queueBoundsUpdate);

      return () => {
        map.off('movestart zoomstart', handleInteractionStart);
        map.off('moveend zoomend viewreset', handleInteractionEnd);
        map.off('resize', queueBoundsUpdate);
        if (frameId) cancelAnimationFrame(frameId);
      };
    }, [map]);

    return null;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch airport data from API
        const airportResponse = await fetch(`https://v2.stopbars.com/airports?icao=${icao}`);
        if (!airportResponse.ok) {
          throw new Error('Failed to fetch airport data');
        }
        const airportData = await airportResponse.json();

        // Set the airport data from the API
        setAirport({
          icao: airportData.icao,
          name: airportData.name,
          latitude: airportData.latitude,
          longitude: airportData.longitude,
        });

        let centerLat = airportData.latitude;
        let centerLng = airportData.longitude;
        const hasBoundingBox =
          typeof airportData.bbox_min_lat === 'number' &&
          typeof airportData.bbox_min_lon === 'number' &&
          typeof airportData.bbox_max_lat === 'number' &&
          typeof airportData.bbox_max_lon === 'number';

        if (hasBoundingBox) {
          try {
            const bounds = L.latLngBounds(
              [airportData.bbox_min_lat, airportData.bbox_min_lon],
              [airportData.bbox_max_lat, airportData.bbox_max_lon]
            );
            const boundsCenter = bounds.getCenter();
            centerLat = boundsCenter.lat;
            centerLng = boundsCenter.lng;
            setMapBounds(bounds);
          } catch {
            setMapBounds(null);
          }
        } else {
          setMapBounds(null);
        }

        setMapCenter([centerLat, centerLng]);

        setMinZoom(mapZoom - 1);

        // Fetch points data for this airport
        const pointsResponse = await fetch(`https://v2.stopbars.com/airports/${icao}/points`);
        if (!pointsResponse.ok) {
          throw new Error('Failed to fetch points data');
        }
        const pointsData = await pointsResponse.json();

        // Transform points data to match our format
        const transformedPoints = pointsData.map((point) => ({
          id: point.id,
          type: point.type,
          name: point.name,
          coordinates: point.coordinates,
          directionality: point.directionality,
          color: point.color || undefined,
          elevated: point.elevated,
          ihp: point.ihp,
        }));

        setPoints(transformedPoints);
      } catch (err) {
        console.error(err);
        // Redirect back to contribute/new with error in state
        navigate('/contribute/new', { state: { error: 'airport_load_failed' } });
        return;
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [icao, navigate, mapZoom]);

  const ensureBoundsVisible = useCallback(() => {
    if (!mapRef.current || !mapBounds) {
      return;
    }
    try {
      mapRef.current.fitBounds(mapBounds, { padding: [40, 40] });
    } catch {
      /* ignore */
    }
  }, [mapBounds]);

  useEffect(() => {
    ensureBoundsVisible();
  }, [ensureBoundsVisible]);

  const preparedPoints = useMemo(() => {
    if (!Array.isArray(points) || points.length === 0) {
      return [];
    }

    return points.reduce((accumulator, point) => {
      const coords = point.coordinates;
      const isPath = Array.isArray(coords) && coords.length >= 2;

      if (!isPath) {
        const position = toLatLngPair(coords);
        if (!position) {
          return accumulator;
        }

        accumulator.push({
          kind: 'marker',
          point,
          position,
          focusPosition: position,
          icon: createCustomIcon(point),
        });
        return accumulator;
      }

      const safeCoords = coords.filter(
        (c) => typeof c?.lat === 'number' && typeof c?.lng === 'number'
      );

      if (safeCoords.length < 2) {
        return accumulator;
      }

      const positions = safeCoords.map((c) => [c.lat, c.lng]);
      const segments = safeCoords.slice(0, safeCoords.length - 1).map((_, idx) => ({
        baseId: point.id,
        idx,
        p1: safeCoords[idx],
        p2: safeCoords[idx + 1],
      }));
      const bounds = L.latLngBounds(positions);
      const { topColor, bottomColor } = getPolylineColors(point);

      accumulator.push({
        kind: 'polyline',
        point,
        positions,
        segments,
        bounds,
        focusPosition: [safeCoords[0].lat, safeCoords[0].lng],
        polylineColors: { topColor, bottomColor },
      });

      return accumulator;
    }, []);
  }, [points]);

  const handlePopupClose = useCallback(() => {
    setActivePointId(null);
  }, []);

  const handleFeatureSelect = useCallback(
    (pointId, focusPosition, leafletEvent) => {
      const isActivating = activePointId !== pointId;
      setActivePointId(isActivating ? pointId : null);

      if (isActivating && focusPosition && mapRef.current) {
        try {
          mapRef.current.setView(focusPosition, mapRef.current.getZoom());
        } catch {
          /* ignore */
        }
      } else if (!isActivating) {
        const layer = leafletEvent?.target;
        if (layer && typeof layer.closePopup === 'function') {
          try {
            layer.closePopup();
          } catch {
            /* ignore */
          }
        }
        if (mapRef.current) {
          try {
            mapRef.current.closePopup();
          } catch {
            /* ignore */
          }
        }
      }
    },
    [activePointId]
  );

  const handleMapCreated = useCallback(
    (mapInstance) => {
      mapRef.current = mapInstance;
      ensureBoundsVisible();
    },
    [ensureBoundsVisible]
  );

  const handleContinue = () => {
    navigate(`/contribute/test/${icao}`);
  };

  const handleCopyId = (id, event) => {
    // Stop event propagation to prevent the popup from closing
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

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

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen pt-32 pb-20 flex items-center">
          <div className="w-full max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center">
                <Loader className="w-8 h-8 animate-spin text-zinc-400" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12 mt-6">
            <div className="flex items-center space-x-2 mb-12">
              <Breadcrumb>
                <BreadcrumbItem title="Contribute" link="/contribute" />
                <BreadcrumbItem title="Airport" link="/contribute/new" />
                <BreadcrumbItem title="Map" />
              </Breadcrumb>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {/* Map */}
              <div className="h-[600px] rounded-lg overflow-hidden border border-zinc-800">
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  maxZoom={22}
                  minZoom={minZoom}
                  style={{ height: '100%', width: '100%' }}
                  whenCreated={handleMapCreated}
                  zoomAnimation={true}
                  zoomAnimationDuration={0.18}
                  easeLinearity={0.35}
                  wheelDebounceTime={30}
                  wheelPxPerZoomLevel={50}
                  zoomSnap={0.25}
                  zoomDelta={0.5}
                >
                  {/* Clear selection when clicking anywhere on the map */}
                  <ClearSelectionOnMapClick onClear={handlePopupClose} />
                  <MapInteractionTracker />
                  <LayersControl position="topright">
                    <LayersControl.BaseLayer name="Street Map">
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        maxZoom={22}
                        maxNativeZoom={19}
                        // Buffer extra tiles and skip mid-zoom redraws to avoid flicker.
                        updateWhenZooming={false}
                        updateWhenIdle={true}
                        keepBuffer={6}
                      />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer checked name="Satellite">
                      <TileLayer
                        attribution='Imagery &copy; <a href="https://www.mapbox.com/">Mapbox</a>'
                        url={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`}
                        maxZoom={22}
                        // Mirror anti-flicker settings for the satellite layer.
                        updateWhenZooming={false}
                        updateWhenIdle={true}
                        keepBuffer={6}
                      />
                    </LayersControl.BaseLayer>
                  </LayersControl>

                  {preparedPoints.map((item) => {
                    const { point } = item;
                    const isActive = activePointId === point.id;

                    if (item.kind === 'marker') {
                      if (!item.position) {
                        return null;
                      }

                      if (!isActive && paddedBounds && !paddedBounds.contains(item.position)) {
                        return null;
                      }

                      return (
                        <Marker
                          key={point.id}
                          position={item.position}
                          icon={item.icon}
                          eventHandlers={{
                            click: (event) =>
                              handleFeatureSelect(point.id, item.focusPosition, event),
                            popupclose: handlePopupClose,
                          }}
                        >
                          <Popup
                            className="custom-popup"
                            autoPan={false}
                            eventHandlers={{
                              close: handlePopupClose,
                              remove: handlePopupClose,
                            }}
                          >
                            <PointPopupContent
                              point={point}
                              copiedId={copiedId}
                              onCopy={handleCopyId}
                            />
                          </Popup>
                        </Marker>
                      );
                    }

                    if (item.kind === 'polyline') {
                      if (
                        !isActive &&
                        paddedBounds &&
                        item.bounds &&
                        !paddedBounds.intersects(item.bounds)
                      ) {
                        return null;
                      }

                      const renderDetailed = !isInteracting || isActive;
                      return (
                        <React.Fragment key={point.id}>
                          <Polyline
                            key={`${point.id}-outline`}
                            positions={item.positions}
                            pathOptions={{
                              color: isActive ? '#f00' : '#ffffff',
                              weight: 15,
                              opacity: isActive ? 0.7 : 1,
                              lineCap: 'round',
                              lineJoin: 'round',
                            }}
                            interactive={false}
                          />

                          {renderDetailed && item.segments.length > 0 && (
                            <>
                              <SegmentedDefs
                                segments={item.segments}
                                topColor={item.polylineColors.topColor}
                                bottomColor={item.polylineColors.bottomColor}
                                strokeWidth={10}
                              />

                              {item.segments.map((seg) => {
                                const gradId = `seggrad-${seg.baseId}-${seg.idx}`;
                                const segPositions = [
                                  [seg.p1.lat, seg.p1.lng],
                                  [seg.p2.lat, seg.p2.lng],
                                ];

                                return (
                                  <Polyline
                                    key={`${point.id}-seg-${seg.idx}`}
                                    positions={segPositions}
                                    pathOptions={{
                                      color: `url(#${gradId})`,
                                      weight: 10,
                                      opacity: 1,
                                      lineCap: 'round',
                                      lineJoin: 'round',
                                    }}
                                    eventHandlers={{
                                      click: (event) =>
                                        handleFeatureSelect(point.id, item.focusPosition, event),
                                    }}
                                  >
                                    <Popup
                                      className="custom-popup"
                                      autoPan={false}
                                      eventHandlers={{
                                        close: handlePopupClose,
                                        remove: handlePopupClose,
                                      }}
                                    >
                                      <PointPopupContent
                                        point={point}
                                        copiedId={copiedId}
                                        onCopy={handleCopyId}
                                      />
                                    </Popup>
                                  </Polyline>
                                );
                              })}
                            </>
                          )}
                        </React.Fragment>
                      );
                    }

                    return null;
                  })}
                </MapContainer>
              </div>
            </div>

            <div className="space-y-6">
              {/* Airport info */}
              <Card className="p-6">
                <h2 className="text-xl font-medium mb-4">Airport Information</h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-zinc-400">ICAO Code</p>
                    <p className="font-medium">{airport.icao}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Airport Name</p>
                    <p className="font-medium">{airport.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">Location</p>
                    <p className="font-medium">
                      {airport.latitude.toFixed(4)}, {airport.longitude.toFixed(4)}
                    </p>
                  </div>
                </div>
              </Card>

              {points.length === 0 ? (
                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center">
                  <AlertCircle className="w-5 h-5 text-amber-400 mr-3 flex-shrink-0" />
                  <p className="text-sm text-amber-400">
                    This airport currently has no lighting points submitted by the owning Division.
                    Please check back later, or contact the Division for support.
                  </p>
                </div>
              ) : (
                <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center">
                  <Info className="w-5 h-5 text-blue-400 mr-3 flex-shrink-0" />
                  <p className="text-sm text-blue-400">
                    These are the existing mapped points for this airport, set by the Division. Your
                    contribution will add support for a specific simulator scenery package.
                  </p>
                </div>
              )}

              {/* Continue button (disabled when no Division points) */}
              <Button
                onClick={points.length === 0 ? undefined : handleContinue}
                disabled={points.length === 0}
                aria-disabled={points.length === 0}
                className={`w-full ${points.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span>Continue to Next Step</span>
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ContributeMap;
