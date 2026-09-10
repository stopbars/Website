/* oxlint-disable react-doctor/no-giant-component react-doctor/no-high-complexity-react-function react-doctor/async-await-in-loop react-doctor/no-prop-callback-in-effect -- MapLibre, Geoman, texture workers, and their parent-facing status projection share one imperative lifecycle; ordered worker jobs preserve stable accounting. */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, Copy, Plus } from 'lucide-react';
import Map, { Layer, NavigationControl, Popup, ScaleControl, Source } from 'react-map-gl/maplibre';
import { createGeomanInstance, FEATURE_ID_PROPERTY } from '@geoman-io/maplibre-geoman-free';
import {
  editorDocumentToGeojson,
  originalDivisionHasMatch,
  originalDivisionsToGeojson,
} from './editor-model.js';
import {
  acknowledgeGeomanGeometryEdit,
  applyEditorGeometryPreviews,
  createGeomanFeatureSyncState,
  createGeomanReferenceSnapTargets,
  discardCompletedGeomanDraw,
  limitGeomanFeatureQueries,
  planGeomanFeatureSync,
} from './geoman-editor.js';
import {
  decodedTextureCache,
  decodedTextureKey,
  msfsDecodedTextureKey,
} from './decoded-texture-cache.js';
import { loadReferenceTextures } from './editor-session.js';
import {
  referenceFeatureIsVisible,
  referenceSceneGeojson,
  referenceTexturePattern,
} from './reference-scene.js';
import {
  createReferenceTextureFallbacks,
  installReferenceTextureFallbacks,
} from './marking-patterns.js';
import { SimulatorTextureLayer } from './SimulatorTextureLayer.js';
import { realWorldLineWidthExpression } from './scenery-texture.js';
import { createTextureEntryIndex, findTextureEntry } from './texture-assets.js';
import { maintainCustomLayerBefore, placeLayerImmediatelyBefore } from './custom-layer-order.js';
import { reconnectMsfsRenderBundleFiles } from '../msfs-renderer/msfs-texture-files.js';
import { distanceMeters } from './editor-geometry.js';
import { selectedRemovalGeojson } from './removal-selection-display.js';
import { createTextureFallbackReport } from './texture-fallback-report.js';
import { runTextureWorkerQueue } from './texture-worker-queue.js';
import { snapDrawAngle } from './angle-snapping.js';
import { traceEditorSpan } from './editor-performance.js';
import { referenceMapGeojson, restoreReferenceMapFeature } from './reference-map-data.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css';

const EDITOR_LAYER_IDS = [
  'editor-selected',
  'editor-selected-casing',
  'editor-lines',
  'editor-points',
];
const MEASUREMENT_LAYER_IDS = [
  'editor-measurement-hit',
  'editor-measurement-lines',
  'editor-measurement-points',
  'editor-measurement-labels',
];
const ORIGINAL_DIVISION_LAYER_IDS = [
  'original-division-hit',
  'original-division-lines',
  'original-division-points',
];
const REFERENCE_LAYER_IDS = [
  'reference-texture-bases',
  'reference-painted-texture-bases',
  'reference-textured-fills',
  'reference-fills',
  'reference-painted-fills',
  'reference-light-rows',
  'reference-lines',
  'reference-textured-lines',
  'reference-painted-lines',
  'reference-points',
  'reference-removal-hit-lines',
];
const MSFS_SNAP_TARGET_LIMIT = 2_000;
const MSFS_SNAP_CATEGORY_PRIORITY = ['light-rows', 'fixtures'];
const MSFS_SNAP_GEOMETRIES = new Set(['Point', 'LineString', 'MultiLineString']);
const DIVISION_POPUP_ACCENTS = {
  stopbar: 'border-red-500',
  lead_on: 'border-amber-500',
  taxiway: 'border-green-500',
  stand: 'border-blue-500',
};

function formatDivisionType(type) {
  return String(type || 'division object')
    .replaceAll('_', ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function referenceRecordKey(properties = {}) {
  const sourceRecordOffset = Number(properties.sourceRecordOffset);
  if (!Number.isFinite(sourceRecordOffset)) return '';
  return [
    properties.sourceType ?? '',
    properties.sourceFile ?? '',
    sourceRecordOffset,
    properties.exactness ?? '',
  ].join('|');
}

function DivisionPopupContent({ division, onQuickAdd }) {
  const [copyState, setCopyState] = useState('idle');
  const copyResetRef = useRef(null);

  useEffect(
    () => () => {
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    },
    []
  );

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(division.id);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => setCopyState('idle'), 2_000);
  };

  return (
    <div
      className={`min-w-60 overflow-hidden rounded-lg border-t-2 bg-zinc-900 text-left shadow-lg ${DIVISION_POPUP_ACCENTS[division.type] ?? 'border-cyan-500'}`}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="px-3 pb-3 pt-2.5">
        <p className="pr-7 text-sm font-semibold leading-5 text-zinc-100">{division.name}</p>
        <button
          type="button"
          onClick={copyId}
          className="mt-2 flex min-h-9 w-full items-center justify-between gap-3 rounded-md bg-zinc-800 px-2.5 py-1.5 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
          aria-label={`Copy division ID ${division.id}`}
        >
          <code className="break-all font-mono text-[11px]">{division.id}</code>
          <span className="shrink-0 text-[11px] font-medium" aria-live="polite">
            {copyState === 'copied' ? (
              <span className="flex items-center gap-1 text-emerald-300">
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Copied
              </span>
            ) : copyState === 'failed' ? (
              <span className="text-rose-300">Copy failed</span>
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </span>
        </button>
        <dl className="mt-2 text-xs">
          <div className="flex items-center justify-between gap-4 py-1.5">
            <dt className="text-zinc-500">Type</dt>
            <dd className="font-medium text-zinc-200">{formatDivisionType(division.type)}</dd>
          </div>
        </dl>
        {!division.matched && division.quickAddable ? (
          <button
            type="button"
            onClick={() => onQuickAdd(division.id)}
            className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-cyan-400 px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-cyan-300 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Quick add
          </button>
        ) : null}
      </div>
    </div>
  );
}

DivisionPopupContent.propTypes = {
  division: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    type: PropTypes.string,
    matched: PropTypes.bool,
    quickAddable: PropTypes.bool,
  }).isRequired,
  onQuickAdd: PropTypes.func.isRequired,
};

function msfsReferenceSnapFeatures(features) {
  const selected = [];
  for (const category of MSFS_SNAP_CATEGORY_PRIORITY) {
    for (const feature of features ?? []) {
      if (feature.properties?.snapCategory !== category) continue;
      if (!MSFS_SNAP_GEOMETRIES.has(feature.geometry?.type)) continue;
      selected.push(feature);
    }
  }
  return selected;
}

function msfsRenderGroupIsVisible(group, visibleCategories) {
  if (group.markingTexture || group.lineTexture) {
    return visibleCategories.has('painted-lines');
  }
  if (group.renderPass === 'apron' || group.renderPass === 'taxiway-base') {
    return visibleCategories.has('pavement-edges');
  }
  return true;
}

const MAX_LOCAL_TEXTURE_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_TEXTURE_BYTES = 256 * 1024 * 1024;
const MAX_TEXTURE_EDGE = 1024;
const TEXTURE_WORKER_COUNT = 4;
const MSFS_TEXTURE_WORKER_COUNT = 4;
const REFERENCE_COLOR = [
  'match',
  ['get', 'snapCategory'],
  'light-rows',
  '#38bdf8',
  'painted-lines',
  '#facc15',
  'taxiway-centrelines',
  '#4ade80',
  'runways',
  '#fb7185',
  'pavement-edges',
  '#71717a',
  'fixtures',
  '#f97316',
  '#94a3b8',
];
const REFERENCE_WIDTH_METERS = ['number', ['get', 'widthMeters'], 0];
const HAS_REFERENCE_WIDTH = ['>', REFERENCE_WIDTH_METERS, 0];
const referenceWidthAtScale = (scale, fallback, minimum = 0.8) => [
  'case',
  HAS_REFERENCE_WIDTH,
  ['max', minimum, ['*', REFERENCE_WIDTH_METERS, scale]],
  fallback,
];
const REFERENCE_LINE_WIDTH = [
  'interpolate',
  ['exponential', 2],
  ['zoom'],
  13,
  referenceWidthAtScale(0.04, 0.8),
  15,
  referenceWidthAtScale(0.16, 1),
  17,
  referenceWidthAtScale(0.65, 1.5),
  19,
  referenceWidthAtScale(2.6, 2.5),
];
const REMOVAL_REFERENCE_LINE_WIDTH = [
  'interpolate',
  ['linear'],
  ['zoom'],
  13,
  ['case', ['==', ['get', 'snapCategory'], 'light-rows'], 4, referenceWidthAtScale(0.04, 0.8)],
  15,
  ['case', ['==', ['get', 'snapCategory'], 'light-rows'], 5.33, referenceWidthAtScale(0.16, 1)],
  17,
  ['case', ['==', ['get', 'snapCategory'], 'light-rows'], 6.67, referenceWidthAtScale(0.65, 1.5)],
  19,
  ['case', ['==', ['get', 'snapCategory'], 'light-rows'], 8, referenceWidthAtScale(2.6, 2.5)],
];
const TEXTURED_REFERENCE_LINE_PATTERN = ['image', ['get', 'renderPattern']];
const AIRFIELD_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'airfield-background', type: 'background', paint: { 'background-color': '#151619' } },
  ],
};
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const SATELLITE_TILE_URL = MAPBOX_TOKEN
  ? `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`
  : '';

function combinedXPlaneTextureStats(layers) {
  return Object.values(layers ?? {}).reduce(
    (combined, layer) => {
      const stats = layer?.getStats?.();
      if (!stats) return combined;
      combined.meshGroups += stats.meshGroups;
      combined.drawableGroups += stats.drawableGroups;
      combined.drawnGroups += stats.drawnGroups;
      combined.drawnTriangles += stats.drawnTriangles;
      return combined;
    },
    { meshGroups: 0, drawableGroups: 0, drawnGroups: 0, drawnTriangles: 0 }
  );
}

function setXPlaneTexture(layers, pattern, image, options) {
  for (const layer of Object.values(layers ?? {})) layer?.setTexture(pattern, image, options);
}

