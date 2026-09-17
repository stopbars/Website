/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- A bounds/source change intentionally invalidates the map popup selection. */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Map, { Layer, NavigationControl, Popup, ScaleControl, Source } from 'react-map-gl/maplibre';
import { Crosshair, Layers3, MapPinned, Palette, Route, Waypoints } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MatcherFeedbackPanel } from './MatcherFeedbackPanel';
import {
  buildMatcherFeedbackReport,
  buildMatcherSectionSelection,
  findFullMatcherFeature,
  snapMatcherSectionPoint,
} from './matcher-feedback.js';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const RESULT_INTERACTIVE_LAYERS = [
  'draft-matched',
  'draft-unsafe',
  'draft-unmatched',
  'draft-unmatched-points',
];
const SIMULATOR_INTERACTIVE_LAYERS = ['simulator-source', 'simulator-merged'];
const DIVISION_INTERACTIVE_LAYERS = ['division-original-lines', 'division-original-points'];
const MATCHER_FEEDBACK_INTERACTIVE_LAYERS = [
  'division-original-lines-hit',
  'division-original-points-hit',
  'simulator-source-hit',
  'simulator-merged-hit',
];
const MATCHED_COLOR = '#34d399';
const MANUAL_WORK_COLOR = '#f87171';

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

// oxlint-disable-next-line react-doctor/no-giant-component react-doctor/no-high-complexity-react-function -- Map lifecycle, layers, and interactions share one imperative MapLibre instance; splitting would obscure ownership.
const DraftGeneratorMap = memo(function DraftGeneratorMap({
  airport,
  geojsonUrl,
  simulatorGeojsonUrl,
  divisionGeojson,
  diagnosticBlob,
  bounds,
}) {
  const mapRef = useRef(null);
  const [mapStyle, setMapStyle] = useState(SATELLITE_STYLE);
  const [styleName, setStyleName] = useState('Satellite');
  const [showSimulatorGeometry, setShowSimulatorGeometry] = useState(false);
  const [showDivisionGeometry, setShowDivisionGeometry] = useState(false);
  const [colorByBarsId, setColorByBarsId] = useState(false);
  const [popup, setPopup] = useState(null);
  const [feedbackActive, setFeedbackActive] = useState(false);
  const [feedbackDivision, setFeedbackDivision] = useState(null);
  const [feedbackSimulator, setFeedbackSimulator] = useState(null);
  const [feedbackScope, setFeedbackScope] = useState('whole-row');
  const [feedbackSectionPoints, setFeedbackSectionPoints] = useState([]);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('Click a pink division object.');
  const [feedbackCopying, setFeedbackCopying] = useState(false);
  const [feedbackCopied, setFeedbackCopied] = useState(false);
  const [simulatorFeatureCollection, setSimulatorFeatureCollection] = useState(null);
  const feedbackSelectionGeojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...(feedbackDivision ? [withSelectionRole(feedbackDivision, 'division')] : []),
        ...(feedbackSimulator ? [withSelectionRole(feedbackSimulator, 'simulator')] : []),
      ],
    }),
    [feedbackDivision, feedbackSimulator]
  );
  const feedbackSection = useMemo(
    () => buildMatcherSectionSelection(feedbackSimulator, feedbackSectionPoints),
    [feedbackSectionPoints, feedbackSimulator]
  );
  const feedbackSectionGeojson = useMemo(
    () => sectionSelectionGeojson(feedbackSection, feedbackSectionPoints),
    [feedbackSection, feedbackSectionPoints]
  );
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
      {
        padding: 56,
        maxZoom: 19,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
      }
    );
  }, [bounds, geojsonUrl]);

  useEffect(() => {
    if (!simulatorGeojsonUrl) {
      setSimulatorFeatureCollection(null);
      return undefined;
    }
    const controller = new AbortController();
    fetch(simulatorGeojsonUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Simulator geometry returned ${response.status}.`);
        return response.json();
      })
      .then(setSimulatorFeatureCollection)
      .catch((error) => {
        if (error?.name !== 'AbortError') setSimulatorFeatureCollection(null);
      });
    return () => controller.abort();
  }, [simulatorGeojsonUrl]);

  const handleMapClick = useCallback(
    (event) => {
      const features = event.features ?? [];
      if (feedbackActive) {
        if (!feedbackDivision) {
          const division = features.find(
            (feature) => feature.properties?.featureType === 'division-original'
          );
          if (!division) {
            setFeedbackStatus('Click a pink division object first.');
            return;
          }
          const fullDivision = findFullMatcherFeature(division, divisionGeojson);
          if (!fullDivision) {
            setFeedbackStatus('Could not load the complete division object. Click it again.');
            return;
          }
          setFeedbackDivision(copyFeature(fullDivision));
          setFeedbackSimulator(null);
          setFeedbackSectionPoints([]);
          setFeedbackCopied(false);
          setFeedbackStatus('Division selected. Now click its cyan or purple simulator row.');
          return;
        }

        if (feedbackSimulator && feedbackScope === 'section') {
          const snapped = snapMatcherSectionPoint(feedbackSimulator, [
            event.lngLat.lng,
            event.lngLat.lat,
          ]);
          if (!snapped) {
            setFeedbackStatus('Could not place that section point on the selected row.');
            return;
          }
          const nextPoints =
            feedbackSectionPoints.length >= 2 ? [snapped] : [...feedbackSectionPoints, snapped];
          setFeedbackSectionPoints(nextPoints);
          setFeedbackCopied(false);
          setFeedbackStatus(
            nextPoints.length === 1
              ? 'Section start selected. Click where the match should end.'
              : 'Section selected. Add a note if the intended continuation needs explaining.'
          );
          return;
        }

        const simulator = features.find((feature) =>
          ['simulator-source', 'simulator-merged'].includes(feature.properties?.featureType)
        );
        if (!simulator) {
          setFeedbackStatus('Click the cyan or purple simulator row that should match.');
          return;
        }
        const fullSimulator = findFullMatcherFeature(simulator, simulatorFeatureCollection);
        if (!fullSimulator) {
          setFeedbackStatus('Simulator geometry is still loading. Click the row again.');
          return;
        }
        setFeedbackSimulator(copyFeature(fullSimulator));
        setFeedbackSectionPoints([]);
        setFeedbackCopied(false);
        setFeedbackStatus(
          feedbackScope === 'section'
            ? 'Pair selected. Click where the expected section should start.'
            : 'Pair selected. Copy the report and paste it into Codex.'
        );
        return;
      }

      const feature = features[0];
      if (!feature) {
        setPopup(null);
        return;
      }
      setPopup({
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
        properties: feature.properties,
      });
    },
    [
      feedbackActive,
      feedbackDivision,
      feedbackScope,
      feedbackSectionPoints,
      feedbackSimulator,
      divisionGeojson,
      simulatorFeatureCollection,
    ]
  );

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

  const startMatcherFeedback = () => {
    setFeedbackActive(true);
    setFeedbackDivision(null);
    setFeedbackSimulator(null);
    setFeedbackScope('whole-row');
    setFeedbackSectionPoints([]);
    setFeedbackComment('');
    setFeedbackCopied(false);
    setFeedbackStatus('Click a pink division object.');
    setShowDivisionGeometry(true);
    setShowSimulatorGeometry(true);
    setColorByBarsId(false);
    setPopup(null);
  };

  const resetMatcherFeedback = () => {
    setFeedbackDivision(null);
    setFeedbackSimulator(null);
    setFeedbackScope('whole-row');
    setFeedbackSectionPoints([]);
    setFeedbackComment('');
    setFeedbackCopied(false);
    setFeedbackStatus('Click a pink division object.');
  };

  const closeMatcherFeedback = () => {
    setFeedbackActive(false);
    resetMatcherFeedback();
  };

  const changeFeedbackScope = (scope) => {
    setFeedbackScope(scope);
    setFeedbackSectionPoints([]);
    setFeedbackCopied(false);
    setFeedbackStatus(
      scope === 'section'
        ? 'Click where the expected section should start.'
        : 'The report will describe the whole selected simulator row.'
    );
  };

  const finishFeedbackSectionAtEndpoint = (endpoint) => {
    const coordinates = feedbackSimulator?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2 || feedbackSectionPoints.length !== 1)
      return;
    const endpointCoordinate = endpoint === 'start' ? coordinates[0] : coordinates.at(-1);
    const snapped = snapMatcherSectionPoint(feedbackSimulator, endpointCoordinate);
    if (!snapped) return;
    setFeedbackSectionPoints([feedbackSectionPoints[0], snapped]);
    setFeedbackCopied(false);
    setFeedbackStatus(
      `Section selected through the simulator row ${endpoint}. Add a note if needed.`
    );
  };

  const copyMatcherFeedback = async () => {
    if (
      !diagnosticBlob ||
      !feedbackDivision ||
      !feedbackSimulator ||
      (feedbackScope === 'section' && !feedbackSection) ||
      feedbackCopying
    )
      return;
    setFeedbackCopying(true);
    setFeedbackCopied(false);
    setFeedbackStatus('Building the pair-specific matcher report.');
    try {
      const diagnostic = JSON.parse(await diagnosticBlob.text());
      const report = buildMatcherFeedbackReport({
        diagnostic,
        divisionFeature: feedbackDivision,
        simulatorFeature: feedbackSimulator,
        expectedScope: feedbackScope,
        sectionSelection: feedbackSection,
        comment: feedbackComment,
      });
      await writeClipboard(JSON.stringify(report, null, 2));
      setFeedbackCopied(true);
      setFeedbackStatus('Copied. Paste it into Codex, or choose New pair and keep going.');
    } catch (error) {
      setFeedbackStatus(
        error instanceof Error ? `Could not copy the report. ${error.message}` : 'Copy failed.'
      );
    } finally {
      setFeedbackCopying(false);
    }
  };

  return (
    <div className="space-y-3">
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
              feedbackActive
                ? MATCHER_FEEDBACK_INTERACTIVE_LAYERS
                : geojsonUrl ||
                    (showSimulatorGeometry && simulatorGeojsonUrl) ||
                    (showDivisionGeometry && divisionGeojson)
                  ? [
                      ...(geojsonUrl ? RESULT_INTERACTIVE_LAYERS : []),
                      ...(showSimulatorGeometry && simulatorGeojsonUrl
                        ? SIMULATOR_INTERACTIVE_LAYERS
                        : []),
                      ...(showDivisionGeometry && divisionGeojson
                        ? DIVISION_INTERACTIVE_LAYERS
                        : []),
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
                  id="draft-matched"
                  type="line"
                  filter={['==', ['get', 'featureType'], 'matched']}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{
                    'line-color': colorByBarsId ? ['get', 'debugColor'] : MATCHED_COLOR,
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
                    'line-color': colorByBarsId ? ['get', 'debugColor'] : MANUAL_WORK_COLOR,
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
                    'line-color': colorByBarsId ? ['get', 'debugColor'] : MANUAL_WORK_COLOR,
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
                    'circle-color': colorByBarsId ? ['get', 'debugColor'] : MANUAL_WORK_COLOR,
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
                <Layer
                  id="simulator-source-hit"
                  type="line"
                  filter={['==', ['get', 'featureType'], 'simulator-source']}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': '#22d3ee', 'line-width': 14, 'line-opacity': 0.01 }}
                />
                <Layer
                  id="simulator-merged-hit"
                  type="line"
                  filter={['==', ['get', 'featureType'], 'simulator-merged']}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': '#c084fc', 'line-width': 14, 'line-opacity': 0.01 }}
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
                <Layer
                  id="division-original-lines-hit"
                  type="line"
                  filter={['==', ['geometry-type'], 'LineString']}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': '#f472b6', 'line-width': 14, 'line-opacity': 0.01 }}
                />
                <Layer
                  id="division-original-points-hit"
                  type="circle"
                  filter={['==', ['geometry-type'], 'Point']}
                  paint={{ 'circle-color': '#f472b6', 'circle-radius': 12, 'circle-opacity': 0.01 }}
                />
              </Source>
            ) : null}

            {feedbackActive && feedbackSelectionGeojson.features.length > 0 ? (
              <Source
                id="matcher-feedback-selection"
                type="geojson"
                data={feedbackSelectionGeojson}
              >
                <Layer
                  id="matcher-feedback-selection-halo"
                  type="line"
                  filter={['==', ['geometry-type'], 'LineString']}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': '#fafafa', 'line-width': 8, 'line-opacity': 0.95 }}
                />
                <Layer
                  id="matcher-feedback-selection-lines"
                  type="line"
                  filter={['==', ['geometry-type'], 'LineString']}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{
                    'line-color': [
                      'match',
                      ['get', 'selectionRole'],
                      'division',
                      '#f472b6',
                      '#22d3ee',
                    ],
                    'line-width': 4.5,
                  }}
                />
                <Layer
                  id="matcher-feedback-selection-points"
                  type="circle"
                  filter={['==', ['geometry-type'], 'Point']}
                  paint={{
                    'circle-color': '#f472b6',
                    'circle-radius': 8,
                    'circle-stroke-color': '#fafafa',
                    'circle-stroke-width': 3,
                  }}
                />
              </Source>
            ) : null}

            {feedbackActive && feedbackSectionGeojson.features.length > 0 ? (
              <Source id="matcher-feedback-section" type="geojson" data={feedbackSectionGeojson}>
                <Layer
                  id="matcher-feedback-section-halo"
                  type="line"
                  filter={['==', ['geometry-type'], 'LineString']}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': '#18181b', 'line-width': 10, 'line-opacity': 0.9 }}
                />
                <Layer
                  id="matcher-feedback-section-line"
                  type="line"
                  filter={['==', ['geometry-type'], 'LineString']}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{ 'line-color': '#facc15', 'line-width': 6 }}
                />
                <Layer
                  id="matcher-feedback-section-points"
                  type="circle"
                  filter={['==', ['geometry-type'], 'Point']}
                  paint={{
                    'circle-color': '#facc15',
                    'circle-radius': 7,
                    'circle-stroke-color': '#18181b',
                    'circle-stroke-width': 3,
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

        {geojsonUrl && !colorByBarsId && !feedbackActive ? (
          <div className="absolute left-4 top-4 z-10 space-y-1.5 rounded-lg border border-zinc-700 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-200 shadow-lg backdrop-blur">
            <p className="mb-2 font-semibold text-zinc-100">Draft result</p>
            <DebugLegendRow color="bg-emerald-400" label="Matched and included" />
            <DebugLegendRow color="border-red-400" dashed label="Needs manual work" />
          </div>
        ) : null}

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
                <Route className="h-4 w-4" />
                Simulator Geometry
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
              Unique colors
            </button>
          ) : null}
          {import.meta.env.DEV && diagnosticBlob && simulatorGeojsonUrl && divisionGeojson ? (
            <button
              type="button"
              onClick={feedbackActive ? closeMatcherFeedback : startMatcherFeedback}
              aria-pressed={feedbackActive}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
                feedbackActive
                  ? 'border-cyan-400/70 bg-cyan-950/95 text-cyan-100'
                  : 'border-zinc-700 bg-zinc-950/90 text-zinc-200 hover:border-cyan-500/50 hover:bg-zinc-900'
              }`}
            >
              <Crosshair className="h-4 w-4" />
              Capture expected match
            </button>
          ) : null}
        </div>
      </div>

      {feedbackActive ? (
        <MatcherFeedbackPanel
          division={feedbackDivision}
          simulator={feedbackSimulator}
          scope={feedbackScope}
          sectionPointCount={feedbackSectionPoints.length}
          comment={feedbackComment}
          status={feedbackStatus}
          copying={feedbackCopying}
          copied={feedbackCopied}
          onScopeChange={changeFeedbackScope}
          onCommentChange={(comment) => {
            setFeedbackComment(comment);
            setFeedbackCopied(false);
          }}
          onFinishAtEndpoint={finishFeedbackSectionAtEndpoint}
          onCopy={copyMatcherFeedback}
          onReset={resetMatcherFeedback}
          onClose={closeMatcherFeedback}
        />
      ) : null}
    </div>
  );
});

