/* oxlint-disable react-doctor/no-giant-component react-doctor/async-await-in-loop react-doctor/no-prop-callback-in-effect -- MapLibre, Geoman, texture workers, and their parent-facing status projection share one imperative lifecycle; ordered worker jobs preserve stable accounting. */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import Map, { Layer, NavigationControl, Popup, ScaleControl, Source } from 'react-map-gl/maplibre';
import { createGeomanInstance } from '@geoman-io/maplibre-geoman-free';
import { editorDocumentToGeojson, originalDivisionsToGeojson } from './editor-model.js';
import {
  applyEditorGeometryPreviews,
  createGeomanEditorFeatures,
  createGeomanReferenceSnapTargets,
} from './geoman-editor.js';
import { decodedTextureCache, decodedTextureKey } from './decoded-texture-cache.js';
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
import { maintainCustomLayerBefore } from './custom-layer-order.js';
import { reconnectMsfsRenderBundleFiles } from '../msfs-renderer/msfs-texture-files.js';
import { distanceMeters } from './editor-geometry.js';
import { mergeRemovalDisplayFeatures } from './removal-display.js';
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
  'reference-lines',
  'reference-textured-lines',
  'reference-painted-lines',
  'reference-removal-lines',
  'reference-points',
];
const MSFS_SNAP_TARGET_LIMIT = 2_000;
const MSFS_SNAP_CATEGORY_PRIORITY = ['light-rows', 'fixtures'];
const MSFS_SNAP_GEOMETRIES = new Set(['Point', 'LineString', 'MultiLineString']);

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
const TEXTURED_REFERENCE_LINE_PATTERN = ['image', ['get', 'renderPattern']];
const AIRFIELD_STYLE = {
  version: 8,
  sources: {},
  layers: [
    { id: 'airfield-background', type: 'background', paint: { 'background-color': '#151619' } },
  ],
};

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

function isMarkingFeature(feature) {
  const properties = feature?.properties ?? {};
  return (
    properties.snapCategory === 'painted-lines' ||
    /marking|painted/i.test(String(properties.semanticType ?? '')) ||
    /marking/i.test(String(properties.layerGroup ?? ''))
  );
}

function createMarkingDiagnostic({ feature, clickedCoordinate, renderedLayerId, resolvedEntry }) {
  const properties = feature?.properties ?? {};
  const geometry = feature?.geometry ?? null;
  const coordinates = geometry?.coordinates ?? [];
  return {
    diagnosticVersion: 1,
    kind: 'xplane-marking',
    clickedCoordinate,
    renderedLayerId,
    feature: {
      id: feature?.id ?? properties.sourceId ?? null,
      geometryType: geometry?.type ?? null,
      geometry: {
        coordinateCount: countGeometryCoordinates(coordinates),
        bounds: geometryCoordinateBounds(coordinates),
      },
    },
    marking: {
      title: properties.title ?? '',
      markingCode: properties.markingCode ?? null,
      markingDescription: properties.markingDescription ?? '',
      markingColor: properties.markingColor ?? '',
      snapCategory: properties.snapCategory ?? '',
      semanticType: properties.semanticType ?? '',
      exactness: properties.exactness ?? '',
      widthMetres: properties.widthMeters ?? null,
      sourceType: properties.sourceType ?? '',
      sourceFile: properties.sourceFile ?? '',
      sourceDefinition: properties.sourceDefinition ?? '',
      sourceAssetPath: properties.sourceAssetPath ?? '',
    },
    texture: {
      assetPath: properties.textureAssetPath ?? '',
      pattern: properties.texturePattern ?? '',
      renderPattern: properties.renderPattern ?? '',
      scaleXMetres: properties.textureScaleX ?? properties.textureScale ?? null,
      scaleYMetres: properties.textureScaleY ?? properties.textureScale ?? null,
      widthMetres: properties.textureWidthMeters ?? null,
      heightMetres: properties.textureHeightMeters ?? null,
      headingDegrees: properties.textureHeading ?? null,
      wrap: properties.textureWrap ?? null,
      noAlpha: properties.textureNoAlpha ?? false,
      lineTextureLayers: properties.lineTextureLayers ?? null,
      resolvedEntry: resolvedEntry
        ? {
            name: resolvedEntry.file?.name ?? '',
            path: resolvedEntry.path ?? '',
            size: resolvedEntry.size ?? resolvedEntry.file?.size ?? null,
          }
        : null,
    },
    sourceProperties: properties,
  };
}