const EditorMap = memo(function EditorMap({
  airport,
  airportIcao,
  document,
  removalSelectionDocument,
  referenceScene,
  renderBundle,
  sourceEntries,
  sourceFingerprint,
  selectedId,
  tool,
  visibleCategories,
  satelliteVisible,
  editHandlesVisible,
  objectColors,
  divisionGhostsVisible,
  editorObjectsVisible,
  measurements,
  measurementStart,
  onMeasurementMove,
  onMeasurementCancel,
  snapEnabled,
  uniqueObjectColors,
  focusRequest,
  initialViewport,
  onSelect,
  onCreate,
  onGeometryChange,
  onMapClick,
  onReferenceClick,
  removalSelectionStart,
  textureStatus,
  onTextureStatus,
  onViewportChange,
}) {
  const mapRef = useRef(null);
  const xplaneTextureLayersRef = useRef({ terrain: null, overlay: null });
  const msfsTextureLayerRef = useRef(null);
  const reconcileXPlaneLayersRef = useRef(null);
  const reconcileMsfsLayerRef = useRef(null);
  const textureRenderErrorRef = useRef('');
  const didInitialFitRef = useRef(false);
  const geomanRef = useRef(null);
  const geomanSyncingRef = useRef(false);
  const geomanSyncVersionRef = useRef(0);
  const geomanFeatureSyncStateRef = useRef(null);
  const geomanModeSyncKeyRef = useRef('');
  const geomanCallbacksRef = useRef({ onCreate, onGeometryChange, onSelect });
  const documentObjectsRef = useRef(document.objects);
  const originalDivisionsRef = useRef(document.originalDivisions);
  const measurementFrameRef = useRef(0);
  const pendingMeasurementCursorRef = useRef(null);
  const measurementDragRef = useRef(null);
  const toolRef = useRef(tool);
  const snapEnabledRef = useRef(snapEnabled);
  const liveDrawFeatureRef = useRef(null);
  const activeDrawAngleRef = useRef(null);
  const activeDrawVertexCountRef = useRef(0);
  const liveDrawFrameRef = useRef(0);
  const pendingLiveDrawCoordinatesRef = useRef(null);
  useLayoutEffect(() => {
    geomanCallbacksRef.current = { onCreate, onGeometryChange, onSelect };
    documentObjectsRef.current = document.objects;
    originalDivisionsRef.current = document.originalDivisions;
    toolRef.current = tool;
    snapEnabledRef.current = snapEnabled;
  }, [
    document.objects,
    document.originalDivisions,
    onCreate,
    onGeometryChange,
    onSelect,
    snapEnabled,
    tool,
  ]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const handleMapLoad = useCallback((event) => {
    event.target.touchZoomRotate.disableRotation();
    setMapLoaded(true);
    if (import.meta.env.DEV) globalThis.__BARS_EDITOR_MAP__ = event.target;
  }, []);
  useEffect(
    () => () => {
      if (import.meta.env.DEV) delete globalThis.__BARS_EDITOR_MAP__;
    },
    []
  );
  const [geomanReady, setGeomanReady] = useState(false);
  const [liveEdit, setLiveEdit] = useState(null);
  const [liveDrawCoordinates, setLiveDrawCoordinates] = useState(null);
  const [divisionPopup, setDivisionPopup] = useState(null);
  const [markingPopup, setMarkingPopup] = useState(null);
  const [measurementCursor, setMeasurementCursor] = useState(null);
  const [measurementDrag, setMeasurementDrag] = useState(null);
  const [measurementHovered, setMeasurementHovered] = useState(false);
  const [loadedMsfsTexturePatterns, setLoadedMsfsTexturePatterns] = useState(() => new Set());
  const selectedTextureReportCandidate =
    markingPopup?.candidates?.[markingPopup.selectedIndex] ?? null;
  const quickAddDivision = useCallback(
    (divisionId) => {
      const division = originalDivisionsRef.current.find(
        (candidate) => String(candidate.id).toUpperCase() === String(divisionId).toUpperCase()
      );
      if (division?.geometry?.type !== 'LineString') return;
      onCreate(division.geometry.coordinates, { divisionId: division.id });
      setDivisionPopup(null);
    },
    [onCreate]
  );
  const editorObjectGeojson = useMemo(
    () => editorDocumentToGeojson({ objects: document.objects, removals: [] }, { objectColors }),
    [document.objects, objectColors]
  );
  const editorGeojson = useMemo(
    () =>
      applyEditorGeometryPreviews(
        editorObjectGeojson,
        selectedId,
        liveEdit,
        tool === 'draw' ? liveDrawCoordinates : null
      ),
    [editorObjectGeojson, liveDrawCoordinates, liveEdit, selectedId, tool]
  );
  const displayedMeasurements = useMemo(
    () =>
      measurementDrag
        ? measurements.map((measurement) =>
            measurement.id === measurementDrag.id
              ? {
                  ...measurement,
                  coordinates: measurementDrag.coordinates,
                  distanceMeters: distanceMeters(
                    measurementDrag.coordinates[0],
                    measurementDrag.coordinates[1]
                  ),
                }
              : measurement
          )
        : measurements,
    [measurementDrag, measurements]
  );
  const measurementGeojson = useMemo(
    () => buildMeasurementGeojson(displayedMeasurements, measurementStart, measurementCursor),
    [displayedMeasurements, measurementCursor, measurementStart]
  );
  const removalSelectionGeojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: validMapCoordinate(removalSelectionStart)
        ? [
            {
              type: 'Feature',
              properties: { featureType: 'removal-selection-start' },
              geometry: { type: 'Point', coordinates: removalSelectionStart },
            },
          ]
        : [],
    }),
    [removalSelectionStart]
  );
  const referenceGeojson = useMemo(() => referenceSceneGeojson(referenceScene), [referenceScene]);
  const mapReferenceGeojson = useMemo(
    () => referenceMapGeojson(referenceGeojson),
    [referenceGeojson]
  );
  const selectedRemovalSectionGeojson = useMemo(
    () =>
      traceEditorSpan(
        'map:selected-removal-geojson',
        () => selectedRemovalGeojson(referenceGeojson, removalSelectionDocument ?? document),
        {
          referenceFeatureCount: referenceGeojson.features.length,
          removalCount: (removalSelectionDocument ?? document).removals.length,
        }
      ),
    [document, referenceGeojson, removalSelectionDocument]
  );
  const textureReportHighlightGeojson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features:
        import.meta.env.DEV &&
        tool === 'marking-debug' &&
        selectedTextureReportCandidate?.feature?.geometry
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: selectedTextureReportCandidate.feature.geometry,
              },
            ]
          : [],
    }),
    [selectedTextureReportCandidate?.feature?.geometry, tool]
  );
  const referenceFeaturesById = useMemo(() => {
    const featuresById = new globalThis.Map();
    for (const feature of referenceScene?.features ?? []) {
      for (const id of [feature.id, feature.properties?.sourceId]) {
        if (id !== null && id !== undefined && String(id) && !featuresById.has(String(id))) {
          featuresById.set(String(id), feature);
        }
      }
    }
    return featuresById;
  }, [referenceScene?.features]);
  const referenceFeaturesByRecordKey = useMemo(() => {
    const featuresByRecordKey = new globalThis.Map();
    for (const feature of referenceScene?.features ?? []) {
      const key = referenceRecordKey(feature.properties);
      if (key && !featuresByRecordKey.has(key)) featuresByRecordKey.set(key, feature);
    }
    return featuresByRecordKey;
  }, [referenceScene?.features]);
  const textureEntryIndex = useMemo(() => createTextureEntryIndex(sourceEntries), [sourceEntries]);
  const originalDivisionGeojson = useMemo(
    () =>
      divisionGhostsVisible
        ? originalDivisionsToGeojson(
            {
              objects: document.objects,
              originalDivisions: document.originalDivisions,
            },
            { objectColors }
          )
        : { type: 'FeatureCollection', features: [] },
    [divisionGhostsVisible, document.objects, document.originalDivisions, objectColors]
  );
  const referenceLatitude = useMemo(
    () =>
      Number(airport?.latitude) ||
      (referenceScene?.bounds
        ? (Number(referenceScene.bounds[1]) + Number(referenceScene.bounds[3])) / 2
        : 0),
    [airport?.latitude, referenceScene?.bounds]
  );
  const texturedReferenceLineWidth = useMemo(
    () => realWorldLineWidthExpression(referenceLatitude, { minimum: 1.5, fallback: 2 }),
    [referenceLatitude]
  );
  const selectedObject = document.objects.find((object) => object.partId === selectedId);
  const selectedObjectCoordinateCount = selectedObject?.coordinates.length ?? 0;
  const referenceSnapTargets = useMemo(
    () =>
      createGeomanReferenceSnapTargets(
        document.simulator === 'msfs'
          ? msfsReferenceSnapFeatures(
              (referenceScene?.features ?? []).filter((feature) =>
                referenceFeatureIsVisible(feature, visibleCategories)
              )
            )
          : (referenceScene?.features ?? []).filter((feature) =>
              referenceFeatureIsVisible(feature, visibleCategories)
            ),
        document.simulator === 'msfs' ? { maximumFeatures: MSFS_SNAP_TARGET_LIMIT } : undefined
      ),
    [document.simulator, referenceScene?.features, visibleCategories]
  );
  const editorLineColor = uniqueObjectColors
    ? ['get', 'color']
    : ['case', ['==', ['get', 'divisionType'], 'stopbar'], '#ef4444', '#22c55e'];
  const originalDivisionColor = uniqueObjectColors
    ? ['coalesce', ['get', 'color'], '#a5f3fc']
    : '#a5f3fc';
  const editorObjectVisibility = editorObjectsVisible ? 'visible' : 'none';
  const removalMode = tool === 'remove-light';
  const referenceHitLinesVisible = ['follow', 'draw', 'continue', 'remove-light'].includes(tool);
  const documentBounds = useMemo(
    () => geojsonBounds(editorGeojson.features),
    [editorGeojson.features]
  );
  const visibleFilter = useMemo(
    () => ['in', ['get', 'snapCategory'], ['literal', [...visibleCategories]]],
    [visibleCategories]
  );
  const loadedMsfsPaintedLinePatterns = useMemo(
    () => [...loadedMsfsTexturePatterns],
    [loadedMsfsTexturePatterns]
  );
  const removableReferenceFilter = useMemo(
    () =>
      document.simulator === 'msfs'
        ? [
            'all',
            ['==', ['get', 'msfsRemovalTarget'], true],
            ['==', ['get', 'snapCategory'], 'light-rows'],
          ]
        : [
            'all',
            [
              'in',
              ['get', 'sourceType'],
              ['literal', ['xplane-apt-light-string', 'xplane-dsf-light-string']],
            ],
            ['==', ['get', 'snapCategory'], 'light-rows'],
            ['!=', ['get', 'removable'], false],
          ],
    [document.simulator]
  );
  const referenceFillFilter = useMemo(() => {
    const filters = [
      'all',
      ['==', ['geometry-type'], 'Polygon'],
      visibleFilter,
      ['!=', ['get', 'snapCategory'], 'painted-lines'],
    ];
    if (document.simulator === 'xplane') {
      filters.push([
        'any',
        ['==', ['coalesce', ['get', 'texturePattern'], ''], ''],
        [
          '!',
          [
            'in',
            ['get', 'surfaceLabel'],
            ['literal', ['Grass', 'Dirt', 'Dry lakebed', 'Water', 'Snow or ice']],
          ],
        ],
      ]);
    }
    return filters;
  }, [document.simulator, visibleFilter]);
  const visibleTexturedFeatures = useMemo(
    () =>
      (referenceScene?.features ?? []).filter(
        (feature) =>
          ['LineString', 'Polygon', 'MultiPolygon'].includes(feature.geometry?.type) &&
          referenceFeatureIsVisible(feature, visibleCategories) &&
          (feature.properties?.texturePattern || feature.properties?.renderPattern)
      ),
    [referenceScene?.features, visibleCategories]
  );

  useEffect(() => {
    if (!mapRef.current || !mapLoaded || didInitialFitRef.current) return;
    const bounds = referenceScene?.bounds ?? documentBounds;
    didInitialFitRef.current = true;
    if (!bounds) return;
    mapRef.current.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: 60,
        maxZoom: 19,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
      }
    );
  }, [documentBounds, mapLoaded, referenceScene?.bounds]);

  useEffect(() => {
    if (!mapLoaded || !focusRequest?.id) return;
    const division =
      focusRequest.kind === 'division'
        ? originalDivisionsRef.current.find((candidate) => candidate.id === focusRequest.id)
        : null;
    const object =
      focusRequest.kind === 'division'
        ? null
        : documentObjectsRef.current.find((candidate) => candidate.partId === focusRequest.id);
    const coordinates =
      division?.geometry?.type === 'Point'
        ? [division.geometry.coordinates]
        : (division?.geometry?.coordinates ?? object?.coordinates);
    const bounds = coordinatesBounds(coordinates);
    if (!bounds || !mapRef.current) return;
    const [west, south, east, north] = bounds;
    if (division) {
      setDivisionPopup({
        longitude: (west + east) / 2,
        latitude: (south + north) / 2,
        id: division.id,
        name: division.name,
        type: division.type,
        matched: originalDivisionHasMatch(documentObjectsRef.current, division.id),
        quickAddable: division.geometry.type === 'LineString',
      });
    }
    const viewport = mapRef.current.getBounds();
    if (
      viewport &&
      west <= viewport.getEast() &&
      east >= viewport.getWest() &&
      south <= viewport.getNorth() &&
      north >= viewport.getSouth()
    ) {
      return;
    }
    if (west === east && south === north) {
      mapRef.current.easeTo({
        center: [west, south],
        zoom: Math.max(mapRef.current.getZoom(), 18),
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
        essential: false,
      });
      return;
    }
    mapRef.current.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      {
        padding: { top: 90, right: 90, bottom: 90, left: 90 },
        maxZoom: 19.25,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250,
        essential: false,
      }
    );
  }, [focusRequest, mapLoaded]);

  // Geoman allocates asynchronously; this cleanup owns every listener and destroys late instances.
  // oxlint-disable-next-line react-doctor/effect-needs-cleanup
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded) return undefined;
    let cancelled = false;
    let geoman;
    let restoreGeomanQueries = () => {};
    const queueLiveDrawCoordinates = (coordinates) => {
      pendingLiveDrawCoordinatesRef.current = coordinates;
      if (liveDrawFrameRef.current) return;
      liveDrawFrameRef.current = requestAnimationFrame(() => {
        liveDrawFrameRef.current = 0;
        setLiveDrawCoordinates(pendingLiveDrawCoordinatesRef.current);
      });
    };
    const clearLiveDrawCoordinates = () => {
      if (liveDrawFrameRef.current) cancelAnimationFrame(liveDrawFrameRef.current);
      liveDrawFrameRef.current = 0;
      pendingLiveDrawCoordinatesRef.current = null;
      setLiveDrawCoordinates(null);
    };
    const handleDrawPointerMove = (event) => {
      if (
        toolRef.current !== 'draw' ||
        !snapEnabledRef.current ||
        !liveDrawFeatureRef.current ||
        !event.lngLat
      ) {
        activeDrawAngleRef.current = null;
        return;
      }
      const geometry = liveDrawFeatureRef.current.getGeoJson?.().geometry;
      if (geometry?.type !== 'LineString' || geometry.coordinates.length < 2) {
        activeDrawAngleRef.current = null;
        activeDrawVertexCountRef.current = 0;
        return;
      }
      const committed = geometry.coordinates.slice(0, -1);
      if (activeDrawVertexCountRef.current !== committed.length) {
        activeDrawAngleRef.current = null;
        activeDrawVertexCountRef.current = committed.length;
      }
      const pointer = event.lngLat.toArray();
      const snapped = snapDrawAngle(
        committed.at(-2),
        committed.at(-1),
        pointer,
        activeDrawAngleRef.current
      );
      activeDrawAngleRef.current = snapped.direction;
      if (snapped.direction === null) return;
      event.lngLat.lng = snapped.coordinate[0];
      event.lngLat.lat = snapped.coordinate[1];
    };
    const handleCreate = async (event) => {
      if (geomanSyncingRef.current) return;
      clearLiveDrawCoordinates();
      const geometry = event.feature?.getGeoJson?.().geometry;
      if (geometry?.type === 'LineString') {
        try {
          await discardCompletedGeomanDraw(geomanRef.current, event.feature);
        } catch {
          geomanRef.current?.features.setSelection([], false);
        }
        geomanCallbacksRef.current.onCreate?.(geometry.coordinates);
      }
    };
    const handleEdit = (event) => {
      if (geomanSyncingRef.current) return;
      const feature = event.feature?.getGeoJson?.();
      const id = String(feature?.properties?.barsPartId ?? event.feature?.id ?? '');
      if (id && feature?.geometry?.type === 'LineString') {
        setLiveEdit({ id, coordinates: feature.geometry.coordinates });
      }
    };
    const handleEditEnd = (event) => {
      if (geomanSyncingRef.current) return;
      const feature = event.feature?.getGeoJson?.();
      const id = String(feature?.properties?.barsPartId ?? event.feature?.id ?? '');
      if (id && feature?.geometry?.type === 'LineString') {
        acknowledgeGeomanGeometryEdit(
          geomanFeatureSyncStateRef.current,
          id,
          feature.geometry.coordinates
        );
        geomanCallbacksRef.current.onGeometryChange?.(id, feature.geometry.coordinates);
      }
      setLiveEdit(null);
    };
    const handleSelection = (event) => {
      if (geomanSyncingRef.current) return;
      const id = event.selection?.at(-1);
      geomanCallbacksRef.current.onSelect?.(id == null ? null : String(id), {
        focus: false,
      });
    };
    const handleGeomanEvent = (event) => {
      if (event.name === 'gm:draw:shape_with_data') {
        if (event.action === 'start' || event.action === 'update') {
          liveDrawFeatureRef.current = event.featureData;
          const geometry = event.featureData?.getGeoJson?.().geometry;
          queueLiveDrawCoordinates(geometry?.type === 'LineString' ? geometry.coordinates : null);
        } else {
          liveDrawFeatureRef.current = null;
          activeDrawAngleRef.current = null;
          activeDrawVertexCountRef.current = 0;
        }
        return;
      }
      if (
        event.name === 'gm:draw:shape' &&
        (event.action === 'finish' || event.action === 'cancel')
      ) {
        clearLiveDrawCoordinates();
        liveDrawFeatureRef.current = null;
        activeDrawAngleRef.current = null;
        activeDrawVertexCountRef.current = 0;
      }
    };

    map.on('mousemove', handleDrawPointerMove);
    createGeomanInstance(map, {
      settings: {
        useControlsUi: false,
        useDefaultLayers: true,
        snapDistance: 18,
      },
      layerStyles: {
        line: {
          gm_main: [
            {
              type: 'line',
              paint: {
                'line-color': '#ffffff',
                'line-opacity': 0.01,
                'line-width': 8,
              },
            },
          ],
          gm_temporary: [
            {
              type: 'line',
              paint: {
                'line-color': '#ffffff',
                'line-opacity': 0.95,
                'line-width': 3,
              },
            },
          ],
        },
        circle_marker: {
          gm_main: [
            {
              type: 'circle',
              paint: {
                'circle-radius': 0,
                'circle-opacity': 0,
                'circle-stroke-width': 0,
                'circle-stroke-opacity': 0,
              },
            },
          ],
        },
        vertex_marker: {
          gm_internal: [
            {
              type: 'circle',
              paint: {
                'circle-radius': 6,
                'circle-color': '#22d3ee',
                'circle-opacity': 1,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 2,
                'circle-stroke-opacity': 1,
              },
            },
          ],
        },
        edge_marker: {
          gm_internal: [
            {
              type: 'circle',
              paint: {
                'circle-radius': 4.5,
                'circle-color': '#a1a1aa',
                'circle-opacity': 0.9,
                'circle-stroke-color': '#18181b',
                'circle-stroke-width': 1.5,
                'circle-stroke-opacity': 1,
              },
            },
          ],
        },
      },
    })
      .then((instance) => {
        if (cancelled) {
          instance.destroy({ removeSources: true });
          return;
        }
        geoman = instance;
        restoreGeomanQueries = limitGeomanFeatureQueries(instance, map, {
          featureIdProperty: FEATURE_ID_PROPERTY,
        });
        geomanRef.current = instance;
        geomanFeatureSyncStateRef.current = createGeomanFeatureSyncState();
        geomanModeSyncKeyRef.current = '';
        instance.setGlobalEventsListener(handleGeomanEvent);
        map.on('gm:create', handleCreate);
        map.on('gm:edit', handleEdit);
        map.on('gm:editend', handleEditEnd);
        map.on('gm:selection', handleSelection);
        setGeomanReady(true);
      })
      .catch((error) => {
        textureRenderErrorRef.current =
          error instanceof Error ? `Editing tools: ${error.message}` : String(error);
      });

    return () => {
      cancelled = true;
      setGeomanReady(false);
      map.off('gm:create', handleCreate);
      map.off('gm:edit', handleEdit);
      map.off('gm:editend', handleEditEnd);
      map.off('gm:selection', handleSelection);
      map.off('mousemove', handleDrawPointerMove);
      if (geomanRef.current === geoman) geomanRef.current = null;
      liveDrawFeatureRef.current = null;
      activeDrawAngleRef.current = null;
      activeDrawVertexCountRef.current = 0;
      if (liveDrawFrameRef.current) cancelAnimationFrame(liveDrawFrameRef.current);
      liveDrawFrameRef.current = 0;
      pendingLiveDrawCoordinatesRef.current = null;
      geomanFeatureSyncStateRef.current = null;
      geomanModeSyncKeyRef.current = '';
      restoreGeomanQueries();
      geoman?.setGlobalEventsListener();
      geoman?.destroy({ removeSources: true });
    };
  }, [mapLoaded]);

  useEffect(() => {
    const geoman = geomanRef.current;
    if (!geoman || !geomanReady) return undefined;
    let cancelled = false;
    const syncVersion = ++geomanSyncVersionRef.current;
    const isCurrent = () => !cancelled && geomanSyncVersionRef.current === syncVersion;
    const featureSync = planGeomanFeatureSync(geomanFeatureSyncStateRef.current, {
      objects: document.objects,
      selectedId,
      editorObjectsVisible,
      referenceSnapTargets,
      snapEnabled,
    });
    const selectedEditId =
      tool === 'select' && editHandlesVisible && selectedId && selectedObjectCoordinateCount >= 2
        ? selectedId
        : '';
    const modeSyncKey = `${tool}:${snapEnabled ? 'snap' : 'plain'}:${selectedEditId}`;
    if (
      featureSync.deleteIds.length === 0 &&
      featureSync.importFeatures.length === 0 &&
      geomanModeSyncKeyRef.current === modeSyncKey
    ) {
      geomanFeatureSyncStateRef.current = featureSync.nextState;
      return undefined;
    }
    const sync = async () => {
      geomanSyncingRef.current = true;
      try {
        // Geoman keeps edit markers for its current selection independently of the source feature.
        // Clear that selection before deleting/replacing features so orphaned control points cannot
        // survive an object deletion or selection change.
        geoman.features.setSelection([], false);
        await geoman.disableAllModes();
        if (!isCurrent()) return;
        if (featureSync.deleteIds.length > 0) {
          await Promise.allSettled(featureSync.deleteIds.map((id) => geoman.features.delete(id)));
          geoman.features.setSelection([], false);
        }
        if (!isCurrent()) return;
        if (featureSync.importFeatures.length > 0) {
          await geoman.features.importGeoJson({
            type: 'FeatureCollection',
            features: featureSync.importFeatures,
          });
        }
        if (!isCurrent()) return;
        geomanFeatureSyncStateRef.current = featureSync.nextState;
        const enableSnapping = async () => {
          if (!snapEnabled) return;
          await geoman.enableMode('helper', 'snapping');
        };
        if (tool === 'draw') {
          await geoman.enableDraw('line');
          await enableSnapping();
          if (isCurrent()) geomanModeSyncKeyRef.current = modeSyncKey;
          return;
        }
        if (tool === 'select') {
          if (editHandlesVisible && selectedId && selectedObjectCoordinateCount >= 2) {
            geoman.features.setSelection([selectedId], false);
          }
          await geoman.enableGlobalEditMode();
          if (!isCurrent()) return;
          await enableSnapping();
          bringGeomanControlLayersToFront(mapRef.current?.getMap?.());
        }
        if (isCurrent()) geomanModeSyncKeyRef.current = modeSyncKey;
      } finally {
        if (geomanSyncVersionRef.current === syncVersion) {
          geomanSyncingRef.current = false;
          reconcileXPlaneLayersRef.current?.();
          reconcileMsfsLayerRef.current?.();
        }
      }
    };
    sync().catch(() => {
      geomanSyncingRef.current = false;
      geomanModeSyncKeyRef.current = '';
    });
    return () => {
      cancelled = true;
    };
  }, [
    document.objects,
    editHandlesVisible,
    editorObjectsVisible,
    geomanReady,
    referenceSnapTargets,
    selectedId,
    selectedObjectCoordinateCount,
    snapEnabled,
    tool,
  ]);

  useEffect(() => {
    if (!mapLoaded || !geomanReady || !selectedId) return;
    bringGeomanControlLayersToFront(mapRef.current?.getMap?.());
  }, [divisionGhostsVisible, geomanReady, mapLoaded, selectedId]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded || !removalMode) return undefined;
    const reconcileRemovalOverlay = () => {
      placeLayerImmediatelyBefore(
        map,
        'removal-target-lines-above-bars',
        'selected-removal-section-lines'
      );
    };
    reconcileRemovalOverlay();
    map.on('styledata', reconcileRemovalOverlay);
    return () => map.off('styledata', reconcileRemovalOverlay);
  }, [mapLoaded, removalMode]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded || document.simulator !== 'xplane') return undefined;
    textureRenderErrorRef.current = '';
    const sharedTextureSources = new globalThis.Map();
    const reportStats = () => {
      onTextureStatus?.((current) => ({
        ...current,
        ...combinedXPlaneTextureStats(xplaneTextureLayersRef.current),
        renderError: textureRenderErrorRef.current,
      }));
    };
    const layers = {
      terrain: new SimulatorTextureLayer(reportStats, {
        id: 'xplane-terrain-textures',
        textureSources: sharedTextureSources,
      }),
      overlay: new SimulatorTextureLayer(reportStats, {
        id: 'xplane-airport-textures',
        textureSources: sharedTextureSources,
      }),
    };
    xplaneTextureLayersRef.current = layers;
    const addCustomLayer = (layer, beforeId) => {
      try {
        if (!map.getLayer(layer.id)) {
          map.addLayer(layer, beforeId);
          return;
        }
        const layerIds = map.getStyle().layers.map(({ id }) => id);
        const currentIndex = layerIds.indexOf(layer.id);
        const beforeIndex = layerIds.indexOf(beforeId);
        if (currentIndex >= 0 && beforeIndex >= 0 && currentIndex !== beforeIndex - 1) {
          map.moveLayer(layer.id, beforeId);
        }
      } catch (error) {
        textureRenderErrorRef.current = error instanceof Error ? error.message : String(error);
        onTextureStatus?.((current) => ({
          ...current,
          renderError: textureRenderErrorRef.current,
        }));
      }
    };
    const addLayers = () => {
      if (!map.isStyleLoaded()) return;
      if (map.getLayer('reference-fills')) {
        addCustomLayer(layers.terrain, 'reference-fills');
      }
      const overlayBeforeId = ['reference-painted-fills', 'reference-lines'].find((id) =>
        map.getLayer(id)
      );
      if (overlayBeforeId) addCustomLayer(layers.overlay, overlayBeforeId);
      map.triggerRepaint();
    };
    reconcileXPlaneLayersRef.current = addLayers;
    addLayers();
    map.on('styledata', addLayers);
    return () => {
      map.off('styledata', addLayers);
      for (const layer of [layers.overlay, layers.terrain]) {
        if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      }
      if (xplaneTextureLayersRef.current === layers) {
        xplaneTextureLayersRef.current = { terrain: null, overlay: null };
      }
      if (reconcileXPlaneLayersRef.current === addLayers) {
        reconcileXPlaneLayersRef.current = null;
      }
    };
  }, [document.simulator, mapLoaded, onTextureStatus]);

  // Texture status is an intentional parent-facing projection of this owned layer lifecycle.
  // oxlint-disable-next-line react-doctor/no-prop-callback-in-effect
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded || document.simulator !== 'msfs' || !renderBundle) return undefined;
    let cancelled = false;
    const loadedPackagePatterns = new Set();
    const publishLoadedPackagePatterns = () => {
      if (!cancelled) setLoadedMsfsTexturePatterns(new Set(loadedPackagePatterns));
    };
    const connectedBundle = reconnectMsfsRenderBundleFiles(renderBundle, sourceEntries);
    const descriptors = connectedBundle.textures || [];
    const layer = new SimulatorTextureLayer(
      (stats) => onTextureStatus?.((current) => ({ ...current, ...stats })),
      { id: 'msfs-scenery-textures' }
    );
    layer.setGeometry(connectedBundle.groups);
    msfsTextureLayerRef.current = layer;
    const directDescriptors = descriptors.filter((descriptor) => descriptor.image);
    const decodableDescriptors = descriptors.filter(
      (descriptor) => !descriptor.image && descriptor.file
    );
    const packageDescriptors = descriptors.filter((descriptor) => descriptor.source === 'package');
    const cachedDescriptors = [];
    const decodeJobs = [];
    for (const descriptor of decodableDescriptors) {
      const decodedKey = msfsDecodedTextureKey(sourceFingerprint, descriptor);
      const image = decodedTextureCache.get(decodedKey);
      if (image) cachedDescriptors.push({ descriptor, image });
      else decodeJobs.push({ descriptor, decodedKey });
    }
    const skipped = descriptors.length - directDescriptors.length - decodableDescriptors.length;
    for (const descriptor of directDescriptors) {
      layer.setTexture(descriptor.pattern, descriptor.image, {
        wrap: descriptor.wrap !== false,
        lineTexture: descriptor.lineTexture === true,
      });
      if (descriptor.source === 'package') loadedPackagePatterns.add(descriptor.pattern);
    }
    for (const { descriptor, image } of cachedDescriptors) {
      layer.setTexture(descriptor.pattern, image, {
        wrap: descriptor.wrap !== false,
        lineTexture: descriptor.lineTexture === true,
      });
      if (descriptor.source === 'package') loadedPackagePatterns.add(descriptor.pattern);
    }
    publishLoadedPackagePatterns();
    onTextureStatus?.({
      phase: decodeJobs.length > 0 ? 'loading' : 'ready',
      total: descriptors.length,
      loaded: directDescriptors.length + cachedDescriptors.length,
      packageTotal: packageDescriptors.length,
      packageLoaded:
        directDescriptors.filter((descriptor) => descriptor.source === 'package').length +
        cachedDescriptors.filter(({ descriptor }) => descriptor.source === 'package').length,
      fallbackLoaded: directDescriptors.filter((descriptor) => descriptor.source === 'fallback')
        .length,
      missing: 0,
      failed: 0,
      skipped,
      meshGroups: renderBundle.groups.length,
      drawableGroups: directDescriptors.length,
      drawnGroups: 0,
      drawnTriangles: 0,
      renderError: '',
      cached: cachedDescriptors.length,
      connected: decodeJobs.length,
    });
    const workers = Array.from(
      { length: Math.min(MSFS_TEXTURE_WORKER_COUNT, decodeJobs.length) },
      createMsfsTextureWorkerClient
    );
    let remaining = decodeJobs.length;
    runTextureWorkerQueue(workers, decodeJobs, async (worker, job) => {
      let image = null;
      let failed = false;
      try {
        image = await worker.decode(job.descriptor);
        if (!image && job.descriptor.fallbackImage) {
          failed = true;
          image = job.descriptor.fallbackImage;
        }
        if (cancelled) return;
        if (image) {
          if (!failed) decodedTextureCache.set(job.decodedKey, image);
          layer.setTexture(job.descriptor.pattern, image, {
            wrap: job.descriptor.wrap !== false,
            lineTexture: job.descriptor.lineTexture === true,
          });
          if (!failed && job.descriptor.source === 'package') {
            loadedPackagePatterns.add(job.descriptor.pattern);
          }
        }
      } catch {
        failed = true;
        image = job.descriptor.fallbackImage || null;
        if (!cancelled && image) {
          layer.setTexture(job.descriptor.pattern, image, {
            wrap: job.descriptor.wrap !== false,
            lineTexture: job.descriptor.lineTexture === true,
          });
        }
      } finally {
        remaining -= 1;
      }
      if (!cancelled) {
        if (remaining === 0) publishLoadedPackagePatterns();
        onTextureStatus?.((current) => ({
          ...current,
          phase: remaining === 0 ? 'ready' : 'loading',
          loaded: (current.loaded || 0) + (image ? 1 : 0),
          packageLoaded:
            (current.packageLoaded || 0) +
            (image && !failed && job.descriptor.source === 'package' ? 1 : 0),
          fallbackLoaded:
            (current.fallbackLoaded || 0) +
            (image && (failed || job.descriptor.source === 'fallback') ? 1 : 0),
          failed: (current.failed || 0) + (failed ? 1 : 0),
        }));
      }
    }).catch(() => {});
    // The first contribution handoff can mount this effect before react-map-gl
    // has installed the reference layers. Keep trying until an anchor exists;
    // a one-shot styledata listener can miss the event that adds those layers.
    const placement = maintainCustomLayerBefore(
      map,
      layer,
      ['reference-painted-fills', 'reference-lines'],
      {
        onError: (error) => {
          onTextureStatus?.((current) => ({
            ...current,
            phase: 'error',
            renderError: error instanceof Error ? error.message : String(error),
          }));
        },
      }
    );
    reconcileMsfsLayerRef.current = placement.reconcile;
    return () => {
      cancelled = true;
      setLoadedMsfsTexturePatterns(new Set());
      for (const worker of workers) worker.terminate();
      placement.stop();
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      if (msfsTextureLayerRef.current === layer) msfsTextureLayerRef.current = null;
      if (reconcileMsfsLayerRef.current === placement.reconcile) {
        reconcileMsfsLayerRef.current = null;
      }
    };
  }, [
    document.simulator,
    mapLoaded,
    onTextureStatus,
    renderBundle,
    sourceEntries,
    sourceFingerprint,
  ]);

  useEffect(() => {
    if (document.simulator !== 'msfs') return;
    msfsTextureLayerRef.current?.setGroupVisibility((group) =>
      msfsRenderGroupIsVisible(group, visibleCategories)
    );
  }, [document.simulator, renderBundle, visibleCategories]);

  useEffect(() => {
    if (document.simulator !== 'xplane' || !mapLoaded) return;
    const layers = xplaneTextureLayersRef.current;
    for (const [pattern, image] of createReferenceTextureFallbacks(referenceScene?.features)) {
      setXPlaneTexture(layers, pattern, image, {
        wrap: true,
        lineTexture: true,
      });
    }
  }, [document.simulator, mapLoaded, referenceScene?.features]);

  useEffect(() => {
    if (document.simulator !== 'xplane' || !mapLoaded) return undefined;
    const worker = new Worker(new URL('./xplane-texture-mesh.worker.js', import.meta.url), {
      type: 'module',
    });
    const id = 1;
    worker.onmessage = (event) => {
      if (event.data?.id !== id) return;
      if (event.data.type === 'error') {
        textureRenderErrorRef.current =
          event.data.error || 'X-Plane texture mesh could not be built.';
        onTextureStatus?.((current) => ({
          ...current,
          renderError: textureRenderErrorRef.current,
        }));
        worker.terminate();
        return;
      }
      if (event.data.type !== 'complete') return;
      const layers = xplaneTextureLayersRef.current;
      layers.terrain?.setGeometry(
        event.data.groups.filter((group) => group.renderPass === 'terrain')
      );
      layers.overlay?.setGeometry(
        event.data.groups.filter((group) => group.renderPass !== 'terrain')
      );
      worker.terminate();
    };
    worker.postMessage({ type: 'build', id, features: visibleTexturedFeatures });
    return () => worker.terminate();
  }, [document.simulator, mapLoaded, onTextureStatus, visibleTexturedFeatures]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (
      !map ||
      !mapLoaded ||
      !map.isStyleLoaded() ||
      document.simulator === 'xplane' ||
      (document.simulator === 'msfs' && renderBundle)
    )
      return;
    installReferenceTextureFallbacks(map, referenceScene?.features);
  }, [document.simulator, mapLoaded, referenceScene?.features, renderBundle]);

  // Texture status is an intentional parent-facing projection of this owned loading lifecycle.
  // oxlint-disable-next-line react-doctor/no-prop-callback-in-effect
  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded || document.simulator !== 'xplane') return undefined;
    let cancelled = false;
    let retryTimer;
    const entryIndex = createTextureEntryIndex(sourceEntries);
    const textures = new globalThis.Map();
    for (const feature of referenceScene?.features ?? []) {
      const path = normalizeAssetPath(feature.properties?.textureAssetPath);
      const pattern = referenceTexturePattern(feature);
      if (path && pattern && !textures.has(pattern)) {
        textures.set(pattern, {
          path,
          properties: feature.properties,
          lineTexture: feature.geometry?.type === 'LineString',
        });
      }
    }
    const textureList = Array.from(textures).sort(
      ([, left], [, right]) => textureLoadPriority(left) - textureLoadPriority(right)
    );
    const workers = Array.from(
      { length: Math.min(TEXTURE_WORKER_COUNT, Math.max(1, textureList.length)) },
      createTextureWorkerClient
    );
    onTextureStatus?.({
      phase: textureList.length > 0 ? 'loading' : 'ready',
      total: textures.size,
      loaded: 0,
      missing: 0,
      failed: 0,
      skipped: 0,
      cached: 0,
      connected: 0,
      ...combinedXPlaneTextureStats(xplaneTextureLayersRef.current),
      renderError: textureRenderErrorRef.current,
    });

    const load = async () => {
      if (!map.isStyleLoaded()) {
        retryTimer = window.setTimeout(load, 50);
        return;
      }
      let loadedSourceBytes = 0;
      const countedSourcePaths = new Set();
      const cachedEntries = await loadReferenceTextures(
        sourceFingerprint,
        [...textures.values()].map((texture) => texture.path)
      );
      const jobs = [];
      let missing = 0;
      let skipped = 0;
      for (const [pattern, texture] of textureList) {
        const decodedKey = decodedTextureKey(texture.path, texture.properties, texture.lineTexture);
        const decoded = decodedTextureCache.get(decodedKey);
        if (decoded) {
          jobs.push({
            pattern,
            texture,
            decoded,
            decodedKey,
            source: 'memory',
          });
          continue;
        }
        const connectedEntry = findTextureEntry(entryIndex, texture.path);
        const cachedEntry = cachedEntries.get(texture.path);
        const entry =
          connectedEntry ?? (cachedEntry ? { ...cachedEntry, file: cachedEntry.blob } : null);
        const size = Number(entry?.size ?? entry?.file?.size) || 0;
        const additionalBytes = countedSourcePaths.has(texture.path) ? 0 : size;
        if (!entry?.file) {
          missing += 1;
          continue;
        }
        if (
          size > MAX_LOCAL_TEXTURE_BYTES ||
          loadedSourceBytes + additionalBytes > MAX_TOTAL_TEXTURE_BYTES
        ) {
          skipped += 1;
          continue;
        }
        loadedSourceBytes += additionalBytes;
        countedSourcePaths.add(texture.path);
        jobs.push({
          pattern,
          texture,
          entry,
          decodedKey,
          source: connectedEntry ? 'folder' : 'cache',
        });
      }

      let loaded = 0;
      let failed = 0;
      let cached = 0;
      let connected = 0;
      await runTextureWorkerQueue(
        workers,
        jobs,
        async (worker, { pattern, texture, entry, decoded, decodedKey, source }) => {
          try {
            const result = decoded
              ? { image: decoded }
              : await worker.decode({
                  file: entry.file,
                  path: texture.path,
                  properties: texture.properties,
                  maximumEdge: MAX_TEXTURE_EDGE,
                  lineTextureSource: texture.lineTexture,
                });
            if (cancelled) return;
            if (!decoded && result.image) decodedTextureCache.set(decodedKey, result.image);
            if (result.image && document.simulator === 'xplane') {
              setXPlaneTexture(xplaneTextureLayersRef.current, pattern, result.image, {
                wrap: texture.properties?.textureWrap !== false,
                lineTexture: texture.lineTexture,
              });
            }
            if (document.simulator !== 'xplane') {
              installMapTexture(map, pattern, result);
            }
            loaded += 1;
            if (source === 'folder') connected += 1;
            else cached += 1;
          } catch {
            failed += 1;
          }
        }
      );
      if (!cancelled) {
        reconcileXPlaneLayersRef.current?.();
        onTextureStatus?.({
          phase: 'ready',
          total: textures.size,
          loaded,
          missing,
          failed,
          skipped,
          cached,
          connected,
          ...combinedXPlaneTextureStats(xplaneTextureLayersRef.current),
          renderError: textureRenderErrorRef.current,
        });
      }
    };
    load().catch(() => {
      if (!cancelled) {
        onTextureStatus?.({
          phase: 'error',
          total: textures.size,
          loaded: 0,
          missing: textures.size,
          failed: 0,
          skipped: 0,
          cached: 0,
          connected: 0,
          ...combinedXPlaneTextureStats(xplaneTextureLayersRef.current),
          renderError: textureRenderErrorRef.current,
        });
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      for (const worker of workers) worker.terminate();
    };
  }, [
    document.simulator,
    mapLoaded,
    referenceScene?.features,
    sourceEntries,
    sourceFingerprint,
    onTextureStatus,
  ]);

  const clearMeasurementCursor = useCallback(() => {
    pendingMeasurementCursorRef.current = null;
    if (measurementFrameRef.current) cancelAnimationFrame(measurementFrameRef.current);
    measurementFrameRef.current = 0;
    setMeasurementCursor(null);
  }, []);

  const handleClick = useCallback(
    (event) => {
      const coordinate = [event.lngLat.lng, event.lngLat.lat];
      const features = (event.features ?? []).map((feature) =>
        restoreReferenceMapFeature(feature, referenceGeojson)
      );
      const editorFeature = features.find((feature) => EDITOR_LAYER_IDS.includes(feature.layer.id));
      const divisionFeature = features.find((feature) =>
        ORIGINAL_DIVISION_LAYER_IDS.includes(feature.layer.id)
      );
      const referenceFeature = features.find((feature) =>
        REFERENCE_LAYER_IDS.includes(feature.layer.id)
      );
      if (tool === 'measure') {
        if (features.some(isCompletedMeasurementFeature)) return;
        clearMeasurementCursor();
        onMapClick(coordinate, { editorFeature, divisionFeature, referenceFeature });
        return;
      }
      if (import.meta.env.DEV && tool === 'marking-debug') {
        const renderedReferences = features.filter((feature) =>
          REFERENCE_LAYER_IDS.includes(feature.layer.id)
        );
        if (renderedReferences.length === 0) {
          setMarkingPopup(null);
          return;
        }
        const seenCandidates = new Set();
        const candidates = renderedReferences.flatMap((renderedFeature, index) => {
          const featureId = String(
            renderedFeature.id ?? renderedFeature.properties?.sourceId ?? ''
          );
          const recordKey = referenceRecordKey(renderedFeature.properties);
          const originalFeature =
            referenceFeaturesByRecordKey.get(recordKey) ??
            referenceFeaturesById.get(featureId) ??
            renderedFeature;
          const candidateKey = `${renderedFeature.layer.id}|${recordKey || originalFeature.id || featureId || index}`;
          if (seenCandidates.has(candidateKey)) return [];
          seenCandidates.add(candidateKey);
          const texturePath = originalFeature.properties?.textureAssetPath;
          const resolvedEntry = texturePath
            ? findTextureEntry(textureEntryIndex, texturePath)
            : null;
          return [
            {
              key: candidateKey,
              feature: originalFeature,
              diagnostic: createTextureFallbackReport({
                airportIcao,
                simulator: document.simulator,
                expectedAppearance: '',
                feature: originalFeature,
                clickedCoordinate: coordinate,
                renderedLayerId: renderedFeature.layer.id,
                resolvedEntry,
                textureStatus,
              }),
            },
          ];
        });
        setMarkingPopup({
          longitude: coordinate[0],
          latitude: coordinate[1],
          copied: false,
          expectedAppearance: '',
          candidates,
          selectedIndex: 0,
        });
        return;
      }
      if (tool === 'remove-light') {
        onReferenceClick(referenceFeature, coordinate);
        return;
      }
      if (referenceFeature && ['follow', 'draw', 'continue'].includes(tool)) {
        onReferenceClick(referenceFeature, coordinate);
        return;
      }
      if (editorFeature && !['draw', 'follow'].includes(tool)) {
        setDivisionPopup(null);
        onSelect(String(editorFeature.properties.editorId), { focus: true });
      } else if (divisionFeature && tool === 'select') {
        onSelect(null, { focus: false });
        setDivisionPopup({
          longitude: coordinate[0],
          latitude: coordinate[1],
          id: String(divisionFeature.properties.divisionId ?? ''),
          name: String(
            divisionFeature.properties.title ||
              divisionFeature.properties.divisionId ||
              'Division object'
          ),
          type: String(divisionFeature.properties.divisionType ?? ''),
          matched: divisionFeature.properties.matched === true,
          quickAddable: divisionFeature.properties.quickAddable === true,
        });
      } else if (!editorFeature && tool === 'select') {
        setDivisionPopup(null);
        onSelect(null, { focus: false });
      }
      onMapClick(coordinate, { editorFeature, divisionFeature, referenceFeature });
    },
    [
      clearMeasurementCursor,
      airportIcao,
      document.simulator,
      onMapClick,
      onReferenceClick,
      onSelect,
      referenceFeaturesById,
      referenceFeaturesByRecordKey,
      referenceGeojson,
      textureEntryIndex,
      textureStatus,
      tool,
    ]
  );

  const copyMarkingDiagnostic = useCallback(async () => {
    const expectedAppearance = markingPopup?.expectedAppearance?.trim();
    const candidate = markingPopup?.candidates?.[markingPopup.selectedIndex];
    if (!candidate?.diagnostic || !expectedAppearance) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(
          {
            ...candidate.diagnostic,
            expectedAppearance,
            overlappingCandidates: markingPopup.candidates.map(({ diagnostic }) => ({
              id: diagnostic.selectedObject.id,
              title: diagnostic.selectedObject.title,
              renderedLayerId: diagnostic.renderedLayerId,
              sourceRecordOffset: diagnostic.sourceProperties.sourceRecordOffset ?? null,
              materialGuid: diagnostic.sourceProperties.materialGuid ?? '',
              fallbackRenderMode: diagnostic.sourceProperties.fallbackRenderMode ?? '',
            })),
          },
          null,
          2
        )
      );
      setMarkingPopup((current) => (current ? { ...current, copied: true } : current));
    } catch {
      setMarkingPopup((current) =>
        current ? { ...current, copied: false, copyFailed: true } : current
      );
    }
  }, [markingPopup]);

  const handleStyleImageMissing = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (map) installReferenceTextureFallbacks(map, referenceScene?.features);
  }, [referenceScene?.features]);

  const handleMouseMove = useCallback(
    (event) => {
      const currentDrag = measurementDragRef.current;
      if (currentDrag) {
        const nextDrag = {
          ...currentDrag,
          coordinates:
            currentDrag.endpointIndex == null
              ? currentDrag.originalCoordinates.map(([longitude, latitude]) => [
                  longitude + (event.lngLat.lng - currentDrag.pointerStart[0]),
                  latitude + (event.lngLat.lat - currentDrag.pointerStart[1]),
                ])
              : currentDrag.originalCoordinates.map((coordinate, index) =>
                  index === currentDrag.endpointIndex
                    ? [event.lngLat.lng, event.lngLat.lat]
                    : coordinate
                ),
        };
        measurementDragRef.current = nextDrag;
        setMeasurementDrag(nextDrag);
        return;
      }
      setMeasurementHovered(
        tool === 'measure' && (event.features ?? []).some(isCompletedMeasurementFeature)
      );
      if (tool !== 'measure' || !measurementStart) return;
      pendingMeasurementCursorRef.current = [event.lngLat.lng, event.lngLat.lat];
      if (measurementFrameRef.current) return;
      measurementFrameRef.current = requestAnimationFrame(() => {
        measurementFrameRef.current = 0;
        setMeasurementCursor(pendingMeasurementCursorRef.current);
      });
    },
    [measurementStart, tool]
  );

  const handleMouseDown = useCallback(
    (event) => {
      if (tool !== 'measure' || event.originalEvent?.button !== 0) return;
      const measurementFeature = (event.features ?? []).find(isCompletedMeasurementFeature);
      const measurementId = String(measurementFeature?.properties?.measurementId ?? '');
      const measurement = measurements.find((candidate) => candidate.id === measurementId);
      if (!measurement) return;
      event.originalEvent?.preventDefault?.();
      clearMeasurementCursor();
      mapRef.current?.getMap?.().dragPan.disable();
      const nextDrag = {
        id: measurement.id,
        endpointIndex:
          measurementFeature.layer.id === 'editor-measurement-points' &&
          Number.isInteger(Number(measurementFeature.properties?.endpointIndex))
            ? Number(measurementFeature.properties.endpointIndex)
            : null,
        pointerStart: [event.lngLat.lng, event.lngLat.lat],
        originalCoordinates: measurement.coordinates,
        coordinates: measurement.coordinates,
      };
      measurementDragRef.current = nextDrag;
      setMeasurementDrag(nextDrag);
    },
    [clearMeasurementCursor, measurements, tool]
  );

  const finishMeasurementDrag = useCallback(() => {
    const currentDrag = measurementDragRef.current;
    if (currentDrag) onMeasurementMove(currentDrag.id, currentDrag.coordinates);
    measurementDragRef.current = null;
    mapRef.current?.getMap?.().dragPan.enable();
    setMeasurementDrag(null);
  }, [onMeasurementMove]);

  const handleContextMenu = useCallback(
    (event) => {
      if (tool !== 'measure' || !measurementStart) return;
      event.preventDefault?.();
      event.originalEvent?.preventDefault?.();
      clearMeasurementCursor();
      onMeasurementCancel();
    },
    [clearMeasurementCursor, measurementStart, onMeasurementCancel, tool]
  );

  const handleMouseLeave = useCallback(() => {
    setMeasurementHovered(false);
    if (measurementDragRef.current) finishMeasurementDrag();
    else clearMeasurementCursor();
  }, [clearMeasurementCursor, finishMeasurementDrag]);

  useEffect(
    () => () => {
      if (measurementFrameRef.current) cancelAnimationFrame(measurementFrameRef.current);
      mapRef.current?.getMap?.().dragPan.enable();
    },
    []
  );

  const initialViewState = {
    ...(initialViewport ?? {
      longitude: airport?.longitude ?? referenceScene?.bounds?.[0] ?? 0,
      latitude: airport?.latitude ?? referenceScene?.bounds?.[1] ?? 0,
      zoom: 15,
    }),
    bearing: 0,
    pitch: 0,
  };
  const interactiveLayerIds = useMemo(
    () => [
      ...EDITOR_LAYER_IDS,
      ...MEASUREMENT_LAYER_IDS,
      ...(divisionGhostsVisible ? ORIGINAL_DIVISION_LAYER_IDS : []),
      ...(['follow', 'draw', 'continue', 'remove-light', 'marking-debug'].includes(tool)
        ? REFERENCE_LAYER_IDS
        : []),
    ],
    [divisionGhostsVisible, tool]
  );

  return (
    <div className="contribution-editor-map relative h-full min-h-[34rem] overflow-hidden bg-zinc-950">
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={AIRFIELD_STYLE}
        onLoad={handleMapLoad}
        onMoveEnd={(event) => onViewportChange?.(event.viewState)}
        onStyleImageMissing={handleStyleImageMissing}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={tool === 'measure' ? handleMouseDown : undefined}
        onMouseMove={tool === 'measure' ? handleMouseMove : undefined}
        onMouseUp={tool === 'measure' ? finishMeasurementDrag : undefined}
        onMouseLeave={tool === 'measure' ? handleMouseLeave : undefined}
        interactiveLayerIds={interactiveLayerIds}
        antialias
        renderWorldCopies={false}
        dragRotate={false}
        maxPitch={0}
        doubleClickZoom={!['draw', 'measure'].includes(tool)}
        cursor={
          measurementDrag
            ? 'grabbing'
            : tool === 'measure' && measurementHovered
              ? 'grab'
              : ['draw', 'measure'].includes(tool)
                ? 'crosshair'
                : ['follow', 'remove-light', 'marking-debug'].includes(tool)
                  ? 'cell'
                  : 'default'
        }
      >
        <NavigationControl position="bottom-right" showCompass={false} />
        <ScaleControl position="bottom-left" />

        {satelliteVisible && SATELLITE_TILE_URL ? (
          <Source
            id="satellite-reference"
            type="raster"
            tiles={[SATELLITE_TILE_URL]}
            tileSize={256}
            maxzoom={22}
            attribution='<a href="https://www.mapbox.com/about/maps/">© Mapbox</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>'
          >
            <Layer
              id="satellite-reference"
              type="raster"
              paint={{
                'raster-opacity': 0.92,
                'raster-resampling': 'linear',
                'raster-fade-duration': 0,
              }}
            />
          </Source>
        ) : null}

        <Source id="simulator-reference" type="geojson" data={mapReferenceGeojson}>
          {document.simulator === 'xplane' ? (
            <Layer
              id="reference-texture-bases"
              type="fill"
              filter={[
                'all',
                ['==', ['geometry-type'], 'Polygon'],
                visibleFilter,
                ['!=', ['coalesce', ['get', 'texturePattern'], ''], ''],
                [
                  'in',
                  ['get', 'surfaceLabel'],
                  ['literal', ['Grass', 'Dirt', 'Dry lakebed', 'Water', 'Snow or ice']],
                ],
              ]}
              paint={{
                'fill-color': ['coalesce', ['get', 'surfaceColor'], '#3f6212'],
                'fill-opacity': ['case', ['==', ['get', 'surfaceLabel'], 'Grass'], 0.82, 0.78],
              }}
            />
          ) : null}
          <Layer
            id="reference-fills"
            type="fill"
            filter={referenceFillFilter}
            paint={{
              'fill-color': [
                'case',
                ['==', ['get', 'snapCategory'], 'pavement-edges'],
                ['coalesce', ['get', 'surfaceColor'], '#52525b'],
                ['==', ['get', 'snapCategory'], 'runways'],
                ['coalesce', ['get', 'surfaceColor'], '#3f3f46'],
                ['==', ['get', 'snapCategory'], 'painted-lines'],
                ['coalesce', ['get', 'markingColor'], '#f5f5f4'],
                REFERENCE_COLOR,
              ],
              'fill-opacity': [
                'case',
                ['==', ['get', 'surfaceLabel'], 'Transparent'],
                0,
                [
                  'in',
                  ['get', 'surfaceLabel'],
                  ['literal', ['Grass', 'Dirt', 'Dry lakebed', 'Water', 'Snow or ice']],
                ],
                ['coalesce', ['get', 'surfaceOpacity'], 0.78],
                ['in', ['get', 'snapCategory'], ['literal', ['pavement-edges', 'runways']]],
                ['coalesce', ['get', 'surfaceOpacity'], document.simulator === 'xplane' ? 1 : 0.78],
                ['==', ['get', 'snapCategory'], 'painted-lines'],
                0.96,
                0.12,
              ],
            }}
          />
          {document.simulator === 'xplane' ? (
            <Layer
              id="reference-painted-texture-bases"
              type="fill"
              filter={[
                'all',
                ['==', ['geometry-type'], 'Polygon'],
                visibleFilter,
                ['==', ['get', 'snapCategory'], 'painted-lines'],
                ['!=', ['coalesce', ['get', 'texturePattern'], ''], ''],
              ]}
              paint={{
                'fill-color': ['coalesce', ['get', 'markingColor'], '#f5f5f4'],
                'fill-opacity': 0.96,
              }}
            />
          ) : null}
          {document.simulator !== 'xplane' ? (
            <Layer
              id="reference-textured-fills"
              type="fill"
              filter={[
                'all',
                ['==', ['geometry-type'], 'Polygon'],
                visibleFilter,
                ['!=', ['coalesce', ['get', 'texturePattern'], ''], ''],
              ]}
              paint={{
                'fill-pattern': ['image', ['get', 'texturePattern']],
                'fill-opacity': 0.12,
              }}
            />
          ) : null}
          <Layer
            id="reference-painted-fills"
            type="fill"
            filter={[
              'all',
              ['==', ['geometry-type'], 'Polygon'],
              visibleFilter,
              ['==', ['get', 'snapCategory'], 'painted-lines'],
              ['==', ['coalesce', ['get', 'texturePattern'], ''], ''],
            ]}
            paint={{
              'fill-color': ['coalesce', ['get', 'markingColor'], '#f5f5f4'],
              'fill-opacity': 0.96,
            }}
          />
          <Layer
            id="reference-light-rows"
            type="line"
            filter={[
              'all',
              ['==', ['geometry-type'], 'LineString'],
              visibleFilter,
              ['==', ['get', 'snapCategory'], 'light-rows'],
            ]}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{
              'line-color': REFERENCE_COLOR,
              'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 19, 3],
              'line-opacity': removalMode ? 0 : 0.82,
            }}
          />
          <Layer
            id="reference-lines"
            type="line"
            filter={[
              'all',
              ['==', ['geometry-type'], 'LineString'],
              visibleFilter,
              ['!=', ['get', 'snapCategory'], 'painted-lines'],
              ...(document.simulator === 'xplane'
                ? [
                    ['!=', ['get', 'snapCategory'], 'runways'],
                    ['==', ['coalesce', ['get', 'renderPattern'], ''], ''],
                  ]
                : []),
            ]}
            layout={{
              visibility:
                referenceHitLinesVisible || (import.meta.env.DEV && tool === 'marking-debug')
                  ? 'visible'
                  : 'none',
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{
              'line-color': REFERENCE_COLOR,
              'line-width': removalMode ? REMOVAL_REFERENCE_LINE_WIDTH : REFERENCE_LINE_WIDTH,
              // Normal editing keeps this layer as an invisible hit target. The dev report tool
              // reveals the reference geometry, while its selected candidate gets an amber border.
              'line-opacity': import.meta.env.DEV && tool === 'marking-debug' ? 0.82 : 0,
            }}
          />
          {document.simulator !== 'xplane' ? (
            <Layer
              id="reference-textured-lines"
              type="line"
              filter={[
                'all',
                ['==', ['geometry-type'], 'LineString'],
                visibleFilter,
                ['!=', ['coalesce', ['get', 'renderPattern'], ''], ''],
              ]}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-pattern': TEXTURED_REFERENCE_LINE_PATTERN,
                'line-width': texturedReferenceLineWidth,
                'line-opacity': 0.08,
              }}
            />
          ) : null}
          <Layer
            id="reference-painted-lines"
            type="line"
            filter={[
              'all',
              ['==', ['geometry-type'], 'LineString'],
              visibleFilter,
              ['==', ['get', 'snapCategory'], 'painted-lines'],
            ]}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ['coalesce', ['get', 'markingColor'], '#facc15'],
              'line-width': REFERENCE_LINE_WIDTH,
              'line-opacity': [
                'case',
                [
                  'in',
                  ['coalesce', ['get', 'exactTexturePattern'], ''],
                  ['literal', loadedMsfsPaintedLinePatterns],
                ],
                0,
                ['!=', ['coalesce', ['get', 'renderPattern'], ''], ''],
                document.simulator === 'xplane' ? 0 : 0.72,
                1,
              ],
            }}
          />
          <Layer
            id="reference-points"
            type="circle"
            filter={[
              'all',
              ['==', ['geometry-type'], 'Point'],
              visibleFilter,
              ...(removalMode
                ? [
                    [
                      'any',
                      ['!=', ['get', 'snapCategory'], 'fixtures'],
                      ['all', ['has', 'dsfRemoval'], ['!=', ['get', 'removable'], false]],
                    ],
                  ]
                : []),
            ]}
            paint={{
              'circle-color': ['coalesce', ['get', 'lightColor'], REFERENCE_COLOR],
              'circle-radius': removalMode
                ? [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    13,
                    ['case', removableReferenceFilter, 4, 2],
                    19,
                    ['case', removableReferenceFilter, 7, 4],
                  ]
                : ['interpolate', ['linear'], ['zoom'], 13, 2, 19, 5],
              'circle-stroke-color': '#09090b',
              'circle-stroke-width': 1,
              'circle-opacity': 0.85,
            }}
          />
          <Layer
            id="reference-removal-hit-lines"
            type="line"
            filter={[
              'all',
              ['==', ['geometry-type'], 'LineString'],
              visibleFilter,
              removableReferenceFilter,
            ]}
            layout={{
              visibility: removalMode ? 'visible' : 'none',
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{ 'line-color': '#ffffff', 'line-width': 24, 'line-opacity': 0.01 }}
          />
        </Source>

        <Source id="editor-draft" type="geojson" data={editorGeojson}>
          <Layer
            id="editor-lines"
            type="line"
            filter={[
              'all',
              ['==', ['get', 'featureType'], 'editor-object'],
              ['!=', ['get', 'editorId'], selectedId ?? ''],
            ]}
            layout={{
              visibility: editorObjectVisibility,
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{
              'line-color': editorLineColor,
              'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 19, 6],
              'line-opacity': removalMode ? 0.5 : 0.94,
            }}
          />
          <Layer
            id="editor-points"
            type="circle"
            filter={[
              'all',
              ['==', ['get', 'featureType'], 'editor-object'],
              ['==', ['geometry-type'], 'Point'],
            ]}
            layout={{ visibility: editorObjectVisibility }}
            paint={{
              'circle-color': editorLineColor,
              'circle-radius': 6,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.5,
              'circle-opacity': removalMode ? 0.5 : 1,
              'circle-stroke-opacity': removalMode ? 0.5 : 1,
            }}
          />
          <Layer
            id="editor-selected-casing"
            type="line"
            filter={['==', ['get', 'editorId'], selectedId ?? '']}
            layout={{
              visibility: editorObjectVisibility,
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{
              'line-color': '#ffffff',
              'line-width': ['interpolate', ['linear'], ['zoom'], 13, 6, 19, 10],
              'line-opacity': removalMode ? 0.35 : 0.9,
            }}
          />
          <Layer
            id="editor-selected"
            type="line"
            filter={['==', ['get', 'editorId'], selectedId ?? '']}
            layout={{
              visibility: editorObjectVisibility,
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{
              'line-color': editorLineColor,
              'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4, 19, 8],
              'line-opacity': removalMode ? 0.55 : 1,
            }}
          />
          <Layer
            id="editor-direction"
            type="symbol"
            filter={['==', ['get', 'editorId'], selectedId ?? '']}
            layout={{
              visibility: editorObjectVisibility,
              'symbol-placement': 'line-center',
              'text-field': '▶',
              'text-size': 18,
              'text-rotation-alignment': 'map',
              'text-keep-upright': false,
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{
              'text-color': '#ffffff',
              'text-halo-color': '#09090b',
              'text-halo-width': 2,
              'text-opacity': removalMode ? 0.5 : 1,
            }}
          />
        </Source>

        {removalMode ? (
          <Layer
            id="removal-target-lines-above-bars"
            source="simulator-reference"
            type="line"
            filter={[
              'all',
              ['==', ['geometry-type'], 'LineString'],
              visibleFilter,
              removableReferenceFilter,
            ]}
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{
              'line-color': REFERENCE_COLOR,
              'line-width': ['interpolate', ['linear'], ['zoom'], 13, 4, 19, 8],
              'line-opacity': 0.98,
            }}
          />
        ) : null}

        <Source id="selected-removal-sections" type="geojson" data={selectedRemovalSectionGeojson}>
          <Layer
            id="selected-removal-fixtures"
            type="circle"
            filter={['==', ['geometry-type'], 'Point']}
            layout={{ visibility: removalMode ? 'visible' : 'none' }}
            paint={{
              'circle-color': '#ef4444',
              'circle-radius': 7,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            }}
          />
          <Layer
            id="selected-removal-section-lines"
            type="line"
            filter={['==', ['geometry-type'], 'LineString']}
            layout={{
              visibility: removalMode ? 'visible' : 'none',
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{
              'line-color': '#ef4444',
              'line-width': 7,
              'line-opacity': 0.98,
            }}
          />
        </Source>

        <Source id="editor-measurements" type="geojson" data={measurementGeojson}>
          <Layer
            id="editor-measurement-hit"
            type="line"
            filter={['==', ['get', 'featureType'], 'measurement-line']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{ 'line-color': '#ffffff', 'line-width': 16, 'line-opacity': 0 }}
          />
          <Layer
            id="editor-measurement-lines"
            type="line"
            filter={['==', ['get', 'featureType'], 'measurement-line']}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': '#22d3ee',
              'line-width': 2.5,
              'line-opacity': 0.95,
              'line-dasharray': [2, 1.5],
            }}
          />
          <Layer
            id="editor-measurement-points"
            type="circle"
            filter={['==', ['get', 'featureType'], 'measurement-point']}
            paint={{
              'circle-color': '#22d3ee',
              'circle-radius': 4,
              'circle-stroke-color': '#ecfeff',
              'circle-stroke-width': 1.5,
            }}
          />
          <Layer
            id="editor-measurement-labels"
            type="symbol"
            filter={['==', ['get', 'featureType'], 'measurement-label']}
            layout={{
              'text-field': ['get', 'label'],
              'text-size': 12,
              'text-offset': [0, -1],
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            }}
            paint={{
              'text-color': '#ecfeff',
              'text-halo-color': '#09090b',
              'text-halo-width': 2,
            }}
          />
        </Source>

        {divisionGhostsVisible ? (
          <Source id="original-divisions" type="geojson" data={originalDivisionGeojson}>
            <Layer
              id="original-division-hit"
              type="line"
              filter={['==', ['geometry-type'], 'LineString']}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#ffffff',
                'line-width': 16,
                'line-opacity': 0,
              }}
            />
            <Layer
              id="original-division-lines"
              type="line"
              filter={['==', ['geometry-type'], 'LineString']}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': originalDivisionColor,
                'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.25, 19, 2.5],
                'line-opacity': 0.42,
                'line-dasharray': [2, 2],
              }}
            />
            <Layer
              id="original-division-points"
              type="circle"
              filter={['==', ['geometry-type'], 'Point']}
              paint={{
                'circle-color': originalDivisionColor,
                'circle-radius': 4,
                'circle-opacity': 0.42,
                'circle-stroke-color': '#ecfeff',
                'circle-stroke-width': 1,
              }}
            />
          </Source>
        ) : null}

        <Source id="removal-selection" type="geojson" data={removalSelectionGeojson}>
          <Layer
            id="removal-selection-start"
            type="circle"
            paint={{
              'circle-color': '#ef4444',
              'circle-radius': 8,
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2.5,
            }}
          />
        </Source>

        {import.meta.env.DEV ? (
          <Source id="texture-report-selection" type="geojson" data={textureReportHighlightGeojson}>
            <Layer
              id="texture-report-selection-fill"
              type="fill"
              filter={['==', ['geometry-type'], 'Polygon']}
              paint={{ 'fill-color': '#f59e0b', 'fill-opacity': 0.1 }}
            />
            <Layer
              id="texture-report-selection-polygon-border"
              type="line"
              filter={['==', ['geometry-type'], 'Polygon']}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': '#fbbf24', 'line-width': 4, 'line-opacity': 0.98 }}
            />
            <Layer
              id="texture-report-selection-line-border"
              type="line"
              filter={['==', ['geometry-type'], 'LineString']}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#fbbf24',
                'line-width': 3,
                'line-gap-width': 3,
                'line-opacity': 0.98,
              }}
            />
            <Layer
              id="texture-report-selection-point-border"
              type="circle"
              filter={['==', ['geometry-type'], 'Point']}
              paint={{
                'circle-color': '#f59e0b',
                'circle-opacity': 0.12,
                'circle-radius': 9,
                'circle-stroke-color': '#fbbf24',
                'circle-stroke-width': 3,
              }}
            />
          </Source>
        ) : null}

        {divisionGhostsVisible && divisionPopup ? (
          <Popup
            longitude={divisionPopup.longitude}
            latitude={divisionPopup.latitude}
            anchor="bottom"
            offset={10}
            closeOnClick={false}
            className="editor-original-division-popup"
            onClose={() => setDivisionPopup(null)}
          >
            <DivisionPopupContent division={divisionPopup} onQuickAdd={quickAddDivision} />
          </Popup>
        ) : null}

        {import.meta.env.DEV && tool === 'marking-debug' && markingPopup ? (
          <Popup
            longitude={markingPopup.longitude}
            latitude={markingPopup.latitude}
            anchor="bottom"
            offset={12}
            closeOnClick={false}
            maxWidth="22rem"
            className="editor-division-popup"
            onClose={() => setMarkingPopup(null)}
          >
            <div
              className="w-72 max-w-full pr-5 text-left"
              onPointerDown={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-amber-300/80">
                Texture fallback report
              </p>
              {markingPopup.candidates.length > 1 ? (
                <label className="mt-2 block text-[10px] font-medium text-zinc-300">
                  Selected object
                  <select
                    value={markingPopup.selectedIndex}
                    onChange={(event) =>
                      setMarkingPopup((current) =>
                        current
                          ? {
                              ...current,
                              selectedIndex: Number(event.target.value),
                              expectedAppearance: '',
                              copied: false,
                              copyFailed: false,
                            }
                          : current
                      )
                    }
                    className="mt-1 min-h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-[11px] text-zinc-100 outline-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  >
                    {markingPopup.candidates.map(({ key, diagnostic }, index) => (
                      <option key={key} value={index}>
                        {diagnostic.selectedObject.title ||
                          diagnostic.selectedObject.id ||
                          `Object ${index + 1}`}{' '}
                        {diagnostic.sourceProperties.sourceRecordOffset !== undefined
                          ? `· record ${diagnostic.sourceProperties.sourceRecordOffset} `
                          : ''}
                        · {diagnostic.renderedLayerId}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block font-normal text-zinc-500">
                    {markingPopup.candidates.length} rendered objects at this point
                  </span>
                </label>
              ) : null}
              <p className="mt-1 truncate text-xs font-medium text-zinc-100">
                {selectedTextureReportCandidate.diagnostic.selectedObject.title ||
                  selectedTextureReportCandidate.diagnostic.selectedObject.id ||
                  'Unnamed source object'}
              </p>
              <dl className="mt-2 grid grid-cols-[4.25rem_1fr] gap-x-2 gap-y-1 text-[9px] leading-4">
                <dt className="text-zinc-500">Object</dt>
                <dd
                  className="truncate font-mono text-zinc-300"
                  title={String(selectedTextureReportCandidate.diagnostic.selectedObject.id ?? '')}
                >
                  {selectedTextureReportCandidate.diagnostic.selectedObject.id ?? 'Unknown'}
                </dd>
                <dt className="text-zinc-500">Texture</dt>
                <dd
                  className="truncate font-mono text-zinc-300"
                  title={String(
                    selectedTextureReportCandidate.diagnostic.sourceProperties.textureAssetPath ??
                      ''
                  )}
                >
                  {selectedTextureReportCandidate.diagnostic.sourceProperties.textureAssetPath ||
                    'No texture asset'}
                </dd>
                <dt className="text-zinc-500">Layer</dt>
                <dd className="truncate font-mono text-zinc-300">
                  {selectedTextureReportCandidate.diagnostic.renderedLayerId}
                </dd>
              </dl>
              <label className="mt-3 block text-[10px] font-medium text-zinc-300">
                What should this look like?
                <textarea
                  value={markingPopup.expectedAppearance}
                  onChange={(event) =>
                    setMarkingPopup((current) =>
                      current
                        ? {
                            ...current,
                            expectedAppearance: event.target.value,
                            copied: false,
                            copyFailed: false,
                          }
                        : current
                    )
                  }
                  rows={3}
                  className="mt-1 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-[11px] leading-4 text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/30"
                  placeholder="Example: worn yellow centreline on dark asphalt"
                />
              </label>
              <button
                type="button"
                disabled={!markingPopup.expectedAppearance.trim()}
                className="mt-2 min-h-8 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-[10px] font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={(event) => {
                  event.stopPropagation();
                  copyMarkingDiagnostic();
                }}
              >
                {markingPopup.copyFailed
                  ? 'Unable to copy report'
                  : markingPopup.copied
                    ? 'Report copied'
                    : 'Copy report'}
              </button>
              <p
                className="mt-1.5 text-[9px] leading-3 text-zinc-500"
                role="status"
                aria-live="polite"
              >
                {markingPopup.copyFailed
                  ? 'Use a secure local page, then try again.'
                  : markingPopup.copied
                    ? 'Paste the JSON into the texture fallback task.'
                    : 'The report stays local until you copy it.'}
              </p>
            </div>
          </Popup>
        ) : null}
      </Map>
    </div>
  );
});

