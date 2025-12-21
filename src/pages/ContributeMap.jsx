import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Breadcrumb, BreadcrumbItem } from '../components/shared/Breadcrumb';
import {
  AlertCircle,
  ChevronRight,
  CopyIcon,
  Info,
  Loader,
  Check,
  Layers,
  FileCode2,
} from 'lucide-react';
import Map, {
  Source,
  Layer,
  Marker,
  Popup,
  NavigationControl,
  ScaleControl,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const COLORS = {
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: 'rgb(63, 63, 255)',
  orange: 'rgb(255, 141, 35)',
  red: '#ef4444',
  white: '#ffffff',
  gray: '#999999',
};

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

const calculateBearing = (start, end) => {
  const lat1 = toRad(start[1]);
  const lat2 = toRad(end[1]);
  const dLon = toRad(end[0] - start[0]);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
};

const createCapIcon = (topColor, bottomColor) => {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const radius = size / 2;

  ctx.beginPath();
  ctx.arc(radius, radius, radius, 0, 2 * Math.PI);
  ctx.clip();

  ctx.fillStyle = topColor;
  ctx.fillRect(0, 0, size, size / 2);

  ctx.fillStyle = bottomColor;
  ctx.fillRect(0, size / 2, size, size / 2);

  return ctx.getImageData(0, 0, size, size);
};

const addCapIcons = (map) => {
  if (!map) return;

  const caps = [
    { name: 'cap-gray-red', top: COLORS.gray, bottom: COLORS.red },
    { name: 'cap-red-red', top: COLORS.red, bottom: COLORS.red },
    { name: 'cap-green-green', top: COLORS.green, bottom: COLORS.green },
    { name: 'cap-green-yellow', top: COLORS.green, bottom: COLORS.yellow },
    { name: 'cap-green-blue', top: COLORS.green, bottom: COLORS.blue },
    { name: 'cap-green-orange', top: COLORS.green, bottom: COLORS.orange },
    { name: 'cap-orange-orange', top: COLORS.orange, bottom: COLORS.orange },
  ];

  caps.forEach(({ name, top, bottom }) => {
    if (!map.hasImage(name)) {
      map.addImage(name, createCapIcon(top, bottom), { pixelRatio: 2 });
    }
  });
};

const getPolylineColors = (point) => {
  if (!point || !point.type) return { top: COLORS.gray, bottom: COLORS.red };

  switch (point.type) {
    case 'taxiway': {
      const style = point.color || 'green';
      if (style === 'green') return { top: COLORS.green, bottom: COLORS.green };
      if (style === 'green-yellow') return { top: COLORS.green, bottom: COLORS.yellow };
      if (style === 'green-blue') return { top: COLORS.green, bottom: COLORS.blue };
      if (style === 'green-orange') return { top: COLORS.green, bottom: COLORS.orange };
      return { top: COLORS.green, bottom: COLORS.green };
    }
    case 'lead_on':
      return { top: COLORS.green, bottom: COLORS.yellow };
    case 'stand':
      return { top: COLORS.orange, bottom: COLORS.orange };
    case 'stopbar':
    default:
      if (point.directionality === 'bi-directional') {
        return { top: COLORS.red, bottom: COLORS.red };
      }
      return { top: COLORS.gray, bottom: COLORS.red };
  }
};

const toLngLatPair = (coords) => {
  if (!coords) return null;
  if (Array.isArray(coords)) {
    const c = coords[0];
    return c && typeof c.lat === 'number' && typeof c.lng === 'number' ? [c.lng, c.lat] : null;
  }
  return typeof coords.lat === 'number' && typeof coords.lng === 'number'
    ? [coords.lng, coords.lat]
    : null;
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
  <div className="p-3 -m-3 bg-zinc-900 rounded-lg shadow-lg min-w-[200px]">
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

const PointMarkerIcon = ({ point }) => {
  const color = getPointColor(point);

  if (point.type === 'stopbar') {
    return (
      <div className="marker-container">
        <div className={`marker-circle stopbar-marker ${point.orientation || 'left'}`}>
          {point.directionality === 'uni-directional' &&
            (point.orientation === 'left' ? (
              <div className="marker-quarter marker-quarter-4"></div>
            ) : (
              <div className="marker-quarter marker-quarter-1"></div>
            ))}
        </div>
      </div>
    );
  } else if (point.type === 'lead_on') {
    return (
      <div className="marker-container">
        <div className="marker-circle lead-on-marker">
          <div className="marker-quarter marker-quarter-1"></div>
          <div className="marker-quarter marker-quarter-2"></div>
          <div className="marker-quarter marker-quarter-3"></div>
          <div className="marker-quarter marker-quarter-4"></div>
        </div>
      </div>
    );
  } else if (point.type === 'taxiway') {
    if (point.directionality === 'bi-directional') {
      if (point.color === 'green') {
        return (
          <div className="marker-container">
            <div className="marker-circle lead-on-marker taxiway-green"></div>
          </div>
        );
      } else if (point.color === 'green-yellow') {
        return (
          <div className="marker-container">
            <div className="marker-circle lead-on-marker">
              <div className="marker-quarter taxiway-yellow-quarter-1"></div>
              <div className="marker-quarter taxiway-yellow-quarter-2"></div>
              <div className="marker-quarter taxiway-yellow-quarter-3"></div>
              <div className="marker-quarter taxiway-yellow-quarter-4"></div>
            </div>
          </div>
        );
      } else if (point.color === 'green-blue') {
        return (
          <div className="marker-container">
            <div className="marker-circle lead-on-marker">
              <div className="marker-quarter taxiway-blue-quarter-1"></div>
              <div className="marker-quarter taxiway-blue-quarter-2"></div>
              <div className="marker-quarter taxiway-blue-quarter-3"></div>
              <div className="marker-quarter taxiway-blue-quarter-4"></div>
            </div>
          </div>
        );
      } else if (point.color === 'green-orange') {
        return (
          <div className="marker-container">
            <div className="marker-circle lead-on-marker">
              <div className="marker-quarter taxiway-orange-quarter-1"></div>
              <div className="marker-quarter taxiway-orange-quarter-2"></div>
              <div className="marker-quarter taxiway-orange-quarter-3"></div>
              <div className="marker-quarter taxiway-orange-quarter-4"></div>
            </div>
          </div>
        );
      }
    } else if (point.directionality === 'uni-directional') {
      if (point.color === 'green') {
        return (
          <div className="marker-container">
            <div className={`marker-circle taxiway-green ${point.orientation || 'left'}`}>
              {point.directionality === 'uni-directional' &&
                (point.orientation === 'left' ? (
                  <div className="marker-quarter taxiway-quarter-L"></div>
                ) : (
                  <div className="marker-quarter taxiway-quarter-R"></div>
                ))}
            </div>
          </div>
        );
      } else if (point.color === 'green-yellow') {
        return (
          <div className="marker-container">
            <div className={`marker-circle ${point.orientation || 'left'}`}>
              {point.directionality === 'uni-directional' &&
                (point.orientation === 'left' ? (
                  <>
                    <div className="marker-quarter taxiway-yellow-quarter-1"></div>
                    <div className="marker-quarter taxiway-yellow-quarter-2"></div>
                    <div className="marker-quarter taxiway-yellow-quarter-3"></div>
                    <div className="marker-quarter taxiway-quarter-L"></div>
                  </>
                ) : (
                  <>
                    <div className="marker-quarter taxiway-quarter-R"></div>
                    <div className="marker-quarter taxiway-yellow-quarter-2"></div>
                    <div className="marker-quarter taxiway-yellow-quarter-3"></div>
                    <div className="marker-quarter taxiway-yellow-quarter-4"></div>
                  </>
                ))}
            </div>
          </div>
        );
      } else if (point.color === 'green-blue') {
        return (
          <div className="marker-container">
            <div className={`marker-circle ${point.orientation || 'left'}`}>
              {point.directionality === 'uni-directional' &&
                (point.orientation === 'left' ? (
                  <>
                    <div className="marker-quarter taxiway-blue-quarter-1"></div>
                    <div className="marker-quarter taxiway-blue-quarter-2"></div>
                    <div className="marker-quarter taxiway-blue-quarter-3"></div>
                    <div className="marker-quarter taxiway-quarter-L"></div>
                  </>
                ) : (
                  <>
                    <div className="marker-quarter taxiway-quarter-R"></div>
                    <div className="marker-quarter taxiway-blue-quarter-2"></div>
                    <div className="marker-quarter taxiway-blue-quarter-3"></div>
                    <div className="marker-quarter taxiway-blue-quarter-4"></div>
                  </>
                ))}
            </div>
          </div>
        );
      } else if (point.color === 'green-orange') {
        return (
          <div className="marker-container">
            <div className={`marker-circle ${point.orientation || 'left'}`}>
              {point.directionality === 'uni-directional' &&
                (point.orientation === 'left' ? (
                  <>
                    <div className="marker-quarter taxiway-orange-quarter-1"></div>
                    <div className="marker-quarter taxiway-orange-quarter-2"></div>
                    <div className="marker-quarter taxiway-orange-quarter-3"></div>
                    <div className="marker-quarter taxiway-quarter-L"></div>
                  </>
                ) : (
                  <>
                    <div className="marker-quarter taxiway-quarter-R"></div>
                    <div className="marker-quarter taxiway-orange-quarter-2"></div>
                    <div className="marker-quarter taxiway-orange-quarter-3"></div>
                    <div className="marker-quarter taxiway-orange-quarter-4"></div>
                  </>
                ))}
            </div>
          </div>
        );
      }
    }
  }

  return (
    <div className="marker-container">
      <div className="marker-circle" style={{ backgroundColor: color }}></div>
    </div>
  );
};

PointMarkerIcon.propTypes = {
  point: PropTypes.object.isRequired,
};

const style = document.createElement('style');
style.textContent = `
  .marker-container {
    position: relative;
    width: 24px;
    height: 24px;
    cursor: pointer;
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
  .maplibregl-popup-content {
    background: transparent;
    padding: 0;
    box-shadow: none;
  }
  .maplibregl-popup-tip {
    border-top-color: #18181b;
  }
`;
document.head.appendChild(style);

// eslint-disable-next-line no-unused-vars
const getPolylinePattern = (point) => {
  if (!point || !point.type) return 'pattern-gray-red';

  switch (point.type) {
    case 'taxiway': {
      const style = point.color || 'green';
      if (style === 'green') return 'pattern-green-green';
      if (style === 'green-yellow') return 'pattern-green-yellow';
      if (style === 'green-blue') return 'pattern-green-blue';
      if (style === 'green-orange') return 'pattern-green-orange';
      return 'pattern-green-green';
    }
    case 'lead_on':
      return 'pattern-green-yellow';
    case 'stand':
      return 'pattern-orange-orange';
    case 'stopbar':
    default:
      if (point.directionality === 'bi-directional') {
        return 'pattern-red-red';
      }
      return 'pattern-gray-red';
  }
};

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

const INTERACTIVE_LAYER_IDS = [
  'lower-lines-outline-layer',
  'lower-lines-top-layer',
  'lower-lines-bottom-layer',
  'upper-lines-outline-layer',
  'upper-lines-top-layer',
  'upper-lines-bottom-layer',
  'lower-caps-layer',
  'upper-caps-layer',
];

const CLICK_RADIUS_PX = 10;
const TOUCH_RADIUS_PX = 14;

const ContributeMap = () => {
  const { icao } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [airport, setAirport] = useState(null);
  const [points, setPoints] = useState([]);
  const [activePointId, setActivePointId] = useState(null);
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 14,
  });
  const [copiedId, setCopiedId] = useState(null);
  const [mapStyle, setMapStyle] = useState(SATELLITE_STYLE);
  const [styleName, setStyleName] = useState('Satellite');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const airportResponse = await fetch(`https://v2.stopbars.com/airports?icao=${icao}`);
        if (!airportResponse.ok) {
          throw new Error('Failed to fetch airport data');
        }
        const airportData = await airportResponse.json();

        setAirport({
          icao: airportData.icao,
          name: airportData.name,
          latitude: airportData.latitude,
          longitude: airportData.longitude,
        });

        let centerLat = airportData.latitude;
        let centerLng = airportData.longitude;

        setViewState((prev) => ({
          ...prev,
          latitude: centerLat,
          longitude: centerLng,
          zoom: 14,
        }));

        const hasBoundingBox =
          typeof airportData.bbox_min_lat === 'number' &&
          typeof airportData.bbox_min_lon === 'number' &&
          typeof airportData.bbox_max_lat === 'number' &&
          typeof airportData.bbox_max_lon === 'number';

        if (hasBoundingBox && mapRef.current) {
          mapRef.current.fitBounds(
            [
              [airportData.bbox_min_lon, airportData.bbox_min_lat],
              [airportData.bbox_max_lon, airportData.bbox_max_lat],
            ],
            { padding: 40 }
          );
        }

        const pointsResponse = await fetch(`https://v2.stopbars.com/airports/${icao}/points`);
        if (!pointsResponse.ok) {
          throw new Error('Failed to fetch points data');
        }
        const pointsData = await pointsResponse.json();
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
        navigate('/contribute/new', { state: { error: 'airport_load_failed' } });
        return;
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [icao, navigate]);

  const { markers, lowerLinesSource, upperLinesSource, lowerCapsSource, upperCapsSource } =
    useMemo(() => {
      const markers = [];
      const lowerLinesFeatures = [];
      const upperLinesFeatures = [];
      const lowerCapsFeatures = [];
      const upperCapsFeatures = [];
      let lowerFeatureIndex = 0;
      let upperFeatureIndex = 0;

      if (!Array.isArray(points))
        return {
          markers,
          lowerLinesSource: null,
          upperLinesSource: null,
          lowerCapsSource: null,
          upperCapsSource: null,
        };

      points.forEach((point) => {
        const isUpper = point.type === 'stopbar';
        const targetLines = isUpper ? upperLinesFeatures : lowerLinesFeatures;
        const targetCaps = isUpper ? upperCapsFeatures : lowerCapsFeatures;

        const coords = point.coordinates;
        const isPath = Array.isArray(coords) && coords.length >= 2;

        if (!isPath) {
          const position = toLngLatPair(coords);
          if (position) {
            markers.push({
              point,
              longitude: position[0],
              latitude: position[1],
            });
          }
        } else {
          const safeCoords = coords.filter(
            (c) => typeof c?.lat === 'number' && typeof c?.lng === 'number'
          );

          if (safeCoords.length >= 2) {
            const coordinates = safeCoords.map((c) => [c.lng, c.lat]);
            const colors = getPolylineColors(point);
            const sortKey = isUpper ? upperFeatureIndex++ : lowerFeatureIndex++;

            targetLines.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates,
              },
              properties: {
                id: point.id,
                type: point.type,
                directionality: point.directionality,
                topColor: colors.top,
                bottomColor: colors.bottom,
                sortKey,
              },
            });

            const startPoint = coordinates[0];
            const startNext = coordinates[1];
            const endPoint = coordinates[coordinates.length - 1];
            const endPrev = coordinates[coordinates.length - 2];

            let capName = 'cap-gray-red';
            if (colors.top === COLORS.green && colors.bottom === COLORS.green)
              capName = 'cap-green-green';
            else if (colors.top === COLORS.green && colors.bottom === COLORS.yellow)
              capName = 'cap-green-yellow';
            else if (colors.top === COLORS.green && colors.bottom === COLORS.blue)
              capName = 'cap-green-blue';
            else if (colors.top === COLORS.green && colors.bottom === COLORS.orange)
              capName = 'cap-green-orange';
            else if (colors.top === COLORS.red && colors.bottom === COLORS.red)
              capName = 'cap-red-red';
            else if (colors.top === COLORS.orange && colors.bottom === COLORS.orange)
              capName = 'cap-orange-orange';

            const startBearing = calculateBearing(startPoint, startNext);
            targetCaps.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: startPoint },
              properties: {
                icon: capName,
                rotation: startBearing - 90,
                id: point.id, // For selection
                sortKey,
              },
            });

            const endBearing = calculateBearing(endPrev, endPoint);
            targetCaps.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: endPoint },
              properties: {
                icon: capName,
                rotation: endBearing - 90,
                id: point.id,
                sortKey,
              },
            });
          }
        }
      });

      return {
        markers,
        lowerLinesSource: { type: 'FeatureCollection', features: lowerLinesFeatures },
        upperLinesSource: { type: 'FeatureCollection', features: upperLinesFeatures },
        lowerCapsSource: { type: 'FeatureCollection', features: lowerCapsFeatures },
        upperCapsSource: { type: 'FeatureCollection', features: upperCapsFeatures },
      };
    }, [points]);

  const onMapLoad = useCallback((event) => {
    addCapIcons(event.target);
  }, []);

  const handlePopupClose = useCallback(() => {
    setActivePointId(null);
  }, []);

  const handleMarkerClick = useCallback((point, e) => {
    e.originalEvent.stopPropagation();
    setActivePointId(point.id);
  }, []);

  const handleLineClick = useCallback(
    (e) => {
      const eventFeatures = Array.isArray(e?.features) ? e.features : [];
      const queriedFeatures =
        mapRef.current?.queryRenderedFeatures(e.point, { layers: INTERACTIVE_LAYER_IDS }) || [];

      const feature = [...eventFeatures, ...queriedFeatures].find((f) => f?.properties?.id);

      if (feature?.properties?.id) {
        setActivePointId(feature.properties.id);
        return true;
      }

      return false;
    },
    [mapRef]
  );

  const handleContinue = () => {
    navigate(`/contribute/test/${icao}`);
  };

  const handleCopyId = (id, event) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleStyle = () => {
    if (styleName === 'Satellite') {
      setMapStyle(STREET_STYLE);
      setStyleName('Street Map');
    } else {
      setMapStyle(SATELLITE_STYLE);
      setStyleName('Satellite');
    }
  };

  const activePoint = useMemo(() => {
    return points.find((p) => p.id === activePointId);
  }, [points, activePointId]);

  const activePointPosition = useMemo(() => {
    if (!activePoint) return null;
    const coords = activePoint.coordinates;
    if (Array.isArray(coords) && coords.length > 0) {
      const midIndex = Math.floor(coords.length / 2);
      if (coords.length % 2 !== 0) {
        const p = coords[midIndex];
        return [p.lng, p.lat];
      } else {
        const p1 = coords[midIndex - 1];
        const p2 = coords[midIndex];
        return [(p1.lng + p2.lng) / 2, (p1.lat + p2.lat) / 2];
      }
    }
    return toLngLatPair(coords);
  }, [activePoint]);

  const activeSortExpression = useMemo(() => {
    return ['case', ['==', ['get', 'id'], activePointId || ''], 1_000_000, ['get', 'sortKey']];
  }, [activePointId]);

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
              <div className="h-[600px] rounded-lg overflow-hidden border border-zinc-800 relative">
                <Map
                  ref={mapRef}
                  {...viewState}
                  onMove={(evt) => setViewState(evt.viewState)}
                  onLoad={onMapLoad}
                  onStyleData={(e) => addCapIcons(e.target)}
                  mapStyle={mapStyle}
                  style={{ width: '100%', height: '100%' }}
                  interactiveLayerIds={INTERACTIVE_LAYER_IDS}
                  clickRadius={CLICK_RADIUS_PX}
                  touchRadius={TOUCH_RADIUS_PX}
                  onClick={(e) => {
                    if (!handleLineClick(e)) {
                      setActivePointId(null);
                    }
                  }}
                >
                  <NavigationControl position="top-left" />
                  <ScaleControl />

                  {/* Lower Group */}
                  {lowerLinesSource && (
                    <Source id="lower-lines-source" type="geojson" data={lowerLinesSource}>
                      <Layer
                        id="lower-lines-outline-layer"
                        type="line"
                        paint={{
                          'line-width': 15,
                          'line-color': [
                            'case',
                            ['==', ['get', 'id'], activePointId || ''],
                            '#ef4444', // Active color
                            '#ffffff', // Default outline
                          ],
                          'line-opacity': [
                            'case',
                            ['==', ['get', 'id'], activePointId || ''],
                            0.8,
                            1,
                          ],
                        }}
                        layout={{
                          'line-cap': 'round',
                          'line-join': 'round',
                          'line-sort-key': activeSortExpression,
                        }}
                      />
                      {/* Bottom/Right Half */}
                      <Layer
                        id="lower-lines-bottom-layer"
                        type="line"
                        paint={{
                          'line-width': 6,
                          'line-color': ['get', 'bottomColor'],
                          'line-offset': 2.75,
                        }}
                        layout={{
                          'line-cap': 'butt',
                          'line-join': 'round',
                          'line-sort-key': activeSortExpression,
                        }}
                      />
                      {/* Top/Left Half */}
                      <Layer
                        id="lower-lines-top-layer"
                        type="line"
                        paint={{
                          'line-width': 6,
                          'line-color': ['get', 'topColor'],
                          'line-offset': -2.75,
                        }}
                        layout={{
                          'line-cap': 'butt',
                          'line-join': 'round',
                          'line-sort-key': activeSortExpression,
                        }}
                      />
                    </Source>
                  )}

                  {lowerCapsSource && (
                    <Source id="lower-caps-source" type="geojson" data={lowerCapsSource}>
                      <Layer
                        id="lower-caps-layer"
                        type="symbol"
                        layout={{
                          'icon-image': ['get', 'icon'],
                          'icon-size': 11 / 32,
                          'icon-rotate': ['get', 'rotation'],
                          'icon-rotation-alignment': 'map',
                          'icon-allow-overlap': true,
                          'icon-ignore-placement': true,
                          'symbol-sort-key': activeSortExpression,
                        }}
                      />
                    </Source>
                  )}

                  {/* Upper Group */}
                  {upperLinesSource && (
                    <Source id="upper-lines-source" type="geojson" data={upperLinesSource}>
                      <Layer
                        id="upper-lines-outline-layer"
                        type="line"
                        paint={{
                          'line-width': 15,
                          'line-color': [
                            'case',
                            ['==', ['get', 'id'], activePointId || ''],
                            '#ef4444', // Active color
                            '#ffffff', // Default outline
                          ],
                          'line-opacity': [
                            'case',
                            ['==', ['get', 'id'], activePointId || ''],
                            0.8,
                            1,
                          ],
                        }}
                        layout={{
                          'line-cap': 'round',
                          'line-join': 'round',
                          'line-sort-key': activeSortExpression,
                        }}
                      />
                      {/* Bottom/Right Half */}
                      <Layer
                        id="upper-lines-bottom-layer"
                        type="line"
                        paint={{
                          'line-width': 6,
                          'line-color': ['get', 'bottomColor'],
                          'line-offset': 2.75,
                        }}
                        layout={{
                          'line-cap': 'butt',
                          'line-join': 'round',
                          'line-sort-key': activeSortExpression,
                        }}
                      />
                      {/* Top/Left Half */}
                      <Layer
                        id="upper-lines-top-layer"
                        type="line"
                        paint={{
                          'line-width': 6,
                          'line-color': ['get', 'topColor'],
                          'line-offset': -2.75,
                        }}
                        layout={{
                          'line-cap': 'butt',
                          'line-join': 'round',
                          'line-sort-key': activeSortExpression,
                        }}
                      />
                    </Source>
                  )}

                  {upperCapsSource && (
                    <Source id="upper-caps-source" type="geojson" data={upperCapsSource}>
                      <Layer
                        id="upper-caps-layer"
                        type="symbol"
                        layout={{
                          'icon-image': ['get', 'icon'],
                          'icon-size': 11 / 32,
                          'icon-rotate': ['get', 'rotation'],
                          'icon-rotation-alignment': 'map',
                          'icon-allow-overlap': true,
                          'icon-ignore-placement': true,
                          'symbol-sort-key': activeSortExpression,
                        }}
                      />
                    </Source>
                  )}

                  {/* Markers */}
                  {markers.map((m) => (
                    <Marker
                      key={m.point.id}
                      longitude={m.longitude}
                      latitude={m.latitude}
                      anchor="center"
                      onClick={(e) => handleMarkerClick(m.point, e)}
                    >
                      <PointMarkerIcon point={m.point} />
                    </Marker>
                  ))}

                  {/* Popup */}
                  {activePoint && activePointPosition && (
                    <Popup
                      longitude={activePointPosition[0]}
                      latitude={activePointPosition[1]}
                      anchor="bottom"
                      onClose={handlePopupClose}
                      closeButton={true}
                      closeOnClick={false}
                      offset={15}
                      className="custom-popup"
                    >
                      <PointPopupContent
                        point={activePoint}
                        copiedId={copiedId}
                        onCopy={handleCopyId}
                      />
                    </Popup>
                  )}
                </Map>

                {/* Custom Layer Control */}
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

              {/* XML Generator Tool */}
              <Card className="p-6">
                <h2 className="text-xl font-medium mb-4">XML Generator</h2>
                <button
                  onClick={() => navigate(`/contribute/generator/${icao}`)}
                  className="w-full flex items-center p-3 rounded-lg border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <FileCode2 className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="ml-3 text-left">
                    <p className="text-sm font-medium text-white">Generate Draft Contribution</p>
                    <p className="text-xs text-zinc-400">
                      Create an XML file for your contribution
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-500 ml-auto" />
                </button>
              </Card>

              {points.length === 0 ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center">
                  <AlertCircle className="w-5 h-5 text-amber-400 mr-3 shrink-0" />
                  <p className="text-sm text-amber-400">
                    This airport currently has no lighting points submitted by the owning Division.
                    Please check back later, or contact the Division for support.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center">
                  <Info className="w-5 h-5 text-blue-400 mr-3 shrink-0" />
                  <p className="text-sm text-blue-400">
                    These are the existing mapped points for this airport, set by the Division. Your
                    contribution will add support for a specific simulator scenery package.
                  </p>
                </div>
              )}

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
