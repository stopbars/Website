import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { AlertCircle, ChevronLeft, ChevronRight, CopyIcon, Info, Loader, Check } from 'lucide-react';
import { MapContainer, TileLayer, Marker, LayersControl, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

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
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
});

const ContributeMap = () => {
  const { icao } = useParams();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [airport, setAirport] = useState(null);
  const [points, setPoints] = useState([]);
  const [activePointId, setActivePointId] = useState(null);
  const [mapCenter, setMapCenter] = useState([0, 0]);
  const [mapZoom] = useState(13);
  const [copiedId, setCopiedId] = useState(null);

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

  // Format color style for display
  const formatColorStyle = (color) => {
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch airport data from Stopbars API
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
          longitude: airportData.longitude
        });
        setMapCenter([airportData.latitude, airportData.longitude]);
        
        // Fetch points data for this airport
        const pointsResponse = await fetch(`https://v2.stopbars.com/airports/${icao}/points`);
        if (!pointsResponse.ok) {
          throw new Error('Failed to fetch points data');
        }
        const pointsData = await pointsResponse.json();
        
        // Transform points data to match our format
        const transformedPoints = pointsData.map(point => ({
          id: point.id,
          type: point.type,
          name: point.name,
          coordinates: point.coordinates,
          directionality: point.directionality,
          orientation: point.orientation,
          color: point.color || undefined,
          elevated: point.elevated,
          ihp: point.ihp
        }));
        
        setPoints(transformedPoints);
      } catch (err) {
        setError('Failed to load airport data. Please try again.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [icao]);

  const handleBack = () => {
    navigate('/contribute/new');
  };
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

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen pt-32 pb-20 flex items-center">
          <div className="w-full max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center">
                <Loader className="w-12 h-12 animate-spin text-zinc-400" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="min-h-screen pt-32 pb-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-center h-64">
              <Card className="p-6 max-w-lg w-full">
                <div className="flex items-center space-x-3 text-red-500 mb-4">
                  <AlertCircle className="w-6 h-6" />
                  <h2 className="text-xl font-medium">Error Loading Airport</h2>
                </div>
                <p className="text-zinc-300 mb-6">{error}</p>
                <Button onClick={handleBack}>
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Go Back
                </Button>
              </Card>
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
          <div className="mb-8">
            <div className="flex items-center space-x-2 mb-1">
              <Button variant="outline" onClick={handleBack} className="h-8 px-3">
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <h1 className="text-3xl font-bold">{airport.icao} Contribution</h1>
            </div>
            <p className="text-zinc-400">
              Step 2: Review existing points for {airport.name}
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {/* Map */}
              <div className="h-[600px] rounded-lg overflow-hidden border border-zinc-800">
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
                  
                  {/* Display existing points */}
                  {points.map(point => (
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
                          
                          <div className="bg-zinc-800/50 rounded px-3 py-2 mb-3 flex items-center justify-between">
                            <code className="text-sm text-zinc-300">{point.id}</code>
                            <button
                              onClick={(event) => handleCopyId(point.id, event)}
                              className={`text-zinc-400 hover:text-white transition-colors p-1 rounded ${copiedId === point.id ? 'text-green-500' : ''}`}
                              title="Copy ID"
                            >
                              {copiedId === point.id ? <Check className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                            </button>
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm text-zinc-400">Type:</span>
                              <span className="text-sm text-white">{formatType(point.type)}</span>
                            </div>

                            {point.type === 'stopbar' && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-sm text-zinc-400">Directionality:</span>
                                  <span className="text-sm text-white capitalize">{point.directionality}</span>
                                </div>

                                {point.directionality === 'uni-directional' && (
                                  <div className="flex justify-between">
                                    <span className="text-sm text-zinc-400">Orientation:</span>
                                    <span className="text-sm text-white capitalize">{point.orientation}</span>
                                  </div>
                                )}
                                
                                <div className="flex justify-between">
                                  <span className="text-sm text-zinc-400">Has Elevated Bar:</span>
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

                                {point.directionality === 'uni-directional' && (
                                  <div className="flex justify-between">
                                    <span className="text-sm text-zinc-400">Orientation:</span>
                                    <span className="text-sm text-white capitalize">{point.orientation}</span>
                                  </div>
                                )}

                                <div className="flex justify-between">
                                  <span className="text-sm text-zinc-400">Color Style:</span>
                                  <span className="text-sm text-white">{formatColorStyle(point.color)}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
              
              {/* Banner for when no points exist */}
              {points.length === 0 && (
                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center">
                  <AlertCircle className="w-5 h-5 text-amber-400 mr-3 flex-shrink-0" />
                  <p className="text-sm text-amber-400">
                    This airport currently has no points submitted by the owning division. Please check back later.
                  </p>
                </div>
              )}
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
              
              <div className="flex items-center mt-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <Info className="w-5 h-5 text-blue-400 mr-3 flex-shrink-0" />
                <p className="text-sm text-blue-400">
                  These are the existing mapped points for this airport, set by the Division. Your contribution will add support for a specific scenery package.
                </p>
              </div>
              
              {/* Continue button */}
              <Button 
                onClick={handleContinue}
                className="w-full"
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