function copyFeature(feature) {
  return {
    type: 'Feature',
    properties: { ...feature.properties },
    geometry: structuredClone(feature.geometry),
  };
}

function withSelectionRole(feature, selectionRole) {
  return {
    ...feature,
    properties: { ...feature.properties, selectionRole },
  };
}

function sectionSelectionGeojson(section, points) {
  if (!section && points.length === 0) return { type: 'FeatureCollection', features: [] };
  if (!section) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { selectionRole: 'section-start' },
          geometry: { type: 'Point', coordinates: points[0].coordinate },
        },
      ],
    };
  }
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { selectionRole: 'section' }, geometry: section.geometry },
      {
        type: 'Feature',
        properties: { selectionRole: 'section-start' },
        geometry: { type: 'Point', coordinates: section.pickedStart.coordinate },
      },
      {
        type: 'Feature',
        properties: { selectionRole: 'section-end' },
        geometry: { type: 'Point', coordinates: section.pickedEnd.coordinate },
      },
    ],
  };
}

async function writeClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('The browser blocked clipboard access.');
}

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
  const presentation = featurePopupPresentation(properties);
  const simulatorSource = properties.featureType === 'simulator-source';
  const simulatorMerged = properties.featureType === 'simulator-merged';
  return (
    <div className="min-w-52 bg-zinc-900 p-1 text-zinc-100">
      <p className="pr-5 text-sm font-semibold leading-snug">{properties.title}</p>
      <p
        className={`mt-1 text-xs font-medium ${presentation.statusClassName}`}
      >
        {presentation.statusLabel}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{presentation.detail}</p>
      {!presentation.simulatorDebug && properties.divisionId ? (
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

function featurePopupPresentation(properties) {
  switch (properties.featureType) {
    case 'unmatched':
      return {
        statusClassName: 'text-rose-400',
        statusLabel: 'Manual addition required',
        detail: properties.reason,
        simulatorDebug: false,
      };
    case 'unsafe':
      return {
        statusClassName: 'text-red-400',
        statusLabel: 'Manual review required',
        detail: properties.reason,
        simulatorDebug: false,
      };
    case 'simulator-source':
      return {
        statusClassName: 'text-cyan-300',
        statusLabel: 'Raw extracted simulator row',
        detail: formatType(properties.simulatorType),
        simulatorDebug: true,
      };
    case 'simulator-merged':
      return {
        statusClassName: 'text-purple-300',
        statusLabel: 'Merged matcher geometry',
        detail: `${formatType(properties.simulatorType)} · ${properties.sourceRowCount} source rows`,
        simulatorDebug: true,
      };
    case 'division-original':
      return {
        statusClassName: 'text-pink-300',
        statusLabel: 'Original division geometry',
        detail: formatType(properties.divisionType),
        simulatorDebug: false,
      };
    default:
      return {
        statusClassName: 'text-emerald-400',
        statusLabel: 'Matched to simulator lighting',
        detail: `${formatType(properties.divisionType)} · ${properties.matchPercent}% shape match`,
        simulatorDebug: false,
      };
  }
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
  diagnosticBlob: PropTypes.instanceOf(Blob),
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
