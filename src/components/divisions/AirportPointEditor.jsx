import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../shared/Card';
import { Button } from '../shared/Button';
import { 
  AlertCircle, Trash2, Plus, 
  Edit2, ChevronDown, ChevronUp
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, LayersControl, useMapEvents, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import PropTypes from 'prop-types';


// Add Mapbox token from environment
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

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
          ${point.directionality === 'uni-directional' ? 
            (point.orientation === 'left' ? 
              '<div class="marker-quarter marker-quarter-4"></div>' : 
              '<div class="marker-quarter marker-quarter-1"></div>'
            ) : ''
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
      }
      else if (point.color === 'green-yellow') {
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
      }
      else if (point.color === 'green-blue') {
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
      }
      else if (point.color === 'green-orange') {
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
    }
    else if (point.directionality === 'uni-directional') {
      if (point.color === 'green') {
        html = `
        <div class="marker-container">
          <div class="marker-circle taxiway-green ${point.orientation || 'left'}">
            ${point.directionality === 'uni-directional' ? 
              (point.orientation === 'left' ? 
                `<div class="marker-quarter taxiway-quarter-L"></div>` : 
                `<div class="marker-quarter taxiway-quarter-R"></div>`
              ) : ''
            }
          </div>
        </div>
      `;
      }
      else if (point.color === 'green-yellow') {
          html = `
            <div class="marker-container">
              <div class="marker-circle ${point.orientation || 'left'}">
                ${point.directionality === 'uni-directional' ? 
                  (point.orientation === 'left' ? 
                    `
                    <div class="marker-quarter taxiway-yellow-quarter-1"></div>
                    <div class="marker-quarter taxiway-yellow-quarter-2"></div>
                    <div class="marker-quarter taxiway-yellow-quarter-3"></div>
                    <div class="marker-quarter taxiway-quarter-L"></div>` : 
                    `<div class="marker-quarter taxiway-quarter-R"></div>
                    <div class="marker-quarter taxiway-yellow-quarter-2"></div>
                    <div class="marker-quarter taxiway-yellow-quarter-3"></div>
                    <div class="marker-quarter taxiway-yellow-quarter-4"></div>`
                  ) : ''
                }
              </div>
            </div>
          `;
          }
      else if (point.color === 'green-blue') {
        html = `
        <div class="marker-container">
          <div class="marker-circle ${point.orientation || 'left'}">
            ${point.directionality === 'uni-directional' ? 
              (point.orientation === 'left' ? 
                `<div class="marker-quarter taxiway-blue-quarter-1"></div>
                <div class="marker-quarter taxiway-blue-quarter-2"></div>
                <div class="marker-quarter taxiway-blue-quarter-3"></div>
                <div class="marker-quarter taxiway-quarter-L"></div>` : 
                `<div class="marker-quarter taxiway-quarter-R"></div>
                <div class="marker-quarter taxiway-blue-quarter-2"></div>
                <div class="marker-quarter taxiway-blue-quarter-3"></div>
                <div class="marker-quarter taxiway-blue-quarter-4"></div>`
              ) : ''
            }
          </div>
        </div>
      `;    
      }
      else if (point.color === 'green-orange') {
        html = `
        <div class="marker-container">
          <div class="marker-circle ${point.orientation || 'left'}">
            ${point.directionality === 'uni-directional' ? 
              (point.orientation === 'left' ? 
                `<div class="marker-quarter taxiway-orange-quarter-1"></div>
                <div class="marker-quarter taxiway-orange-quarter-2"></div>
                <div class="marker-quarter taxiway-orange-quarter-3"></div>
                <div class="marker-quarter taxiway-quarter-L"></div>` : 
                `<div class="marker-quarter taxiway-quarter-R"></div>
                <div class="marker-quarter taxiway-orange-quarter-2"></div>
                <div class="marker-quarter taxiway-orange-quarter-3"></div>
                <div class="marker-quarter taxiway-orange-quarter-4"></div>`
              ) : ''
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
    popupAnchor: [0, -12]
  });
};



// Add required CSS styles
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
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
});



// Map click handler component
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click: (e) => {
      onMapClick(e);
    }
  });
  return null;
};

MapClickHandler.propTypes = {
  onMapClick: PropTypes.func.isRequired
};

const AirportPointEditor = () => {
  const { airportId } = useParams();
  const token = localStorage.getItem('vatsimToken');
  const mapRef = useRef(null);
  
  // State variables
  const [airport, setAirport] = useState(null);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activePointId, setActivePointId] = useState(null);
  const [mapCenter, setMapCenter] = useState([0, 0]);
  const [mapZoom,] = useState(13);
  const [addingPoint, setAddingPoint] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [editingPoint, setEditingPoint] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [newPoint, setNewPoint] = useState({
    type: 'stopbar',
    name: '',
    coordinates: null,
    directionality: 'uni-directional',
    orientation: 'left',
    color: 'green',
    elevated: false,
    ihp: false
  });
  // Update new point form when type changes
  const handleNewPointFieldChange = (field, value) => {
    setNewPoint(prev => {
      const updatedPoint = { ...prev, [field]: value };

      if (field === 'type') {
        // Reset fields based on type
        switch (value) {
          case 'stopbar':
            updatedPoint.directionality = 'uni-directional';
            updatedPoint.orientation = 'left';
            delete updatedPoint.color; // Remove color for stopbars
            break;
          case 'lead_on':
            delete updatedPoint.directionality;
            delete updatedPoint.orientation;
            delete updatedPoint.color; // Remove color for lead-on lights
            break;
          case 'taxiway':
            updatedPoint.directionality = 'bi-directional';
            delete updatedPoint.orientation; // Remove orientation for taxiways
            updatedPoint.color = 'green'; // Set default color for taxiway
            break;
          case 'stand':
            delete updatedPoint.directionality;
            delete updatedPoint.orientation;
            delete updatedPoint.color; // Remove color for stand lights
            break;
        }
      }

      // If changing directionality on a stopbar and it's bi-directional, force elevated to false and remove orientation
      if (field === 'directionality') {
        if (updatedPoint.type === 'stopbar' && value === 'bi-directional') {
          updatedPoint.elevated = false;
          delete updatedPoint.orientation;
        }
        // Always remove orientation for taxiway when changing directionality (for both uni and bi)
        if (updatedPoint.type === 'taxiway') {
          delete updatedPoint.orientation;
        }
      }

      return updatedPoint;
    });
  };
  // Handle field changes for edit form
  const handleEditFieldChange = (field, value) => {
    setEditForm(prev => {
      const updatedForm = { ...prev, [field]: value };

      if (field === 'type') {
        // Reset fields based on type
        switch (value) {
          case 'stopbar':
            updatedForm.directionality = 'uni-directional';
            updatedForm.orientation = 'left';
            delete updatedForm.color; // Remove color for stopbars
            break;
          case 'lead_on':
            delete updatedForm.directionality;
            delete updatedForm.orientation;
            delete updatedForm.color; // Remove color for lead-on lights
            break;
          case 'taxiway':
            updatedForm.directionality = 'bi-directional';
            delete updatedForm.orientation; // Remove orientation for taxiways
            updatedForm.color = 'green'; // Set default color for taxiway
            break;
          case 'stand':
            delete updatedForm.directionality;
            delete updatedForm.orientation;
            delete updatedForm.color; // Remove color for stand lights
            break;
        }
      }

      // If changing directionality on a stopbar and it's bi-directional, force elevated to false and remove orientation
      if (field === 'directionality') {
        if (updatedForm.type === 'stopbar' && value === 'bi-directional') {
          updatedForm.elevated = false;
          delete updatedForm.orientation;
        }
        // Always remove orientation for taxiway when changing directionality (for both uni and bi)
        if (updatedForm.type === 'taxiway') {
          delete updatedForm.orientation;
        }
      }

      return updatedForm;
    });
  };

  // Fetch airport and points data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch airport data
        const airportResponse = await fetch(`https://v2.stopbars.com/airports?icao=${airportId}`, {
          headers: { 'X-Vatsim-Token': `${token}` }
        });
        
        if (!airportResponse.ok) throw new Error('Failed to fetch airport data');
        const airportData = await airportResponse.json();
        setAirport(airportData);
        setMapCenter([airportData.latitude, airportData.longitude]);
        
        // Fetch points data
        const pointsResponse = await fetch(`https://v2.stopbars.com/airports/${airportId}/points`, {
          headers: { 'X-Vatsim-Token': `${token}` }
        });
        
        if (!pointsResponse.ok) throw new Error('Failed to fetch points data');
        const pointsData = await pointsResponse.json();
        setPoints(pointsData || []); // Removed .points since backend returns array directly
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    if (airportId && token) {
      fetchData();
    }
  }, [airportId, token]);

  // Update map click to set single point instead of array
  const handleMapClick = (e) => {
    if (!addingPoint && !editingPoint) return;
    
    const { lat, lng } = e.latlng;
    if (editingPoint) {
      setEditForm(prev => ({
        ...prev,
        coordinates: { lat, lng }
      }));
    } else if (addingPoint) {
      setNewPoint(prev => ({
        ...prev,
        coordinates: { lat, lng }
      }));
    }
  };
  // Adjust the payload to exclude unnecessary fields based on type
  const preparePointPayload = (point) => {
    const payload = { ...point };

    if (point.type === 'stopbar') {
      if (point.directionality !== 'uni-directional') {
        delete payload.orientation; // Remove orientation if not uni-directional
      }
      delete payload.color; // Remove color for stopbar
    }
    if (point.type === 'taxiway') {
      if (point.directionality === 'uni-directional') {
        delete payload.orientation; // Remove orientation for uni-directional taxiway
      }
    }
    if (point.type === 'lead_on') {
      delete payload.color; // Remove color for lead-on light
    }
    return payload;
  };

  // Save a new point
  const handleSavePoint = async () => {
    try {
      setLoading(true);

      const payload = preparePointPayload({
        ...newPoint
      });

      const response = await fetch(`https://v2.stopbars.com/airports/${airportId}/points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vatsim-Token': `${token}`
        },
        body: JSON.stringify({
          ...payload,
          airportId // Add airportId to match backend schema
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save point');
      }

      const savedPoint = await response.json();
      setPoints(prev => [...prev, savedPoint]);
      setSuccess('Point added successfully!');

      // Reset form
      setAddingPoint(false);
      setNewPoint({
        type: 'stopbar',
        name: '',
        coordinates: null,
        directionality: 'uni-directional',
        orientation: 'left',
        color: 'red'
      });

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Delete a point
  const handleDeletePoint = async (pointId) => {
    try {
      setLoading(true);
      
      const response = await fetch(`https://v2.stopbars.com/airports/${airportId}/points/${pointId}`, {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': `${token}` }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete point');
      }
      
      setPoints(prev => prev.filter(p => p.id !== pointId));
      setSuccess('Point deleted successfully!');
      setShowConfirmDelete(false);
      setActivePointId(null);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Update a point
  const handleUpdatePoint = async () => {
    try {
      setLoading(true);
      
      const payload = preparePointPayload(editForm);

      const response = await fetch(`https://v2.stopbars.com/airports/${airportId}/points/${editingPoint.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Vatsim-Token': `${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update point');
      }
      
      const updatedPoint = await response.json();
      setPoints(prev => prev.map(p => p.id === updatedPoint.id ? updatedPoint : p));
      setSuccess('Point updated successfully');
      setEditingPoint(null);
      setEditForm(null);
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Cancel point creation
  const handleCancelAddPoint = () => {
    setAddingPoint(false);
    setNewPoint({
      type: 'stopbar',
      name: '',
      coordinates: null,
      directionality: 'uni-directional',
      orientation: 'left',
      color: 'red'
    });
  };

  // Format type for display
  const formatType = (type) => {
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

  // Add new helper function for taxiway colors
  const formatTaxiwayColor = (color) => {
    switch (color) {
      case 'green':
        return 'Normal (Green)';
      case 'green-yellow':
        return 'Enhanced (Green-Yellow)';
      case 'green-blue':
        return 'Blue (Green-Blue)';
      case 'green-orange':
        return 'Orange (Green-Orange)';
      default:
        return color;
    }
  };

  // Function to start editing a point
  const startEditing = (point) => {
    // First set editing point and form
    setEditingPoint(point);
    setEditForm({ ...point });
    
    // Center map on the point's current location
    if (mapRef.current) {
      mapRef.current.setView(
        [point.coordinates.lat, point.coordinates.lng],
        mapRef.current.getZoom()
      );
    }
    
    // Prevent any click events for 100ms to avoid position snap
    setTimeout(() => {
      const mapContainer = document.querySelector('.leaflet-container');
      if (mapContainer) {
        mapContainer.classList.add('editing-mode');
      }
    }, 100);
  };

  // Function to cancel editing a point
  const handleCancelEdit = () => {
    setEditingPoint(null);
    setEditForm(null);
  };

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000); // Dismiss after 5 seconds
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Update the map container class based on editing state
  useEffect(() => {
    const mapContainer = document.querySelector('.leaflet-container');
    if (mapContainer) {
      if (addingPoint || editingPoint) {
        mapContainer.classList.add('editing-mode');
      } else {
        mapContainer.classList.remove('editing-mode');
      }
    }
  }, [addingPoint, editingPoint]);

  if (loading && !airport) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-6rem)] p-6 pt-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{airport?.icao || airportId} Points Editor</h1>
          <p className="text-zinc-400 text-sm">Manage points for BARS system integration</p>
        </div>
        <Button
          onClick={() => setAddingPoint(true)}
          disabled={addingPoint}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Point
        </Button>
      </div>

      {/* Success/Error messages */}
      {success && (
        <div className="fixed bottom-8 left-8 p-4 bg-emerald-500/10 border border-emerald-500 rounded-lg z-50 animate-in fade-in slide-in-from-bottom-4">
          <p className="text-emerald-500">{success}</p>
        </div>
      )}
      {error && (
        <div className="fixed bottom-8 left-8 p-4 bg-red-500/10 border border-red-500 rounded-lg z-50 animate-in fade-in slide-in-from-bottom-4">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {/* Main content - split view with map taking more space */}
      <div className="grid grid-cols-[3fr_2fr] gap-6 h-[calc(100%-4rem)]">
        {/* Left side - Map */}
        <div className="rounded-lg overflow-hidden border border-zinc-800">
          <MapContainer 
            center={mapCenter} 
            zoom={mapZoom} 
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Street Map">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer
                  attribution='Imagery &copy; <a href="https://www.mapbox.com/">Mapbox</a>'
                  url={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`}

                />
              </LayersControl.BaseLayer>
            </LayersControl>
            <MapClickHandler onMapClick={handleMapClick} />
            
            {/* Display existing points */}
            {points
            .filter(point => !editingPoint || point.id !== editingPoint.id)
            .map(point => (
              <Marker
                key={point.id}
                position={[point.coordinates.lat, point.coordinates.lng]}
                icon={createCustomIcon(point)}
                eventHandlers={{
                  click: () => {
                    setActivePointId(point.id === activePointId ? null : point.id);
                    if (mapRef.current) {
                      mapRef.current.setView(
                        [point.coordinates.lat, point.coordinates.lng],
                        mapRef.current.getZoom()
                      );
                    }
                  },
                  popupclose: () => {
                    setActivePointId(null);
                  }
                }}
              >
                <Popup 
                  className="custom-popup"
                  onClose={() => setActivePointId(null)}
                >
                  <div className="p-3 -m-3 bg-zinc-900 rounded-lg shadow-lg">
                    <h3 className="font-bold text-white mb-1">{point.name}</h3>
                    <div className="space-y-0 mb-3">
                      <p className="text-sm text-zinc-400">Type: {formatType(point.type)}</p>
                      <p className="text-sm text-zinc-400">BARS ID: {point.id}</p>
                      {point.type === 'stopbar' && (
                        <>
                          {point.directionality === 'uni-directional' && (
                            <p className="text-sm text-zinc-400">
                              Orientation: {point.orientation === 'left' ? 'Left' : 'Right'}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(point);
                        }}
                      >
                        <Edit2 className="w-3 h-3 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-red-500 hover:bg-red-500/10 hover:border-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePointId(point.id);
                          setShowConfirmDelete(true);
                        }}
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {/* Display temporary marker for new point or edit */}
            {((addingPoint && newPoint.coordinates) || (editingPoint && editForm?.coordinates)) && (
              <Marker 
                position={[
                  editForm?.coordinates?.lat || newPoint.coordinates.lat,
                  editForm?.coordinates?.lng || newPoint.coordinates.lng
                ]}
                icon={createCustomIcon(editForm || newPoint)}
              />
            )}
          </MapContainer>
        </div>

        {/* Right side - Points list */}
        <div className="space-y-6 overflow-y-auto">
          {/* Edit form */}
          {editingPoint && editForm && (
            <Card>
              <CardHeader>
                <CardTitle>Edit Point: {editingPoint.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Point type */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Point Type</label>
                    <select
                      value={editForm.type}
                      onChange={e => handleEditFieldChange('type', e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      <option value="stopbar">Stopbar</option>
                      <option value="lead_on">Lead-On Light</option>
                      <option value="taxiway">Taxiway Segment</option>
                      <option value="stand">Stand Lead-On Light</option>
                    </select>
                  </div>
                  
                  {/* Point name */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Point Name</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={e => handleEditFieldChange('name', e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                      placeholder="e.g., A1, B2, etc."
                    />
                  </div>
                
                  
                  {editForm.type === 'stopbar' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">Directionality</label>
                        <select
                          value={editForm.directionality}
                          onChange={e => handleEditFieldChange('directionality', e.target.value)}
                          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                        >
                          <option value="uni-directional">Uni-directional</option>
                          <option value="bi-directional">Bi-directional</option>
                        </select>
                      </div>
                      
                      {/* Only show orientation for uni-directional */}
                      {editForm.directionality === 'uni-directional' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium mb-2">Orientation</label>
                            <select
                              value={editForm.orientation}
                              onChange={e => handleEditFieldChange('orientation', e.target.value)}
                              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                            >
                              <option value="left">Left</option>
                              <option value="right">Right</option>
                            </select>
                          </div>

                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="edit-elevated"
                              checked={editForm.elevated || false}
                              onChange={e => handleEditFieldChange('elevated', e.target.checked)}
                              className="w-4 h-4 rounded border-zinc-700 bg-zinc-800"
                            />
                            <label htmlFor="edit-elevated" className="text-sm font-medium">
                              Has Elevated Bar
                            </label>
                          </div>
                        </>
                      )}

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="edit-ihp"
                          checked={editForm.ihp || false}
                          onChange={e => handleEditFieldChange('ihp', e.target.checked)}
                          className="w-4 h-4 rounded border-zinc-700 bg-zinc-800"
                        />
                        <label htmlFor="edit-ihp" className="text-sm font-medium">
                          Is Intermediate Holding Point
                        </label>
                      </div>
                    </>
                  )}                  {editForm.type === 'taxiway' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">Directionality</label>
                        <select
                          value={editForm.directionality}
                          onChange={e => handleEditFieldChange('directionality', e.target.value)}
                          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                        >
                          <option value="uni-directional">Uni-directional</option>
                          <option value="bi-directional">Bi-directional</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Color Style</label>
                        <select
                          value={editForm.color}
                          onChange={e => handleEditFieldChange('color', e.target.value)}
                          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                        >
                          <option value="green">Normal (Green)</option>
                          <option value="green-yellow">Enhanced (Green-Yellow)</option>
                          <option value="green-blue">Blue (Green-Blue)</option>
                          <option value="green-orange">Orange (Green-Orange)</option>
                        </select>
                      </div>
                    </>
                  )}
                  
                  {/* Map instructions */}
                  <div className="p-4 bg-blue-500/10 border border-blue-500 rounded-lg">
                    <p className="text-blue-400 text-sm">Click on the map to move the point to a new position.</p>
                  </div>

                  {/* Point coordinates display */}
                  <div className="p-4 bg-zinc-800/50 rounded-lg">
                    <p className="text-sm font-medium mb-2">Current Position:</p>
                    <p className="text-sm text-zinc-400">
                      [{editForm.coordinates.lat.toFixed(6)}, {editForm.coordinates.lng.toFixed(6)}]
                    </p>
                  </div>
                  
                  {/* Form actions */}
                  <div className="flex justify-end space-x-4 pt-4">
                    <Button
                      variant="outline"
                      onClick={handleCancelEdit}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!editForm.name || !editForm.coordinates}
                      onClick={handleUpdatePoint}
                    >
                      Save Changes
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Add point form - show only when not editing */}
          {addingPoint && !editingPoint && (
            <Card>
              <CardHeader>
                <CardTitle>Add New Point</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Point type */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Point Type</label>
                    <select
                      value={newPoint.type}
                      onChange={e => handleNewPointFieldChange('type', e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      <option value="stopbar">Stopbar</option>
                      <option value="lead_on">Lead-On Light</option>
                      <option value="taxiway">Taxiway Segment</option>
                      <option value="stand">Stand Lead-On Light</option>
                    </select>
                  </div>
                  
                  {/* Point name */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Point Name</label>
                    <input
                      type="text"
                      value={newPoint.name}
                      onChange={e => setNewPoint({...newPoint, name: e.target.value})}
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                      placeholder="e.g., A1, B2, etc."
                    />
                  </div>
                  
                  
                  {newPoint.type === 'stopbar' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">Directionality</label>
                        <select
                          value={newPoint.directionality}
                          onChange={e => handleNewPointFieldChange('directionality', e.target.value)}
                          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                        >
                          <option value="uni-directional">Uni-directional</option>
                          <option value="bi-directional">Bi-directional</option>
                        </select>
                      </div>
                      
                      {/* Only show orientation and elevated for uni-directional */}
                      {newPoint.directionality === 'uni-directional' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium mb-2">Orientation</label>
                            <select
                              value={newPoint.orientation}
                              onChange={e => setNewPoint({...newPoint, orientation: e.target.value})}
                              className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                            >
                              <option value="left">Left</option>
                              <option value="right">Right</option>
                            </select>
                          </div>

                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="new-elevated"
                              checked={newPoint.elevated || false}
                              onChange={e => handleNewPointFieldChange('elevated', e.target.checked)}
                              className="w-4 h-4 rounded border-zinc-700 bg-zinc-800"
                            />
                            <label htmlFor="new-elevated" className="text-sm font-medium">
                              Has Elevated Bar
                            </label>
                          </div>
                        </>
                      )}

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="new-ihp"
                          checked={newPoint.ihp || false}
                          onChange={e => handleNewPointFieldChange('ihp', e.target.checked)}
                          className="w-4 h-4 rounded border-zinc-700 bg-zinc-800"
                        />
                        <label htmlFor="new-ihp" className="text-sm font-medium">
                          Is Intermediate Holding Point
                        </label>
                      </div>
                    </>
                  )}                      {newPoint.type === 'taxiway' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">Directionality</label>
                        <select
                          value={newPoint.directionality}
                          onChange={e => handleNewPointFieldChange('directionality', e.target.value)}
                          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                        >
                          <option value="uni-directional">Uni-directional</option>
                          <option value="bi-directional">Bi-directional</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Color Style</label>
                        <select
                          value={newPoint.color}
                          onChange={e => handleNewPointFieldChange('color', e.target.value)}
                          className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                        >
                          <option value="green">Normal (Green)</option>
                          <option value="green-yellow">Enhanced (Green-Yellow)</option>
                          <option value="green-blue">Blue (Green-Blue)</option>
                          <option value="green-orange">Orange (Green-Orange)</option>
                        </select>
                      </div>
                    </>
                  )}
                  
                  {/* Map instructions */}
                  <div className="p-4 bg-blue-500/10 border border-blue-500 rounded-lg">
                    <p className="text-blue-400 text-sm">Click on the map to place the point.</p>
                  </div>

                  {/* Point coordinates display */}
                  {newPoint.coordinates && (
                    <div className="p-4 bg-zinc-800/50 rounded-lg">
                      <p className="text-sm font-medium mb-2">Selected Position:</p>
                      <p className="text-sm text-zinc-400">
                        [{newPoint.coordinates.lat.toFixed(6)}, {newPoint.coordinates.lng.toFixed(6)}]
                      </p>
                    </div>
                  )}
                  
                  {/* Form actions */}
                  <div className="flex justify-end space-x-4 pt-4">
                    <Button
                      variant="outline"
                      onClick={handleCancelAddPoint}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!newPoint.name || !newPoint.coordinates}
                      onClick={handleSavePoint}
                    >
                      Save Point
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Points list - show only when not editing */}
          {!editingPoint && (
            <Card>
              <CardHeader>
                <CardTitle>Managed Points</CardTitle>
              </CardHeader>
              <CardContent>
                {points.length === 0 ? (
                  <div className="p-4 bg-zinc-800 rounded-lg text-center">
                    <p className="text-zinc-400">No points added yet. Add your first point to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {points.map(point => (
                      <div key={point.id} className="p-4 border rounded-lg transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: getPointColor(point) }}
                            ></div>
                            <div>
                              <h3 className="font-medium">{point.name}</h3>
                              <p className="text-xs text-zinc-400">
                                {formatType(point.type)} • BARS ID: {point.id}
                              </p>
                            </div>
                          </div>
                          {/* Show expand/collapse and edit buttons when not expanded */}
                          {activePointId !== point.id && (
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="outline"
                                className="h-8"
                                onClick={() => {
                                  setActivePointId(point.id);
                                  // Center map on this point
                                  if (mapRef.current) {
                                    mapRef.current.setView(
                                      [point.coordinates.lat, point.coordinates.lng],
                                      17
                                    );
                                  }
                                }}
                              >
                                <ChevronDown className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                className="h-8"
                                onClick={() => startEditing(point)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                          {/* Show collapse button when expanded */}
                          {activePointId === point.id && (
                            <Button
                              variant="outline"
                              className="h-8"
                              onClick={() => setActivePointId(null)}
                            >
                              <ChevronUp className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        
                        {/* Point details when expanded */}
                        {activePointId === point.id && (
                          <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                            {/* Point details */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-zinc-400">Type:</p>
                                <p>{formatType(point.type)}</p>
                              </div>
                              {(point.type === 'stopbar' || point.type === 'taxiway') && (
                                <>
                                  <div>
                                    <p className="text-zinc-400">Directionality:</p>
                                    <p>{point.directionality === 'uni-directional' ? 'Uni-directional' : 'Bi-directional'}</p>
                                  </div>
                                  {point.directionality === 'uni-directional' && (
                                    <div>
                                      <p className="text-zinc-400">Orientation:</p>
                                      <p>{point.orientation === 'left' ? 'Left' : 'Right'}</p>
                                    </div>
                                  )}
                                </>
                              )}
                              {point.type === 'stopbar' && (
                                <>
                                  {point.directionality === 'uni-directional' && (
                                    <div>
                                      <p className="text-zinc-400">Elevated Bar:</p>
                                      <p>{point.elevated ? 'Yes' : 'No'}</p>
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-zinc-400">IHP:</p>
                                    <p>{point.ihp ? 'Yes' : 'No'}</p>
                                  </div>
                                </>
                              )}
                              {point.type === 'taxiway' && (
                                <div>
                                  <p className="text-zinc-400">Color Style:</p>
                                  <p>{formatTaxiwayColor(point.color)}</p>
                                </div>
                              )}
                            </div>

                            {/* Coordinates */}
                            <div>
                              <p className="text-zinc-400 text-sm">Position:</p>
                              <p className="text-sm">
                                [{point.coordinates.lat.toFixed(6)}, {point.coordinates.lng.toFixed(6)}]
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end space-x-3">
                              <Button
                                variant="outline"
                                onClick={() => startEditing(point)}
                              >
                                <Edit2 className="w-4 h-4 mr-2" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                className="text-red-500 hover:bg-red-500/10 hover:border-red-500"
                                onClick={() => {
                                  setActivePointId(point.id);
                                  setShowConfirmDelete(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showConfirmDelete && activePointId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full border border-zinc-800">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-red-500" />
              <h3 className="text-xl font-medium">Confirm Deletion</h3>
            </div>
            <p className="text-zinc-300 mb-6">
              Are you sure you want to delete this point? This action cannot be undone and will cause 
              any scenery contribution using this BARS ID to no longer function correctly.
            </p>
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setShowConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={() => handleDeletePoint(activePointId)}
              >
                Delete Point
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AirportPointEditor;