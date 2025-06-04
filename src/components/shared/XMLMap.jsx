import { useState, useRef, useEffect} from 'react';
import PropTypes from 'prop-types';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, LayersControl, Polyline, Polygon } from 'react-leaflet';
import L from 'leaflet';
// Import geolib for proper geo calculations
import { computeDestinationPoint } from 'geolib';

const XMLMap = ({ xmlData, height = '600px', showPolyLines = false, showRemoveAreas = false }) => {
  const [parsedLights, setParsedLights] = useState([]);
  const [mapCenter, setMapCenter] = useState([0, 0]);
  const [mapZoom,] = useState(15);
  const [polylines, setPolylines] = useState([]);
  const [removeAreas, setRemoveAreas] = useState([]);
  const mapRef = useRef(null);

  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
    });

    const style = document.createElement('style');
    style.textContent = `
      .marker-container {
        position: relative;
        width: 24px;
        height: 24px;
        transform-origin: center center;
      }
      .marker-circle {
        position: relative;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2px solid #ffffff;
        overflow: hidden;
      }
      .marker-circle.split-stopbar {
        background: linear-gradient(0deg, var(--left-color) 50%, var(--right-color) 50%);
      }
      .marker-circle.split-leadon {
        background: linear-gradient(0deg, var(--left-color) 50%, var(--right-color) 50%);
      }
      .stopbar-marker {
        background-color: #ef4444;
      }
      .leadon-marker {
        background-color: #facc15;
      }
      .leadon-green-marker {
        background-color: #4ade80;
      }
      .stand-marker {
        background-color: #fbbf24;
      }
      .stand-marker.uni {
        background: linear-gradient(90deg, #fbbf24 50%, #6b7280 50%);
      }
      .marker-circle.taxiway-marker {
        background-color: #4ade80;
      }
      .marker-circle.taxiway-marker.uni {
        background: linear-gradient(90deg, #4ade80 50%, #6b7280 50%);
      }
      .remove-area {
        fill: rgba(255, 0, 0, 0.2);
        stroke: rgba(255, 0, 0, 0.5);
        stroke-width: 2;
      }
    `;
    document.head.appendChild(style);

    // If XML data is provided, parse it
    if (xmlData) {
      // Check if it's a BARS XML or a LightSupport XML
      if (xmlData.includes('BarsObject')) {
        const { lights, lines } = parseXML(xmlData);
        setParsedLights(lights);
        setPolylines(lines);
      } else if (xmlData.includes('LightSupport')) {
        const areas = parseRemoveAreasXML(xmlData);
        setRemoveAreas(areas);
      }
    }

    return () => {
      document.head.removeChild(style);
    };
  }, [xmlData]);
  // Parse LightSupport XML (remove areas)
  const parseRemoveAreasXML = (xmlString) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const supports = xmlDoc.getElementsByTagName("LightSupport");
    const areas = [];
    let firstPosition = null;

    for (let i = 0; i < supports.length; i++) {
      const support = supports[i];
      const lat = parseFloat(support.getAttribute("latitude"));
      const lng = parseFloat(support.getAttribute("longitude"));
      const width = parseFloat(support.getAttribute("width")); // Width in meters
      const length = parseFloat(support.getAttribute("length")); // Length in meters
      const heading = parseFloat(support.getAttribute("heading"));
      
      if (!firstPosition && !isNaN(lat) && !isNaN(lng)) {
        firstPosition = [lat, lng];
        setMapCenter(firstPosition);
      }
      
      // Create polygon corners based on center point, width, length and heading
      const polygon = calculateRectangleCorners(lat, lng, width, length, heading);
      
      if (polygon.length === 4) {
        areas.push({
          id: `support-${i}`,
          points: polygon
        });
      }
    }
    
    return areas;
  };

  // Calculate rectangle corners from center, dimensions and heading
  // using geolib to match backend calculations
  const calculateRectangleCorners = (centerLat, centerLng, widthMeters, lengthMeters, heading) => {
    // Define center point
    const center = { latitude: centerLat, longitude: centerLng };
    
    // Calculate half dimensions
    const halfWidth = widthMeters / 2;
    const halfLength = lengthMeters / 2;
    
    // Calculate corner positions using geolib's computeDestinationPoint
    // which matches the backend's calculateDestinationPoint function
    
    // Bottom left: Move from center by -halfLength and -halfWidth
    const bottomLeft = computeDestinationPoint(
      center,
      Math.sqrt(halfLength * halfLength + halfWidth * halfWidth),
      (heading + 225) % 360 // 225 degrees counterclockwise from heading
    );
    
    // Bottom right: Move from center by +halfLength and -halfWidth
    const bottomRight = computeDestinationPoint(
      center,
      Math.sqrt(halfLength * halfLength + halfWidth * halfWidth),
      (heading + 315) % 360 // 315 degrees counterclockwise from heading
    );
    
    // Top right: Move from center by +halfLength and +halfWidth
    const topRight = computeDestinationPoint(
      center,
      Math.sqrt(halfLength * halfLength + halfWidth * halfWidth),
      (heading + 45) % 360 // 45 degrees counterclockwise from heading
    );
    
    // Top left: Move from center by -halfLength and +halfWidth
    const topLeft = computeDestinationPoint(
      center,
      Math.sqrt(halfLength * halfLength + halfWidth * halfWidth),
      (heading + 135) % 360 // 135 degrees counterclockwise from heading
    );
    
    return [
      [bottomLeft.latitude, bottomLeft.longitude],
      [bottomRight.latitude, bottomRight.longitude],
      [topRight.latitude, topRight.longitude],
      [topLeft.latitude, topLeft.longitude]
    ];
  };
  // Parse standard BARS XML
  const parseXML = (xmlString) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const objects = xmlDoc.getElementsByTagName("BarsObject");
    const allLights = [];
    const objectGroups = {};
    let firstPosition = null;

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      const objId = obj.getAttribute("id");
      const objType = obj.getAttribute("type");
      const propsElement = obj.querySelector("Properties");
      const color = propsElement?.querySelector("Color")?.textContent || '';
      const orientation = propsElement?.querySelector("Orientation")?.textContent || '';
      const elevated = propsElement?.querySelector("Elevated")?.textContent === 'true';
      const lightElements = obj.getElementsByTagName("Light");
      
      // Create an array to store positions for this object (for polylines)
      objectGroups[objId] = {
        type: objType,
        positions: []
      };

      for (let j = 0; j < lightElements.length; j++) {
        const light = lightElements[j];
        const position = light.querySelector("Position")?.textContent.split(",");
        const heading = parseFloat(light.querySelector("Heading")?.textContent || "0");
        const lightProps = light.querySelector("Properties");
        const lightColor = lightProps?.querySelector("Color")?.textContent || color;
        const lightOrientation = lightProps?.querySelector("Orientation")?.textContent || orientation;
        const lightIHP = lightProps?.querySelector("IHP")?.textContent === 'true';
        const lightElevated = lightProps?.querySelector("Elevated")?.textContent === 'true' || elevated;

        if (position && position.length === 2) {
          const lat = parseFloat(position[0]);
          const lng = parseFloat(position[1]);
          if (!firstPosition) {
            firstPosition = [lat, lng];
          }
          
          // Add position to the object's positions array (for polylines)
          // Only include lights that are not elevated and not IHP
          if (!lightElevated && !lightIHP) {
            objectGroups[objId].positions.push([lat, lng]);
          }
          
          allLights.push({
            id: `${objId}_${j}`,
            position: [lat, lng],
            heading: heading,
            type: objType,
            color: lightColor,
            orientation: lightOrientation,
            elevated: lightElevated,
            IHP: lightIHP,
            objectId: objId,
            properties: lightProps ? {
              color: lightProps.querySelector("Color")?.textContent || null,
              orientation: lightProps.querySelector("Orientation")?.textContent || null,
              IHP: lightProps.querySelector("IHP")?.textContent || null,
              elevated: lightProps.querySelector("Elevated")?.textContent || null
            } : null
          });
        }
      }
    }

    if (firstPosition) {
      setMapCenter(firstPosition);
    }

    // Convert objectGroups to polylines array
    const lines = Object.keys(objectGroups).map(objId => {
      const group = objectGroups[objId];
      let color = '#ef4444'; // Default red
      
      // Set color based on object type
      if (group.type === 'taxiway') color = '#4ade80'; // Green
      else if (group.type === 'leadon') color = '#facc15'; // Yellow
      
      return {
        id: objId,
        positions: group.positions,
        type: group.type,
        color: color
      };
    });

    return { lights: allLights, lines: lines };
  };
  
  const createCustomIcon = (light) => {
    // Make sure we have a heading value, defaulting to 0 if not present
    const heading = typeof light.heading === 'number' ? light.heading : 0;
    // Apply rotation to the entire marker container
    const headingStyle = `transform: rotate(${heading}deg);`;
    
    let html = '';
    
    // Different display based on light type and properties
    if (light.type === 'stopbar') {
      // Check if this is an IHP (Intermediate Holding Position)
      const isIHP = light.properties?.IHP === 'true' || (typeof light.IHP === 'boolean' && light.IHP);
      // Determine color based on IHP status
      const stopbarColor = isIHP ? 'rgb(250, 204, 21)' : 'rgb(238, 49, 49)'; // Yellow for IHP, red for regular stopbar
      
      if (light.orientation === 'both' || !light.orientation) {
        // Regular stopbar - solid color (either red or yellow)
        html = `
          <div class="marker-container" style="${headingStyle}">
            <div class="marker-circle stopbar-marker" style="background-color: ${stopbarColor};">
              <div class="marker-heading-indicator"></div>
            </div>
          </div>
        `;
      } else {
        // Unidirectional stopbar - half colored, half gray
        html = `
          <div class="marker-container" style="${headingStyle}">
            <div class="marker-circle split-stopbar" style="--left-color:${stopbarColor}; --right-color:rgb(77, 77, 77);">
              <div class="marker-heading-indicator"></div>
            </div>
          </div>
        `;
      }
    } else if (light.type === 'leadon') {
      // Check if color property exists
      if (!light.color) {
        // No color property - make it fully green
        html = `
          <div class="marker-container" style="${headingStyle}">
            <div class="marker-circle leadon-green-marker">
              <div class="marker-heading-indicator"></div>
            </div>
          </div>
        `;
      } else if (light.color === 'yellow-green-uni') {
        // Yellow-green-uni leadon - half yellow, half green
        html = `
          <div class="marker-container" style="${headingStyle}">
            <div class="marker-circle split-leadon" style="--left-color:rgb(255, 212, 41); --right-color:rgb(65, 230, 125);">
              <div class="marker-heading-indicator"></div>
            </div>
          </div>
        `;
      } else if (light.color?.includes('green')) {
        // Green leadon - both halves green
        html = `
          <div class="marker-container" style="${headingStyle}">
            <div class="marker-circle leadon-green-marker">
              <div class="marker-heading-indicator"></div>
            </div>
          </div>
        `;
      } else {
        // Regular leadon - yellow
        html = `
          <div class="marker-container" style="${headingStyle}">
            <div class="marker-circle leadon-marker">
              <div class="marker-heading-indicator"></div>
            </div>
          </div>
        `;
      }
    } else if (light.type === 'stand') {
      // Stand lights are always unidirectional - half amber, half gray
      html = `
        <div class="marker-container" style="${headingStyle}">
          <div class="marker-circle split-stopbar" style="--left-color:#fbbf24; --right-color:rgb(77, 77, 77);">
            <div class="marker-heading-indicator"></div>
          </div>
        </div>
      `;    
    } else if (light.type === 'taxiway') {
      // Get properties from light object
      const lightProps = light.properties;
      const lightOrientation = lightProps?.orientation || light.orientation || 'both';
      
      // First check if this light has its own color in Properties
      const lightColor = (lightProps?.color || light.color || 'green').toLowerCase();
      
      // Color mappings for taxiway lights
      const colorMap = {
        'green': '#4ade80',
        'yellow': '#facc15',
        'blue': '#3b82f6',
        'orange': '#f97316'
      };
      
      // Check for uni-directional colors first
      if (lightColor.includes('-uni')) {
        // Extract the base color (before "-uni")
        const baseColor = lightColor.split('-uni')[0];
        const bgColor = colorMap[baseColor] || colorMap['green']; // Default to green if color not recognized
        
        // Unidirectional taxiway - half colored, half gray
        html = `
          <div class="marker-container" style="${headingStyle}">
            <div class="marker-circle split-stopbar" style="--left-color:${bgColor}; --right-color:rgb(77, 77, 77);">
              <div class="marker-heading-indicator"></div>
            </div>
          </div>
        `;
        
        return L.divIcon({
          className: 'custom-div-icon',
          html: html,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });
      }
      
      // Handle special split colors for taxiway lights
      if (lightColor.includes('-') && (lightOrientation === 'both' || !lightOrientation)) {
        const colors = lightColor.split('-');
        if (colors.length === 2) {
          const leftColor = colorMap[colors[0]] || colorMap['green'];
          const rightColor = colorMap[colors[1]] || colorMap['green'];
          
          html = `
            <div class="marker-container" style="${headingStyle}">
              <div class="marker-circle split-stopbar" style="--left-color:${leftColor}; --right-color:${rightColor};">
                <div class="marker-heading-indicator"></div>
            </div>
          </div>
        `;
          
          return L.divIcon({
            className: 'custom-div-icon',
            html: html,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
        }
      }
      
      // Handle single color taxiway lights
      const bgColor = colorMap[lightColor] || colorMap['green'];
      
      if (lightOrientation === 'both' || !lightOrientation) {
        // Regular taxiway - use the specific color
        html = `
          <div class="marker-container" style="${headingStyle}">
            <div class="marker-circle" style="background-color: ${bgColor}; border: 2px solid #ffffff;">
              <div class="marker-heading-indicator"></div>
            </div>
          </div>
        `;
      } else {
        // Unidirectional taxiway - half colored, half gray
        html = `
          <div class="marker-container" style="${headingStyle}">
            <div class="marker-circle split-stopbar" style="--left-color:${bgColor}; --right-color:rgb(77, 77, 77);">
              <div class="marker-heading-indicator"></div>
            </div>
          </div>
        `;
      }
    }

    return L.divIcon({
      className: 'custom-div-icon',
      html: html,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  };

  return (
    <div className="h-[600px] rounded-lg overflow-hidden" style={{ height }}>
      {(parsedLights.length > 0 || removeAreas.length > 0) ? (
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
                maxZoom={19}
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Satellite">
              <TileLayer
                attribution='Imagery &copy; <a href="https://www.mapbox.com/">Mapbox</a>'
                url={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${import.meta.env.VITE_MAPBOX_TOKEN}`}
                maxZoom={22}
              />
            </LayersControl.BaseLayer>
          </LayersControl>
          
          {/* Render remove areas if showing remove areas view */}
          {showRemoveAreas && removeAreas.map(area => (
            <Polygon
              key={area.id}
              positions={area.points}
              pathOptions={{ 
                fillColor: '#ef4444', 
                fillOpacity: 0.2, 
                weight: 1, 
                color: '#ef4444',
                opacity: 0.7
              }}
            />
          ))}
          
          {/* Render polylines if showing polylines view */}
          {showPolyLines && polylines.map(line => (
            <Polyline
              key={line.id}
              positions={line.positions}
              pathOptions={{
                color: line.color,
                weight: 2,
                opacity: 0.8
              }}
            />
          ))}
          
          {/* Always render the light markers in normal mode */}
          {!showRemoveAreas && parsedLights.map(light => (
            <Marker
              key={light.id}
              position={light.position}
              icon={createCustomIcon(light)}
            />
          ))}
        </MapContainer>
      ) : (
        <div className="flex items-center justify-center h-full bg-zinc-800/30">
          <p className="text-zinc-400">
            No XML data provided or no lights found in the XML
          </p>
        </div>
      )}
    </div>
  );
};

XMLMap.propTypes = {
  xmlData: PropTypes.string,
  height: PropTypes.string,
  showPolyLines: PropTypes.bool,
  showRemoveAreas: PropTypes.bool
};

export default XMLMap;