function createTextureWorkerClient() {
  const worker = new Worker(new URL('./texture-loader.worker.js', import.meta.url), {
    type: 'module',
  });
  let nextId = 0;
  const requests = new globalThis.Map();
  worker.onmessage = (event) => {
    const request = requests.get(event.data?.id);
    if (!request) return;
    requests.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve({ image: event.data.image });
  };
  worker.onerror = (event) => {
    for (const request of requests.values()) {
      request.reject(new Error(event.message || 'Local texture worker failed'));
    }
    requests.clear();
  };
  return {
    decode(payload) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        requests.set(id, { resolve, reject });
        worker.postMessage({ id, ...payload });
      });
    },
    terminate() {
      worker.terminate();
      for (const request of requests.values()) {
        request.reject(new Error('Texture loading cancelled'));
      }
      requests.clear();
    },
  };
}

function createMsfsTextureWorkerClient() {
  const worker = new Worker(new URL('../msfs-renderer/msfs-texture.worker.js', import.meta.url), {
    type: 'module',
  });
  let nextId = 0;
  const requests = new globalThis.Map();
  worker.onmessage = (event) => {
    const request = requests.get(event.data?.id);
    if (!request) return;
    requests.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.image);
  };
  worker.onerror = (event) => {
    for (const request of requests.values()) {
      request.reject(new Error(event.message || 'MSFS texture worker failed'));
    }
    requests.clear();
  };
  return {
    decode(descriptor) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        requests.set(id, { resolve, reject });
        worker.postMessage({ id, descriptor });
      });
    },
    terminate() {
      worker.terminate();
      for (const request of requests.values()) {
        request.reject(new Error('Texture loading cancelled'));
      }
      requests.clear();
    },
  };
}

