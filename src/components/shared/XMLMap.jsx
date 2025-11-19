import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import Map, { Source, Layer, NavigationControl, ScaleControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Layers } from 'lucide-react';
import { computeDestinationPoint } from 'geolib';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

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

const LIGHT_SORT_PRIORITY = {
  stopbar: 400,
  lead_on: 300,
  stand: 200,
  taxiway: 100,
};

const XMLMap = ({ xmlData, height = '600px', showPolyLines = false, showRemoveAreas = false }) => {
  const [parsedLights, setParsedLights] = useState([]);
  const [viewState, setViewState] = useState({
    longitude: 0,
    latitude: 0,
    zoom: 15,
  });
  const [polylines, setPolylines] = useState([]);
  const [removeAreas, setRemoveAreas] = useState([]);
  const [mapStyle, setMapStyle] = useState(SATELLITE_STYLE);
  const [styleName, setStyleName] = useState('Satellite');
  const mapRef = useRef(null);
  const pendingBoundsRef = useRef(null);

  const fitMapToBounds = useCallback((bounds) => {
    if (!bounds) return;
    const mapInstance = mapRef.current?.getMap();
    const isReady =
      mapInstance &&
      (typeof mapInstance.isStyleLoaded === 'function'
        ? mapInstance.isStyleLoaded()
        : mapInstance?.loaded?.());

    if (isReady) {
      mapInstance.fitBounds(bounds, { padding: 48, duration: 0 });
      pendingBoundsRef.current = null;
    } else {
      pendingBoundsRef.current = bounds;
    }
  }, []);

  const getLightAppearance = useCallback((light) => {
    const heading = typeof light.heading === 'number' ? light.heading : 0;
    let type = 'solid';
    let color1 = '#cccccc';
    let color2 = '#cccccc';

    if (light.type === 'stopbar') {
      const isIHP =
        light.properties?.IHP === 'true' || (typeof light.IHP === 'boolean' && light.IHP);
      const stopbarColor = isIHP ? 'rgb(250, 204, 21)' : 'rgb(238, 49, 49)';
      const rawDirectionality = (
        light.properties?.directionality ||
        light.directionality ||
        ''
      ).toLowerCase();
      const isBi = rawDirectionality === 'bi-directional' || rawDirectionality === 'bi';

      if (isBi) {
        type = 'solid';
        color1 = stopbarColor;
      } else {
        type = 'split';
        color1 = stopbarColor;
        color2 = 'rgb(77, 77, 77)';
      }
    } else if (light.type === 'lead_on') {
      if (!light.color) {
        type = 'solid';
        color1 = '#4ade80';
      } else if (light.color === 'yellow-green-uni') {
        type = 'split';
        color1 = 'rgb(255, 212, 41)';
        color2 = 'rgb(65, 230, 125)';
      } else if (light.color?.includes('green')) {
        type = 'solid';
        color1 = '#4ade80';
      } else {
        type = 'solid';
        color1 = '#facc15';
      }
    } else if (light.type === 'stand') {
      type = 'split';
      color1 = '#fbbf24';
      color2 = 'rgb(77, 77, 77)';
    } else if (light.type === 'taxiway') {
      const lightProps = light.properties;
      const lightOrientation = lightProps?.orientation || light.orientation || 'both';
      const lightColor = (lightProps?.color || light.color || 'green').toLowerCase();

      const colorMap = {
        green: '#4ade80',
        yellow: '#facc15',
        blue: '#3b82f6',
        orange: '#f97316',
      };

      if (lightColor.includes('-uni')) {
        const baseColor = lightColor.split('-uni')[0];
        const bgColor = colorMap[baseColor] || colorMap['green'];
        type = 'split';
        color1 = bgColor;
        color2 = 'rgb(77, 77, 77)';
      } else if (lightColor.includes('-') && (lightOrientation === 'both' || !lightOrientation)) {
        const colors = lightColor.split('-');
        if (colors.length === 2) {
          type = 'split';
          color1 = colorMap[colors[0]] || colorMap['green'];
          color2 = colorMap[colors[1]] || colorMap['green'];
        }
      } else {
        const bgColor = colorMap[lightColor] || colorMap['green'];
        if (lightOrientation === 'both' || !lightOrientation) {
          type = 'solid';
          color1 = bgColor;
        } else {
          type = 'split';
          color1 = bgColor;
          color2 = 'rgb(77, 77, 77)';
        }
      }
    }

    return { type, color1, color2, heading };
  }, []);

  const createMarkerImage = useCallback((type, color1, color2) => {
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const center = size / 2;
    const radius = (size - 4) / 2;

    ctx.beginPath();
    ctx.arc(center, center, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    if (type === 'solid') {
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fillStyle = color1;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(center, center, radius, Math.PI, 0);
      ctx.fillStyle = color2;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI);
      ctx.fillStyle = color1;
      ctx.fill();
    }

    return ctx.getImageData(0, 0, size, size);
  }, []);

  const lightGeoJSON = useMemo(() => {
    if (!parsedLights.length) return null;

    const features = parsedLights.map((light, index) => {
      const { type, color1, color2, heading } = getLightAppearance(light);
      const c1 = color1.replace(/[^\w]/g, '');
      const c2 = color2.replace(/[^\w]/g, '');
      const iconId = `marker-${type}-${c1}-${c2}`;
      const basePriority = LIGHT_SORT_PRIORITY[light.type] || 0;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: light.position,
        },
        properties: {
          id: light.id,
          heading: heading,
          icon: iconId,
          styleType: type,
          color1,
          color2,
          pointType: light.type,
          sortKey: basePriority * 1_000 + index,
        },
      };
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  }, [parsedLights, getLightAppearance]);

  const updateMapImages = useCallback(
    (map) => {
      if (!map || !lightGeoJSON) return;

      const checkedIcons = new Set();

      lightGeoJSON.features.forEach((feature) => {
        const { icon, styleType, color1, color2 } = feature.properties;
        if (!checkedIcons.has(icon)) {
          checkedIcons.add(icon);
          if (!map.hasImage(icon)) {
            const image = createMarkerImage(styleType, color1, color2);
            map.addImage(icon, image, { pixelRatio: 1 });
          }
        }
      });
    },
    [lightGeoJSON, createMarkerImage]
  );

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map) {
      updateMapImages(map);
    }
  }, [updateMapImages]);

  const calculateRectangleCorners = useCallback(
    (centerLat, centerLng, widthMeters, lengthMeters, heading) => {
      const center = { latitude: centerLat, longitude: centerLng };
      const halfWidth = widthMeters / 2;
      const halfLength = lengthMeters / 2;
      const distance = Math.sqrt(halfLength * halfLength + halfWidth * halfWidth);
      const bottomLeft = computeDestinationPoint(center, distance, (heading + 225) % 360);
      const bottomRight = computeDestinationPoint(center, distance, (heading + 315) % 360);
      const topRight = computeDestinationPoint(center, distance, (heading + 45) % 360);
      const topLeft = computeDestinationPoint(center, distance, (heading + 135) % 360);
      return [
        [bottomLeft.longitude, bottomLeft.latitude],
        [bottomRight.longitude, bottomRight.latitude],
        [topRight.longitude, topRight.latitude],
        [topLeft.longitude, topLeft.latitude],
        [bottomLeft.longitude, bottomLeft.latitude],
      ];
    },
    []
  );

  const parseRemoveAreasXML = useCallback(
    (xmlString) => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
      const supports = xmlDoc.getElementsByTagName('LightSupport');
      const areas = [];
      let firstPosition = null;

      for (let i = 0; i < supports.length; i++) {
        const support = supports[i];
        const lat = parseFloat(support.getAttribute('latitude'));
        const lng = parseFloat(support.getAttribute('longitude'));
        const width = parseFloat(support.getAttribute('width'));
        const length = parseFloat(support.getAttribute('length'));
        const heading = parseFloat(support.getAttribute('heading'));

        if (!firstPosition && !isNaN(lat) && !isNaN(lng)) {
          firstPosition = [lng, lat];
        }

        const polygon = calculateRectangleCorners(lat, lng, width, length, heading);

        if (polygon.length === 5) {
          areas.push({
            id: `support-${i}`,
            points: polygon,
          });
        }
      }

      return { areas, center: firstPosition };
    },
    [calculateRectangleCorners]
  );

  const parseXML = useCallback((xmlString) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    const objects = xmlDoc.getElementsByTagName('BarsObject');
    const allLights = [];
    const usedIds = new Set();
    const objectGroups = {};
    let firstPosition = null;

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      const objId = obj.getAttribute('id');
      const objType = obj.getAttribute('type');
      const propsElement = obj.querySelector('Properties');
      const color = propsElement?.querySelector('Color')?.textContent || '';
      const directionality =
        propsElement?.querySelector('Directionality')?.textContent?.toLowerCase() || '';
      const orientation = propsElement?.querySelector('Orientation')?.textContent || '';
      const elevated = propsElement?.querySelector('Elevated')?.textContent === 'true';
      const lightElements = obj.getElementsByTagName('Light');

      objectGroups[objId] = {
        type: objType,
        positions: [],
      };

      for (let j = 0; j < lightElements.length; j++) {
        const light = lightElements[j];
        const position = light.querySelector('Position')?.textContent.split(',');
        const heading = parseFloat(light.querySelector('Heading')?.textContent || '0');
        const lightProps = light.querySelector('Properties');
        const lightColor = lightProps?.querySelector('Color')?.textContent || color;
        const lightOrientation =
          lightProps?.querySelector('Orientation')?.textContent || orientation;
        const lightDirectionality =
          lightProps?.querySelector('Directionality')?.textContent?.toLowerCase() || directionality;
        const lightIHP = lightProps?.querySelector('IHP')?.textContent === 'true';
        const lightElevated =
          lightProps?.querySelector('Elevated')?.textContent === 'true' || elevated;

        if (position && position.length === 2) {
          const lat = parseFloat(position[0]);
          const lng = parseFloat(position[1]);
          if (!firstPosition) {
            firstPosition = [lng, lat];
          }

          if (!lightElevated && !lightIHP) {
            objectGroups[objId].positions.push([lng, lat]);
          }

          const baseId = `${objId}_${j}`;
          let uniqueId = baseId;
          let dup = 1;
          while (usedIds.has(uniqueId)) {
            uniqueId = `${baseId}__${dup++}`;
          }
          usedIds.add(uniqueId);

          allLights.push({
            id: uniqueId,
            position: [lng, lat],
            heading: heading,
            type: objType,
            color: lightColor,
            orientation: lightOrientation,
            directionality: lightDirectionality,
            elevated: lightElevated,
            IHP: lightIHP,
            objectId: objId,
            properties: lightProps
              ? {
                  color: lightProps.querySelector('Color')?.textContent || null,
                  orientation: lightProps.querySelector('Orientation')?.textContent || null,
                  directionality: lightProps.querySelector('Directionality')?.textContent || null,
                  IHP: lightProps.querySelector('IHP')?.textContent || null,
                  elevated: lightProps.querySelector('Elevated')?.textContent || null,
                }
              : null,
          });
        }
      }
    }

    const lines = Object.keys(objectGroups).map((objId) => {
      const group = objectGroups[objId];
      let color = '#ef4444';
      if (group.type === 'taxiway') color = '#4ade80';
      else if (group.type === 'lead_on') color = '#facc15';

      return {
        id: objId,
        positions: group.positions,
        type: group.type,
        color: color,
      };
    });

    return {
      lights: allLights,
      lines: lines,
      center: firstPosition ? [...firstPosition] : null,
    };
  }, []);

  useEffect(() => {
    const scheduledUpdates = [];

    if (xmlData) {
      if (xmlData.includes('BarsObject')) {
        const { lights, lines, center } = parseXML(xmlData);
        const handle = setTimeout(() => {
          setParsedLights(lights);
          setPolylines(lines);
          if (center) {
            setViewState((prev) => ({
              ...prev,
              longitude: center[0],
              latitude: center[1],
            }));
          }
        }, 0);
        scheduledUpdates.push(handle);
      }
      if (xmlData.includes('LightSupport')) {
        const { areas, center } = parseRemoveAreasXML(xmlData);
        const handle = setTimeout(() => {
          setRemoveAreas(areas);
          if (center) {
            setViewState((prev) => ({
              ...prev,
              longitude: center[0],
              latitude: center[1],
            }));
          }
        }, 0);
        scheduledUpdates.push(handle);
      }
    }

    return () => {
      scheduledUpdates.forEach((handle) => clearTimeout(handle));
    };
  }, [xmlData, parseXML, parseRemoveAreasXML]);

  useEffect(() => {
    const coordinates = [];

    parsedLights.forEach((light) => {
      if (Array.isArray(light.position)) {
        coordinates.push(light.position);
      }
    });

    polylines.forEach((line) => {
      line.positions.forEach((position) => {
        if (Array.isArray(position)) {
          coordinates.push(position);
        }
      });
    });

    removeAreas.forEach((area) => {
      area.points.forEach((point) => {
        if (Array.isArray(point)) {
          coordinates.push(point);
        }
      });
    });

    if (!coordinates.length) return;

    if (coordinates.length === 1) {
      const [longitude, latitude] = coordinates[0];
      const epsilon = 0.0005;
      const singlePointBounds = [
        [longitude - epsilon, latitude - epsilon],
        [longitude + epsilon, latitude + epsilon],
      ];
      fitMapToBounds(singlePointBounds);
      return;
    }

    let minLng = coordinates[0][0];
    let maxLng = coordinates[0][0];
    let minLat = coordinates[0][1];
    let maxLat = coordinates[0][1];

    coordinates.forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });

    const bounds = [
      [minLng, minLat],
      [maxLng, maxLat],
    ];

    fitMapToBounds(bounds);
  }, [parsedLights, polylines, removeAreas, fitMapToBounds]);

  const handleMapLoad = useCallback(
    (event) => {
      const mapInstance = event.target;
      updateMapImages(mapInstance);
      if (pendingBoundsRef.current) {
        mapInstance.fitBounds(pendingBoundsRef.current, { padding: 48, duration: 0 });
        pendingBoundsRef.current = null;
      }
    },
    [updateMapImages]
  );

  const toggleStyle = () => {
    if (styleName === 'Satellite') {
      setMapStyle(STREET_STYLE);
      setStyleName('Street');
    } else {
      setMapStyle(SATELLITE_STYLE);
      setStyleName('Satellite');
    }
  };

  const polylineGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: polylines.map((line) => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: line.positions,
        },
        properties: {
          color: line.color,
        },
      })),
    };
  }, [polylines]);

  const removeAreasGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: removeAreas.map((area) => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [area.points],
        },
      })),
    };
  }, [removeAreas]);

  return (
    <div className="h-[600px] rounded-lg overflow-hidden relative" style={{ height }}>
      {parsedLights.length > 0 || removeAreas.length > 0 ? (
        <>
          <Map
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            mapStyle={mapStyle}
            onLoad={handleMapLoad}
            onStyleData={(e) => updateMapImages(e.target)}
            style={{ width: '100%', height: '100%' }}
            ref={mapRef}
          >
            <NavigationControl position="top-left" />
            <ScaleControl />

            {/* Render remove areas if showing remove areas view */}
            {showRemoveAreas && (
              <Source id="remove-areas" type="geojson" data={removeAreasGeoJSON}>
                <Layer
                  id="remove-areas-fill"
                  type="fill"
                  paint={{
                    'fill-color': '#ef4444',
                    'fill-opacity': 0.2,
                  }}
                />
                <Layer
                  id="remove-areas-outline"
                  type="line"
                  paint={{
                    'line-color': '#ef4444',
                    'line-opacity': 0.7,
                    'line-width': 2,
                  }}
                />
              </Source>
            )}

            {/* Render polylines if showing polylines view */}
            {showPolyLines && (
              <Source id="polylines" type="geojson" data={polylineGeoJSON}>
                <Layer
                  id="polylines-layer"
                  type="line"
                  paint={{
                    'line-color': ['get', 'color'],
                    'line-width': 2,
                    'line-opacity': 0.8,
                  }}
                />
              </Source>
            )}

            {/* Always render the light markers in normal mode */}
            {!showRemoveAreas && lightGeoJSON && (
              <Source id="lights" type="geojson" data={lightGeoJSON}>
                <Layer
                  id="lights-layer"
                  type="symbol"
                  layout={{
                    'icon-image': ['get', 'icon'],
                    'icon-size': 1,
                    'icon-rotate': ['get', 'heading'],
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                    'icon-rotation-alignment': 'map',
                    'symbol-sort-key': ['get', 'sortKey'],
                  }}
                />
              </Source>
            )}
          </Map>

          <div className="absolute top-4 right-4 bg-zinc-900/90 border border-zinc-700 rounded-md p-1 z-10">
            <button
              onClick={toggleStyle}
              className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-zinc-200 hover:text-white hover:bg-zinc-800 rounded transition-colors"
            >
              <Layers className="w-4 h-4" />
              <span>{styleName}</span>
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-full bg-zinc-800/30">
          <p className="text-zinc-400">No XML data provided or no lights found in the XML</p>
        </div>
      )}
    </div>
  );
};

XMLMap.propTypes = {
  xmlData: PropTypes.string,
  height: PropTypes.string,
  showPolyLines: PropTypes.bool,
  showRemoveAreas: PropTypes.bool,
};

export default XMLMap;