function countGeometryCoordinates(value) {
  if (!Array.isArray(value)) return 0;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) return 1;
  return value.reduce((total, child) => total + countGeometryCoordinates(child), 0);
}

function geometryCoordinateBounds(value) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (
      coordinates.length >= 2 &&
      Number.isFinite(coordinates[0]) &&
      Number.isFinite(coordinates[1])
    ) {
      bounds[0] = Math.min(bounds[0], coordinates[0]);
      bounds[1] = Math.min(bounds[1], coordinates[1]);
      bounds[2] = Math.max(bounds[2], coordinates[0]);
      bounds[3] = Math.max(bounds[3], coordinates[1]);
      return;
    }
    for (const child of coordinates) visit(child);
  };
  visit(value);
  return bounds.every(Number.isFinite) ? bounds : null;
}

const EditorMap = memo(function EditorMap({
  airport,
  document,
  referenceScene,
  renderBundle,
  sourceEntries,
  sourceFingerprint,
  selectedId,
  tool,
  visibleCategories,
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
  const geomanCallbacksRef = useRef({ onCreate, onGeometryChange, onSelect });
  const documentObjectsRef = useRef(document.objects);
  const originalDivisionsRef = useRef(document.originalDivisions);
  const measurementFrameRef = useRef(0);
  const pendingMeasurementCursorRef = useRef(null);
  const measurementDragRef = useRef(null);
  useLayoutEffect(() => {
    geomanCallbacksRef.current = { onCreate, onGeometryChange, onSelect };
    documentObjectsRef.current = document.objects;
    originalDivisionsRef.current = document.originalDivisions;
  }, [document.objects, document.originalDivisions, onCreate, onGeometryChange, onSelect]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [geomanReady, setGeomanReady] = useState(false);
  const [liveEdit, setLiveEdit] = useState(null);
  const [liveDrawCoordinates, setLiveDrawCoordinates] = useState(null);
  const [divisionPopup, setDivisionPopup] = useState(null);
  const [markingPopup, setMarkingPopup] = useState(null);
  const [measurementCursor, setMeasurementCursor] = useState(null);
  const [measurementDrag, setMeasurementDrag] = useState(null);
  const [measurementHovered, setMeasurementHovered] = useState(false);
  const editorDocumentGeojson = useMemo(() => editorDocumentToGeojson(document), [document]);
  const editorObjectGeojson = useMemo(
    () => ({
      ...editorDocumentGeojson,
      features: editorDocumentGeojson.features.filter(
        (feature) => feature.properties?.featureType !== 'editor-removal'
      ),
    }),
    [editorDocumentGeojson]
  );
  const editorRemovalGeojson = useMemo(
    () => buildEditorRemovalDisplayGeojson(editorDocumentGeojson),
    [editorDocumentGeojson]
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
  const referenceGeojson = useMemo(() => {
    const geojson = referenceSceneGeojson(referenceScene);
    const xplaneSelected = new Set(
      (document.xplaneRemovals ?? []).map(
        (selector) => `${selector.feature}:${selector.code}:${selector.run}`
      )
    );
    const msfsSelectedIds = new Set();
    for (const removal of document.removals ?? []) {
      for (const sourceId of removal.sourceIds ?? []) msfsSelectedIds.add(String(sourceId));
    }
    return {
      ...geojson,
      features: geojson.features.map((feature) => {
        const properties = feature.properties ?? {};
        const key = `${properties.sourceFeatureId}:${properties.lightCode}:${properties.sourceRunIndex}`;
        const sourceId = String(properties.sourceId ?? feature.id ?? '');
        const msfsSelected = msfsSelectedIds.has(sourceId);
        return {
          ...feature,
          properties: {
            ...properties,
            removalSelected: document.simulator === 'msfs' ? msfsSelected : xplaneSelected.has(key),
          },
        };
      }),
    };
  }, [document.removals, document.simulator, document.xplaneRemovals, referenceScene]);
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
  const textureEntryIndex = useMemo(() => createTextureEntryIndex(sourceEntries), [sourceEntries]);
  const originalDivisionGeojson = useMemo(() => originalDivisionsToGeojson(document), [document]);
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
  const documentBounds = useMemo(
    () => geojsonBounds(editorGeojson.features),
    [editorGeojson.features]
  );
  const visibleFilter = useMemo(
    () => ['in', ['get', 'snapCategory'], ['literal', [...visibleCategories]]],
    [visibleCategories]
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
      { padding: 60, maxZoom: 19, duration: 500 }
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
        duration: 280,
        essential: true,
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
        duration: 320,
        essential: true,
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
    const handleCreate = (event) => {
      if (geomanSyncingRef.current) return;
      setLiveDrawCoordinates(null);
      const geometry = event.feature?.getGeoJson?.().geometry;
      if (geometry?.type === 'LineString') {
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
          const geometry = event.featureData?.getGeoJson?.().geometry;
          setLiveDrawCoordinates(geometry?.type === 'LineString' ? geometry.coordinates : null);
        }
        return;
      }
      if (
        event.name === 'gm:draw:shape' &&
        (event.action === 'finish' || event.action === 'cancel')
      ) {
        setLiveDrawCoordinates(null);
      }
    };

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
        geomanRef.current = instance;
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
      if (geomanRef.current === geoman) geomanRef.current = null;
      geoman?.setGlobalEventsListener();
      geoman?.destroy({ removeSources: true });
    };
  }, [mapLoaded]);

  const editorGeometrySignature = useMemo(
    () => JSON.stringify(document.objects.map((object) => [object.partId, object.coordinates])),
    [document.objects]
  );

  useEffect(() => {
    const geoman = geomanRef.current;
    if (!geoman || !geomanReady) return undefined;
    let cancelled = false;
    const syncVersion = ++geomanSyncVersionRef.current;
    const isCurrent = () => !cancelled && geomanSyncVersionRef.current === syncVersion;
    const sync = async () => {
      geomanSyncingRef.current = true;
      try {
        await geoman.disableAllModes();
        if (!isCurrent()) return;
        await geoman.features.deleteAll();
        if (!isCurrent()) return;
        const editableFeatures = editorObjectsVisible
          ? createGeomanEditorFeatures(document.objects, selectedId)
          : [];
        const snappingFeatures = snapEnabled ? referenceSnapTargets.features : [];
        const geomanFeatures = [...editableFeatures, ...snappingFeatures];
        if (geomanFeatures.length > 0) {
          await geoman.features.importGeoJson({
            type: 'FeatureCollection',
            features: geomanFeatures,
          });
        }
        if (!isCurrent()) return;
        const enableSnapping = async () => {
          if (!snapEnabled) return;
          await geoman.enableMode('helper', 'snapping');
        };
        if (tool === 'draw') {
          await geoman.enableDraw('line');
          await enableSnapping();
          return;
        }
        if (tool === 'select') {
          if (selectedObject?.coordinates.length >= 2) {
            geoman.features.setSelection([selectedObject.partId], false);
          }
          await geoman.enableGlobalEditMode();
          if (!isCurrent()) return;
          await enableSnapping();
          bringGeomanControlLayersToFront(mapRef.current?.getMap?.());
        }
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
    });
    return () => {
      cancelled = true;
    };
  }, [
    document.objects,
    editorObjectsVisible,
    editorGeometrySignature,
    geomanReady,
    referenceSnapTargets,
    selectedId,
    selectedObject,
    snapEnabled,
    tool,
  ]);

  useEffect(() => {
    if (!mapLoaded || !geomanReady || !selectedId) return;
    bringGeomanControlLayersToFront(mapRef.current?.getMap?.());
  }, [divisionGhostsVisible, geomanReady, mapLoaded, selectedId]);

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
      const overlayBeforeId = [
        'reference-painted-fills',
        'reference-lines',
        'editor-removals',
      ].find((id) => map.getLayer(id));
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
    const connectedBundle = reconnectMsfsRenderBundleFiles(renderBundle, sourceEntries);
    const descriptors = connectedBundle.textures || [];
    const layer = new SimulatorTextureLayer(
      (stats) => onTextureStatus?.((current) => ({ ...current, ...stats })),
      { id: 'msfs-scenery-textures' }
    );
    layer.setGeometry(connectedBundle.groups);
    msfsTextureLayerRef.current = layer;
    const directDescriptors = descriptors.filter((descriptor) => descriptor.image);
    const workerDescriptors = descriptors.filter(
      (descriptor) => !descriptor.image && descriptor.file
    );
    const packageDescriptors = descriptors.filter((descriptor) => descriptor.source === 'package');
    const skipped = descriptors.length - directDescriptors.length - workerDescriptors.length;
    for (const descriptor of directDescriptors) {
      layer.setTexture(descriptor.pattern, descriptor.image, {
        wrap: descriptor.wrap !== false,
        lineTexture: descriptor.lineTexture === true,
      });
    }
    onTextureStatus?.({
      phase: workerDescriptors.length > 0 ? 'loading' : 'ready',
      total: descriptors.length,
      loaded: directDescriptors.length,
      packageTotal: packageDescriptors.length,
      packageLoaded: directDescriptors.filter((descriptor) => descriptor.source === 'package')
        .length,
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
      cached: 0,
      connected: workerDescriptors.length,
    });
    const worker =
      workerDescriptors.length > 0
        ? new Worker(new URL('../msfs-renderer/msfs-texture.worker.js', import.meta.url), {
            type: 'module',
          })
        : null;
    const requests = new globalThis.Map(
      workerDescriptors.map((texture, index) => [index + 1, texture])
    );
    if (worker) {
      worker.onmessage = (event) => {
        const descriptor = requests.get(event.data?.id);
        if (!descriptor) return;
        requests.delete(event.data.id);
        if (event.data.image) {
          layer.setTexture(descriptor.pattern, event.data.image, {
            wrap: descriptor.wrap !== false,
            lineTexture: descriptor.lineTexture === true,
          });
        }
        onTextureStatus?.((current) => ({
          ...current,
          phase: requests.size === 0 ? 'ready' : 'loading',
          loaded: (current.loaded || 0) + (event.data.image ? 1 : 0),
          packageLoaded:
            (current.packageLoaded || 0) +
            (event.data.image && descriptor.source === 'package' ? 1 : 0),
          fallbackLoaded:
            (current.fallbackLoaded || 0) +
            (event.data.image && descriptor.source === 'fallback' ? 1 : 0),
          failed: (current.failed || 0) + (event.data.error ? 1 : 0),
        }));
      };
      worker.onerror = (event) => {
        const failed = requests.size;
        requests.clear();
        onTextureStatus?.((current) => ({
          ...current,
          phase: 'error',
          failed: (current.failed || 0) + failed,
          renderError: event.message || 'MSFS textures could not be decoded.',
        }));
      };
      for (const [id, descriptor] of requests) worker.postMessage({ id, descriptor });
    }
    // The first contribution handoff can mount this effect before react-map-gl
    // has installed the reference layers. Keep trying until an anchor exists;
    // a one-shot styledata listener can miss the event that adds those layers.
    const placement = maintainCustomLayerBefore(
      map,
      layer,
      ['reference-painted-fills', 'reference-lines', 'editor-removals'],
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
      worker?.terminate();
      placement.stop();
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
      if (msfsTextureLayerRef.current === layer) msfsTextureLayerRef.current = null;
      if (reconcileMsfsLayerRef.current === placement.reconcile) {
        reconcileMsfsLayerRef.current = null;
      }
    };
  }, [document.simulator, mapLoaded, onTextureStatus, renderBundle, sourceEntries]);

  useEffect(() => {
    if (document.simulator !== 'msfs') return;
    msfsTextureLayerRef.current?.setGroupVisibility((group) =>
      msfsRenderGroupIsVisible(group, visibleCategories)
    );
  }, [document.simulator, renderBundle, visibleCategories]);

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !mapLoaded || document.simulator !== 'xplane') return;
    for (const id of ['xplane-terrain-textures', 'xplane-airport-textures']) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', removalMode ? 'none' : 'visible');
      }
    }
    map.triggerRepaint();
  }, [document.simulator, mapLoaded, removalMode]);

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
      await Promise.all(
        workers.map(async (worker, workerIndex) => {
          for (let index = workerIndex; index < jobs.length; index += workers.length) {
            const { pattern, texture, entry, decoded, decodedKey, source } = jobs[index];
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
        })
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
      const features = event.features ?? [];
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
      if (tool === 'marking-debug') {
        const renderedMarking = features.find(
          (feature) => REFERENCE_LAYER_IDS.includes(feature.layer.id) && isMarkingFeature(feature)
        );
        if (!renderedMarking) {
          setMarkingPopup(null);
          return;
        }
        const featureId = String(renderedMarking.id ?? renderedMarking.properties?.sourceId ?? '');
        const originalFeature = referenceFeaturesById.get(featureId) ?? renderedMarking;
        const texturePath = originalFeature.properties?.textureAssetPath;
        const resolvedEntry = texturePath ? findTextureEntry(textureEntryIndex, texturePath) : null;
        setMarkingPopup({
          longitude: coordinate[0],
          latitude: coordinate[1],
          copied: false,
          diagnostic: createMarkingDiagnostic({
            feature: originalFeature,
            clickedCoordinate: coordinate,
            renderedLayerId: renderedMarking.layer.id,
            resolvedEntry,
          }),
        });
        return;
      }
      if (referenceFeature && ['follow', 'draw', 'continue', 'remove-light'].includes(tool)) {
        onReferenceClick(referenceFeature, coordinate, {
          selectSection: Boolean(event.originalEvent?.shiftKey),
        });
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
        });
      } else if (!editorFeature && tool === 'select') {
        setDivisionPopup(null);
        onSelect(null, { focus: false });
      }
      onMapClick(coordinate, { editorFeature, divisionFeature, referenceFeature });
    },
    [
      clearMeasurementCursor,
      onMapClick,
      onReferenceClick,
      onSelect,
      referenceFeaturesById,
      textureEntryIndex,
      tool,
    ]
  );

  const copyMarkingDiagnostic = useCallback(async () => {
    if (!markingPopup?.diagnostic) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(markingPopup.diagnostic, null, 2));
      setMarkingPopup((current) => (current ? { ...current, copied: true } : current));
    } catch {
      setMarkingPopup((current) =>
        current ? { ...current, copied: false, copyFailed: true } : current
      );
    }
  }, [markingPopup?.diagnostic]);

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

  const initialViewState = initialViewport ?? {
    longitude: airport?.longitude ?? referenceScene?.bounds?.[0] ?? 0,
    latitude: airport?.latitude ?? referenceScene?.bounds?.[1] ?? 0,
    zoom: 15,
  };

  return (
    <div className="relative h-full min-h-[34rem] overflow-hidden bg-zinc-950">
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={AIRFIELD_STYLE}
        onLoad={() => setMapLoaded(true)}
        onMoveEnd={(event) => onViewportChange?.(event.viewState)}
        onStyleImageMissing={handleStyleImageMissing}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={finishMeasurementDrag}
        onMouseLeave={handleMouseLeave}
        interactiveLayerIds={[
          ...EDITOR_LAYER_IDS,
          ...MEASUREMENT_LAYER_IDS,
          ...(divisionGhostsVisible ? ORIGINAL_DIVISION_LAYER_IDS : []),
          ...REFERENCE_LAYER_IDS,
        ]}
        antialias
        renderWorldCopies={false}
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

        <Source id="simulator-reference" type="geojson" data={referenceGeojson}>
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
                'fill-opacity': removalMode
                  ? 0.05
                  : ['case', ['==', ['get', 'surfaceLabel'], 'Grass'], 0.82, 0.78],
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
                removalMode ? 0.04 : 0.12,
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
                'fill-opacity': removalMode ? 0.05 : 0.96,
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
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': REFERENCE_COLOR,
              'line-width': REFERENCE_LINE_WIDTH,
              'line-opacity': removalMode
                ? ['case', ['==', ['get', 'snapCategory'], 'light-rows'], 0.95, 0.08]
                : 0.82,
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
              'line-opacity': removalMode
                ? 0.06
                : [
                    'case',
                    ['!=', ['coalesce', ['get', 'renderPattern'], ''], ''],
                    document.simulator === 'xplane' ? 0 : 0.72,
                    1,
                  ],
            }}
          />
          {document.simulator === 'xplane' ? (
            <Layer
              id="reference-removal-lines"
              type="line"
              filter={[
                'all',
                ['==', ['geometry-type'], 'LineString'],
                visibleFilter,
                ['==', ['get', 'removalSelected'], true],
              ]}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#fb7185',
                'line-width': 5,
                'line-opacity': 0.95,
                'line-dasharray': [1.5, 1],
              }}
            />
          ) : null}
          <Layer
            id="reference-points"
            type="circle"
            filter={['all', ['==', ['geometry-type'], 'Point'], visibleFilter]}
            paint={{
              'circle-color': ['coalesce', ['get', 'lightColor'], REFERENCE_COLOR],
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2, 19, 5],
              'circle-stroke-color': '#09090b',
              'circle-stroke-width': 1,
              'circle-opacity': removalMode ? 0.15 : 0.85,
            }}
          />
        </Source>

        <Source id="editor-removal-draft" type="geojson" data={editorRemovalGeojson}>
          <Layer
            id="editor-removals"
            type="fill"
            filter={['==', ['get', 'featureType'], 'editor-removal']}
            paint={{ 'fill-color': '#f59e0b', 'fill-opacity': 0.18 }}
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
              'line-opacity': removalMode ? 0.1 : 0.94,
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
              'line-opacity': 0.9,
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
              'line-opacity': 1,
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

        {divisionGhostsVisible && divisionPopup ? (
          <Popup
            longitude={divisionPopup.longitude}
            latitude={divisionPopup.latitude}
            anchor="bottom"
            offset={10}
            closeOnClick={false}
            className="editor-division-popup"
            onClose={() => setDivisionPopup(null)}
          >
            <div className="min-w-48 pr-6 text-left">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/70" aria-hidden="true" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200/80">
                  Original division
                </p>
              </div>
              <p className="mt-2 max-w-56 truncate text-sm font-medium text-zinc-100">
                {divisionPopup.name}
              </p>
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-zinc-700/60 pt-2">
                <code className="truncate font-mono text-[10px] text-zinc-400">
                  {divisionPopup.id}
                </code>
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
                  Not exported
                </span>
              </div>
            </div>
          </Popup>
        ) : null}

        {tool === 'marking-debug' && markingPopup ? (
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
            <div className="w-72 max-w-full pr-5 text-left">
              <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-amber-300/80">
                Marking diagnostic
              </p>
              <p className="mt-1 truncate text-xs font-medium text-zinc-100">
                {markingPopup.diagnostic.marking.title || 'Unnamed marking'}
              </p>
              <dl className="mt-2 grid grid-cols-[4.25rem_1fr] gap-x-2 gap-y-1 text-[9px] leading-4">
                <dt className="text-zinc-500">Code</dt>
                <dd className="text-zinc-300">
                  {markingPopup.diagnostic.marking.markingCode ?? '—'}
                </dd>
                <dt className="text-zinc-500">Width</dt>
                <dd className="text-zinc-300">
                  {markingPopup.diagnostic.marking.widthMetres ?? '—'} m
                </dd>
                <dt className="text-zinc-500">Definition</dt>
                <dd
                  className="truncate font-mono text-zinc-300"
                  title={markingPopup.diagnostic.marking.sourceDefinition}
                >
                  {markingPopup.diagnostic.marking.sourceDefinition || 'Procedural'}
                </dd>
                <dt className="text-zinc-500">Texture</dt>
                <dd
                  className="truncate font-mono text-zinc-300"
                  title={markingPopup.diagnostic.texture.assetPath}
                >
                  {markingPopup.diagnostic.texture.assetPath || 'No texture asset'}
                </dd>
                <dt className="text-zinc-500">Layer</dt>
                <dd className="truncate font-mono text-zinc-300">
                  {markingPopup.diagnostic.renderedLayerId}
                </dd>
              </dl>
              <button
                type="button"
                className="mt-3 h-7 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-[10px] font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
                onClick={(event) => {
                  event.stopPropagation();
                  copyMarkingDiagnostic();
                }}
              >
                {markingPopup.copyFailed
                  ? 'Copy failed'
                  : markingPopup.copied
                    ? 'Copied diagnostic JSON'
                    : 'Copy diagnostic JSON'}
              </button>
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

function buildEditorRemovalDisplayGeojson(geojson) {
  const generatedSourceIds = new Set();
  for (const feature of geojson.features ?? []) {
    if (
      feature.properties?.featureType !== 'editor-removal' ||
      !['msfs-auto', 'msfs-manual'].includes(feature.properties?.origin)
    ) {
      continue;
    }
    for (const sourceId of feature.properties?.sourceIds ?? []) {
      generatedSourceIds.add(String(sourceId));
    }
  }

  const features = [];
  const generatedFeatures = [];
  for (const feature of geojson.features ?? []) {
    if (feature.properties?.featureType !== 'editor-removal') continue;
    const sourceIds = (feature.properties?.sourceIds ?? []).map(String);
    if (
      feature.properties?.origin === 'msfs-source' &&
      sourceIds.some((sourceId) => generatedSourceIds.has(sourceId))
    ) {
      continue;
    }
    if (
      feature.geometry?.type === 'Polygon' &&
      ['msfs-auto', 'msfs-manual'].includes(feature.properties?.origin)
    ) {
      generatedFeatures.push({
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: feature.geometry.coordinates.map((ring) =>
            simplifyClosedDisplayRing(ring, 0.35)
          ),
        },
      });
    } else {
      features.push(feature);
    }
  }
  return {
    type: 'FeatureCollection',
    features: [...features, ...mergeRemovalDisplayFeatures(generatedFeatures)],
  };
}

function simplifyClosedDisplayRing(ring, toleranceMeters) {
  if (!Array.isArray(ring) || ring.length <= 5) return ring;
  const points = coordinatesEqual(ring[0], ring.at(-1)) ? ring.slice(0, -1) : [...ring];
  if (points.length <= 4) return [...points, points[0]];
  let farthestIndex = 1;
  let farthestDistance = -1;
  for (let index = 1; index < points.length; index += 1) {
    const distance = distanceMeters(points[0], points[index]);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }
  const firstHalf = simplifyOpenDisplayLine(points.slice(0, farthestIndex + 1), toleranceMeters);
  const secondHalf = simplifyOpenDisplayLine(
    [...points.slice(farthestIndex), points[0]],
    toleranceMeters
  );
  const simplified = [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
  return simplified.length >= 3 ? [...simplified, simplified[0]] : ring;
}

function simplifyOpenDisplayLine(coordinates, toleranceMeters) {
  if (coordinates.length <= 2) return [...coordinates];
  const kept = new Set([0, coordinates.length - 1]);
  const ranges = [[0, coordinates.length - 1]];
  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop();
    if (endIndex <= startIndex + 1) continue;
    let furthestIndex = -1;
    let furthestDistance = -1;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = localSegmentDistanceMeters(
        coordinates[index],
        coordinates[startIndex],
        coordinates[endIndex]
      );
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestDistance <= toleranceMeters || furthestIndex < 0) continue;
    kept.add(furthestIndex);
    ranges.push([startIndex, furthestIndex], [furthestIndex, endIndex]);
  }
  return [...kept].sort((left, right) => left - right).map((index) => coordinates[index]);
}

function localSegmentDistanceMeters(point, start, end) {
  const latitude = ((point[1] + start[1] + end[1]) / 3) * (Math.PI / 180);
  const longitudeScale = 111_320 * Math.max(0.001, Math.cos(latitude));
  const latitudeScale = 110_540;
  const endX = (end[0] - start[0]) * longitudeScale;
  const endY = (end[1] - start[1]) * latitudeScale;
  const pointX = (point[0] - start[0]) * longitudeScale;
  const pointY = (point[1] - start[1]) * latitudeScale;
  const lengthSquared = endX * endX + endY * endY;
  const ratio =
    lengthSquared > 0
      ? Math.max(0, Math.min(1, (pointX * endX + pointY * endY) / lengthSquared))
      : 0;
  return Math.hypot(pointX - endX * ratio, pointY - endY * ratio);
}

function coordinatesEqual(left, right) {
  return left?.[0] === right?.[0] && left?.[1] === right?.[1];
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
  document: PropTypes.object.isRequired,
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
  onTextureStatus: PropTypes.func,
  onViewportChange: PropTypes.func,
};

export default EditorMap;