function installMapTexture(map, pattern, result) {
  if (result.image) {
    if (map.hasImage(pattern)) map.updateImage(pattern, result.image);
    else map.addImage(pattern, result.image, { pixelRatio: 1 });
    if (typeof result.image?.close === 'function') result.image.close();
  }
}

function textureLoadPriority(texture) {
  if (texture.lineTexture) return 0;
  const layerGroup = String(texture.properties?.layerGroup || '').toLowerCase();
  if (/markings|runways/.test(layerGroup)) return 1;
  if (/taxiways|shoulders/.test(layerGroup)) return 2;
  if (/terrain|airports|beaches/.test(layerGroup)) return 4;
  return 3;
}

function normalizeAssetPath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .toLowerCase();
}

function geojsonBounds(features) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      bounds[0] = Math.min(bounds[0], value[0]);
      bounds[1] = Math.min(bounds[1], value[1]);
      bounds[2] = Math.max(bounds[2], value[0]);
      bounds[3] = Math.max(bounds[3], value[1]);
      return;
    }
    for (const child of value) visit(child);
  };
  for (const feature of features ?? []) visit(feature.geometry?.coordinates);
  return bounds.every(Number.isFinite) ? bounds : undefined;
}

function bringGeomanControlLayersToFront(map) {
  if (!map?.getStyle) return;
  const layerIds = (map.getStyle()?.layers ?? []).map(({ id }) => id);
  for (const id of layerIds) {
    if (id.includes('vertex_marker') || id.includes('edge_marker')) {
      map.moveLayer(id);
    }
  }
}

