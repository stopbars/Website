import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../layout/Layout';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Dialog } from '../shared/Dialog';
import { Dropdown } from '../shared/Dropdown';
import { Toast } from '../shared/Toast';
import PropTypes from 'prop-types';
import {
  Plus,
  UserX,
  TowerControl,
  Users,
  Settings,
  AlertOctagon,
  Loader,
  User,
  Shield,
  Trash2,
  Map as MapIcon,
} from 'lucide-react';
import { getVatsimToken } from '../../utils/cookieUtils';
import Map, { Source, Layer, Marker, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
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

const getPointColor = (point) => {
  switch (point.type) {
    case 'lead_on':
      return '#fbbf24';
    case 'stopbar':
      return '#ef4444';
    case 'taxiway':
      switch (point.color) {
        case 'green-yellow':
          return '#FFD700';
        case 'green-blue':
          return '#0000FF';
        case 'green-orange':
          return '#FFA500';
        default:
          return '#00FF00';
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
  point: PropTypes.shape({
    id: PropTypes.string,
    type: PropTypes.string.isRequired,
    directionality: PropTypes.string,
    color: PropTypes.string,
    orientation: PropTypes.string,
  }).isRequired,
};

const MapPreviewIcon = ({ className }) => <MapIcon className={`${className} relative top-px`} />;

MapPreviewIcon.propTypes = {
  className: PropTypes.string,
};

const markerStyles = `
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
`;

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

const DivisionManagement = () => {
  const { id: divisionId } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const [division, setDivision] = useState(null);
  const [members, setMembers] = useState([]);
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddAirport, setShowAddAirport] = useState(false);
  const [newMemberCid, setNewMemberCid] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('nav_member');
  const [newAirportIcao, setNewAirportIcao] = useState('');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [addingMember, setAddingMember] = useState(false);
  const [addingAirport, setAddingAirport] = useState(false);
  const [removingMember, setRemovingMember] = useState(false);
  const [showDeleteAirportConfirm, setShowDeleteAirportConfirm] = useState(false);
  const [airportToDelete, setAirportToDelete] = useState(null);
  const [deletingAirport, setDeletingAirport] = useState(false);
  const token = getVatsimToken();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isLeadDev, setIsLeadDev] = useState(false);
  const [showMapPreview, setShowMapPreview] = useState(false);
  const [mapAirport, setMapAirport] = useState(null);
  const [mapPoints, setMapPoints] = useState([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState('');
  const [mapViewState, setMapViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 14,
  });
  const [mapBounds, setMapBounds] = useState(null);

  const currentMemberRole = useMemo(() => {
    if (!currentUserId) return null;
    const match = members.find((m) => String(m.vatsim_id) === String(currentUserId));
    return match?.role ?? null;
  }, [members, currentUserId]);

  const isNavHead = currentMemberRole === 'nav_head';
  const isNavMember = currentMemberRole === 'nav_member';
  const isDivisionMember = isNavHead || isNavMember;
  const canManageMembers = isLeadDev || isNavHead;
  const canRequestAirport = isLeadDev || isDivisionMember;

  const [showToast, setShowToast] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    variant: 'success',
    title: '',
    description: '',
  });

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'bg-green-400';
      case 'pending':
        return 'bg-orange-400';
      case 'rejected':
        return 'bg-red-400';
      default:
        return 'bg-gray-400';
    }
  };

  const getDataSubmitted = (airport) => {
    const realValue =
      airport?.has_objects ??
      airport?.has_data ??
      airport?.data_submitted ??
      airport?.has_submission ??
      airport?.dataSubmitted ??
      airport?.submitted;

    return Boolean(realValue);
  };

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById('bars-map-marker-styles')) return;

    const style = document.createElement('style');
    style.id = 'bars-map-marker-styles';
    style.textContent = markerStyles;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const staffResponse = await fetch('https://v2.stopbars.com/auth/is-staff', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (staffResponse.ok) {
          const staffData = await staffResponse.json();
          setIsLeadDev(staffData.isStaff && staffData.role?.toLowerCase() === 'lead_developer');
        }

        const accountResponse = await fetch('https://v2.stopbars.com/auth/account', {
          headers: { 'X-Vatsim-Token': token },
        });
        if (accountResponse.ok) {
          const accountData = await accountResponse.json();
          setCurrentUserId(accountData.vatsim_id);
        }
        const divisionResponse = await fetch(`https://v2.stopbars.com/divisions/${divisionId}`, {
          headers: { 'X-Vatsim-Token': token },
        });
        if (!divisionResponse.ok) throw new Error('Failed to fetch division');
        const divisionData = await divisionResponse.json();
        setDivision(divisionData);
        const membersResponse = await fetch(
          `https://v2.stopbars.com/divisions/${divisionId}/members`,
          {
            headers: { 'X-Vatsim-Token': token },
          }
        );
        if (!membersResponse.ok) throw new Error('Failed to fetch members');
        const membersData = await membersResponse.json();
        setMembers(membersData);
        const airportsResponse = await fetch(
          `https://v2.stopbars.com/divisions/${divisionId}/airports`,
          {
            headers: { 'X-Vatsim-Token': token },
          }
        );
        if (!airportsResponse.ok) throw new Error('Failed to fetch airports');
        const airportsData = await airportsResponse.json();
        setAirports(airportsData);
      } catch (err) {
        setToastConfig({
          variant: 'destructive',
          title: 'Error',
          description: err.message || 'Failed to load division data.',
        });
        setShowToast(true);
      } finally {
        setLoading(false);
      }
    };
    if (token && divisionId) fetchData();
  }, [token, divisionId, navigate]);

  useEffect(() => {
    if (loading) return;
    if (!isLeadDev && !isDivisionMember) {
      navigate('/account');
    }
  }, [loading, isLeadDev, isDivisionMember, navigate]);

  const loadMapPreview = useCallback(async (airport) => {
    if (!airport?.icao) return;
    setMapLoading(true);
    setMapError('');
    setMapPoints([]);
    setMapBounds(null);

    try {
      const airportResponse = await fetch(`https://v2.stopbars.com/airports?icao=${airport.icao}`);
      if (!airportResponse.ok) {
        throw new Error('Failed to fetch airport data');
      }
      const airportData = await airportResponse.json();

      setMapAirport({
        icao: airportData.icao,
        name: airportData.name,
        latitude: airportData.latitude,
        longitude: airportData.longitude,
      });

      setMapViewState((prev) => ({
        ...prev,
        latitude: airportData.latitude,
        longitude: airportData.longitude,
        zoom: 14,
      }));

      const hasBoundingBox =
        typeof airportData.bbox_min_lat === 'number' &&
        typeof airportData.bbox_min_lon === 'number' &&
        typeof airportData.bbox_max_lat === 'number' &&
        typeof airportData.bbox_max_lon === 'number';

      if (hasBoundingBox) {
        setMapBounds([
          [airportData.bbox_min_lon, airportData.bbox_min_lat],
          [airportData.bbox_max_lon, airportData.bbox_max_lat],
        ]);
      }

      const pointsResponse = await fetch(`https://v2.stopbars.com/airports/${airport.icao}/points`);
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

      setMapPoints(transformedPoints);
    } catch (err) {
      setMapError(err.message || 'Failed to load map data.');
    } finally {
      setMapLoading(false);
    }
  }, []);

  const openMapPreview = (airport) => {
    setShowMapPreview(true);
    setMapAirport({ icao: airport.icao, name: airport.name });
    loadMapPreview(airport);
  };

  const closeMapPreview = () => {
    setShowMapPreview(false);
    setMapAirport(null);
    setMapPoints([]);
    setMapError('');
    setMapBounds(null);
  };

  const onMapLoad = useCallback(
    (event) => {
      addCapIcons(event.target);
      if (mapBounds?.length === 2) {
        event.target.fitBounds(mapBounds, { padding: 40 });
      }
    },
    [mapBounds]
  );

  const { mapMarkers, lowerLinesSource, upperLinesSource, lowerCapsSource, upperCapsSource } =
    useMemo(() => {
      const mapMarkers = [];
      const lowerLinesFeatures = [];
      const upperLinesFeatures = [];
      const lowerCapsFeatures = [];
      const upperCapsFeatures = [];
      let lowerFeatureIndex = 0;
      let upperFeatureIndex = 0;

      if (!Array.isArray(mapPoints))
        return {
          mapMarkers,
          lowerLinesSource: null,
          upperLinesSource: null,
          lowerCapsSource: null,
          upperCapsSource: null,
        };

      mapPoints.forEach((point) => {
        const isUpper = point.type === 'stopbar';
        const targetLines = isUpper ? upperLinesFeatures : lowerLinesFeatures;
        const targetCaps = isUpper ? upperCapsFeatures : lowerCapsFeatures;

        const coords = point.coordinates;
        const isPath = Array.isArray(coords) && coords.length >= 2;

        if (!isPath) {
          const position = toLngLatPair(coords);
          if (position) {
            mapMarkers.push({
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
                id: point.id,
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
        mapMarkers,
        lowerLinesSource: { type: 'FeatureCollection', features: lowerLinesFeatures },
        upperLinesSource: { type: 'FeatureCollection', features: upperLinesFeatures },
        lowerCapsSource: { type: 'FeatureCollection', features: lowerCapsFeatures },
        upperCapsSource: { type: 'FeatureCollection', features: upperCapsFeatures },
      };
    }, [mapPoints]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    setAddingMember(true);
    try {
      const response = await fetch(`https://v2.stopbars.com/divisions/${divisionId}/members`, {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vatsimId: newMemberCid,
          role: newMemberRole,
        }),
      });

      if (!response.ok) throw new Error('Failed to add member');

      const newMember = await response.json();
      setMembers([...members, newMember]);
      const addedCid = newMemberCid;
      setNewMemberCid('');
      setNewMemberRole('nav_member');
      setShowAddMember(false);
      setToastConfig({
        variant: 'success',
        title: `${addedCid} Added`,
        description: 'The member has been added to the division.',
      });
      setShowToast(true);
    } catch (err) {
      setShowAddMember(false);
      setNewMemberCid('');
      setNewMemberRole('nav_member');
      setToastConfig({
        variant: 'destructive',
        title: 'Failed to Add Member',
        description: err.message || 'An error occurred while adding the member.',
      });
      setShowToast(true);
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    setRemovingMember(true);
    try {
      const response = await fetch(
        `https://v2.stopbars.com/divisions/${divisionId}/members/${memberId}`,
        {
          method: 'DELETE',
          headers: { 'X-Vatsim-Token': token },
        }
      );

      if (!response.ok) throw new Error('Failed to remove member');

      setMembers(members.filter((m) => m.vatsim_id !== memberId));
      setShowRemoveConfirm(false);
      setMemberToRemove(null);
      setToastConfig({
        variant: 'success',
        title: `${memberId} Removed`,
        description: 'The member has been removed from the division.',
      });
      setShowToast(true);
    } catch (err) {
      setShowRemoveConfirm(false);
      setMemberToRemove(null);
      setToastConfig({
        variant: 'destructive',
        title: 'Failed to Remove Member',
        description: err.message || 'An error occurred while removing the member.',
      });
      setShowToast(true);
    } finally {
      setRemovingMember(false);
    }
  };

  const confirmRemoveMember = (member) => {
    if (!canManageMembers) return;
    if (!member) return;
    const isSelf = String(currentUserId) === String(member.vatsim_id);
    if (isSelf) return;
    if (!isLeadDev && member.role === 'nav_head') return;
    setMemberToRemove(member);
    setShowRemoveConfirm(true);
  };

  const cancelRemoveMember = () => {
    setShowRemoveConfirm(false);
    setMemberToRemove(null);
    setRemovingMember(false);
  };

  const confirmDeleteAirport = (airport) => {
    if (!isDivisionMember && !isLeadDev) return;
    setAirportToDelete(airport);
    setShowDeleteAirportConfirm(true);
  };

  const cancelDeleteAirport = () => {
    setShowDeleteAirportConfirm(false);
    setAirportToDelete(null);
    setDeletingAirport(false);
  };

  const handleDeleteAirport = async (airportId) => {
    setDeletingAirport(true);
    const deletedIcao = airportToDelete?.icao;
    try {
      const response = await fetch(
        `https://v2.stopbars.com/divisions/${divisionId}/airports/${airportId}`,
        {
          method: 'DELETE',
          headers: { 'X-Vatsim-Token': token },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete airport request');
      }

      setAirports(airports.filter((a) => a.id !== airportId));
      setShowDeleteAirportConfirm(false);
      setAirportToDelete(null);
      setToastConfig({
        variant: 'success',
        title: `${deletedIcao} Request Deleted`,
        description: 'The airport request has been deleted.',
      });
      setShowToast(true);
    } catch (err) {
      setShowDeleteAirportConfirm(false);
      setAirportToDelete(null);
      setToastConfig({
        variant: 'destructive',
        title: 'Failed to Delete Request',
        description: err.message || 'An error occurred while deleting the airport request.',
      });
      setShowToast(true);
    } finally {
      setDeletingAirport(false);
    }
  };

  const handleAddAirport = async (e) => {
    e.preventDefault();
    if (!canRequestAirport) return;
    setAddingAirport(true);
    try {
      // First validate the airport exists
      const validateResponse = await fetch(
        `https://v2.stopbars.com/airports?icao=${newAirportIcao.toUpperCase()}`,
        {
          headers: { 'X-Vatsim-Token': token },
        }
      );

      if (!validateResponse.ok) {
        if (validateResponse.status === 404) {
          throw new Error('Airport not found');
        }
        throw new Error('Failed to validate airport');
      }

      // Then request to add it to the division
      const response = await fetch(`https://v2.stopbars.com/divisions/${divisionId}/airports`, {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ icao: newAirportIcao.toUpperCase() }),
      });

      if (!response.ok) throw new Error('Failed to request airport');

      const newAirport = await response.json();
      setAirports([...airports, newAirport]);
      const requestedIcao = newAirportIcao.toUpperCase();
      setNewAirportIcao('');
      setShowAddAirport(false);
      setToastConfig({
        variant: 'success',
        title: `${requestedIcao} Requested`,
        description: 'The airport request has been submitted.',
      });
      setShowToast(true);
    } catch (err) {
      setShowAddAirport(false);
      setNewAirportIcao('');
      setToastConfig({
        variant: 'destructive',
        title: 'Failed to Request Airport',
        description: err.message || 'An error occurred while requesting the airport.',
      });
      setShowToast(true);
    } finally {
      setAddingAirport(false);
    }
  };

  if (loading)
    return (
      <Layout>
        <div className="pt-40 pb-20 min-h-screen flex items-center justify-center">
          <Loader className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      </Layout>
    );

  return (
    <Layout>
      <div className="pt-40 pb-20">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">{division?.name}</h1>
            <p className="text-sm text-zinc-400 mt-1">Division Management</p>
          </div>

          <div className="space-y-6">
            {/* Members Section */}
            <Card className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-zinc-400" />
                  <h2 className="text-lg font-semibold text-white">Members</h2>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-400">
                    {members.length}
                  </span>
                </div>
                <Button
                  onClick={() => {
                    if (!canManageMembers) return;
                    setShowAddMember(true);
                  }}
                  className="shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!canManageMembers}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Member
                </Button>
              </div>

              {/* Members Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {members.length === 0 ? (
                  <div className="col-span-full p-8 text-center border border-dashed border-zinc-700/50 rounded-xl bg-zinc-800/20">
                    <User className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-400 text-sm">No members found</p>
                  </div>
                ) : (
                  members.map((member) => {
                    const isSelf = String(currentUserId) === String(member.vatsim_id);
                    const removeDisabled =
                      !canManageMembers || isSelf || (!isLeadDev && member.role === 'nav_head');

                    return (
                      <div
                        key={member.id}
                        className="p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg hover:border-zinc-600/50 transition-all duration-200"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                              <User className="w-5 h-5 text-zinc-400" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-medium text-white truncate">
                                {member.display_name}
                              </h3>
                              {member.vatsim_id &&
                                String(member.display_name) !== String(member.vatsim_id) && (
                                  <p className="text-xs text-zinc-500 font-mono">
                                    {member.vatsim_id}
                                  </p>
                                )}
                            </div>
                          </div>
                          <button
                            onClick={() => confirmRemoveMember(member)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              removeDisabled
                                ? 'text-zinc-500 opacity-50 cursor-not-allowed pointer-events-none'
                                : 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10'
                            }`}
                            disabled={removeDisabled}
                            title={
                              isSelf
                                ? 'Cannot remove yourself'
                                : removeDisabled
                                  ? 'No permission'
                                  : 'Remove member'
                            }
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="mt-3 pt-3 border-t border-zinc-700/50">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                              member.role === 'nav_head'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            }`}
                          >
                            <Shield className="w-3 h-3" />
                            {member.role
                              .split('_')
                              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                              .join(' ')}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* Airports Section */}
            <Card className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <TowerControl className="w-5 h-5 text-zinc-400" />
                  <h2 className="text-lg font-semibold text-white">Airports</h2>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-400">
                    {airports.length}
                  </span>
                </div>
                <Button
                  onClick={() => {
                    if (!canRequestAirport) return;
                    setShowAddAirport(true);
                  }}
                  className="shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!canRequestAirport}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Request Airport
                </Button>
              </div>

              {/* Airports Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {airports.length === 0 ? (
                  <div className="col-span-full p-8 text-center border border-dashed border-zinc-700/50 rounded-xl bg-zinc-800/20">
                    <TowerControl className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-400 text-sm">No airports found</p>
                  </div>
                ) : (
                  airports
                    .sort((a, b) => a.icao.localeCompare(b.icao))
                    .map((airport) => (
                      <div
                        key={airport.id}
                        className="p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg hover:border-zinc-600/50 transition-all duration-200"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium text-white text-lg">{airport.icao}</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Requested by: {airport.requested_by}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {getDataSubmitted(airport) && (
                              <button
                                onClick={() => openMapPreview(airport)}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                              >
                                <MapIcon className="w-4 h-4" />
                              </button>
                            )}
                            {airport.status === 'approved' && (
                              <button
                                onClick={() =>
                                  navigate(`/divisions/${divisionId}/airports/${airport.icao}`)
                                }
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                              >
                                <Settings className="w-4 h-4" />
                              </button>
                            )}
                            {(airport.status === 'pending' || airport.status === 'rejected') && (
                              <button
                                onClick={() => confirmDeleteAirport(airport)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isDivisionMember || isLeadDev
                                    ? 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10'
                                    : 'text-zinc-500 opacity-50 cursor-not-allowed pointer-events-none'
                                }`}
                                disabled={!isDivisionMember && !isLeadDev}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-zinc-700/50 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <div
                                className={`w-2 h-2 rounded-full ${getStatusColor(airport.status)}`}
                              ></div>
                              <div
                                className={`absolute inset-0 w-2 h-2 rounded-full ${getStatusColor(airport.status)} animate-pulse opacity-50`}
                                style={{ animationDuration: '3s' }}
                              ></div>
                            </div>
                            <span className="text-sm text-zinc-400">
                              {airport.status.charAt(0).toUpperCase() + airport.status.slice(1)}
                            </span>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[11px] ${
                              getDataSubmitted(airport)
                                ? 'text-emerald-300/80 bg-emerald-500/5'
                                : 'text-zinc-400/80 bg-zinc-800/40'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                getDataSubmitted(airport) ? 'bg-emerald-400/80' : 'bg-zinc-500/70'
                              }`}
                            ></span>
                            {getDataSubmitted(airport) ? 'Objects Added' : 'No objects yet'}
                          </span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Add Member Dialog */}
      <Dialog
        open={showAddMember && canManageMembers}
        onClose={() => {
          setShowAddMember(false);
          setNewMemberCid('');
          setNewMemberRole('nav_member');
        }}
        icon={Users}
        iconColor="blue"
        title="Add Member"
        closeOnBackdrop={!addingMember}
        closeOnEscape={!addingMember}
        isLoading={addingMember}
        maxWidth="md"
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">VATSIM CID</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d*"
                value={newMemberCid}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setNewMemberCid(digits);
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const paste = (e.clipboardData || window.clipboardData).getData('text') || '';
                  const digits = paste.replace(/\D/g, '');
                  if (digits) setNewMemberCid((prev) => (prev + digits).replace(/\D/g, ''));
                }}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                placeholder="Enter CID"
                autoFocus
                required
                disabled={addingMember}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Role</label>
              <Dropdown
                options={[
                  { value: 'nav_member', label: 'Nav Member' },
                  { value: 'nav_head', label: 'Nav Head' },
                ]}
                value={newMemberRole}
                onChange={(value) => setNewMemberRole(value)}
                disabled={addingMember}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2 justify-end">
            <Button
              type="submit"
              disabled={addingMember || !newMemberCid || !canManageMembers}
              className="disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addingMember ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Member
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowAddMember(false);
                setNewMemberCid('');
                setNewMemberRole('nav_member');
              }}
              disabled={addingMember}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Request Airport Dialog */}
      <Dialog
        open={showAddAirport && canRequestAirport}
        onClose={() => {
          setShowAddAirport(false);
          setNewAirportIcao('');
        }}
        icon={TowerControl}
        iconColor="blue"
        title="Request Airport"
        closeOnBackdrop={!addingAirport}
        closeOnEscape={!addingAirport}
        isLoading={addingAirport}
        maxWidth="sm"
      >
        <form onSubmit={handleAddAirport} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Airport ICAO</label>
            <input
              type="text"
              value={newAirportIcao}
              onChange={(e) => setNewAirportIcao(e.target.value.toUpperCase())}
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase"
              maxLength={4}
              pattern="[A-Za-z]{4}"
              autoFocus
              required
              disabled={addingAirport}
            />
            <p className="mt-2 text-xs text-zinc-500">
              Enter the 4-letter ICAO code for the airport.
            </p>
          </div>
          <div className="flex gap-3 pt-2 justify-end">
            <Button type="submit" disabled={addingAirport || newAirportIcao.length !== 4}>
              {addingAirport ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Request Airport
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowAddAirport(false);
                setNewAirportIcao('');
              }}
              disabled={addingAirport}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog
        open={showRemoveConfirm && !!memberToRemove && canManageMembers}
        onClose={cancelRemoveMember}
        icon={AlertOctagon}
        iconColor="red"
        title="Remove Member"
        description="This action cannot be undone. The user will immediately lose all access to the division and must be manually added at a later date if needed."
        closeOnBackdrop={!removingMember}
        closeOnEscape={!removingMember}
        isLoading={removingMember}
        maxWidth="md"
        buttons={[
          {
            label: 'Remove',
            variant: 'destructive',
            icon: UserX,
            loadingLabel: 'Removing...',
            requiresValidation: true,
            onClick: () => handleRemoveMember(memberToRemove?.vatsim_id),
          },
          {
            label: 'Cancel',
            variant: 'outline',
            onClick: cancelRemoveMember,
          },
        ]}
      />

      {/* Delete Airport Confirmation Dialog */}
      <Dialog
        open={showDeleteAirportConfirm && !!airportToDelete}
        onClose={cancelDeleteAirport}
        icon={AlertOctagon}
        iconColor="red"
        title="Delete Airport Request"
        description={`Are you sure you want to delete the request for ${airportToDelete?.icao}? This action cannot be undone.`}
        closeOnBackdrop={!deletingAirport}
        closeOnEscape={!deletingAirport}
        isLoading={deletingAirport}
        maxWidth="md"
        buttons={[
          {
            label: 'Delete',
            variant: 'destructive',
            icon: deletingAirport ? () => <Loader className="w-4 h-4 mr-2 animate-spin" /> : Trash2,
            loadingLabel: 'Deleting...',
            onClick: () => handleDeleteAirport(airportToDelete?.id),
          },
          {
            label: 'Cancel',
            variant: 'outline',
            onClick: cancelDeleteAirport,
          },
        ]}
      />

      {/* Map Preview Dialog */}
      <Dialog
        open={showMapPreview}
        onClose={closeMapPreview}
        icon={MapPreviewIcon}
        iconColor="blue"
        titleColor="blue"
        title={`Map Preview${mapAirport?.icao ? ` - ${mapAirport.icao}` : ''}`}
        maxWidth="2xl"
        closeOnBackdrop={false}
      >
        <div className="space-y-4">
          <div className="h-145 rounded-lg overflow-hidden border border-zinc-800 relative">
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10">
                <p className="text-sm text-red-400">{mapError}</p>
              </div>
            )}
            {mapLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/60 z-10">
                <Loader className="w-6 h-6 animate-spin text-zinc-300" />
              </div>
            )}

            {!mapError && (
              <Map
                ref={mapRef}
                {...mapViewState}
                onMove={(evt) => setMapViewState(evt.viewState)}
                onLoad={onMapLoad}
                onStyleData={(e) => addCapIcons(e.target)}
                mapStyle={SATELLITE_STYLE}
                style={{ width: '100%', height: '100%' }}
              >
                <NavigationControl position="top-left" />
                <ScaleControl />

                {lowerLinesSource && (
                  <Source id="preview-lower-lines-source" type="geojson" data={lowerLinesSource}>
                    <Layer
                      id="preview-lower-lines-outline-layer"
                      type="line"
                      paint={{
                        'line-width': 15,
                        'line-color': '#ffffff',
                        'line-opacity': 1,
                      }}
                      layout={{
                        'line-cap': 'round',
                        'line-join': 'round',
                        'line-sort-key': ['get', 'sortKey'],
                      }}
                    />
                    <Layer
                      id="preview-lower-lines-bottom-layer"
                      type="line"
                      paint={{
                        'line-width': 6,
                        'line-color': ['get', 'bottomColor'],
                        'line-offset': 2.75,
                      }}
                      layout={{
                        'line-cap': 'butt',
                        'line-join': 'round',
                        'line-sort-key': ['get', 'sortKey'],
                      }}
                    />
                    <Layer
                      id="preview-lower-lines-top-layer"
                      type="line"
                      paint={{
                        'line-width': 6,
                        'line-color': ['get', 'topColor'],
                        'line-offset': -2.75,
                      }}
                      layout={{
                        'line-cap': 'butt',
                        'line-join': 'round',
                        'line-sort-key': ['get', 'sortKey'],
                      }}
                    />
                  </Source>
                )}

                {lowerCapsSource && (
                  <Source id="preview-lower-caps-source" type="geojson" data={lowerCapsSource}>
                    <Layer
                      id="preview-lower-caps-layer"
                      type="symbol"
                      layout={{
                        'icon-image': ['get', 'icon'],
                        'icon-size': 11 / 32,
                        'icon-rotate': ['get', 'rotation'],
                        'icon-rotation-alignment': 'map',
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
                        'symbol-sort-key': ['get', 'sortKey'],
                      }}
                    />
                  </Source>
                )}

                {upperLinesSource && (
                  <Source id="preview-upper-lines-source" type="geojson" data={upperLinesSource}>
                    <Layer
                      id="preview-upper-lines-outline-layer"
                      type="line"
                      paint={{
                        'line-width': 15,
                        'line-color': '#ffffff',
                        'line-opacity': 1,
                      }}
                      layout={{
                        'line-cap': 'round',
                        'line-join': 'round',
                        'line-sort-key': ['get', 'sortKey'],
                      }}
                    />
                    <Layer
                      id="preview-upper-lines-bottom-layer"
                      type="line"
                      paint={{
                        'line-width': 6,
                        'line-color': ['get', 'bottomColor'],
                        'line-offset': 2.75,
                      }}
                      layout={{
                        'line-cap': 'butt',
                        'line-join': 'round',
                        'line-sort-key': ['get', 'sortKey'],
                      }}
                    />
                    <Layer
                      id="preview-upper-lines-top-layer"
                      type="line"
                      paint={{
                        'line-width': 6,
                        'line-color': ['get', 'topColor'],
                        'line-offset': -2.75,
                      }}
                      layout={{
                        'line-cap': 'butt',
                        'line-join': 'round',
                        'line-sort-key': ['get', 'sortKey'],
                      }}
                    />
                  </Source>
                )}

                {upperCapsSource && (
                  <Source id="preview-upper-caps-source" type="geojson" data={upperCapsSource}>
                    <Layer
                      id="preview-upper-caps-layer"
                      type="symbol"
                      layout={{
                        'icon-image': ['get', 'icon'],
                        'icon-size': 11 / 32,
                        'icon-rotate': ['get', 'rotation'],
                        'icon-rotation-alignment': 'map',
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
                        'symbol-sort-key': ['get', 'sortKey'],
                      }}
                    />
                  </Source>
                )}

                {mapMarkers.map((m) => (
                  <Marker
                    key={m.point.id}
                    longitude={m.longitude}
                    latitude={m.latitude}
                    anchor="center"
                  >
                    <PointMarkerIcon point={m.point} />
                  </Marker>
                ))}
              </Map>
            )}
          </div>

          {mapPoints.length === 0 && !mapLoading && !mapError && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm text-amber-300">
              No lighting points are available for this airport yet.
            </div>
          )}
        </div>
      </Dialog>

      <Toast
        show={showToast}
        title={toastConfig.title}
        description={toastConfig.description}
        variant={toastConfig.variant}
        onClose={() => setShowToast(false)}
      />
    </Layout>
  );
};

export default DivisionManagement;
