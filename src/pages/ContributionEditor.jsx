import { dsfSelector } from '../features/contribution-editor/xplane-removal-contract.js';
import {
  memo,
  Profiler,
  startTransition,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  Check,
  ChevronDown,
  ChevronLeft,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  GitMerge,
  LoaderCircle,
  Magnet,
  MapPinPlus,
  MousePointer2,
  Pencil,
  Redo2,
  RotateCcw,
  Ruler,
  Scissors,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { Toast } from '../components/shared/Toast';
import { PageLoading } from '../components/shared/PageLoading';
import { SimulatorBadge } from '../components/shared/SimulatorBadge';
import { ExperimentalBadge } from '../components/contributions/ExperimentalBadge';
import { ContributionGuideLink } from '../components/contributions/ContributionGuideLink';
import EditorMap from '../features/contribution-editor/EditorMap';
import {
  barsIdSuggestions,
  colorForObjectId,
  createEditorDocument,
  draftHash,
  originalDivisionHasMatch,
  originalDivisionsFromPoints,
  parseDraftXml,
  serializeDraftXml,
  objectColorKey,
  syncOriginalDivisionMetadata,
} from '../features/contribution-editor/editor-model.js';
import {
  distanceMeters,
  joinLines,
  nearestPointOnLine,
  sliceLineBetween,
  splitLineAt,
} from '../features/contribution-editor/editor-geometry.js';
import {
  createEditorState,
  editorReducer,
  validateEditorDocument,
} from '../features/contribution-editor/editor-state.js';
import {
  cacheReferenceTextures,
  editorSessionNeedsHydration,
  editorSessionKey,
  getEditorSession,
  hydrateReferenceTextureDefinitions,
  loadEditorDraft,
  loadEditorDraftImmediate,
  loadEditorWorkspaceImmediate,
  loadReferenceScene,
  loadReferenceSceneImmediate,
  loadReferenceTextures,
  requestPersistentEditorStorage,
  saveEditorDraft,
  saveEditorWorkspace,
  saveReferenceScene,
  xPlaneTextureDefinitionKey,
} from '../features/contribution-editor/editor-session.js';
import {
  normalizeReferenceScene,
  SNAP_CATEGORIES,
} from '../features/contribution-editor/reference-scene.js';
import {
  matchSnappedReference,
  nearbyRemovalBindingFromExtendedReference,
  referenceMatchFromProjections,
  removalBindingFromExtendedReference,
} from '../features/contribution-editor/editor-snapping.js';
import {
  createTextureEntryIndex,
  findTextureEntry,
  normalizeTexturePath,
} from '../features/contribution-editor/texture-assets.js';
import {
  mergeScenerySelections,
  scenerySelectionFingerprint,
  selectionFromDrop,
  selectionFromInput,
} from '../features/draft-generator/local-package.js';
import { preloadRoute } from '../utils/routeModules.js';
import {
  automaticRemovalSelections,
  importedRemovalIdsToRetire,
  canonicalMsfsRemovalSourceId,
  coveredAutomaticRemovalIds,
  createMsfsRemovalWorkerClient,
  importedRemovalReplacementPlan,
  manualMsfsRemovalSourceIds,
  removalBindingsFromMatch,
  removalSelectionFeature,
  removalSelectionFromBinding,
  removalBindingsWithSharedRows,
  removalIdsCoveringLineSection,
  resolveMsfsRemovalTarget,
  resolveXPlaneRemovalTarget,
} from '../features/contribution-editor/msfs-removal-client.js';
import {
  applyMsfsSelectionEdit,
  editableMsfsRemovalGroup,
  previewMsfsRemovalEdit,
} from '../features/contribution-editor/removal-intervals.js';
import {
  beginEditorInteraction,
  finishEditorInteractionAfterSettled,
  installEditorPerformanceTracing,
  recordEditorDuration,
  traceEditorAsync,
  traceEditorSpan,
} from '../features/contribution-editor/editor-performance.js';
import { assignAdjacentColors } from '../utils/adjacent-colors.js';

const SATELLITE_REFERENCE_AVAILABLE = Boolean(import.meta.env.VITE_MAPBOX_TOKEN);

const TOOLS = [
  { id: 'select', label: 'Edit', icon: MousePointer2, shortcut: 'V' },
  { id: 'draw', label: 'Add object', icon: MapPinPlus, shortcut: 'D' },
  {
    id: 'remove-light',
    label: 'Edit source light removals',
    icon: Trash2,
    shortcut: 'R',
  },
  ...(import.meta.env.DEV
    ? [
        {
          id: 'marking-debug',
          label: 'Report texture fallback',
          icon: Bug,
          shortcut: 'I',
          advanced: true,
        },
      ]
    : []),
  { id: 'split', label: 'Split', icon: Scissors, shortcut: 'S' },
  { id: 'join', label: 'Join', icon: GitMerge, shortcut: 'J' },
  { id: 'measure', label: 'Measure distance', icon: Ruler, shortcut: 'M' },
];
const DEFAULT_VISIBLE_CATEGORIES = new Set(['painted-lines', 'runways', 'pavement-edges']);
const EMPTY_SCENE = { version: 3, simulator: 'msfs', features: [], categories: SNAP_CATEGORIES };
const EMPTY_ISSUES = [];
const EMPTY_OBJECT_COLORS = new Map();

function traceEditorMapRender(id, phase, actualDuration, baseDuration, startTime, commitTime) {
  recordEditorDuration(
    `react:${id}:${phase}`,
    actualDuration,
    { baseDurationMs: baseDuration, commitTimeMs: commitTime },
    startTime
  );
}

function finishRemovalBuild(requestId, requestRef, abortRef, setBusy) {
  if (requestId !== requestRef.current) return;
  abortRef.current = null;
  setBusy(false);
}

// The editor coordinates map gestures, local extraction, persistence, and deterministic XML export.
// oxlint-disable react-doctor/no-giant-component react-doctor/no-high-complexity-react-function react-doctor/prefer-useReducer react-doctor/js-combine-iterations react-doctor/js-flatmap-filter react-doctor/rerender-state-only-in-handlers -- The editor is a cohesive map workflow; source selection is rendered and feeds effects, while staged geometry transforms preserve review semantics.
export default function ContributionEditor() {
  const { icao: routeIcao } = useParams();
  const icao = String(routeIcao ?? '')
    .trim()
    .toUpperCase();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedSimulatorValue =
    location.state?.simulator ?? new URLSearchParams(location.search).get('simulator');
  const requestedSimulator = ['msfs', 'xplane'].includes(requestedSimulatorValue)
    ? requestedSimulatorValue
    : null;
  const skippedGeneration = !requestedSimulator;
  useEffect(() => installEditorPerformanceTracing(), []);
  const draftInputRef = useRef(null);
  const sceneryInputRef = useRef(null);
  const textureLibraryInputRef = useRef(null);
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  const autosaveTimerRef = useRef(null);
  const workspaceSaveTimerRef = useRef(null);
  const textureStatusTimerRef = useRef(null);
  const pendingTextureStatusUpdatesRef = useRef([]);
  const initialSaveRef = useRef(false);
  const originalDivisionRefreshRef = useRef('');
  const removalRequestRef = useRef(0);
  const removalAbortRef = useRef(null);
  const importedRemovalAbortRef = useRef(null);
  const migratedRemovalContextsRef = useRef(new WeakSet());
  const removalWorkerClientRef = useRef(null);
  const [initialSession] = useState(() => {
    // Reading render-time state must be idempotent. React Strict Mode renders this
    // initializer twice in development; consuming the session here discarded the
    // ephemeral MSFS render bundle before the committed editor mounted.
    const candidateSession = requestedSimulator
      ? getEditorSession(location.state?.sessionKey || editorSessionKey(icao, requestedSimulator))
      : null;
    const session =
      candidateSession?.document?.simulator === requestedSimulator &&
      String(candidateSession.document.icao ?? '').toUpperCase() === icao
        ? candidateSession
        : null;
    const localRecord = requestedSimulator
      ? loadEditorDraftImmediate(icao, requestedSimulator)
      : null;
    const localDocument = localRecord?.document;
    const localReference = localDocument
      ? loadReferenceSceneImmediate(icao, localDocument.simulator)
      : null;
    const sessionDocument = session?.document ?? localDocument;
    const workspace = sessionDocument
      ? loadEditorWorkspaceImmediate(icao, sessionDocument.simulator)?.workspace
      : null;
    return session
      ? { ...session, workspace }
      : localDocument
        ? {
            document: localDocument,
            referenceScene: localReference?.scene,
            sourceName: localReference?.sourceName,
            workspace,
            requiresPersistentHydration: true,
          }
        : {};
  });

  const initialWorkspace = initialSession?.workspace ?? {};
  const [hydrationStatus, setHydrationStatus] = useState(() => ({
    icao,
    pending: !skippedGeneration && editorSessionNeedsHydration(initialSession),
  }));
  const hydrationPending =
    !skippedGeneration && (hydrationStatus.icao !== icao || hydrationStatus.pending);

  const [airport, setAirport] = useState(initialSession?.airport ?? null);
  const [state, dispatch] = useReducer(
    editorReducer,
    initialSession?.document ?? null,
    (document) => {
      if (!document) return null;
      const editorState = createEditorState(document);
      const selectedId = initialWorkspace.selectedId;
      return editorState.present.objects.some((object) => object.partId === selectedId)
        ? { ...editorState, selectedId }
        : editorState;
    }
  );
  const [referenceSceneState, setReferenceScene] = useState(
    initialSession?.referenceScene ?? EMPTY_SCENE
  );
  const referenceScene = useMemo(
    () => normalizeReferenceScene(referenceSceneState),
    [referenceSceneState]
  );
  const removalReferenceFeaturesBySourceId = useMemo(() => {
    const featuresBySourceId = new Map();
    for (const feature of referenceScene.features ?? []) {
      for (const value of [
        feature.id,
        feature.properties?.sourceId,
        ...(feature.properties?.sourceRowIds ?? []),
      ]) {
        const sourceId = canonicalMsfsRemovalSourceId(value);
        if (sourceId && !featuresBySourceId.has(sourceId)) {
          featuresBySourceId.set(sourceId, feature);
        }
      }
    }
    return featuresBySourceId;
  }, [referenceScene.features]);
  const nearbyRemovalReferenceFeatures = useMemo(
    () =>
      (referenceScene.features ?? []).filter(
        (feature) =>
          feature.geometry?.type === 'LineString' && feature.properties?.msfsRemovalTarget === true
      ),
    [referenceScene.features]
  );
  const [tool, setTool] = useState(() =>
    TOOLS.some((candidate) => candidate.id === initialWorkspace.tool)
      ? initialWorkspace.tool
      : 'select'
  );
  const [visibleCategories, setVisibleCategories] = useState(
    () =>
      new Set(
        initialWorkspace.visibleCategories?.length
          ? initialWorkspace.visibleCategories
          : DEFAULT_VISIBLE_CATEGORIES
      )
  );
  const [divisionGhostsVisible, setDivisionGhostsVisible] = useState(
    Boolean(initialWorkspace.divisionGhostsVisible)
  );
  const [editorObjectsVisible, setEditorObjectsVisible] = useState(
    initialWorkspace.editorObjectsVisible !== false
  );
  const [editHandlesVisible, setEditHandlesVisible] = useState(
    Boolean(initialWorkspace.selectedId)
  );
  const [satelliteVisible, setSatelliteVisible] = useState(
    SATELLITE_REFERENCE_AVAILABLE && Boolean(initialWorkspace.satelliteVisible)
  );
  const [snapEnabled, setSnapEnabled] = useState(initialWorkspace.snapEnabled !== false);
  const snapToleranceMeters = 8;
  const [validationOpen, setValidationOpen] = useState(Boolean(initialWorkspace.validationOpen));
  const [quickEditingId, setQuickEditingId] = useState(null);
  const [removalSectionStart, setRemovalSectionStart] = useState(null);
  const [removalEditMode, setRemovalEditMode] = useState('add');
  const [measurementStart, setMeasurementStart] = useState(null);
  const [measurements, setMeasurements] = useState([]);
  const measurementIdRef = useRef(0);
  const [rightPanel, setRightPanel] = useState(
    initialWorkspace.rightPanel === 'object' ? 'object' : 'scenery'
  );
  const [uniqueObjectColors, setUniqueObjectColors] = useState(
    Boolean(initialWorkspace.uniqueObjectColors)
  );
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(
      initialWorkspace.advancedOpen ||
      TOOLS.find((candidate) => candidate.id === initialWorkspace.tool)?.advanced
    )
  );
  const viewportRef = useRef(initialWorkspace.viewport ?? null);
  const [focusRequest, setFocusRequest] = useState(null);
  const [followState, setFollowState] = useState(null);
  const [sourceProgress, setSourceProgress] = useState(null);
  const [sourceSelection, setSourceSelection] = useState(
    () =>
      initialSession?.sourceSelection ??
      (initialSession?.sourceName ? { name: initialSession.sourceName, entries: [] } : null)
  );
  const [renderBundle, setRenderBundle] = useState(initialSession?.renderBundle ?? null);
  const [removalContext, setRemovalContext] = useState(initialSession?.removalContext ?? null);
  const [importedRemovalMigrationPending, setImportedRemovalMigrationPending] = useState(() =>
    Boolean(
      initialSession?.removalContext &&
      initialSession?.document?.removals?.some((removal) => removal.origin === 'imported')
    )
  );
  const [removalBusy, setRemovalBusy] = useState(false);
  const [removalPreview, setRemovalPreview] = useState(null);
  const [sourceMismatch, setSourceMismatch] = useState(false);
  const [dragTarget, setDragTarget] = useState('');
  const [cachedTexturePaths, setCachedTexturePaths] = useState(() => new Set());
  const [textureStatus, setTextureStatus] = useState({
    phase: 'idle',
    total: 0,
    loaded: 0,
    packageTotal: 0,
    packageLoaded: 0,
    fallbackLoaded: 0,
    missing: 0,
    failed: 0,
    skipped: 0,
    meshGroups: 0,
    drawableGroups: 0,
    drawnGroups: 0,
    drawnTriangles: 0,
    renderError: '',
    cached: 0,
    connected: 0,
  });
  const [, setSavedAt] = useState(null);
  const initialTextureCacheRef = useRef('');
  const [toast, setToast] = useState({
    show: false,
    title: '',
    description: '',
    variant: 'default',
  });
  const handleTextureStatus = useCallback((update) => {
    pendingTextureStatusUpdatesRef.current.push(update);
    if (textureStatusTimerRef.current) return;
    textureStatusTimerRef.current = setTimeout(() => {
      textureStatusTimerRef.current = null;
      const updates = pendingTextureStatusUpdatesRef.current;
      pendingTextureStatusUpdatesRef.current = [];
      setTextureStatus((current) => {
        let next = current;
        for (const pending of updates) {
          next = typeof pending === 'function' ? pending(next) : pending;
        }
        const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
        return [...keys].every((key) => Object.is(current[key], next[key])) ? current : next;
      });
    }, 100);
  }, []);

  const document = state?.present;
  const importedMsfsRemovalsPresent = Boolean(
    document?.simulator === 'msfs' &&
    document.removals.some((removal) => removal.origin === 'imported')
  );
  const importedRemovalRefreshPending = Boolean(
    importedMsfsRemovalsPresent &&
    (sourceProgress || importedRemovalMigrationPending || removalBusy)
  );
  const mapDocument = useMemo(
    () =>
      importedRemovalMigrationPending
        ? {
            ...document,
            removals: document.removals.filter((removal) => removal.origin !== 'imported'),
          }
        : document,
    [document, importedRemovalMigrationPending]
  );
  const removalSelectionDocument = useMemo(
    () =>
      removalPreview
        ? traceEditorSpan(
            'removal:preview-document',
            () =>
              previewMsfsRemovalEdit(
                mapDocument,
                removalPreview.editableGroup,
                removalPreview.selections,
                removalPreview.keepSelections
              ),
            { selectionCount: removalPreview.selections.length }
          )
        : mapDocument,
    [mapDocument, removalPreview]
  );
  const removalRequiredCategories = useMemo(
    () => (tool === 'remove-light' ? new Set(['light-rows']) : new Set()),
    [tool]
  );
  const mapVisibleCategories = useMemo(
    () => new Set([...visibleCategories, ...removalRequiredCategories]),
    [removalRequiredCategories, visibleCategories]
  );
  const objectColors = useMemo(
    () =>
      uniqueObjectColors
        ? assignAdjacentColors(
            (document?.objects ?? []).map((object) => ({
              id: objectColorKey(object),
              coordinates: object.coordinates,
            }))
          )
        : EMPTY_OBJECT_COLORS,
    [document?.objects, uniqueObjectColors]
  );
  const latestDocumentRef = useRef(document);
  const latestDirtyRef = useRef(Boolean(state?.dirty));
  const workspaceSnapshot = useMemo(
    () => ({
      selectedId: state?.selectedId ?? null,
      tool,
      visibleCategories: [...visibleCategories],
      satelliteVisible,
      divisionGhostsVisible,
      editorObjectsVisible,
      snapEnabled,
      validationOpen,
      rightPanel,
      uniqueObjectColors,
      advancedOpen,
      viewport: viewportRef.current,
    }),
    [
      advancedOpen,
      divisionGhostsVisible,
      editorObjectsVisible,
      rightPanel,
      satelliteVisible,
      snapEnabled,
      state?.selectedId,
      tool,
      uniqueObjectColors,
      validationOpen,
      visibleCategories,
    ]
  );
  const latestWorkspaceRef = useRef(workspaceSnapshot);
  const hydrationRef = useRef({
    icao,
    enabled: !skippedGeneration && editorSessionNeedsHydration(initialSession),
  });
  useLayoutEffect(() => {
    latestWorkspaceRef.current = {
      ...workspaceSnapshot,
      viewport: viewportRef.current,
    };
    latestDocumentRef.current = document;
    latestDirtyRef.current = Boolean(state?.dirty);
  }, [document, state?.dirty, workspaceSnapshot]);
  useLayoutEffect(() => {
    if (hydrationRef.current.icao !== icao) {
      hydrationRef.current = { icao, enabled: !skippedGeneration };
    }
  }, [icao, skippedGeneration]);
  const handleViewportChange = useCallback(
    (nextViewport) => {
      viewportRef.current = nextViewport;
      latestWorkspaceRef.current = {
        ...latestWorkspaceRef.current,
        viewport: nextViewport,
      };
      const currentDocument = latestDocumentRef.current;
      if (!currentDocument) return;
      clearTimeout(workspaceSaveTimerRef.current);
      workspaceSaveTimerRef.current = setTimeout(() => {
        saveEditorWorkspace(icao, currentDocument.simulator, latestWorkspaceRef.current).catch(
          () => {}
        );
      }, 300);
    },
    [icao]
  );
  const selectedObject = document?.objects.find((object) => object.partId === state.selectedId);
  const documentObjects = document?.objects;
  const originalDivisions = document?.originalDivisions;
  const issues = useMemo(
    () =>
      documentObjects
        ? validateEditorDocument({
            objects: documentObjects,
            originalDivisions,
          })
        : [],
    [documentObjects, originalDivisions]
  );
  const issuesByPartId = useMemo(() => {
    const grouped = new Map();
    for (const issue of issues) {
      const partIssues = grouped.get(issue.partId);
      if (partIssues) partIssues.push(issue);
      else grouped.set(issue.partId, [issue]);
    }
    return grouped;
  }, [issues]);
  const selectedIssues = issuesByPartId.get(state?.selectedId) ?? EMPTY_ISSUES;
  const partMetadata = useMemo(
    () => buildPartMetadata(document?.objects ?? []),
    [document?.objects]
  );
  const idSuggestions = useMemo(
    () =>
      barsIdSuggestions(document?.originalDivisions, selectedObject?.id, 6, {
        coordinate: selectedObject?.coordinates?.[0],
        excludeIds: (document?.objects ?? [])
          .filter((object) => object.partId !== selectedObject?.partId)
          .map((object) => object.id),
      }),
    [document?.objects, document?.originalDivisions, selectedObject]
  );
  const localTextureStats = useMemo(() => {
    if (document?.simulator !== 'xplane') return null;
    const entryIndex = createTextureEntryIndex(sourceSelection?.entries);
    const paths = new Set();
    for (const feature of referenceScene.features ?? []) {
      const path = normalizeTexturePath(feature.properties?.textureAssetPath);
      if (feature.properties?.texturePattern && path) paths.add(path);
    }
    const ready = [...paths].filter(
      (path) => findTextureEntry(entryIndex, path) || cachedTexturePaths.has(path)
    ).length;
    const unresolvedDefinitions = new Set(
      (referenceScene.features ?? [])
        .filter((feature) =>
          ['LineString', 'Polygon', 'MultiPolygon'].includes(feature.geometry?.type)
        )
        .filter((feature) => feature.properties?.textureDefinitionResolved !== true)
        .map((feature) => xPlaneTextureDefinitionKey(feature.properties))
        .filter(Boolean)
    );
    return {
      total: paths.size,
      ready: Math.min(paths.size, ready),
      unresolvedDefinitions: unresolvedDefinitions.size,
      needsLibrary: unresolvedDefinitions.size > 0 || ready < paths.size,
    };
  }, [cachedTexturePaths, document?.simulator, referenceScene.features, sourceSelection?.entries]);
  const hasReferenceScene = referenceScene.features.length > 0;
  const editorReady = Boolean(
    document &&
    hasReferenceScene &&
    (document.simulator !== 'msfs' || renderBundle) &&
    (document.simulator !== 'xplane' || !localTextureStats?.needsLibrary)
  );
  const showError = useCallback((description) => {
    setToast({ show: true, title: 'Contribution editor', description, variant: 'destructive' });
  }, []);

  useEffect(() => {
    if (document?.simulator !== 'xplane' || !document.source?.fingerprint) {
      setCachedTexturePaths(new Set());
      return undefined;
    }
    const paths = (referenceScene.features ?? [])
      .map((feature) => feature.properties?.textureAssetPath)
      .filter(Boolean);
    let cancelled = false;
    loadReferenceTextures(document.source.fingerprint, paths).then((records) => {
      if (!cancelled) setCachedTexturePaths(new Set(records.keys()));
    });
    return () => {
      cancelled = true;
    };
  }, [document?.simulator, document?.source?.fingerprint, referenceScene.features]);

  useEffect(() => {
    if (
      document?.simulator !== 'xplane' ||
      !document.source?.fingerprint ||
      !sourceSelection?.entries?.length ||
      referenceScene.features.length === 0
    ) {
      return undefined;
    }
    const cacheKey = `${document.source.fingerprint}:${referenceScene.features.length}`;
    if (initialTextureCacheRef.current === cacheKey) return undefined;
    initialTextureCacheRef.current = cacheKey;
    let cancelled = false;
    requestPersistentEditorStorage();
    cacheReferenceTextures(
      document.source.fingerprint,
      referenceScene,
      sourceSelection.entries
    ).then((result) => {
      if (!cancelled && result.paths?.length) {
        setCachedTexturePaths((paths) => new Set([...paths, ...result.paths]));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    document?.simulator,
    document?.source?.fingerprint,
    referenceScene,
    sourceSelection?.entries,
  ]);

  useEffect(() => {
    if (
      document?.simulator !== 'xplane' ||
      referenceScene.features.length === 0 ||
      !localTextureStats?.unresolvedDefinitions
    ) {
      return undefined;
    }
    let cancelled = false;
    hydrateReferenceTextureDefinitions(referenceScene).then((result) => {
      if (cancelled || result.resolvedDefinitions === 0) return;
      setReferenceScene(result.scene);
      if (document.source?.fingerprint) {
        saveReferenceScene(
          icao,
          document.simulator,
          result.scene,
          document.source.name || sourceSelection?.name || '',
          document.source.fingerprint
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    document?.simulator,
    document?.source?.fingerprint,
    document?.source?.name,
    icao,
    localTextureStats?.unresolvedDefinitions,
    referenceScene,
    sourceSelection?.name,
  ]);

  useEffect(() => {
    if (!/^[A-Z0-9]{4}$/.test(icao)) {
      navigate('/contribute/new', { replace: true });
      return undefined;
    }
    if (airport) return undefined;
    const controller = new AbortController();
    fetch(`https://v2.stopbars.com/airports?icao=${icao}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Airport not found');
        return response.json();
      })
      .then((value) =>
        setAirport({
          icao: value.icao,
          name: value.name,
          latitude: value.latitude,
          longitude: value.longitude,
          elevation_m: value.elevation_m,
        })
      )
      .catch((error) => {
        if (error.name !== 'AbortError') showError('Airport could not be loaded.');
      });
    return () => controller.abort();
  }, [airport, icao, navigate, showError]);

  useEffect(() => {
    const simulator = document?.simulator;
    if (!simulator || !/^[A-Z0-9]{4}$/.test(icao)) {
      return undefined;
    }
    const refreshKey = `${icao}:${simulator}`;
    if (originalDivisionRefreshRef.current === refreshKey) return undefined;
    const controller = new AbortController();
    fetch(`https://v2.stopbars.com/airports/${icao}/points`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('Division objects could not be loaded');
        return response.json();
      })
      .then((points) => {
        if (controller.signal.aborted) return;
        const originalDivisions = originalDivisionsFromPoints(points);
        originalDivisionRefreshRef.current = refreshKey;
        const nextDocument = syncOriginalDivisionMetadata(
          latestDocumentRef.current,
          originalDivisions
        );
        dispatch({ type: 'sync-original-divisions', originalDivisions });
        saveEditorDraft(nextDocument).catch(() => {});
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.warn('Original division overlay unavailable:', error);
        }
      });
    return () => controller.abort();
  }, [document?.simulator, icao]);

  useEffect(() => {
    if (!hydrationRef.current.enabled) return undefined;
    let cancelled = false;
    const hydrate = async () => {
      try {
        const newest = requestedSimulator ? await loadEditorDraft(icao, requestedSimulator) : null;
        const reference = newest ? await loadReferenceScene(icao, newest.document.simulator) : null;
        if (cancelled || !newest) return;
        dispatch({ type: 'replace-document', document: newest.document });
        setSavedAt(newest.savedAt);
        if (reference?.scene) {
          setReferenceScene(reference.scene);
          setSourceMismatch(
            Boolean(
              newest.document.source?.fingerprint &&
              reference.fingerprint &&
              newest.document.source.fingerprint !== reference.fingerprint
            )
          );
          if (reference.sourceName) {
            setSourceSelection({ name: reference.sourceName, entries: [] });
          }
        }
      } catch {
        if (!cancelled) showError('The locally saved editor workspace could not be restored.');
      } finally {
        if (!cancelled) {
          // Strict Mode cancels and repeats its first effect pass. Only the
          // committed pass may reveal the restored editor or empty-state UI.
          hydrationRef.current.enabled = false;
          setHydrationStatus({ icao, pending: false });
        }
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [icao, requestedSimulator, showError]);

  useEffect(() => {
    if (!state?.dirty || !document) return undefined;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      const record = await traceEditorAsync(
        'editor:autosave',
        () => saveEditorDraft(document, { normalized: true }),
        {
          objectCount: document.objects.length,
          removalCount: document.removals.length,
        }
      );
      setSavedAt(record.savedAt);
      dispatch({ type: 'mark-saved' });
    }, 650);
    return () => clearTimeout(autosaveTimerRef.current);
  }, [document, state?.dirty]);

  useEffect(() => {
    if (!document) return undefined;
    clearTimeout(workspaceSaveTimerRef.current);
    workspaceSaveTimerRef.current = setTimeout(() => {
      saveEditorWorkspace(icao, document.simulator, workspaceSnapshot).catch(() => {});
    }, 300);
    return () => clearTimeout(workspaceSaveTimerRef.current);
  }, [document, icao, workspaceSnapshot]);

  useEffect(() => {
    removalWorkerClientRef.current?.terminate();
    removalWorkerClientRef.current = removalContext
      ? createMsfsRemovalWorkerClient(removalContext)
      : null;
    return () => {
      removalWorkerClientRef.current?.terminate();
      removalWorkerClientRef.current = null;
    };
  }, [removalContext]);

  useEffect(() => {
    if (document?.simulator !== 'msfs' || !removalContext) return undefined;
    const importedRemovals = document.removals.filter((removal) => removal.origin === 'imported');
    const workerClient = removalWorkerClientRef.current;
    const migratedContexts = migratedRemovalContextsRef.current;
    if (importedRemovals.length === 0 || !workerClient || migratedContexts.has(removalContext)) {
      return undefined;
    }

    migratedContexts.add(removalContext);
    const abortController = new AbortController();
    importedRemovalAbortRef.current?.abort();
    importedRemovalAbortRef.current = abortController;
    let completed = false;
    setImportedRemovalMigrationPending(true);
    startTransition(() => setRemovalBusy(true));
    workerClient
      .migrateImported(document.objects, importedRemovals, {
        signal: abortController.signal,
      })
      .then((result) => {
        if (abortController.signal.aborted) return;
        completed = true;
        dispatch({
          type: 'migrate-imported-msfs-removals',
          bindingsByPartId: result.bindingsByPartId,
          sourceIds: result.generatedSourceIds,
          removalIds: result.removalIds,
          removals: result.removals,
        });
      })
      .catch((error) => {
        migratedContexts.delete(removalContext);
        if (error?.name !== 'AbortError') {
          showError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (importedRemovalAbortRef.current !== abortController) return;
        importedRemovalAbortRef.current = null;
        setImportedRemovalMigrationPending(false);
        startTransition(() => setRemovalBusy(false));
      });

    return () => {
      abortController.abort();
      if (!completed) migratedContexts.delete(removalContext);
    };
  }, [document, removalContext, showError]);

  useEffect(() => {
    if (!document || initialSaveRef.current) return;
    initialSaveRef.current = true;
    saveEditorDraft(document, { normalized: true }).then((record) => setSavedAt(record.savedAt));
  }, [document]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      if (event.key === 'Delete' && state?.selectedId) {
        dispatch({ type: 'delete-object', id: state.selectedId });
        return;
      }
      if (event.key === 'Escape') {
        setTool('select');
        setFollowState(null);
        setRemovalSectionStart(null);
        setMeasurementStart(null);
        dispatch({ type: 'select', id: null });
        return;
      }
      const selectedTool = TOOLS.find(
        (candidate) =>
          candidate.shortcut.toLowerCase() === event.key.toLowerCase() &&
          (!candidate.xplaneOnly || document?.simulator === 'xplane')
      );
      if (selectedTool) {
        if (selectedTool.id !== 'measure') setMeasurementStart(null);
        if (selectedTool.id === 'draw') {
          setVisibleCategories((categories) => new Set([...categories, 'light-rows']));
        }
        if (selectedTool.id === 'remove-light') {
          setRightPanel('scenery');
        }
        if (selectedTool.advanced) setAdvancedOpen(true);
        setTool(selectedTool.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [document?.simulator, state?.selectedId]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      removalAbortRef.current?.abort();
      importedRemovalAbortRef.current?.abort();
      removalWorkerClientRef.current?.terminate();
      clearTimeout(autosaveTimerRef.current);
      clearTimeout(workspaceSaveTimerRef.current);
      clearTimeout(textureStatusTimerRef.current);
      pendingTextureStatusUpdatesRef.current = [];
      if (latestDirtyRef.current && latestDocumentRef.current) {
        saveEditorDraft(latestDocumentRef.current);
      }
      if (latestDocumentRef.current) {
        saveEditorWorkspace(icao, latestDocumentRef.current.simulator, latestWorkspaceRef.current);
      }
    },
    [icao]
  );

  const selectTool = useCallback(
    (nextTool) => {
      if (!document) return;
      setFollowState(null);
      setRemovalSectionStart(null);
      if (nextTool !== 'measure') setMeasurementStart(null);
      if (nextTool === 'draw') {
        setVisibleCategories((categories) => new Set([...categories, 'light-rows']));
      }
      if (nextTool === 'remove-light') {
        setRightPanel('scenery');
      }
      if (TOOLS.find((candidate) => candidate.id === nextTool)?.advanced) {
        setAdvancedOpen(true);
      }
      setTool(nextTool);
    },
    [document]
  );

  const syncAutomaticMsfsRemoval = useCallback(
    async (matchOrMatches, retainedBindings = [], replacedRemovalIds = []) => {
      if (document?.simulator !== 'msfs' || !removalContext) return;
      const manualSourceIds = manualMsfsRemovalSourceIds(document.removals);
      const selections = automaticRemovalSelections(matchOrMatches, retainedBindings).filter(
        (selection) => !manualSourceIds.has(canonicalMsfsRemovalSourceId(selection.sourceId))
      );
      if (selections.length === 0) {
        if (replacedRemovalIds.length > 0) {
          dispatch({
            type: 'upsert-msfs-auto-removals',
            sourceIds: [],
            removalIds: replacedRemovalIds,
            removals: [],
          });
        }
        return;
      }
      removalAbortRef.current?.abort();
      const abortController = new AbortController();
      removalAbortRef.current = abortController;
      const workerClient = removalWorkerClientRef.current;
      if (!workerClient) return;
      const requestId = ++removalRequestRef.current;
      setRemovalBusy(true);
      try {
        const result = await workerClient.build(selections, {
          signal: abortController.signal,
        });
        if (requestId !== removalRequestRef.current) return;
        const acceptedSourceIds = new Set((result.acceptedSourceIds ?? []).map(String));
        const acceptedSelections = selections.filter((selection) =>
          acceptedSourceIds.has(String(selection.sourceId))
        );
        const rejectedSelections = selections.filter(
          (selection) => !acceptedSourceIds.has(String(selection.sourceId))
        );
        const affectedSourceIds = new Set();
        for (const selection of acceptedSelections) affectedSourceIds.add(selection.sourceId);
        for (const sourceId of result.generatedSourceIds ?? []) affectedSourceIds.add(sourceId);
        if (affectedSourceIds.size > 0) {
          dispatch({
            type: 'upsert-msfs-auto-removals',
            sourceIds: [...affectedSourceIds],
            removalIds: replacedRemovalIds,
            removals: result.removals,
          });
        }
        if (rejectedSelections.length > 0) {
          showError(
            `Automatic removal could not safely update ${rejectedSelections.length === 1 ? 'one simulator row' : `${rejectedSelections.length} simulator rows`}.`
          );
        }
      } catch (error) {
        if (error?.name !== 'AbortError' && requestId === removalRequestRef.current) {
          showError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        finishRemovalBuild(requestId, removalRequestRef, removalAbortRef, setRemovalBusy);
      }
    },
    [document, removalContext, showError]
  );

  const handleMapClick = useCallback(
    (coordinate, metadata) => {
      if (!document) return;
      if (tool === 'measure') {
        if (!measurementStart) {
          setMeasurementStart(coordinate);
          return;
        }
        const measuredDistance = distanceMeters(measurementStart, coordinate);
        if (measuredDistance > 0.05) {
          const id = `measurement:${++measurementIdRef.current}`;
          setMeasurements((current) => [
            ...current,
            { id, coordinates: [measurementStart, coordinate], distanceMeters: measuredDistance },
          ]);
        }
        setMeasurementStart(null);
      } else if (tool === 'split' && selectedObject) {
        const projection = nearestPointOnLine(coordinate, selectedObject.coordinates);
        if (!projection || projection.distanceMeters > snapToleranceMeters) return;
        const split = splitLineAt(selectedObject.coordinates, projection);
        if (!split) return;
        const splitMatches =
          document.simulator === 'msfs'
            ? split.map((coordinates) =>
                matchSnappedReference(coordinates, referenceScene.features, 1.5, {
                  allowDerived: true,
                })
              )
            : [null, null];
        const sibling = {
          ...selectedObject,
          id: selectedObject.id,
          partId: uniquePartId(document.objects, selectedObject.id),
          name: selectedObject.name,
          coordinates: split[1],
          sourceBindings: removalBindingsFromMatch(splitMatches[1]),
        };
        dispatch({
          type: 'replace-objects',
          objects: document.objects
            .map((object) =>
              object.partId === selectedObject.partId
                ? {
                    ...object,
                    coordinates: split[0],
                    sourceBindings:
                      document.simulator === 'msfs'
                        ? removalBindingsFromMatch(splitMatches[0])
                        : object.sourceBindings,
                  }
                : object
            )
            .concat(sibling),
        });
        void syncAutomaticMsfsRemoval(
          splitMatches,
          selectedObject.sourceBindings,
          coveredAutomaticRemovalIds(document.removals, selectedObject.coordinates)
        );
        setTool('select');
      } else if (tool === 'join' && selectedObject) {
        const targetId = String(metadata.editorFeature?.properties?.editorId ?? '');
        const target = document.objects.find(
          (object) => object.partId === targetId && object.partId !== selectedObject.partId
        );
        if (!target) return;
        const joined = joinLines(selectedObject.coordinates, target.coordinates, 20);
        if (!joined) {
          showError('Those objects do not have endpoints within 20 metres.');
          return;
        }
        dispatch({
          type: 'replace-objects',
          objects: document.objects
            .filter((object) => object.partId !== target.partId)
            .map((object) =>
              object.partId === selectedObject.partId
                ? {
                    ...object,
                    coordinates: joined,
                    sourceBindings: [
                      ...object.sourceBindings,
                      ...target.sourceBindings.filter(
                        (binding) =>
                          !object.sourceBindings.some(
                            (existing) => existing.sourceId === binding.sourceId
                          )
                      ),
                    ],
                  }
                : object
            ),
        });
        setTool('select');
      }
    },
    [
      document,
      measurementStart,
      referenceScene.features,
      selectedObject,
      showError,
      snapToleranceMeters,
      syncAutomaticMsfsRemoval,
      tool,
    ]
  );

  const handleMeasurementMove = useCallback((id, coordinates) => {
    setMeasurements((current) =>
      current.map((measurement) =>
        measurement.id === id
          ? {
              ...measurement,
              coordinates,
              distanceMeters: distanceMeters(coordinates[0], coordinates[1]),
            }
          : measurement
      )
    );
  }, []);
  const handleMeasurementCancel = useCallback(() => setMeasurementStart(null), []);

  const handleSelect = useCallback((id, { focus = false } = {}) => {
    dispatch({ type: 'select', id });
    setEditHandlesVisible(Boolean(id));
    if (id) {
      setTool('select');
      setFollowState(null);
      setRightPanel('object');
      if (focus) {
        setFocusRequest((request) => ({
          id,
          nonce: (request?.nonce ?? 0) + 1,
        }));
      }
    }
  }, []);
  const handleQuickEditObject = useCallback((id) => {
    dispatch({ type: 'select', id });
    setQuickEditingId((currentId) => (currentId === id ? null : id));
  }, []);
  const handleDeleteObject = useCallback((id) => {
    dispatch({ type: 'delete-object', id });
  }, []);
  const handleRenameObject = useCallback((partId, id) => {
    dispatch({ type: 'rename-object-id', partId, id });
  }, []);

  const handleIssueSelect = useCallback(
    (issue) => {
      if (issue.target !== 'division') {
        handleSelect(issue.partId, { focus: true });
        return;
      }
      dispatch({ type: 'select', id: null });
      setTool('select');
      setFollowState(null);
      setRightPanel('scenery');
      setDivisionGhostsVisible(true);
      setFocusRequest((request) => ({
        id: issue.objectId,
        kind: 'division',
        nonce: (request?.nonce ?? 0) + 1,
      }));
    },
    [handleSelect]
  );

  const handleCreate = useCallback(
    (coordinates, options = {}) => {
      if (!document || coordinates.length < 2) return;
      const requestedDivisionId = String(options.divisionId ?? '').trim();
      const requestedDivision = requestedDivisionId
        ? document.originalDivisions.find(
            (division) =>
              String(division.id).trim().toUpperCase() === requestedDivisionId.toUpperCase()
          )
        : null;
      if (
        requestedDivisionId &&
        (!requestedDivision || originalDivisionHasMatch(document.objects, requestedDivisionId))
      ) {
        return;
      }
      const match = matchSnappedReference(coordinates, referenceScene.features, 1.5, {
        allowDerived: document.simulator === 'msfs',
      });
      const suggestion = requestedDivision
        ? { id: requestedDivision.id, name: requestedDivision.name }
        : barsIdSuggestions(document.originalDivisions, '', 1, {
            coordinate: coordinates[0],
            excludeIds: document.objects.map((object) => object.id),
          })[0];
      const suggestedDivision =
        requestedDivision ??
        (suggestion
          ? document.originalDivisions.find(
              (division) =>
                String(division.id).trim().toUpperCase() === suggestion.id.trim().toUpperCase()
            )
          : null);
      const objectId = suggestedDivision?.id ?? suggestion?.id ?? '';
      dispatch({
        type: 'add-object',
        match,
        object: {
          id: objectId,
          partId: uniquePartId(document.objects, objectId || 'manual'),
          groupId: suggestedDivision ? `division:${suggestedDivision.id}` : undefined,
          name: suggestedDivision?.name ?? suggestion?.name ?? 'New object',
          type: suggestedDivision?.type ?? 'lead_on',
          status: match ? 'matched' : 'manual',
          coordinates,
          color: objectId ? colorForObjectId(objectId) : '#22d3ee',
          sourceBindings: removalBindingsFromMatch(match),
        },
      });
      setEditHandlesVisible(false);
      setTool('select');
      setRightPanel('object');
      void syncAutomaticMsfsRemoval(match);
    },
    [document, referenceScene.features, syncAutomaticMsfsRemoval]
  );

  const handleGeometryChange = useCallback(
    (id, coordinates) => {
      if (coordinates.length < 2) return;
      const match = matchSnappedReference(coordinates, referenceScene.features, 1.5, {
        allowDerived: document?.simulator === 'msfs',
      });
      const previousObject = document?.objects.find((object) => object.partId === id);
      const projectedBindings = (previousObject?.sourceBindings ?? []).map((binding) => {
        const sourceId = canonicalMsfsRemovalSourceId(binding.sourceId);
        const feature = removalReferenceFeaturesBySourceId.get(sourceId);
        return removalBindingFromExtendedReference(coordinates, feature) ?? binding;
      });
      const projectedSourceIds = new Set(
        projectedBindings.map((binding) => canonicalMsfsRemovalSourceId(binding.sourceId))
      );
      const matchedBindings = match?.bindings ?? (match?.binding ? [match.binding] : []);
      const removalBindings = [...projectedBindings];
      for (const binding of matchedBindings) {
        const sourceId = canonicalMsfsRemovalSourceId(binding.sourceId);
        if (projectedSourceIds.has(sourceId)) continue;
        projectedSourceIds.add(sourceId);
        removalBindings.push(binding);
      }
      for (const feature of nearbyRemovalReferenceFeatures) {
        const binding = nearbyRemovalBindingFromExtendedReference(coordinates, feature, 1.5);
        if (!binding) continue;
        const sourceId = canonicalMsfsRemovalSourceId(binding.sourceId);
        if (projectedSourceIds.has(sourceId)) continue;
        projectedSourceIds.add(sourceId);
        removalBindings.push(binding);
      }
      const coveredRemovalIds = coveredAutomaticRemovalIds(
        document?.removals,
        previousObject?.coordinates
      );
      const importedReplacement = importedRemovalReplacementPlan(
        document?.removals,
        coveredRemovalIds,
        document?.objects,
        id,
        (object) =>
          removalBindingsFromMatch(
            matchSnappedReference(object.coordinates, nearbyRemovalReferenceFeatures, 1.5, {
              allowDerived: true,
            })
          )
      );
      const sharedRemovalBindings = removalBindingsWithSharedRows(document?.objects, id, [
        ...removalBindings,
        ...importedReplacement.retainedBindings,
      ]);
      startTransition(() => {
        dispatch({
          type: 'update-object-geometry',
          id,
          coordinates,
          match,
          sourceBindings: document?.simulator === 'msfs' ? removalBindings : undefined,
        });
      });
      void syncAutomaticMsfsRemoval(
        sharedRemovalBindings.length > 0 ? { bindings: sharedRemovalBindings } : match,
        [],
        coveredRemovalIds.filter(
          (removalId) =>
            !importedReplacement.importedRemovalIds.has(removalId) ||
            importedReplacement.replaceableRemovalIds.has(removalId)
        )
      );
    },
    [
      document,
      nearbyRemovalReferenceFeatures,
      referenceScene.features,
      removalReferenceFeaturesBySourceId,
      syncAutomaticMsfsRemoval,
    ]
  );

  const handleReferenceClick = useCallback(
    async (feature, coordinate) => {
      if (tool === 'remove-light') {
        if (removalBusy) return;
        if (document?.simulator === 'msfs') {
          const removalFeature = removalSelectionFeature(
            removalSectionStart,
            resolveMsfsRemovalTarget(nearbyRemovalReferenceFeatures, feature, coordinate)
          );
          const removalProperties = removalFeature?.properties ?? {};
          const sourceId = canonicalMsfsRemovalSourceId(
            removalProperties.sourceId ?? removalFeature?.id
          );
          if (
            removalProperties.msfsRemovalTarget !== true ||
            removalProperties.snapCategory !== 'light-rows' ||
            removalFeature.geometry?.type !== 'LineString'
          ) {
            showError('Select a source-backed light row.');
            return;
          }
          if (!removalContext) {
            showError('Reconnect the scenery package before changing MSFS removals.');
            return;
          }
          const projection = nearestPointOnLine(coordinate, removalFeature.geometry.coordinates);
          if (!projection) return;
          if (!removalSectionStart) {
            setRemovalSectionStart({ sourceId, feature: removalFeature, projection });
            return;
          }
          const finishPerformanceTrace = beginEditorInteraction('msfs-removal-section-edit', {
            sourceId,
            removalCount: document.removals.length,
            objectCount: document.objects.length,
            sourceRowCount: removalContext.lightRows.length,
          });
          let editableGroup = traceEditorSpan(
            'removal:editable-group',
            () => editableMsfsRemovalGroup(document, sourceId, removalContext.lightRows),
            { sourceId }
          );
          const editSourceId = editableGroup.targetSourceId || sourceId;
          let nextSelections = [...editableGroup.selections];
          let nextKeepSelections = [...(editableGroup.keepSelections ?? [])];
          let retiredImportedRemovalIds = [];
          const section = traceEditorSpan(
            'removal:project-section',
            () =>
              referenceMatchFromProjections(
                removalFeature,
                removalSectionStart.projection,
                projection
              ),
            { sourceId: editSourceId }
          );
          const selection = removalSelectionFromBinding(section?.binding);
          if (!selection) {
            finishPerformanceTrace({ outcome: 'selection-unresolved' });
            return;
          }
          if (selection.rangeEndMeters - selection.rangeStartMeters < 1) {
            showError('Select an end point at least 1 metre from the start.');
            finishPerformanceTrace({ outcome: 'selection-too-short' });
            return;
          }
          if (removalEditMode === 'erase') {
            const selectedCoordinates = sliceLineBetween(
              removalFeature.geometry.coordinates,
              removalSectionStart.projection,
              projection
            );
            const overlappingRemovalIds = traceEditorSpan(
              'removal:overlapping-keep-polygons',
              () => removalIdsCoveringLineSection(document.removals, selectedCoordinates),
              { removalCount: document.removals.length }
            );
            retiredImportedRemovalIds = traceEditorSpan(
              'removal:retire-imported-polygons',
              () => importedRemovalIdsToRetire(document.removals, overlappingRemovalIds),
              { overlappingRemovalCount: overlappingRemovalIds.length }
            );
            const editableRemovalIds = new Set(editableGroup.removalIds);
            if (overlappingRemovalIds.some((id) => !editableRemovalIds.has(id))) {
              editableGroup = traceEditorSpan(
                'removal:expanded-editable-group',
                () =>
                  editableMsfsRemovalGroup(
                    document,
                    sourceId,
                    removalContext.lightRows,
                    overlappingRemovalIds
                  ),
                { overlappingRemovalCount: overlappingRemovalIds.length }
              );
              nextSelections = [...editableGroup.selections];
              nextKeepSelections = [...(editableGroup.keepSelections ?? [])];
            }
          }
          nextSelections = traceEditorSpan(
            'removal:apply-selection-edit',
            () =>
              applyMsfsSelectionEdit(
                nextSelections,
                { ...selection, sourceId: editSourceId },
                removalEditMode,
                section.binding.sourceParentLengthMeters
              ),
            { editMode: removalEditMode, existingSelectionCount: nextSelections.length }
          );
          nextKeepSelections = traceEditorSpan(
            'removal:apply-keep-selection-edit',
            () =>
              applyMsfsSelectionEdit(
                nextKeepSelections,
                { ...selection, sourceId: editSourceId },
                removalEditMode === 'erase' ? 'add' : 'erase',
                section.binding.sourceParentLengthMeters
              ),
            {
              editMode: removalEditMode,
              existingKeepSelectionCount: nextKeepSelections.length,
            }
          );
          setRemovalSectionStart(null);
          removalAbortRef.current?.abort();
          const abortController = new AbortController();
          removalAbortRef.current = abortController;
          const workerClient = removalWorkerClientRef.current;
          if (!workerClient) {
            finishPerformanceTrace({ outcome: 'worker-missing' });
            return;
          }
          const requestId = ++removalRequestRef.current;
          let traceOutcome = 'completed';
          let generatedRemovalCount = 0;
          startTransition(() => {
            setRemovalPreview({
              editableGroup,
              selections: nextSelections,
              keepSelections: nextKeepSelections,
            });
            setRemovalBusy(true);
          });
          try {
            const result = await traceEditorAsync(
              'removal:worker-roundtrip',
              () =>
                workerClient.build(nextSelections, {
                  signal: abortController.signal,
                  keepSelections: nextKeepSelections,
                }),
              { selectionCount: nextSelections.length }
            );
            generatedRemovalCount = result.removals.length;
            recordEditorDuration(
              'removal:worker-internal',
              result.performanceTrace?.workerMilliseconds ?? 0,
              result.performanceTrace ?? {}
            );
            if (requestId !== removalRequestRef.current) {
              traceOutcome = 'stale-request';
              return;
            }
            const targetUnresolved = result.rejectedSourceIds.some(
              (rejectedSourceId) => canonicalMsfsRemovalSourceId(rejectedSourceId) === editSourceId
            );
            if (removalEditMode === 'add' && targetUnresolved) {
              showError(
                'That source light row could not be resolved, so the removal was not changed.'
              );
              traceOutcome = 'target-unresolved';
              return;
            }
            traceEditorSpan('removal:dispatch-replacement', () =>
              dispatch({
                type: 'replace-msfs-edited-removals',
                sourceIds: [
                  ...new Set([
                    ...editableGroup.sourceIds,
                    editSourceId,
                    ...(result.generatedSourceIds ?? []),
                  ]),
                ],
                removalIds: [
                  ...new Set([...editableGroup.removalIds, ...retiredImportedRemovalIds]),
                ],
                removals: result.removals,
              })
            );
          } catch (error) {
            traceOutcome = error?.name === 'AbortError' ? 'aborted' : 'failed';
            if (error?.name !== 'AbortError' && requestId === removalRequestRef.current) {
              showError(error instanceof Error ? error.message : String(error));
            }
          } finally {
            if (requestId === removalRequestRef.current) {
              removalAbortRef.current = null;
              startTransition(() => {
                setRemovalPreview(null);
                setRemovalBusy(false);
              });
            }
            finishEditorInteractionAfterSettled(finishPerformanceTrace, {
              outcome: traceOutcome,
              generatedRemovalCount,
              editedSourceCount: editableGroup.sourceIds.length,
              selectionCount: nextSelections.length,
              keepSelectionCount: nextKeepSelections.length,
            });
          }
          return;
        }
        const removalFeature = removalSelectionFeature(
          removalSectionStart,
          resolveXPlaneRemovalTarget(referenceScene.features, feature, coordinate)
        );
        const properties = removalFeature?.properties ?? {};
        const dsf = dsfSelector(properties.dsfRemoval);
        if (dsf && properties.removable !== false) {
          dispatch({ type: 'edit-xplane-removal', selector: dsf, operation: removalEditMode });
          setRemovalSectionStart(null);
          return;
        }
        const selector = {
          feature: String(properties.sourceFeatureId ?? ''),
          code: Number(properties.lightCode),
          run: Number(properties.sourceRunIndex),
          start: 0,
          end: 1,
        };
        if (
          properties.sourceType !== 'xplane-apt-light-string' ||
          properties.removable === false ||
          !/^[a-f0-9]{16}$/i.test(selector.feature) ||
          !Number.isInteger(selector.code) ||
          !Number.isInteger(selector.run)
        ) {
          showError(
            'Only source-backed apt.dat light rows can be removed automatically. This feature is placement-only.'
          );
          return;
        }
        if (removalFeature?.geometry?.type === 'LineString') {
          const projection = nearestPointOnLine(coordinate, removalFeature.geometry.coordinates);
          if (!projection) return;
          const sourceId = String(properties.sourceId ?? removalFeature.id ?? selector.feature);
          if (!removalSectionStart) {
            setRemovalSectionStart({ sourceId, feature: removalFeature, projection });
            return;
          }
          const match = referenceMatchFromProjections(
            removalFeature,
            removalSectionStart.projection,
            projection
          );
          if (
            distanceMeters(removalSectionStart.projection.coordinate, projection.coordinate) < 1
          ) {
            showError('Select an end point at least 1 metre from the start.');
            return;
          }
          const sectionSelector = match?.selector ?? match?.selectors?.[0];
          if (sectionSelector) {
            dispatch({
              type: 'edit-xplane-removal',
              selector: sectionSelector,
              operation: removalEditMode,
            });
          }
          setRemovalSectionStart(null);
          return;
        }
        showError('Select a source-backed light row.');
        return;
      }
      if (!selectedObject || tool !== 'follow') return;
      if (feature.geometry?.type !== 'LineString') {
        showError('Follow source works with simulator lines and light rows.');
        return;
      }
      const projection = nearestPointOnLine(coordinate, feature.geometry.coordinates);
      if (!projection) return;
      const sourceId = String(feature.properties?.sourceId ?? feature.id ?? '');
      if (!followState || followState.sourceId !== sourceId) {
        setFollowState({ sourceId, feature, first: projection });
        return;
      }
      const coordinates = sliceLineBetween(
        feature.geometry.coordinates,
        followState.first,
        projection
      );
      if (coordinates.length < 2) return;
      const tracedMatch = referenceMatchFromProjections(feature, followState.first, projection);
      const overlapMatch =
        document?.simulator === 'xplane'
          ? matchSnappedReference(coordinates, referenceScene.features)
          : null;
      const match = overlapMatch ?? tracedMatch;
      dispatch({
        type: 'update-object-geometry',
        id: selectedObject.partId,
        coordinates,
        match,
      });
      setFollowState(null);
      setTool('select');
    },
    [
      document,
      followState,
      removalContext,
      nearbyRemovalReferenceFeatures,
      referenceScene.features,
      removalBusy,
      removalEditMode,
      removalSectionStart,
      selectedObject,
      showError,
      tool,
    ]
  );

  const processDraftFile = useCallback(
    async (file) => {
      if (!file) return;
      if (!/\.xml$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
        showError('Choose a BARS XML file smaller than 5 MB.');
        return;
      }
      try {
        const xml = await file.text();
        const parsed = parseDraftXml(xml);
        const next = createEditorDocument({
          icao,
          simulator: parsed.simulator,
          altitude: parsed.altitude,
          draftXml: xml,
          originalDivisions: latestDocumentRef.current?.originalDivisions,
        });
        dispatch({ type: 'replace-document', document: next });
        saveEditorDraft(next)
          .then(() => setSavedAt(new Date()))
          .catch(() => {});
        setReferenceScene({ ...EMPTY_SCENE, simulator: next.simulator });
        setRenderBundle(null);
        setRemovalContext(null);
        setImportedRemovalMigrationPending(false);
        setSourceSelection(null);
        setCachedTexturePaths(new Set());
        setSourceMismatch(false);
        setTool('select');
        navigate(`/contribute/editor/${icao}?simulator=${next.simulator}`, { replace: true });
      } catch (error) {
        showError(error instanceof Error ? error.message : 'The XML file could not be read.');
      }
    },
    [icao, navigate, showError]
  );

  const extractReference = useCallback(
    (selection) => {
      if (!selection?.entries.length || !airport || !document) return;
      const refreshesImportedMsfsRemovals =
        document.simulator === 'msfs' &&
        document.removals.some((removal) => removal.origin === 'imported');
      const fingerprint = scenerySelectionFingerprint(selection.entries);
      setSourceMismatch(
        Boolean(document.source?.fingerprint && document.source.fingerprint !== fingerprint)
      );
      workerRef.current?.terminate();
      const worker = new Worker(
        new URL('../features/contribution-editor/reference-scene.worker.js', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;
      const requestId = ++requestIdRef.current;
      if (refreshesImportedMsfsRemovals) setImportedRemovalMigrationPending(true);
      setSourceProgress({ stage: 'Opening scenery package', progress: 3 });
      worker.onmessage = (event) => {
        const message = event.data;
        if (message.id !== requestId) return;
        if (message.type === 'stage') {
          setSourceProgress({ stage: message.stage, progress: message.progress });
        } else if (message.type === 'complete') {
          setSourceProgress(null);
          worker.terminate();
          workerRef.current = null;
          if (message.result.simulator !== document.simulator) {
            if (refreshesImportedMsfsRemovals) setImportedRemovalMigrationPending(false);
            showError(
              `This is ${formatSimulator(message.result.simulator)} scenery, but the XML is for ${formatSimulator(document.simulator)}.`
            );
          } else {
            setSourceSelection(selection);
            setReferenceScene(message.result.scene);
            setRenderBundle(message.result.renderBundle || null);
            setRemovalContext(message.result.removalContext || null);
            setImportedRemovalMigrationPending(
              document.removals.some((removal) => removal.origin === 'imported')
            );
            setSourceMismatch(false);
            dispatch({
              type: 'update-source',
              source: { name: selection.name, fingerprint },
            });
            saveReferenceScene(
              icao,
              document.simulator,
              message.result.scene,
              selection.name,
              fingerprint
            );
            if (document.simulator === 'xplane') {
              requestPersistentEditorStorage();
              cacheReferenceTextures(fingerprint, message.result.scene, selection.entries).then(
                (result) => setCachedTexturePaths(new Set(result.paths))
              );
            }
          }
        } else if (message.type === 'error') {
          setSourceProgress(null);
          if (refreshesImportedMsfsRemovals) setImportedRemovalMigrationPending(false);
          showError(message.error || 'Scenery reference extraction failed.');
          worker.terminate();
          workerRef.current = null;
        }
      };
      worker.postMessage({
        type: 'extract-reference',
        id: requestId,
        entries: selection.entries,
        icao,
        packageName: selection.name,
        airportPosition: { latitude: airport.latitude, longitude: airport.longitude },
      });
    },
    [airport, document, icao, showError]
  );

  const handleSceneryInput = useCallback(
    (event) => {
      const selection = selectionFromInput(event.target.files);
      event.target.value = '';
      if (!selection) return;
      extractReference(selection);
    },
    [extractReference]
  );

  const connectTextureLibrary = useCallback(
    async (library) => {
      if (!library || !document?.source?.fingerprint) return;
      const selection = mergeScenerySelections(sourceSelection, library);
      setSourceSelection(selection);
      setSourceProgress({
        kind: 'textures',
        stage: 'Resolving X-Plane library paths',
        progress: 20,
      });
      try {
        const resolution = await resolveTextureLibraryInWorker(referenceScene, selection.entries);
        const resolvedScene = resolution.scene;
        setReferenceScene(resolvedScene);
        setSourceProgress({ kind: 'textures', stage: 'Caching referenced textures', progress: 75 });
        await saveReferenceScene(
          icao,
          document.simulator,
          resolvedScene,
          document.source.name || selection.name,
          document.source.fingerprint
        );
        const result = await cacheReferenceTextures(
          document.source.fingerprint,
          resolvedScene,
          selection.entries
        );
        setCachedTexturePaths((paths) => new Set([...paths, ...(result.paths ?? [])]));
        setToast({
          show: true,
          title: result.cached > 0 ? 'Texture library connected' : 'No referenced textures found',
          description:
            result.cached > 0
              ? `${result.cached} referenced ${result.cached === 1 ? 'texture is' : 'textures are'} ready from ${resolution.stats.resolvedDefinitions} resolved X-Plane definitions.`
              : resolution.stats.definitions === 0
                ? 'This scene contains no X-Plane .lin or .pol definitions to resolve.'
                : `Checked ${resolution.stats.definitions} referenced definitions, but their library exports or PNG/DDS files were not present in the selected folder.`,
          variant: result.cached > 0 ? 'default' : 'destructive',
        });
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      } finally {
        setSourceProgress(null);
      }
    },
    [document, icao, referenceScene, showError, sourceSelection]
  );

  const handleTextureLibraryInput = useCallback(
    (event) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length === 0) return;
      setSourceProgress({ kind: 'textures', stage: 'Reading selected textures', progress: 5 });
      requestAnimationFrame(() => {
        setTimeout(() => connectTextureLibrary(selectionFromInput(files)), 0);
      });
    },
    [connectTextureLibrary]
  );

  const handleDraftDrop = useCallback(
    async (event) => {
      event.preventDefault();
      setDragTarget('');
      const file = [...(event.dataTransfer?.files ?? [])].find((candidate) =>
        /\.xml$/i.test(candidate.name)
      );
      await processDraftFile(file);
    },
    [processDraftFile]
  );

  const handleSceneryDrop = useCallback(
    async (event) => {
      event.preventDefault();
      setDragTarget('');
      try {
        const selection = await selectionFromDrop(event.dataTransfer);
        if (!selection) return;
        extractReference(selection);
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    },
    [extractReference, showError]
  );

  const handleTextureLibraryDrop = useCallback(
    async (event) => {
      event.preventDefault();
      setDragTarget('');
      try {
        const library = await selectionFromDrop(event.dataTransfer);
        if (!library) return;
        await connectTextureLibrary(library);
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    },
    [connectTextureLibrary, showError]
  );

  const handleDownload = useCallback(() => {
    if (!document || importedMsfsRemovalsPresent) return;
    downloadText(serializeDraftXml(document), `${icao}-Draft.xml`, 'application/xml');
  }, [document, icao, importedMsfsRemovalsPresent]);

  const handleContinue = useCallback(async () => {
    if (!document || importedMsfsRemovalsPresent) return;
    const blocking = issues.filter((issue) => issue.severity === 'error');
    if (blocking.length > 0) {
      showError(
        `Resolve ${blocking.length} blocking ${blocking.length === 1 ? 'issue' : 'issues'} first.`
      );
      return;
    }
    const draftXml = serializeDraftXml(document);
    const [hash, saved] = await Promise.all([
      draftHash(draftXml),
      saveEditorDraft(document),
      preloadRoute(`/contribute/test/${icao}`),
    ]);
    setSavedAt(saved.savedAt);
    navigate(`/contribute/test/${icao}`, {
      state: {
        draftXml,
        draftFileName: `${icao}-Draft.xml`,
        simulator: document.simulator,
        draftHash: hash,
        fromEditor: true,
        airportName: airport?.name || '',
      },
    });
  }, [airport?.name, document, icao, importedMsfsRemovalsPresent, issues, navigate, showError]);

  const objectList = useMemo(
    () => ({
      objects: document?.objects,
      selectedId: state?.selectedId,
      quickEditingId,
      issuesByPartId,
      partMetadata,
      uniqueObjectColors,
      objectColors,
      handleSelect,
      handleQuickEditObject,
      handleDeleteObject,
      handleRenameObject,
    }),
    [
      document?.objects,
      state?.selectedId,
      quickEditingId,
      issuesByPartId,
      partMetadata,
      uniqueObjectColors,
      objectColors,
      handleSelect,
      handleQuickEditObject,
      handleDeleteObject,
      handleRenameObject,
    ]
  );

  if (hydrationPending && !document) {
    return <PageLoading page variant="full-editor" label="Restoring editor…" />;
  }

  if (!document) {
    return (
      <div className="min-h-dvh bg-zinc-950 text-white">
        <main className="min-h-dvh px-6 py-12">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between gap-4">
              <Link
                to={`/contribute/generator/${icao}`}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-zinc-500 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Back to XML generator
              </Link>
            </div>

            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
              <p className="font-mono text-xs text-zinc-500">{icao}</p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <h1 className="text-3xl font-semibold tracking-tight text-white text-balance">
                  Finish editor setup
                </h1>
                <ContributionGuideLink tooltipSide="bottom" />
              </div>
              <p className="mt-3 max-w-xl text-sm text-zinc-400">
                You skipped generation. Import an existing BARS XML file to start the editor.
              </p>

              <div className="mt-8 space-y-3">
                <UploadStep
                  number={1}
                  label="Contribution XML"
                  detail="Choose a BARS XML file"
                  active={dragTarget === 'draft'}
                  onClick={() => draftInputRef.current?.click()}
                  onDragEnter={() => setDragTarget('draft')}
                  onDragLeave={() => setDragTarget('')}
                  onDrop={handleDraftDrop}
                />
                <Link
                  to={`/contribute/generator/${icao}`}
                  className="mx-auto flex min-h-10 w-fit items-center justify-center rounded-lg px-3 text-sm text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                >
                  Generate XML instead
                </Link>
              </div>
            </div>
          </div>
          <input
            ref={draftInputRef}
            type="file"
            accept=".xml,application/xml"
            aria-label="Import contribution XML file"
            className="hidden"
            onChange={(event) => {
              processDraftFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </main>
      </div>
    );
  }

  if (!editorReady) {
    const sceneryLoading = Boolean(sourceProgress && sourceProgress.kind !== 'textures');
    const textureLoading = sourceProgress?.kind === 'textures';
    const sceneryReady = hasReferenceScene && (document.simulator !== 'msfs' || renderBundle);
    const textureDetail = !hasReferenceScene
      ? 'Add the scenery package first'
      : localTextureStats?.unresolvedDefinitions
        ? `${localTextureStats.unresolvedDefinitions} texture definitions still need files`
        : localTextureStats?.needsLibrary
          ? `${localTextureStats.total - localTextureStats.ready} source textures still need files`
          : 'All required textures are ready';

    return (
      <div className="min-h-dvh bg-zinc-950 text-white">
        <main className="min-h-dvh px-6 py-12">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between gap-4">
              <Link
                to={`/contribute/generator/${icao}`}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-zinc-500 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Back to XML generator
              </Link>
            </div>

            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
              <p className="font-mono text-xs text-zinc-500">{icao}</p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <h1 className="text-3xl font-semibold tracking-tight text-white text-balance">
                  Finish editor setup
                </h1>
                <ContributionGuideLink tooltipSide="bottom" />
              </div>
              <p className="mt-3 max-w-xl text-sm text-zinc-400">
                Add the source files needed to draw an accurate editor map.
              </p>

              <div className="mt-8 space-y-3">
                <div className="flex min-h-14 items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-500/10 text-emerald-300">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-zinc-100">XML ready</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {document.objects.length}{' '}
                      {document.objects.length === 1 ? 'object' : 'objects'}
                    </span>
                  </span>
                </div>

                <UploadStep
                  number={2}
                  label="Scenery package"
                  detail={
                    document.simulator === 'msfs' && hasReferenceScene && !renderBundle
                      ? 'Reconnect the same MSFS scenery folder to continue'
                      : sourceSelection?.name ||
                        (sceneryReady
                          ? `${referenceScene.features.length.toLocaleString()} references ready`
                          : 'Choose the airport scenery folder')
                  }
                  complete={sceneryReady}
                  active={dragTarget === 'scenery'}
                  loading={sceneryLoading}
                  disabled={!airport}
                  onClick={() => sceneryInputRef.current?.click()}
                  onDragEnter={() => setDragTarget('scenery')}
                  onDragLeave={() => setDragTarget('')}
                  onDrop={handleSceneryDrop}
                />

                {document.simulator === 'xplane' ? (
                  <UploadStep
                    number={3}
                    label="Missing textures"
                    detail={textureDetail}
                    complete={hasReferenceScene && !localTextureStats?.needsLibrary}
                    active={dragTarget === 'textures'}
                    loading={textureLoading}
                    disabled={!hasReferenceScene}
                    onClick={() => textureLibraryInputRef.current?.click()}
                    onDragEnter={() => setDragTarget('textures')}
                    onDragLeave={() => setDragTarget('')}
                    onDrop={handleTextureLibraryDrop}
                  />
                ) : null}
              </div>

              {sourceProgress ? (
                <div className="mt-5" role="status">
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>{sourceProgress.stage}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-blue-400 transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-smooth-out)]"
                      style={{ width: `${sourceProgress.progress}%` }}
                    />
                  </div>
                </div>
              ) : null}

              {sourceMismatch ? (
                <p className="mt-5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-200">
                  This scenery differs from the XML source. Review every match before testing.
                </p>
              ) : null}
            </div>
          </div>

          <input
            ref={sceneryInputRef}
            type="file"
            className="hidden"
            webkitdirectory=""
            multiple
            onChange={handleSceneryInput}
            aria-label="Choose simulator scenery folder"
          />
          <input
            ref={textureLibraryInputRef}
            type="file"
            className="hidden"
            webkitdirectory=""
            multiple
            onChange={handleTextureLibraryInput}
            aria-label="Add X-Plane texture library folder"
          />
        </main>

        <Toast
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          show={toast.show}
          onClose={() => setToast((value) => ({ ...value, show: false }))}
        />
      </div>
    );
  }

  return (
    <Profiler id="ContributionEditor" onRender={traceEditorMapRender}>
      <div className="h-dvh overflow-hidden bg-zinc-950 text-white">
        <main className="flex h-full min-h-0 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950 px-2.5 sm:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <Link
                to={`/contribute/generator/${icao}`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                aria-label="Back to XML generator"
                title="Back to XML generator"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-[13px] font-medium text-zinc-100">
                  {icao}
                  <span className="ml-1.5 font-normal text-zinc-500">{airport?.name}</span>
                </h1>
                <SimulatorBadge simulator={document.simulator} />
                {document.simulator === 'msfs' ? <ExperimentalBadge /> : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <ContributionGuideLink tooltipSide="bottom" />
              <IconButton
                label="Undo"
                icon={Undo2}
                disabled={state.past.length === 0}
                onClick={() => dispatch({ type: 'undo' })}
              />
              <IconButton
                label="Redo"
                icon={Redo2}
                disabled={state.future.length === 0}
                onClick={() => dispatch({ type: 'redo' })}
              />
              <button
                type="button"
                onClick={handleDownload}
                disabled={importedMsfsRemovalsPresent}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 disabled:cursor-wait disabled:text-zinc-600 disabled:hover:bg-transparent"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {importedRemovalRefreshPending
                    ? 'Updating removals…'
                    : importedMsfsRemovalsPresent
                      ? 'Connect scenery first'
                      : 'Download XML'}
                </span>
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={importedMsfsRemovalsPresent}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 text-[11px] font-medium text-zinc-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 disabled:cursor-wait disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                <span className="hidden sm:inline">
                  {importedRemovalRefreshPending
                    ? 'Updating removals…'
                    : importedMsfsRemovalsPresent
                      ? 'Connect scenery first'
                      : 'Test contribution'}
                </span>
                <span className="sm:hidden">
                  {importedRemovalRefreshPending
                    ? 'Updating…'
                    : importedMsfsRemovalsPresent
                      ? 'Connect scenery'
                      : 'Test'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[17rem_minmax(0,1fr)_18rem] lg:overflow-hidden">
            <aside className="order-2 border-r border-zinc-800/80 bg-zinc-950 lg:order-1 lg:overflow-y-auto">
              <div className="flex min-h-11 items-center justify-between border-b border-zinc-800 px-3">
                <h2 className="text-xs font-medium text-zinc-200">Objects</h2>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs tabular-nums text-zinc-400">
                  {document.objects.length}
                </span>
              </div>
              <EditorObjectList {...objectList} />
            </aside>

            <section className="relative order-1 min-h-[60vh] overflow-hidden border-b border-zinc-800 bg-zinc-950 lg:order-2 lg:min-h-0 lg:border-b-0">
              <Profiler id="EditorMap" onRender={traceEditorMapRender}>
                <EditorMap
                  airport={airport}
                  airportIcao={icao}
                  document={mapDocument}
                  removalSelectionDocument={removalSelectionDocument}
                  referenceScene={referenceScene}
                  renderBundle={renderBundle}
                  sourceEntries={sourceSelection?.entries}
                  sourceFingerprint={document.source?.fingerprint}
                  selectedId={state.selectedId}
                  tool={tool}
                  visibleCategories={mapVisibleCategories}
                  satelliteVisible={satelliteVisible}
                  editHandlesVisible={editHandlesVisible}
                  objectColors={objectColors}
                  divisionGhostsVisible={divisionGhostsVisible}
                  editorObjectsVisible={editorObjectsVisible}
                  snapEnabled={snapEnabled}
                  uniqueObjectColors={uniqueObjectColors}
                  focusRequest={focusRequest}
                  initialViewport={initialWorkspace.viewport}
                  onSelect={handleSelect}
                  onCreate={handleCreate}
                  onGeometryChange={handleGeometryChange}
                  onMapClick={handleMapClick}
                  onReferenceClick={handleReferenceClick}
                  removalSelectionStart={removalSectionStart?.projection?.coordinate ?? null}
                  textureStatus={textureStatus}
                  onTextureStatus={handleTextureStatus}
                  onViewportChange={handleViewportChange}
                  measurements={measurements}
                  measurementStart={measurementStart}
                  onMeasurementMove={handleMeasurementMove}
                  onMeasurementCancel={handleMeasurementCancel}
                />
              </Profiler>

              <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
                <div className="pointer-events-auto relative">
                  {tool === 'remove-light' ? (
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2">
                      <div
                        className="pointer-events-auto w-full rounded-xl border border-rose-400/25 bg-zinc-950/95 p-2 shadow-xl shadow-black/25 backdrop-blur"
                        role="group"
                        aria-label="Removal editing"
                      >
                        <div
                          className="grid grid-cols-2 gap-1"
                          role="group"
                          aria-label="Removal action"
                        >
                          {[
                            { id: 'add', label: 'Remove lights' },
                            { id: 'erase', label: 'Keep lights' },
                          ].map((mode) => (
                            <button
                              key={mode.id}
                              type="button"
                              aria-pressed={removalEditMode === mode.id}
                              onClick={() => {
                                setRemovalEditMode(mode.id);
                                setRemovalSectionStart(null);
                              }}
                              disabled={removalBusy}
                              className={`min-h-10 rounded-lg px-3 text-xs font-medium transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 disabled:cursor-wait disabled:active:scale-100 ${
                                removalEditMode === mode.id
                                  ? mode.id === 'add'
                                    ? 'bg-rose-500 text-white shadow-sm'
                                    : 'bg-zinc-100 text-zinc-950 shadow-sm'
                                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                        <p
                          className="min-h-4 px-1 pt-1.5 text-center text-xs leading-4 text-zinc-300"
                          role="status"
                          aria-live="polite"
                        >
                          {removalBusy
                            ? 'Updating removal…'
                            : removalSectionStart
                              ? 'Select the end point.'
                              : document.simulator === 'xplane'
                                ? 'Select two ends on an apt.dat row. Click a DSF string or fixture to select the whole source.'
                                : 'Select the start and end of one source light row.'}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div
                    className="flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-1 rounded-xl border border-zinc-700/80 bg-zinc-950/95 p-1 shadow-xl shadow-black/25 backdrop-blur"
                    role="toolbar"
                    aria-label="Editor tools"
                  >
                    {TOOLS.filter(
                      (candidate) =>
                        !candidate.advanced &&
                        (!candidate.xplaneOnly || document.simulator === 'xplane')
                    ).map((candidate) => (
                      <button
                        type="button"
                        key={candidate.id}
                        onClick={() => selectTool(candidate.id)}
                        disabled={
                          !selectedObject &&
                          !['select', 'draw', 'remove-light', 'marking-debug', 'measure'].includes(
                            candidate.id
                          )
                        }
                        title={`${candidate.label} (${candidate.shortcut})`}
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 disabled:opacity-30 ${
                          tool === candidate.id
                            ? candidate.id === 'remove-light'
                              ? 'bg-rose-500 text-white'
                              : 'bg-zinc-100 text-zinc-950'
                            : 'text-zinc-300 hover:bg-zinc-800'
                        }`}
                        aria-label={candidate.label}
                        aria-pressed={tool === candidate.id}
                      >
                        <candidate.icon className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setSnapEnabled((enabled) => !enabled)}
                      title={snapEnabled ? 'Snapping on' : 'Snapping off'}
                      aria-label={snapEnabled ? 'Turn snapping off' : 'Turn snapping on'}
                      aria-pressed={snapEnabled}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-zinc-800 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                        snapEnabled ? 'bg-cyan-400 text-zinc-950' : 'text-zinc-400'
                      }`}
                    >
                      <Magnet className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {tool === 'measure' && measurements.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMeasurements([]);
                          setMeasurementStart(null);
                        }}
                        title="Clear measurements"
                        aria-label="Clear measurements"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <aside className="order-3 flex min-h-0 flex-col border-l border-zinc-800/80 bg-zinc-950 lg:overflow-y-auto">
              <div className="grid h-11 grid-cols-2 border-b border-zinc-800 p-1">
                <button
                  type="button"
                  onClick={() => setRightPanel('object')}
                  className={`rounded-md text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                    rightPanel === 'object'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  Object
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanel('scenery')}
                  className={`rounded-md text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                    rightPanel === 'scenery'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  Scenery
                </button>
              </div>

              {rightPanel === 'scenery' ? (
                <div>
                  <div className="m-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 text-zinc-300" />
                      <div>
                        <p className="text-xs font-medium text-zinc-200">Local source setup</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <UploadStep
                        number={1}
                        label="Scenery package"
                        detail={
                          sourceSelection?.name ||
                          (referenceScene.features.length > 0
                            ? `${referenceScene.features.length.toLocaleString()} references cached`
                            : 'Drop the airport or Global Airports folder')
                        }
                        complete={referenceScene.features.length > 0}
                        active={dragTarget === 'scenery'}
                        loading={Boolean(sourceProgress && sourceProgress.kind !== 'textures')}
                        onClick={() => sceneryInputRef.current?.click()}
                        onDragEnter={() => setDragTarget('scenery')}
                        onDragLeave={() => setDragTarget('')}
                        onDrop={handleSceneryDrop}
                      />
                      {document.simulator === 'xplane' ? (
                        <UploadStep
                          number={2}
                          label="X-Plane textures"
                          detail={
                            textureStatus.phase === 'loading'
                              ? `Decoding ${textureStatus.total.toLocaleString()} referenced textures…`
                              : textureStatus.total > 0
                                ? textureStatusDetail(textureStatus)
                                : localTextureStats?.needsLibrary
                                  ? localTextureStats.unresolvedDefinitions > 0
                                    ? `${localTextureStats.unresolvedDefinitions} definitions unresolved — choose the X-Plane folder`
                                    : `${localTextureStats.total - localTextureStats.ready} source textures missing — choose the X-Plane folder`
                                  : localTextureStats?.total
                                    ? `${localTextureStats.ready} source textures cached · no folder needed`
                                    : 'No external textures required'
                          }
                          complete={
                            !localTextureStats?.needsLibrary &&
                            (textureStatus.total === 0 ||
                              (textureStatus.loaded === textureStatus.total &&
                                textureStatus.failed + textureStatus.skipped === 0))
                          }
                          active={dragTarget === 'textures'}
                          loading={sourceProgress?.kind === 'textures'}
                          disabled={!referenceScene.features.length}
                          onClick={() => textureLibraryInputRef.current?.click()}
                          onDragEnter={() => setDragTarget('textures')}
                          onDragLeave={() => setDragTarget('')}
                          onDrop={handleTextureLibraryDrop}
                        />
                      ) : null}
                      {document.simulator === 'msfs' && textureStatus.total > 0 ? (
                        <div className="flex min-h-10 items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/30 px-2.5 py-2 text-xs text-zinc-400">
                          {textureStatus.phase === 'loading' ? (
                            <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" />
                          ) : textureStatus.renderError || textureStatus.failed > 0 ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                          ) : (
                            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                          )}
                          <span className="min-w-0 truncate">
                            {textureStatus.phase === 'loading'
                              ? `Decoding MSFS textures · ${textureStatus.loaded}/${textureStatus.total}`
                              : textureStatusDetail(textureStatus)}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {sourceProgress ? (
                      <div className="mt-3">
                        <div className="flex items-center gap-2 text-xs text-zinc-300">
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                          <span className="truncate">{sourceProgress.stage}</span>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden rounded bg-zinc-800">
                          <div
                            className="h-full rounded bg-white transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-smooth-out)]"
                            style={{ width: `${sourceProgress.progress}%` }}
                          />
                        </div>
                      </div>
                    ) : null}
                    {sourceMismatch ? (
                      <p className="mt-2 text-xs leading-4 text-amber-300">
                        This scenery differs from the package used to generate the XML. Recheck
                        source bindings before testing.
                      </p>
                    ) : null}
                  </div>

                  <div className="t-acc border-t border-zinc-800" data-open={advancedOpen}>
                    <button
                      type="button"
                      onClick={() => setAdvancedOpen((open) => !open)}
                      aria-expanded={advancedOpen}
                      aria-controls="contribution-editor-advanced"
                      className="flex min-h-11 w-full items-center justify-between px-4 text-left text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/45"
                    >
                      Advanced
                      <span className="t-acc-chevron">
                        <ChevronDown className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                      </span>
                    </button>
                    <div className="t-acc-panel">
                      <div
                        id="contribution-editor-advanced"
                        className="t-acc-panel-inner"
                        aria-hidden={!advancedOpen}
                        inert={!advancedOpen}
                      >
                        <div className="border-t border-zinc-800">
                          <div className="grid gap-2 border-b border-zinc-800 p-3">
                            {TOOLS.filter((candidate) => candidate.advanced).map((candidate) => (
                              <button
                                key={candidate.id}
                                type="button"
                                onClick={() => selectTool(candidate.id)}
                                className={`flex min-h-9 items-center gap-2 rounded-md border px-2.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                                  tool === candidate.id
                                    ? 'border-zinc-600 bg-zinc-800 text-white'
                                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                                }`}
                              >
                                <candidate.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                {candidate.label}
                                <span className="ml-auto font-mono text-xs text-zinc-600">
                                  {candidate.shortcut}
                                </span>
                              </button>
                            ))}
                          </div>
                          <div className="border-b border-zinc-800 px-3 py-3">
                            <SwitchControl
                              label="Unique colors"
                              description="One consistent color per BARS ID"
                              checked={uniqueObjectColors}
                              onChange={setUniqueObjectColors}
                            />
                          </div>
                          <div className="flex min-h-11 items-center px-4 text-xs font-medium text-zinc-300">
                            Reference layers
                          </div>
                          <div className="space-y-0.5 px-2 pb-3">
                            {SATELLITE_REFERENCE_AVAILABLE ? (
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-950/50">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-300" />
                                  <span className="block truncate text-[11px] font-medium text-zinc-300">
                                    Satellite imagery
                                  </span>
                                </div>
                                <ToggleIcon
                                  active={satelliteVisible}
                                  label={`${satelliteVisible ? 'Hide' : 'Show'} satellite imagery`}
                                  onClick={() => setSatelliteVisible((visible) => !visible)}
                                  activeIcon={Eye}
                                  inactiveIcon={EyeOff}
                                />
                              </div>
                            ) : null}
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-950/50">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" />
                                <span className="block truncate text-[11px] font-medium text-zinc-300">
                                  BARS objects
                                </span>
                              </div>
                              <ToggleIcon
                                active={editorObjectsVisible}
                                label={`${editorObjectsVisible ? 'Hide' : 'Show'} BARS objects`}
                                onClick={() => setEditorObjectsVisible((visible) => !visible)}
                                activeIcon={Eye}
                                inactiveIcon={EyeOff}
                              />
                            </div>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-950/50">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-200" />
                                <span className="block truncate text-[11px] font-medium text-zinc-300">
                                  Division ghosts
                                </span>
                              </div>
                              <ToggleIcon
                                active={divisionGhostsVisible}
                                label={`${divisionGhostsVisible ? 'Hide' : 'Show'} division ghosts`}
                                onClick={() => setDivisionGhostsVisible((visible) => !visible)}
                                activeIcon={Eye}
                                inactiveIcon={EyeOff}
                              />
                            </div>
                            {SNAP_CATEGORIES.map((category) => {
                              const required = removalRequiredCategories.has(category.id);
                              const visible = visibleCategories.has(category.id) || required;
                              return (
                                <div
                                  key={category.id}
                                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-950/50"
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span
                                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: category.color }}
                                    />
                                    <span className="block truncate text-[11px] font-medium text-zinc-300">
                                      {category.label}
                                    </span>
                                  </div>
                                  {required ? (
                                    <span className="rounded-full bg-rose-400/10 px-2 py-1 text-[10px] font-medium text-rose-200">
                                      Required
                                    </span>
                                  ) : (
                                    <ToggleIcon
                                      active={visible}
                                      label={`${visible ? 'Hide' : 'Show'} ${category.label}`}
                                      onClick={() =>
                                        setVisibleCategories(
                                          toggleSet(visibleCategories, category.id)
                                        )
                                      }
                                      activeIcon={Eye}
                                      inactiveIcon={EyeOff}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {rightPanel === 'object' && selectedObject ? (
                <div className="p-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: objectDisplayColor(
                            selectedObject,
                            uniqueObjectColors,
                            objectColors
                          ),
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {selectedObject.name}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-zinc-500">
                          {selectedObject.id || 'BARS ID required'}
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">
                          {formatObjectType(selectedObject.type)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({ type: 'delete-object', id: selectedObject.partId })
                        }
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                        aria-label="Delete selected object"
                        title="Delete object"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <BarsIdField
                    value={selectedObject.id}
                    color={selectedObject.color}
                    suggestions={idSuggestions}
                    onChange={(id) =>
                      dispatch({
                        type: 'rename-object-id',
                        partId: selectedObject.partId,
                        id,
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      dispatch({
                        type: 'update-object',
                        id: selectedObject.partId,
                        changes: { coordinates: [...selectedObject.coordinates].reverse() },
                      })
                    }
                    className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reverse direction
                  </button>
                  {selectedIssues.length > 0 ? (
                    <p className="mt-3 rounded-md bg-amber-500/10 px-2.5 py-2 text-xs leading-4 text-amber-200">
                      {selectedIssues[0].message}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {rightPanel === 'object' && !selectedObject ? (
                <div className="flex min-h-32 flex-col items-center justify-center px-5 text-center">
                  <MousePointer2 className="h-4 w-4 text-zinc-600" />
                  <p className="mt-2 text-[11px] leading-4 text-zinc-500">
                    Select an object to edit its BARS ID, shape or direction.
                  </p>
                </div>
              ) : null}
              <ValidationPanel
                issues={issues}
                open={validationOpen}
                onToggle={() => setValidationOpen((value) => !value)}
                onIssueSelect={handleIssueSelect}
              />
            </aside>
          </div>

          <input
            ref={draftInputRef}
            type="file"
            accept=".xml,application/xml"
            className="hidden"
            onChange={(event) => {
              processDraftFile(event.target.files?.[0]);
              event.target.value = '';
            }}
            aria-label="Replace contribution XML file"
          />
          <input
            ref={sceneryInputRef}
            type="file"
            className="hidden"
            webkitdirectory=""
            multiple
            onChange={handleSceneryInput}
            aria-label="Choose simulator scenery folder"
          />
          <input
            ref={textureLibraryInputRef}
            type="file"
            className="hidden"
            webkitdirectory=""
            multiple
            onChange={handleTextureLibraryInput}
            aria-label="Add X-Plane texture library folder"
          />
        </main>

        <Toast
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          show={toast.show}
          onClose={() => setToast((value) => ({ ...value, show: false }))}
        />
      </div>
    </Profiler>
  );
}

function BarsIdField({ value, color, suggestions, onChange }) {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const chooseSuggestion = (suggestion) => {
    onChange(suggestion.id.toUpperCase());
    setOpen(false);
    setActiveIndex(0);
  };

  return (
    <div className="relative mt-3">
      <label htmlFor={inputId} className="block text-xs font-medium text-zinc-500">
        BARS ID
      </label>
      <div className="relative mt-1.5">
        <span
          className="pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ring-1 ring-white/20"
          style={{ backgroundColor: color }}
        />
        <input
          id={inputId}
          value={value}
          onFocus={() => {
            setOpen(true);
            setActiveIndex(0);
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            onChange(event.target.value.toUpperCase());
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (!open || suggestions.length === 0) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % suggestions.length);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              chooseSuggestion(suggestions[activeIndex] ?? suggestions[0]);
            }
          }}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={
            open && suggestions[activeIndex] ? `${listId}-${activeIndex}` : undefined
          }
          className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 pl-7 pr-2.5 font-mono text-xs text-zinc-100 outline-none transition-colors focus:border-zinc-500"
        />
      </div>
      {open && suggestions.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-2xl shadow-black/45"
        >
          {suggestions.map((suggestion, index) => (
            <button
              type="button"
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              key={suggestion.id}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => chooseSuggestion(suggestion)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${
                index === activeIndex
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/15"
                style={{ backgroundColor: colorForObjectId(suggestion.id) }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs font-medium">
                  {suggestion.id}
                </span>
                {suggestion.name !== suggestion.id ? (
                  <span
                    className={`block truncate text-xs ${
                      index === activeIndex ? 'text-zinc-600' : 'text-zinc-500'
                    }`}
                  >
                    {suggestion.name}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

BarsIdField.propTypes = {
  value: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  suggestions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    })
  ).isRequired,
  onChange: PropTypes.func.isRequired,
};

function UploadStep({
  number,
  label,
  detail,
  complete,
  active,
  loading,
  disabled,
  onClick,
  onDragEnter,
  onDragLeave,
  onDrop,
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex min-h-14 w-full items-center gap-2.5 rounded-md border border-dashed px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? 'border-zinc-400 bg-zinc-800'
          : complete
            ? 'border-zinc-700 bg-zinc-900/80 hover:border-zinc-600'
            : 'border-zinc-800 bg-zinc-950/30 hover:border-zinc-600 hover:bg-zinc-900/70'
      }`}
    >
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
          complete
            ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
            : 'border-zinc-700 text-zinc-500'
        }`}
      >
        {loading ? (
          <LoaderCircle className="h-3 w-3 animate-spin" />
        ) : complete ? (
          <Check className="h-3 w-3" />
        ) : (
          number
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-zinc-200">{label}</span>
        <span className="mt-0.5 block truncate text-xs leading-4 text-zinc-500">{detail}</span>
      </span>
      <Upload className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
    </button>
  );
}

UploadStep.propTypes = {
  number: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
  detail: PropTypes.string.isRequired,
  complete: PropTypes.bool,
  active: PropTypes.bool,
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  onDragEnter: PropTypes.func.isRequired,
  onDragLeave: PropTypes.func.isRequired,
  onDrop: PropTypes.func.isRequired,
};

function ValidationPanel({ issues, open, onToggle, onIssueSelect }) {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  const panelOpen = open && issues.length > 0;
  return (
    <div
      className="t-acc sticky bottom-0 mt-auto border-t border-zinc-800 bg-zinc-950/98 backdrop-blur"
      data-open={panelOpen}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={panelOpen}
        aria-controls="contribution-editor-validation"
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-xs font-medium text-zinc-300 hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/45"
      >
        {issues.length === 0 ? (
          <Check className="h-4 w-4 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-300" />
        )}
        <span className="flex-1">{issues.length === 0 ? 'Ready to test' : 'Validation'}</span>
        {errors > 0 ? <span className="text-rose-300">{errors} errors</span> : null}
        {warnings > 0 ? <span className="text-amber-300">{warnings} warnings</span> : null}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] ${open ? '' : '-rotate-90'}`}
        />
      </button>
      <div className="t-acc-panel">
        <div
          id="contribution-editor-validation"
          className="t-acc-panel-inner"
          aria-hidden={!panelOpen}
          inert={!panelOpen}
        >
          <div className="max-h-56 space-y-0.5 overflow-y-auto border-t border-zinc-800 p-2">
            {issues.map((issue) => (
              <button
                type="button"
                key={issue.id}
                onClick={() => onIssueSelect(issue)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
              >
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    issue.severity === 'error' ? 'bg-rose-400' : 'bg-amber-300'
                  }`}
                />
                <span className="min-w-0 text-[11px] leading-4 text-zinc-300">
                  <span className="mr-1 font-mono text-zinc-500">{issue.objectId}</span>
                  {issue.message}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({ label, icon: Icon, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 disabled:opacity-35"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function ToggleIcon({
  active,
  label,
  onClick,
  activeIcon: ActiveIcon,
  inactiveIcon: InactiveIcon,
}) {
  const Icon = active ? ActiveIcon : InactiveIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
        active ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:bg-zinc-800'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function SwitchControl({ label, description, checked, onChange }) {
  const inputId = useId();
  return (
    <label htmlFor={inputId} className="flex cursor-pointer items-center justify-between gap-3">
      <span>
        <span className="block text-xs font-medium text-zinc-200">{label}</span>
        <span className="block text-xs text-zinc-500">{description}</span>
      </span>
      <span className="relative inline-flex h-6 w-10 shrink-0 items-center">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full border border-zinc-700 bg-zinc-900 transition-colors duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] peer-checked:border-cyan-400 peer-checked:bg-cyan-400 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950" />
        <span className="relative ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-400 text-zinc-900 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] peer-checked:translate-x-4 peer-checked:bg-zinc-950">
          {checked ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
        </span>
      </span>
    </label>
  );
}

ValidationPanel.propTypes = {
  issues: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      objectId: PropTypes.string.isRequired,
      message: PropTypes.string.isRequired,
      severity: PropTypes.string.isRequired,
    })
  ).isRequired,
  open: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  onIssueSelect: PropTypes.func.isRequired,
};

IconButton.propTypes = {
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  onClick: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

ToggleIcon.propTypes = {
  active: PropTypes.bool.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  activeIcon: PropTypes.elementType.isRequired,
  inactiveIcon: PropTypes.elementType.isRequired,
};

SwitchControl.propTypes = {
  label: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};

const EditorObjectList = memo(function EditorObjectList({
  objects,
  selectedId,
  quickEditingId,
  issuesByPartId,
  partMetadata,
  uniqueObjectColors,
  objectColors,
  handleSelect,
  handleQuickEditObject,
  handleDeleteObject,
  handleRenameObject,
}) {
  return (
    <div className="space-y-1 p-2">
      {(objects ?? []).map((object) => {
        const objectIssues = issuesByPartId.get(object.partId) ?? EMPTY_ISSUES;
        const part = partMetadata.get(object.partId);
        return (
          <EditorObjectListItem
            key={object.partId}
            object={object}
            selected={object.partId === selectedId}
            quickEditing={quickEditingId === object.partId}
            displayColor={objectDisplayColor(object, uniqueObjectColors, objectColors)}
            partIndex={part?.index}
            partTotal={part?.total}
            issueSeverity={
              objectIssues.length === 0
                ? ''
                : objectIssues.some((issue) => issue.severity === 'error')
                  ? 'error'
                  : 'warning'
            }
            onSelect={handleSelect}
            onQuickEdit={handleQuickEditObject}
            onDelete={handleDeleteObject}
            onRename={handleRenameObject}
          />
        );
      })}
      {objects.length === 0 ? (
        <p className="px-2 py-4 text-center text-xs text-zinc-500">
          Add an object from the map toolbar.
        </p>
      ) : null}
    </div>
  );
});

EditorObjectList.propTypes = {
  objects: PropTypes.array.isRequired,
  selectedId: PropTypes.string,
  quickEditingId: PropTypes.string,
  issuesByPartId: PropTypes.instanceOf(Map).isRequired,
  partMetadata: PropTypes.instanceOf(Map).isRequired,
  uniqueObjectColors: PropTypes.bool.isRequired,
  objectColors: PropTypes.instanceOf(Map).isRequired,
  handleSelect: PropTypes.func.isRequired,
  handleQuickEditObject: PropTypes.func.isRequired,
  handleDeleteObject: PropTypes.func.isRequired,
  handleRenameObject: PropTypes.func.isRequired,
};

const EditorObjectListItem = memo(function EditorObjectListItem({
  object,
  selected,
  quickEditing,
  displayColor,
  partIndex,
  partTotal,
  issueSeverity,
  onSelect,
  onQuickEdit,
  onDelete,
  onRename,
}) {
  return (
    <div
      className={`rounded-md ${
        selected ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-900/30 text-zinc-300'
      }`}
    >
      <div className="flex items-center gap-1 p-1">
        <button
          type="button"
          onClick={() => onSelect(object.partId, { focus: true })}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
            selected ? '' : 'hover:bg-zinc-800/70'
          }`}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: displayColor }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-medium">{object.name}</span>
            <span
              className={`block truncate font-mono text-xs ${selected ? 'text-zinc-600' : 'text-zinc-500'}`}
            >
              {object.id || 'BARS ID required'}
            </span>
          </span>
          {partTotal > 1 ? (
            <span className="text-xs tabular-nums text-zinc-500">
              {partIndex}/{partTotal}
            </span>
          ) : null}
          {issueSeverity ? (
            <AlertTriangle
              className={`h-3.5 w-3.5 ${issueSeverity === 'error' ? 'text-rose-400' : 'text-amber-400'}`}
              aria-hidden="true"
            />
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onQuickEdit(object.partId)}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
            selected
              ? 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950'
              : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'
          }`}
          aria-label={`Quick edit ${object.name}`}
          aria-expanded={quickEditing}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(object.partId)}
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
            selected
              ? 'text-zinc-600 hover:bg-rose-100 hover:text-rose-700'
              : 'text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300'
          }`}
          aria-label={`Delete ${object.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {quickEditing ? (
        <div
          className={`grid gap-2 border-t px-2 pb-2 pt-2 ${selected ? 'border-zinc-300' : 'border-zinc-800'}`}
        >
          <label className="text-xs text-zinc-500">
            BARS ID
            <input
              value={object.id}
              onChange={(event) => onRename(object.partId, event.target.value.toUpperCase())}
              className="mt-1 h-8 w-full rounded border border-zinc-700 bg-zinc-900 px-2 font-mono text-xs text-white outline-none focus:border-zinc-500"
              spellCheck={false}
            />
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <span className="text-zinc-500">Name</span>
            <span className="truncate text-right text-zinc-200">{object.name}</span>
            <span className="text-zinc-500">Type</span>
            <span className="truncate text-right text-zinc-200">
              {formatObjectType(object.type)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
});

EditorObjectListItem.propTypes = {
  object: PropTypes.shape({
    id: PropTypes.string.isRequired,
    partId: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
  }).isRequired,
  selected: PropTypes.bool.isRequired,
  quickEditing: PropTypes.bool.isRequired,
  displayColor: PropTypes.string.isRequired,
  partIndex: PropTypes.number,
  partTotal: PropTypes.number,
  issueSeverity: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
  onQuickEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
};

function objectDisplayColor(object, uniqueObjectColors, objectColors) {
  if (uniqueObjectColors) {
    return objectColors.get(objectColorKey(object)) ?? colorForObjectId(object.id);
  }
  return object.type === 'stopbar' ? '#ef4444' : '#22c55e';
}

function formatObjectType(type) {
  if (type === 'stopbar') return 'Stop bar';
  if (type === 'lead_on') return 'Lead on';
  if (type === 'taxiway') return 'Taxiway';
  if (type === 'stand') return 'Stand';
  return type ? String(type).replaceAll('_', ' ') : 'Unknown type';
}

function uniquePartId(objects, barsObjectId) {
  let index = 1;
  while (objects.some((object) => object.partId === `${barsObjectId}:part:${index}`)) index += 1;
  return `${barsObjectId}:part:${index}`;
}

function buildPartMetadata(objects) {
  const totals = new Map();
  const indexes = new Map();
  const metadata = new Map();
  const groupKey = (object) => `${object.groupId}\u0000${object.id}`;
  for (const object of objects) {
    const key = groupKey(object);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  for (const object of objects) {
    const key = groupKey(object);
    const index = (indexes.get(key) ?? 0) + 1;
    indexes.set(key, index);
    metadata.set(object.partId, { index, total: totals.get(key) });
  }
  return metadata;
}

function toggleSet(source, value) {
  const next = new Set(source);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function formatSimulator(simulator) {
  return simulator === 'xplane' ? 'X-Plane' : 'MSFS';
}

function textureStatusDetail(status) {
  const unavailable = status.missing + status.failed + status.skipped;
  if (status.renderError) return `Texture renderer error: ${status.renderError}`;
  if (status.missing > 0) {
    return `${status.missing} missing — choose the X-Plane folder to fill only those textures`;
  }
  const decoded = `${status.loaded}/${status.total} decoded`;
  const drawn =
    status.meshGroups > 0
      ? ` · ${status.drawableGroups}/${status.meshGroups} texture batches ready`
      : '';
  const rendered =
    status.meshGroups > 0 ? ` · ${status.drawnGroups}/${status.meshGroups} batches drawn` : '';
  if (status.packageTotal > 0) {
    const packageTextures = `${status.packageLoaded}/${status.packageTotal} package textures decoded`;
    const fallbacks =
      status.fallbackLoaded > 0 ? ` · ${status.fallbackLoaded} material fallbacks` : '';
    return unavailable > 0
      ? `${packageTextures}${fallbacks}${drawn}${rendered} · ${unavailable} unavailable`
      : `${packageTextures}${fallbacks}${drawn}${rendered}`;
  }
  if (unavailable === 0 && status.loaded > 0 && status.cached === status.loaded && drawn) {
    return `${status.loaded} cached textures${drawn}${rendered}`;
  }
  if (unavailable === 0 && status.loaded > 0 && status.cached === status.loaded) {
    return `${status.loaded} textures loaded from browser cache · no folder needed`;
  }
  if (unavailable === 0 && status.cached > 0) {
    return `${status.loaded}/${status.total} decoded · ${status.cached} cached · ${status.connected} from folder`;
  }
  return unavailable > 0 ? `${decoded}${drawn} · ${unavailable} unavailable` : `${decoded}${drawn}`;
}

function resolveTextureLibraryInWorker(scene, entries) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../features/contribution-editor/reference-scene.worker.js', import.meta.url),
      { type: 'module' }
    );
    const id = Date.now();
    worker.onmessage = (event) => {
      if (event.data?.id !== id) return;
      worker.terminate();
      if (event.data.type === 'textures-complete') resolve(event.data.result);
      else reject(new Error(event.data.error || 'X-Plane texture library could not be resolved.'));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'X-Plane texture resolver failed.'));
    };
    worker.postMessage({
      type: 'resolve-xplane-textures',
      id,
      scene,
      entries,
    });
  });
}

function downloadText(text, fileName, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