function coordinatesBounds(coordinates) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const coordinate of coordinates ?? []) {
    if (!Array.isArray(coordinate)) continue;
    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;
    bounds[0] = Math.min(bounds[0], longitude);
    bounds[1] = Math.min(bounds[1], latitude);
    bounds[2] = Math.max(bounds[2], longitude);
    bounds[3] = Math.max(bounds[3], latitude);
  }
  return bounds.every(Number.isFinite) ? bounds : null;
}

function buildMeasurementGeojson(measurements, measurementStart, measurementCursor) {
  const features = [];
  for (const measurement of measurements ?? []) {
    const [start, end] = measurement.coordinates ?? [];
    if (!validMapCoordinate(start) || !validMapCoordinate(end)) continue;
    features.push(
      {
        type: 'Feature',
        id: `${measurement.id}:line`,
        geometry: { type: 'LineString', coordinates: [start, end] },
        properties: { featureType: 'measurement-line', measurementId: measurement.id },
      },
      ...[start, end].map((coordinate, index) => ({
        type: 'Feature',
        id: `${measurement.id}:point:${index}`,
        geometry: { type: 'Point', coordinates: coordinate },
        properties: {
          featureType: 'measurement-point',
          measurementId: measurement.id,
          endpointIndex: index,
        },
      })),
      {
        type: 'Feature',
        id: `${measurement.id}:label`,
        geometry: {
          type: 'Point',
          coordinates: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2],
        },
        properties: {
          featureType: 'measurement-label',
          measurementId: measurement.id,
          label: formatMeasurementDistance(measurement.distanceMeters),
        },
      }
    );
  }
  if (validMapCoordinate(measurementStart)) {
    features.push({
      type: 'Feature',
      id: 'measurement:draft:start',
      geometry: { type: 'Point', coordinates: measurementStart },
      properties: { featureType: 'measurement-point' },
    });
  }
  if (validMapCoordinate(measurementStart) && validMapCoordinate(measurementCursor)) {
    const liveDistance = distanceMeters(measurementStart, measurementCursor);
    if (liveDistance > 0.05) {
      features.push(
        {
          type: 'Feature',
          id: 'measurement:draft:line',
          geometry: {
            type: 'LineString',
            coordinates: [measurementStart, measurementCursor],
          },
          properties: { featureType: 'measurement-line' },
        },
        {
          type: 'Feature',
          id: 'measurement:draft:end',
          geometry: { type: 'Point', coordinates: measurementCursor },
          properties: { featureType: 'measurement-point' },
        },
        {
          type: 'Feature',
          id: 'measurement:draft:label',
          geometry: {
            type: 'Point',
            coordinates: [
              (measurementStart[0] + measurementCursor[0]) / 2,
              (measurementStart[1] + measurementCursor[1]) / 2,
            ],
          },
          properties: {
            featureType: 'measurement-label',
            label: formatMeasurementDistance(liveDistance),
          },
        }
      );
    }
  }
  return { type: 'FeatureCollection', features };
}

