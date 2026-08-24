import {
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
import { SimulatorBadge } from '../components/shared/SimulatorBadge';
import { ExperimentalBadge } from '../components/contributions/ExperimentalBadge';
import { ContributionGuideLink } from '../components/contributions/ContributionGuideLink';
import EditorMap from '../features/contribution-editor/EditorMap';
import {
  barsIdSuggestions,
  colorForObjectId,
  createEditorDocument,
  draftHash,
  originalDivisionsFromPoints,
  parseDraftXml,
  serializeDraftXml,
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
  getEditorSession,
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
  canonicalMsfsRemovalSourceId,
  coveredAutomaticRemovalIds,
  createMsfsRemovalWorkerClient,
  removalSelectionFromBinding,
  removalBindingsWithSharedRows,
} from '../features/contribution-editor/msfs-removal-client.js';

const TOOLS = [
  { id: 'select', label: 'Edit', icon: MousePointer2, shortcut: 'V' },
  { id: 'draw', label: 'Add object', icon: MapPinPlus, shortcut: 'D' },
  {
    id: 'remove-light',
    label: 'Mark source lights for removal',
    icon: Trash2,
    shortcut: 'R',
    advanced: true,
  },
  {
    id: 'marking-debug',
    label: 'Inspect marking',
    icon: Bug,
    shortcut: 'I',
    advanced: true,
  },
  { id: 'split', label: 'Split', icon: Scissors, shortcut: 'S' },
  { id: 'join', label: 'Join', icon: GitMerge, shortcut: 'J' },
  { id: 'measure', label: 'Measure distance', icon: Ruler, shortcut: 'M' },
];
const DEFAULT_VISIBLE_CATEGORIES = new Set(['painted-lines', 'runways', 'pavement-edges']);
const EMPTY_SCENE = { version: 2, simulator: 'msfs', features: [], categories: SNAP_CATEGORIES };

function nearestMsfsRemovalTarget(features, clickedFeature, coordinate, maximumMeters = 4) {
  if (clickedFeature?.properties?.msfsRemovalTarget === true) return clickedFeature;
  let best = null;
  let bestDistance = maximumMeters;
  for (const feature of features ?? []) {
    if (feature.properties?.msfsRemovalTarget !== true) continue;
    let distance = Infinity;
    if (feature.geometry?.type === 'Point') {
      distance = distanceMeters(coordinate, feature.geometry.coordinates);
    } else if (feature.geometry?.type === 'LineString') {
      distance =
        nearestPointOnLine(coordinate, feature.geometry.coordinates)?.distanceMeters ?? Infinity;
    }
    if (distance <= bestDistance) {
      best = feature;
      bestDistance = distance;
    }
  }
  return best;
}

// The editor coordinates map gestures, local extraction, persistence, and deterministic XML export.
// oxlint-disable react-doctor/no-giant-component react-doctor/prefer-useReducer react-doctor/js-combine-iterations react-doctor/js-flatmap-filter react-doctor/rerender-state-only-in-handlers -- The editor is a cohesive map workflow; source selection is rendered and feeds effects, while staged geometry transforms preserve review semantics.
export default function ContributionEditor() {
  const { icao: routeIcao } = useParams();
  const icao = String(routeIcao ?? '')
    .trim()
    .toUpperCase();
  const location = useLocation();
  const navigate = useNavigate();
  const draftInputRef = useRef(null);
  const sceneryInputRef = useRef(null);
  const textureLibraryInputRef = useRef(null);
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  const autosaveTimerRef = useRef(null);
  const workspaceSaveTimerRef = useRef(null);
  const initialSaveRef = useRef(false);
  const originalDivisionRefreshRef = useRef('');
  const removalRequestRef = useRef(0);
  const removalAbortRef = useRef(null);
  const removalWorkerClientRef = useRef(null);
  const [initialSession] = useState(() => {
    // Reading render-time state must be idempotent. React Strict Mode renders this
    // initializer twice in development; consuming the session here discarded the
    // ephemeral MSFS render bundle before the committed editor mounted.
    const session = getEditorSession(location.state?.sessionKey || icao);
    const localRecord = newestEditorRecord([
      loadEditorDraftImmediate(icao, 'xplane'),
      loadEditorDraftImmediate(icao, 'msfs'),
    ]);
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
          }
        : {};
  });

  const initialWorkspace = initialSession?.workspace ?? {};

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
      for (const value of [feature.id, feature.properties?.sourceId]) {
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
  const [snapEnabled, setSnapEnabled] = useState(initialWorkspace.snapEnabled !== false);
  const snapToleranceMeters = 8;
  const [validationOpen, setValidationOpen] = useState(Boolean(initialWorkspace.validationOpen));
  const [quickEditingId, setQuickEditingId] = useState(null);
  const [removalSectionStart, setRemovalSectionStart] = useState(null);
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
  const [viewport, setViewport] = useState(initialWorkspace.viewport ?? null);
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
  const [removalBusy, setRemovalBusy] = useState(false);
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

  const document = state?.present;
  const latestDocumentRef = useRef(document);
  const latestDirtyRef = useRef(Boolean(state?.dirty));
  const workspaceSnapshot = useMemo(
    () => ({
      selectedId: state?.selectedId ?? null,
      tool,
      visibleCategories: [...visibleCategories],
      divisionGhostsVisible,
      editorObjectsVisible,
      snapEnabled,
      validationOpen,
      rightPanel,
      uniqueObjectColors,
      advancedOpen,
      viewport,
    }),
    [
      advancedOpen,
      divisionGhostsVisible,
      editorObjectsVisible,
      rightPanel,
      snapEnabled,
      state?.selectedId,
      tool,
      uniqueObjectColors,
      validationOpen,
      viewport,
      visibleCategories,
    ]
  );
  const latestWorkspaceRef = useRef(workspaceSnapshot);
  const hydrationRef = useRef({
    icao,
    enabled: editorSessionNeedsHydration(initialSession),
  });
  useLayoutEffect(() => {
    latestWorkspaceRef.current = workspaceSnapshot;
    latestDocumentRef.current = document;
    latestDirtyRef.current = Boolean(state?.dirty);
  }, [document, state?.dirty, workspaceSnapshot]);
  useLayoutEffect(() => {
    if (hydrationRef.current.icao !== icao) {
      hydrationRef.current = { icao, enabled: true };
    }
  }, [icao]);
  const selectedObject = document?.objects.find((object) => object.partId === state.selectedId);
  const msfsRemovalSourceIds = useMemo(() => {
    const sourceIds = new Set();
    for (const removal of document?.removals ?? []) {
      if (removal.origin !== 'msfs-source') continue;
      for (const sourceId of removal.sourceIds ?? []) sourceIds.add(String(sourceId));
    }
    return sourceIds;
  }, [document?.removals]);
  const msfsManualRemovalSelections = useMemo(
    () =>
      (document?.removals ?? [])
        .filter((removal) => removal.origin === 'msfs-manual')
        .flatMap((removal) =>
          removal.selections?.length
            ? removal.selections
            : (removal.sourceIds ?? []).map((sourceId) => ({ sourceId: String(sourceId) }))
        ),
    [document?.removals]
  );

  const issues = useMemo(() => (document ? validateEditorDocument(document) : []), [document]);
  const selectedIssues = issues.filter((issue) => issue.partId === state?.selectedId);
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
    originalDivisionRefreshRef.current = refreshKey;
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
        if (originalDivisions.length === 0) return;
        const nextDocument = {
          ...latestDocumentRef.current,
          originalDivisions,
        };
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
      const records = await Promise.all([
        loadEditorDraft(icao, 'xplane'),
        loadEditorDraft(icao, 'msfs'),
      ]);
      const newest = newestEditorRecord(records);
      const reference = newest ? await loadReferenceScene(icao, newest.document.simulator) : null;
      if (cancelled) return;
      // React Strict Mode cancels and repeats the first effect pass in development.
      // Mark hydration complete only after a non-cancelled pass so the real app,
      // not just the standalone renderer, can restore large IndexedDB scenes.
      hydrationRef.current.enabled = false;
      if (!newest) return;
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
    };
    hydrate().catch(() => {
      if (!cancelled) showError('The locally saved editor workspace could not be restored.');
    });
    return () => {
      cancelled = true;
    };
  }, [icao, showError]);

  useEffect(() => {
    if (!state?.dirty || !document) return undefined;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      const record = await saveEditorDraft(document);
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
    if (!document || initialSaveRef.current) return;
    initialSaveRef.current = true;
    saveEditorDraft(document).then((record) => setSavedAt(record.savedAt));
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
        if (selectedTool.id === 'remove-light' || selectedTool.id === 'draw') {
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
      removalWorkerClientRef.current?.terminate();
      clearTimeout(autosaveTimerRef.current);
      clearTimeout(workspaceSaveTimerRef.current);
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
      if (nextTool === 'remove-light' || nextTool === 'draw') {
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
      const selections = automaticRemovalSelections(matchOrMatches, retainedBindings);
      if (selections.length === 0) return;
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
        if (requestId === removalRequestRef.current) {
          removalAbortRef.current = null;
          setRemovalBusy(false);
        }
      }
    },
    [document?.simulator, removalContext, showError]
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
          sourceBindings: splitMatches[1]?.binding ? [splitMatches[1].binding] : [],
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
                        ? splitMatches[0]?.binding
                          ? [splitMatches[0].binding]
                          : []
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
    (coordinates) => {
      if (!document || coordinates.length < 2) return;
      const match = matchSnappedReference(coordinates, referenceScene.features, 1.5, {
        allowDerived: document.simulator === 'msfs',
      });
      dispatch({
        type: 'add-object',
        match,
        object: {
          id: '',
          partId: uniquePartId(document.objects, 'manual'),
          name: 'New object',
          type: 'lead_on',
          status: match ? 'matched' : 'manual',
          coordinates,
          color: '#22d3ee',
          sourceBindings:
            document.simulator === 'msfs'
              ? match?.binding
                ? [match.binding]
                : []
              : (match?.bindings ?? (match?.binding ? [match.binding] : [])),
        },
      });
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
      const sharedRemovalBindings = removalBindingsWithSharedRows(
        document?.objects,
        id,
        removalBindings
      );
      dispatch({
        type: 'update-object-geometry',
        id,
        coordinates,
        match,
        sourceBindings: document?.simulator === 'msfs' ? removalBindings : undefined,
      });
      void syncAutomaticMsfsRemoval(
        sharedRemovalBindings.length > 0 ? { bindings: sharedRemovalBindings } : match,
        [],
        coveredAutomaticRemovalIds(document?.removals, previousObject?.coordinates)
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
    async (feature, coordinate, { selectSection = false } = {}) => {
      if (tool === 'remove-light') {
        const properties = feature.properties ?? {};
        if (document?.simulator === 'msfs') {
          if (properties.mustKeep === true) {
            showError('This BGL light is protected as must keep and will not be removed.');
            return;
          }
          const removalFeature = nearestMsfsRemovalTarget(
            referenceScene.features,
            feature,
            coordinate
          );
          const removalProperties = removalFeature?.properties ?? {};
          const sourceId = String(removalProperties.sourceId ?? removalFeature?.id ?? '');
          if (
            removalProperties.msfsRemovalTarget !== true ||
            !['light-rows', 'fixtures'].includes(removalProperties.snapCategory)
          ) {
            showError('Select a source-backed stopbar, lead-on, or taxi-centreline light.');
            return;
          }
          if (!removalContext) {
            showError('Reconnect the scenery package before changing MSFS removals.');
            return;
          }
          let nextSelections = [...msfsManualRemovalSelections];
          if (selectSection && removalFeature.geometry?.type === 'LineString') {
            const projection = nearestPointOnLine(coordinate, removalFeature.geometry.coordinates);
            if (!projection) return;
            if (!removalSectionStart || removalSectionStart.sourceId !== sourceId) {
              setRemovalSectionStart({ sourceId, feature: removalFeature, projection });
              return;
            }
            const section = referenceMatchFromProjections(
              removalFeature,
              removalSectionStart.projection,
              projection
            );
            const selection = removalSelectionFromBinding(section?.binding);
            if (!selection) return;
            nextSelections = [
              ...nextSelections.filter((item) => item.sourceId !== sourceId),
              selection,
            ];
            setRemovalSectionStart(null);
          } else {
            const hasManualSelection = nextSelections.some(
              (selection) => selection.sourceId === sourceId
            );
            nextSelections = hasManualSelection
              ? nextSelections.filter((selection) => selection.sourceId !== sourceId)
              : [...nextSelections, { sourceId }];
            setRemovalSectionStart(null);
          }
          removalAbortRef.current?.abort();
          const abortController = new AbortController();
          removalAbortRef.current = abortController;
          const workerClient = removalWorkerClientRef.current;
          if (!workerClient) return;
          const requestId = ++removalRequestRef.current;
          setRemovalBusy(true);
          try {
            const result = await workerClient.build(nextSelections, {
              signal: abortController.signal,
            });
            if (requestId !== removalRequestRef.current) return;
            dispatch({ type: 'replace-msfs-manual-removals', removals: result.removals });
            if (result.rejectedSourceIds.includes(sourceId)) {
              showError('That light cannot be removed without touching must-keep BGL lighting.');
            }
          } catch (error) {
            if (error?.name !== 'AbortError' && requestId === removalRequestRef.current) {
              showError(error instanceof Error ? error.message : String(error));
            }
          } finally {
            if (requestId === removalRequestRef.current) {
              removalAbortRef.current = null;
              setRemovalBusy(false);
            }
          }
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
        if (selectSection && feature.geometry?.type === 'LineString') {
          const projection = nearestPointOnLine(coordinate, feature.geometry.coordinates);
          if (!projection) return;
          const sourceId = String(properties.sourceId ?? feature.id ?? selector.feature);
          if (!removalSectionStart || removalSectionStart.sourceId !== sourceId) {
            setRemovalSectionStart({ sourceId, feature, projection });
            return;
          }
          const match = referenceMatchFromProjections(
            feature,
            removalSectionStart.projection,
            projection
          );
          const sectionSelector = match?.selector ?? match?.selectors?.[0];
          if (sectionSelector)
            dispatch({ type: 'toggle-xplane-removal', selector: sectionSelector });
          setRemovalSectionStart(null);
          return;
        }
        setRemovalSectionStart(null);
        dispatch({ type: 'toggle-xplane-removal', selector });
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
      document?.simulator,
      followState,
      msfsManualRemovalSelections,
      removalContext,
      referenceScene.features,
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
        showError('Choose a BARS draft file smaller than 5 MB.');
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
        });
        dispatch({ type: 'replace-document', document: next });
        saveEditorDraft(next)
          .then(() => setSavedAt(new Date()))
          .catch(() => {});
        setReferenceScene({ ...EMPTY_SCENE, simulator: next.simulator });
        setRenderBundle(null);
        setRemovalContext(null);
        setSourceSelection(null);
        setCachedTexturePaths(new Set());
        setSourceMismatch(false);
        setTool('select');
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Draft could not be read.');
      }
    },
    [icao, showError]
  );

  const extractReference = useCallback(
    (selection) => {
      if (!selection?.entries.length || !airport || !document) return;
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
            showError(
              `This is ${formatSimulator(message.result.simulator)} scenery, but the draft is for ${formatSimulator(document.simulator)}.`
            );
          } else {
            setSourceSelection(selection);
            setReferenceScene(message.result.scene);
            setRenderBundle(message.result.renderBundle || null);
            setRemovalContext(message.result.removalContext || null);
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
    if (!document) return;
    downloadText(serializeDraftXml(document), `${icao}-Draft.xml`, 'application/xml');
  }, [document, icao]);

  const handleContinue = useCallback(async () => {
    if (!document) return;
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
  }, [airport?.name, document, icao, issues, navigate, showError]);

  if (!document) {
    return (
      <div className="min-h-dvh bg-zinc-950 text-white">
        <main className="min-h-dvh px-6 py-12">
          <div className="mx-auto max-w-4xl">
            <div className="flex items-center justify-between gap-4">
              <Link
                to={`/contribute/generator/${icao}`}
                className="inline-flex items-center gap-2 text-xs text-zinc-400 transition hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to draft generator
              </Link>
            </div>
            <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
              <p className="font-mono text-xs text-zinc-500">{icao}</p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <h1 className="text-3xl font-semibold tracking-tight text-white">Open a draft</h1>
                <ContributionGuideLink tooltipSide="bottom" />
              </div>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                Create a draft from your scenery before opening the editor.
              </p>
              <div className="mt-8 max-w-md space-y-3">
                <Link
                  to={`/contribute/generator/${icao}`}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                >
                  Create a draft
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => draftInputRef.current?.click()}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setDragTarget('draft');
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setDragTarget('')}
                  onDrop={handleDraftDrop}
                  className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                    dragTarget === 'draft'
                      ? 'bg-zinc-800 text-zinc-200'
                      : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Choose an existing draft
                </button>
              </div>
            </div>
          </div>
          <input
            ref={draftInputRef}
            type="file"
            accept=".xml,application/xml"
            aria-label="Open contribution draft file"
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
                Back to draft generator
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
                    <span className="block text-sm font-medium text-zinc-100">Draft ready</span>
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
                  This scenery differs from the draft source. Review every match before testing.
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
    <div className="h-dvh overflow-hidden bg-zinc-950 text-white">
      <main className="flex h-full min-h-0 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 bg-zinc-950 px-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              to={`/contribute/generator/${icao}`}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
              aria-label="Back to draft generator"
              title="Back to draft generator"
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
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-zinc-300 transition hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download draft</span>
            </button>
            <button
              type="button"
              onClick={handleContinue}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 text-[11px] font-medium text-zinc-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
            >
              <span className="hidden sm:inline">Test contribution</span>
              <span className="sm:hidden">Test</span>
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
            <div className="space-y-1 p-2">
              {document.objects.map((object, objectIndex) => {
                const objectIssues = issues.filter((issue) => issue.partId === object.partId);
                const part = partMetadata.get(object.partId);
                return (
                  <div
                    key={`${object.id}:${objectIndex}`}
                    className={`rounded-md ${
                      object.partId === state.selectedId
                        ? 'bg-zinc-100 text-zinc-950'
                        : 'bg-zinc-900/30 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-1 p-1">
                      <button
                        type="button"
                        onClick={() => handleSelect(object.partId, { focus: true })}
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                          object.partId === state.selectedId ? '' : 'hover:bg-zinc-800/70'
                        }`}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: objectDisplayColor(object, uniqueObjectColors),
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-medium">
                            {object.name}
                          </span>
                          <span
                            className={`block truncate font-mono text-xs ${object.partId === state.selectedId ? 'text-zinc-600' : 'text-zinc-500'}`}
                          >
                            {object.id || 'BARS ID required'}
                          </span>
                        </span>
                        {part?.total > 1 ? (
                          <span className="text-xs tabular-nums text-zinc-500">
                            {part.index}/{part.total}
                          </span>
                        ) : null}
                        {objectIssues.length > 0 ? (
                          <AlertTriangle
                            className={`h-3.5 w-3.5 ${objectIssues.some((issue) => issue.severity === 'error') ? 'text-rose-400' : 'text-amber-400'}`}
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          dispatch({ type: 'select', id: object.partId });
                          setQuickEditingId((id) => (id === object.partId ? null : object.partId));
                        }}
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                          object.partId === state.selectedId
                            ? 'text-zinc-600 hover:bg-zinc-200 hover:text-zinc-950'
                            : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'
                        }`}
                        aria-label={`Quick edit ${object.name}`}
                        aria-expanded={quickEditingId === object.partId}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'delete-object', id: object.partId })}
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${
                          object.partId === state.selectedId
                            ? 'text-zinc-600 hover:bg-rose-100 hover:text-rose-700'
                            : 'text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300'
                        }`}
                        aria-label={`Delete ${object.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    {quickEditingId === object.partId ? (
                      <div
                        className={`grid gap-2 border-t px-2 pb-2 pt-2 ${object.partId === state.selectedId ? 'border-zinc-300' : 'border-zinc-800'}`}
                      >
                        <label className="text-xs text-zinc-500">
                          BARS ID
                          <input
                            value={object.id}
                            onChange={(event) =>
                              dispatch({
                                type: 'rename-object-id',
                                partId: object.partId,
                                id: event.target.value.toUpperCase(),
                              })
                            }
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
              })}
              {document.objects.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-zinc-500">
                  Add an object from the map toolbar.
                </p>
              ) : null}
            </div>
          </aside>

          <section className="relative order-1 min-h-[60vh] overflow-hidden border-b border-zinc-800 bg-zinc-950 lg:order-2 lg:min-h-0 lg:border-b-0">
            <EditorMap
              airport={airport}
              document={document}
              referenceScene={referenceScene}
              renderBundle={renderBundle}
              sourceEntries={sourceSelection?.entries}
              sourceFingerprint={document.source?.fingerprint}
              selectedId={state.selectedId}
              tool={tool}
              visibleCategories={visibleCategories}
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
              onTextureStatus={setTextureStatus}
              onViewportChange={setViewport}
              measurements={measurements}
              measurementStart={measurementStart}
              onMeasurementMove={handleMeasurementMove}
              onMeasurementCancel={handleMeasurementCancel}
            />

            <div className="absolute left-3 top-3 flex flex-col gap-1 rounded-lg border border-zinc-700/80 bg-zinc-950/95 p-1 shadow-xl shadow-black/25 backdrop-blur">
              {TOOLS.filter(
                (candidate) =>
                  !candidate.advanced && (!candidate.xplaneOnly || document.simulator === 'xplane')
              ).map((candidate, index) => (
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
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 disabled:opacity-30 ${
                    index === 2 ? 'mt-1 border-t border-zinc-800 pt-1' : ''
                  } ${
                    tool === candidate.id
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                  aria-label={candidate.label}
                >
                  <candidate.icon className="h-4 w-4" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSnapEnabled((enabled) => !enabled)}
                title={snapEnabled ? 'Snapping on' : 'Snapping off'}
                aria-label={snapEnabled ? 'Turn snapping off' : 'Turn snapping on'}
                aria-pressed={snapEnabled}
                className={`mt-1 inline-flex h-9 w-9 items-center justify-center rounded-md border-t border-zinc-800 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                  snapEnabled ? 'bg-cyan-400 text-zinc-950' : 'text-zinc-400'
                }`}
              >
                <Magnet className="h-4 w-4" />
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
                  className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-md border-t border-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            {tool === 'remove-light' ? (
              <div className="absolute bottom-3 left-3 max-w-xs rounded-lg border border-rose-400/20 bg-zinc-950/95 px-3 py-2 shadow-xl backdrop-blur">
                <div className="flex items-center gap-2 text-xs font-medium text-zinc-100">
                  <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                  Remove source lights
                  <span className="rounded-full bg-rose-400/10 px-1.5 py-0.5 font-mono text-rose-200">
                    {removalBusy
                      ? '…'
                      : document.simulator === 'xplane'
                        ? document.xplaneRemovals.length
                        : msfsRemovalSourceIds.size}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-zinc-400">
                  Click a row to add or remove it. Shift-click two points to remove one section.
                </p>
                {removalSectionStart ? (
                  <p className="mt-1 text-[11px] text-cyan-300">Now Shift-click the section end.</p>
                ) : null}
                {document.simulator === 'msfs' && !removalContext ? (
                  <p className="mt-1 text-[11px] text-amber-300">
                    Reconnect the scenery package to edit removals.
                  </p>
                ) : null}
              </div>
            ) : null}
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
                      This scenery differs from the package used to generate the draft. Recheck
                      source bindings before testing.
                    </p>
                  ) : null}
                </div>

                <div className="border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((open) => !open)}
                    aria-expanded={advancedOpen}
                    className="flex min-h-11 w-full items-center justify-between px-4 text-left text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/45"
                  >
                    Advanced
                    <ChevronDown
                      className={`h-4 w-4 text-zinc-500 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] ${advancedOpen ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {advancedOpen ? (
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
                      <div className="grid grid-cols-[1fr_3rem] px-4 pb-1 text-xs uppercase tracking-wider text-zinc-500">
                        <span>Layer</span>
                        <span className="text-center">Show</span>
                      </div>
                      <div className="space-y-0.5 px-2 pb-3">
                        <div className="grid grid-cols-[1fr_3rem] items-center rounded-md px-2 py-1.5 hover:bg-zinc-950/50">
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
                        <div className="grid grid-cols-[1fr_3rem] items-center rounded-md px-2 py-1.5 hover:bg-zinc-950/50">
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
                          const visible = visibleCategories.has(category.id);
                          return (
                            <div
                              key={category.id}
                              className="grid grid-cols-[1fr_3rem] items-center rounded-md px-2 py-1.5 hover:bg-zinc-950/50"
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
                              <ToggleIcon
                                active={visible}
                                label={`${visible ? 'Hide' : 'Show'} ${category.label}`}
                                onClick={() =>
                                  setVisibleCategories(toggleSet(visibleCategories, category.id))
                                }
                                activeIcon={Eye}
                                inactiveIcon={EyeOff}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
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
                        backgroundColor: objectDisplayColor(selectedObject, uniqueObjectColors),
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
                      onClick={() => dispatch({ type: 'delete-object', id: selectedObject.partId })}
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
          aria-label="Replace contribution draft file"
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
  return (
    <div className="sticky bottom-0 mt-auto border-t border-zinc-800 bg-zinc-950/98 backdrop-blur">
      <button
        type="button"
        onClick={onToggle}
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
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && issues.length > 0 ? (
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
      ) : null}
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
        <span className="absolute inset-0 rounded-full border border-zinc-700 bg-zinc-900 transition-colors peer-checked:border-cyan-400 peer-checked:bg-cyan-400 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950" />
        <span className="relative ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-400 text-zinc-900 transition-transform peer-checked:translate-x-4 peer-checked:bg-zinc-950">
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

function objectDisplayColor(object, uniqueObjectColors) {
  if (uniqueObjectColors) return colorForObjectId(object.id);
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

function newestEditorRecord(records) {
  let newest = null;
  for (const record of records ?? []) {
    if (!record) continue;
    if (!newest || String(record.savedAt).localeCompare(String(newest.savedAt)) > 0) {
      newest = record;
    }
  }
  return newest;
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
