import { memo, useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Map, { Layer, NavigationControl, Popup, ScaleControl, Source } from 'react-map-gl/maplibre';
import { Bug, Layers3, MapPinned, Palette, Waypoints } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const RESULT_INTERACTIVE_LAYERS = [
  'draft-matched',
  'draft-unsafe',
  'draft-unmatched',
  'draft-unmatched-points',
];
const SIMULATOR_INTERACTIVE_LAYERS = ['simulator-source', 'simulator-merged'];
const DIVISION_INTERACTIVE_LAYERS = ['division-original-lines', 'division-original-points'];
const MATCHED_TYPE_COLOR = [
  'match',
  ['get', 'divisionType'],
  'lead_on',
  '#34d399',
  'taxiway',
  '#60a5fa',
  'stopbar',
  '#f59e0b',
  'stand',
  '#c084fc',
  '#34d399',
];

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
  layers: [{ id: 'osm', type: 'raster', source: 'osm', minzoom: 0, maxzoom: 22 }],
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
  layers: [{ id: 'mapbox', type: 'raster', source: 'mapbox', minzoom: 0, maxzoom: 22 }],
};

// oxlint-disable-next-line react-doctor/no-giant-component -- Map lifecycle, layers, and interactions share one imperative MapLibre instance; splitting would obscure ownership.
const DraftGeneratorMap = memo(function DraftGeneratorMap({
  airport,
  geojsonUrl,
  simulatorGeojsonUrl,
  divisionGeojson,
  bounds,
}) {
  const mapRef = useRef(null);
  const [mapStyle, setMapStyle] = useState(SATELLITE_STYLE);
  const [styleName, setStyleName] = useState('Satellite');
  const [showSimulatorGeometry, setShowSimulatorGeometry] = useState(false);
  const [showDivisionGeometry, setShowDivisionGeometry] = useState(false);
  const [colorByBarsId, setColorByBarsId] = useState(false);
  const [popup, setPopup] = useState(null);
  useEffect(() => {
    if (!airport || !mapRef.current) return;
    mapRef.current.jumpTo({
      center: [airport.longitude, airport.latitude],
      zoom: 14,
    });
  }, [airport]);

  useEffect(() => {
    setPopup(null);
    if (!bounds || !mapRef.current) return;
    mapRef.current.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding: 56, maxZoom: 19, duration: 500 }
    );
  }, [bounds, geojsonUrl]);

  const handleMapClick = useCallback((event) => {
    const feature = event.features?.[0];
    if (!feature) {
      setPopup(null);
      return;
    }
    setPopup({
      longitude: event.lngLat.lng,
      latitude: event.lngLat.lat,
      properties: feature.properties,
    });
  }, []);

  const handleMouseMove = useCallback((event) => {
    const canvas = mapRef.current?.getCanvas?.();
    if (canvas) canvas.style.cursor = event.features?.length ? 'pointer' : '';
  }, []);

  const toggleStyle = () => {
    if (styleName === 'Satellite') {
      setMapStyle(STREET_STYLE);
      setStyleName('Street map');
    } else {
      setMapStyle(SATELLITE_STYLE);
      setStyleName('Satellite');
    }
  };

  return (
    <div className="relative h-[34rem] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 lg:h-[42rem]">
      {airport ? (
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: airport.longitude,
            latitude: airport.latitude,
            zoom: 14,
          }}
          onClick={handleMapClick}
          onMouseMove={handleMouseMove}
          interactiveLayerIds={
            geojsonUrl ||
            (showSimulatorGeometry && simulatorGeojsonUrl) ||
            (showDivisionGeometry && divisionGeojson)
              ? [
                  ...(geojsonUrl ? RESULT_INTERACTIVE_LAYERS : []),
                  ...(showSimulatorGeometry && simulatorGeojsonUrl
                    ? SIMULATOR_INTERACTIVE_LAYERS
                    : []),
                  ...(showDivisionGeometry && divisionGeojson ? DIVISION_INTERACTIVE_LAYERS : []),
                ]
              : []
          }
          mapStyle={mapStyle}
          style={{ width: '100%', height: '100%' }}
          renderWorldCopies={false}
          maxPitch={0}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <ScaleControl position="bottom-left" />

          {geojsonUrl ? (
            <Source key={geojsonUrl} id="draft-result" type="geojson" data={geojsonUrl}>
              <Layer
                id="draft-removal-fill"
                type="fill"
                filter={['==', ['get', 'featureType'], 'removal']}
                paint={{ 'fill-color': '#f59e0b', 'fill-opacity': 0.2 }}
              />
              <Layer
                id="draft-removal-outline"
                type="line"
                filter={['==', ['get', 'featureType'], 'removal']}
                paint={{ 'line-color': '#fbbf24', 'line-width': 1.2, 'line-opacity': 0.9 }}
              />
              <Layer
                id="draft-matched"
                type="line"
                filter={['==', ['get', 'featureType'], 'matched']}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': colorByBarsId ? ['get', 'debugColor'] : MATCHED_TYPE_COLOR,
                  'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 18, 4.5],
                  'line-opacity': 0.98,
                }}
              />
              <Layer
                id="draft-unsafe"
                type="line"
                filter={['==', ['get', 'featureType'], 'unsafe']}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': colorByBarsId ? ['get', 'debugColor'] : '#fbbf24',
                  'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 18, 4.5],
                  'line-opacity': 0.98,
                  'line-dasharray': [1.5, 1],
                }}
              />
              <Layer
                id="draft-unmatched"
                type="line"
                filter={[
                  'all',
                  ['==', ['get', 'featureType'], 'unmatched'],
                  ['==', ['geometry-type'], 'LineString'],
                ]}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': colorByBarsId ? ['get', 'debugColor'] : '#fb7185',
                  'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 18, 4.5],
                  'line-dasharray': [2, 1.25],
                }}
              />
              <Layer
                id="draft-unmatched-points"
                type="circle"
                filter={[
                  'all',
                  ['==', ['get', 'featureType'], 'unmatched'],
                  ['==', ['geometry-type'], 'Point'],
                ]}
                paint={{
                  'circle-color': colorByBarsId ? ['get', 'debugColor'] : '#fb7185',
                  'circle-radius': 6,
                  'circle-stroke-color': '#fff1f2',
                  'circle-stroke-width': 1.5,
                }}
              />
            </Source>
          ) : null}

          {showSimulatorGeometry && simulatorGeojsonUrl ? (
            <Source
              key={simulatorGeojsonUrl}
              id="simulator-debug"
              type="geojson"
              data={simulatorGeojsonUrl}
            >
              <Layer
                id="simulator-source"
                type="line"
                filter={['==', ['get', 'featureType'], 'simulator-source']}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': '#22d3ee',
                  'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 18, 1.8],
                  'line-opacity': 0.58,
                  'line-dasharray': [1.25, 2],
                }}
              />
              <Layer
                id="simulator-merged"
                type="line"
                filter={['==', ['get', 'featureType'], 'simulator-merged']}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': '#c084fc',
                  'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 18, 5],
                  'line-opacity': 0.95,
                }}
              />
            </Source>
          ) : null}

          {showDivisionGeometry && divisionGeojson ? (
            <Source id="division-original-debug" type="geojson" data={divisionGeojson}>
              <Layer
                id="division-original-lines"
                type="line"
                filter={['==', ['geometry-type'], 'LineString']}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': '#f472b6',
                  'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 18, 3.5],
                  'line-opacity': 0.9,
                  'line-dasharray': [2, 1.5],
                }}
              />
              <Layer
                id="division-original-points"
                type="circle"
                filter={['==', ['geometry-type'], 'Point']}
                paint={{
                  'circle-color': '#f472b6',
                  'circle-radius': 5,
                  'circle-stroke-color': '#fdf2f8',
                  'circle-stroke-width': 1.5,
                }}
              />
            </Source>
          ) : null}

          {popup ? (
            <Popup
              className="draft-generator-popup"
              longitude={popup.longitude}
              latitude={popup.latitude}
              closeOnClick={false}
              onClose={() => setPopup(null)}
              offset={10}
              maxWidth="280px"
            >
              <FeaturePopup properties={popup.properties} />
            </Popup>
          ) : null}
        </Map>
      ) : (
        <div className="flex h-full items-center justify-center text-zinc-500">
          <MapPinned className="h-8 w-8" />
        </div>
      )}

      <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={toggleStyle}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/90 px-3 py-2 text-sm font-medium text-zinc-200 shadow-lg backdrop-blur transition-colors hover:border-zinc-600 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
        >
          <Layers3 className="h-4 w-4" />
          {styleName}
        </button>
        {simulatorGeojsonUrl ? (
          <>
            <button
              type="button"
              onClick={() => {
                setShowSimulatorGeometry((current) => !current);
                setPopup(null);
              }}
              aria-pressed={showSimulatorGeometry}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 ${
                showSimulatorGeometry
                  ? 'border-cyan-400/60 bg-cyan-950/90 text-cyan-200'
                  : 'border-zinc-700 bg-zinc-950/90 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-900'
              }`}
            >
              <Bug className="h-4 w-4" />
              SIM geometry
            </button>
            {showSimulatorGeometry ? (
              <div className="space-y-1 rounded-lg border border-zinc-700 bg-zinc-950/90 px-3 py-2 text-[11px] text-zinc-300 shadow-lg backdrop-blur">
                <DebugLegendRow color="border-cyan-300" dashed label="Raw simulator row" />
                <DebugLegendRow color="bg-purple-400" label="Merged matcher row" />
                {!colorByBarsId ? (
                  <>
                    <div className="my-1.5 border-t border-zinc-800" />
                    <DebugLegendRow color="bg-emerald-400" label="Lead-on allocation" />
                    <DebugLegendRow color="bg-blue-400" label="Taxiway allocation" />
                    <DebugLegendRow color="bg-amber-500" label="Stopbar boundary" />
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
        {divisionGeojson ? (
          <button
            type="button"
            onClick={() => {
              setShowDivisionGeometry((current) => !current);
              setPopup(null);
            }}
            aria-pressed={showDivisionGeometry}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-400/50 ${
              showDivisionGeometry
                ? 'border-pink-400/60 bg-pink-950/90 text-pink-200'
                : 'border-zinc-700 bg-zinc-950/90 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-900'
            }`}
          >
            <Waypoints className="h-4 w-4" />
            Division data
          </button>
        ) : null}
        {geojsonUrl ? (
          <button
            type="button"
            onClick={() => {
              setColorByBarsId((current) => !current);
              setPopup(null);
            }}
            aria-pressed={colorByBarsId}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50 ${
              colorByBarsId
                ? 'border-fuchsia-400/60 bg-fuchsia-950/90 text-fuchsia-200'
                : 'border-zinc-700 bg-zinc-950/90 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-900'
            }`}
          >
            <Palette className="h-4 w-4" />
            BARS ID colours
          </button>
        ) : null}
      </div>

      {!geojsonUrl ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-white/10 bg-zinc-950/85 px-4 py-3 text-sm text-zinc-300 shadow-xl backdrop-blur">
          Select a scenery folder to align the draft with simulator lighting.
        </div>
      ) : null}
    </div>
  );
});

function DebugLegendRow({ color, dashed = false, label }) {
  return (
    <p className="flex items-center gap-2 whitespace-nowrap">
      <span
        aria-hidden="true"
        className={`inline-block w-5 ${
          dashed ? `border-t border-dashed ${color}` : `h-0.5 ${color}`
        }`}
      />
      {label}
    </p>
  );
}

function FeaturePopup({ properties }) {
  const unmatched = properties.featureType === 'unmatched';
  const unsafe = properties.featureType === 'unsafe';
  const simulatorSource = properties.featureType === 'simulator-source';
  const simulatorMerged = properties.featureType === 'simulator-merged';
  const divisionOriginal = properties.featureType === 'division-original';
  const simulatorDebug = simulatorSource || simulatorMerged;
  return (
    <div className="min-w-52 bg-zinc-900 p-1 text-zinc-100">
      <p className="pr-5 text-sm font-semibold leading-snug">{properties.title}</p>
      <p
        className={`mt-1 text-xs font-medium ${
          unmatched
            ? 'text-rose-400'
            : unsafe
              ? 'text-amber-300'
              : simulatorSource
                ? 'text-cyan-300'
                : simulatorMerged
                  ? 'text-purple-300'
                  : divisionOriginal
                    ? 'text-pink-300'
                    : 'text-emerald-400'
        }`}
      >
        {unmatched
          ? 'Manual addition required'
          : unsafe
            ? 'Matched · removal needs review'
            : simulatorSource
              ? 'Raw extracted simulator row'
              : simulatorMerged
                ? 'Merged matcher geometry'
                : divisionOriginal
                  ? 'Original division geometry'
                  : properties.matchedViaHoldShort
                    ? 'Aligned to simulator hold-short position'
                    : 'Matched to simulator lighting'}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
        {divisionOriginal
          ? formatType(properties.divisionType)
          : simulatorDebug
            ? `${formatType(properties.simulatorType)}${
                simulatorMerged ? ` · ${properties.sourceRowCount} source rows` : ''
              }`
            : unmatched || unsafe
              ? properties.reason
              : `${formatType(properties.divisionType)} · ${properties.matchPercent}% shape match`}
      </p>
      {!simulatorDebug && properties.divisionId ? (
        <p className="mt-2 text-[11px] font-medium text-zinc-300">
          <span className="text-zinc-500">BARS ID</span> {properties.divisionId}
        </p>
      ) : null}
      {simulatorSource && properties.sourceFile ? (
        <p className="mt-1 max-w-64 break-all text-[10px] leading-relaxed text-zinc-500">
          {properties.sourceFile}
        </p>
      ) : null}
      {simulatorMerged && properties.sourceRowIds ? (
        <p className="mt-1 max-w-64 break-all text-[10px] leading-relaxed text-zinc-500">
          {properties.sourceRowIds}
        </p>
      ) : null}
    </div>
  );
}

function formatType(type) {
  return String(type || 'object')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

DraftGeneratorMap.propTypes = {
  airport: PropTypes.shape({
    latitude: PropTypes.number.isRequired,
    longitude: PropTypes.number.isRequired,
  }),
  geojsonUrl: PropTypes.string,
  simulatorGeojsonUrl: PropTypes.string,
  divisionGeojson: PropTypes.object,
  bounds: PropTypes.arrayOf(PropTypes.number),
};

FeaturePopup.propTypes = {
  properties: PropTypes.object.isRequired,
};

DebugLegendRow.propTypes = {
  color: PropTypes.string.isRequired,
  dashed: PropTypes.bool,
  label: PropTypes.string.isRequired,
};

export default DraftGeneratorMap;