function formatMeasurementDistance(value) {
  const meters = Number(value);
  if (!Number.isFinite(meters)) return '';
  if (meters >= 1_000) return `${(meters / 1_000).toFixed(meters >= 10_000 ? 1 : 2)} km`;
  return `${meters < 100 ? meters.toFixed(1) : Math.round(meters)} m`;
}

function validMapCoordinate(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function isCompletedMeasurementFeature(feature) {
  return (
    MEASUREMENT_LAYER_IDS.includes(feature?.layer?.id) &&
    Boolean(String(feature?.properties?.measurementId ?? '').trim())
  );
}

EditorMap.propTypes = {
  airport: PropTypes.shape({
    latitude: PropTypes.number,
    longitude: PropTypes.number,
  }),
  airportIcao: PropTypes.string.isRequired,
  document: PropTypes.object.isRequired,
  removalSelectionDocument: PropTypes.object,
  referenceScene: PropTypes.object,
  renderBundle: PropTypes.shape({
    version: PropTypes.number.isRequired,
    groups: PropTypes.array.isRequired,
    textures: PropTypes.array.isRequired,
  }),
  sourceEntries: PropTypes.arrayOf(
    PropTypes.shape({
      path: PropTypes.string.isRequired,
      file: PropTypes.instanceOf(File),
      size: PropTypes.number,
    })
  ),
  sourceFingerprint: PropTypes.string,
  selectedId: PropTypes.string,
  tool: PropTypes.string.isRequired,
  visibleCategories: PropTypes.instanceOf(Set).isRequired,
  satelliteVisible: PropTypes.bool,
  editHandlesVisible: PropTypes.bool.isRequired,
  objectColors: PropTypes.instanceOf(globalThis.Map).isRequired,
  divisionGhostsVisible: PropTypes.bool.isRequired,
  editorObjectsVisible: PropTypes.bool.isRequired,
  measurements: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      coordinates: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number).isRequired).isRequired,
      distanceMeters: PropTypes.number.isRequired,
    })
  ).isRequired,
  measurementStart: PropTypes.arrayOf(PropTypes.number),
  onMeasurementMove: PropTypes.func.isRequired,
  onMeasurementCancel: PropTypes.func.isRequired,
  snapEnabled: PropTypes.bool.isRequired,
  uniqueObjectColors: PropTypes.bool.isRequired,
  focusRequest: PropTypes.shape({
    id: PropTypes.string,
    kind: PropTypes.oneOf(['object', 'division']),
    nonce: PropTypes.number,
  }),
  initialViewport: PropTypes.shape({
    longitude: PropTypes.number.isRequired,
    latitude: PropTypes.number.isRequired,
    zoom: PropTypes.number.isRequired,
    bearing: PropTypes.number,
    pitch: PropTypes.number,
  }),
  onSelect: PropTypes.func.isRequired,
  onCreate: PropTypes.func.isRequired,
  onGeometryChange: PropTypes.func.isRequired,
  onMapClick: PropTypes.func.isRequired,
  onReferenceClick: PropTypes.func.isRequired,
  removalSelectionStart: PropTypes.arrayOf(PropTypes.number),
  textureStatus: PropTypes.object,
  onTextureStatus: PropTypes.func,
  onViewportChange: PropTypes.func,
};

export default EditorMap;
