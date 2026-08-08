import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bug,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleDot,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  GitMerge,
  LoaderCircle,
  Magnet,
  MapPinPlus,
  MousePointer2,
  Redo2,
  RotateCcw,
  Scissors,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { Toast } from '../components/shared/Toast';
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
  loadReferenceScene,
  loadReferenceSceneImmediate,
  loadReferenceTextures,
  requestPersistentEditorStorage,
  saveEditorDraft,
  saveReferenceScene,
  takeEditorSession,
  xPlaneTextureDefinitionKey,
} from '../features/contribution-editor/editor-session.js';
import {
  normalizeReferenceScene,
  SNAP_CATEGORIES,
} from '../features/contribution-editor/reference-scene.js';
import {
  matchSnappedReference,
  referenceMatchFromProjections,
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

const TOOLS = [
  { id: 'select', label: 'Edit', icon: MousePointer2, shortcut: 'V' },
  { id: 'draw', label: 'Add object', icon: MapPinPlus, shortcut: 'D' },
  {
    id: 'remove-light',
    label: 'Mark source lights for removal',
    icon: Trash2,
    shortcut: 'R',
    xplaneOnly: true,
  },
  { id: 'marking-debug', label: 'Inspect marking', icon: Bug, shortcut: 'I' },
  { id: 'split', label: 'Split', icon: Scissors, shortcut: 'S' },
  { id: 'join', label: 'Join', icon: GitMerge, shortcut: 'J' },
];
const DEFAULT_VISIBLE_CATEGORIES = new Set(['painted-lines', 'runways', 'pavement-edges']);
const EMPTY_SCENE = { version: 1, simulator: 'msfs', features: [], categories: SNAP_CATEGORIES };

// The editor coordinates map gestures, local extraction, persistence, and deterministic XML export.
// oxlint-disable react-doctor/no-giant-component react-doctor/prefer-useReducer
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
  const initialSaveRef = useRef(false);
  const initialSessionRef = useRef(null);
  const originalDivisionRefreshRef = useRef('');
  if (initialSessionRef.current === null) {
    const session = takeEditorSession(location.state?.sessionKey || icao);
    const localRecord = newestEditorRecord([
      loadEditorDraftImmediate(icao, 'xplane'),
      loadEditorDraftImmediate(icao, 'msfs'),
    ]);
    const localDocument = localRecord?.document;
    const localReference = localDocument
      ? loadReferenceSceneImmediate(icao, localDocument.simulator)
      : null;
    initialSessionRef.current =
      session ??
      (localDocument
        ? {
            document: localDocument,
            referenceScene: localReference?.scene,
            sourceName: localReference?.sourceName,
          }
        : {});
  }

  const [airport, setAirport] = useState(initialSessionRef.current?.airport ?? null);
  const [state, dispatch] = useReducer(
    editorReducer,
    initialSessionRef.current?.document ?? null,
    (document) => (document ? createEditorState(document) : null)
  );
  const [referenceSceneState, setReferenceScene] = useState(
    initialSessionRef.current?.referenceScene ?? EMPTY_SCENE
  );
  const referenceScene = useMemo(
    () => normalizeReferenceScene(referenceSceneState),
    [referenceSceneState]
  );
  const [tool, setTool] = useState('select');
  const [visibleCategories, setVisibleCategories] = useState(
    () => new Set(DEFAULT_VISIBLE_CATEGORIES)
  );
  const [divisionGhostsVisible, setDivisionGhostsVisible] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const snapToleranceMeters = 8;
  const [objectsOpen, setObjectsOpen] = useState(true);
  const [validationOpen, setValidationOpen] = useState(false);
  const [rightPanel, setRightPanel] = useState('scenery');
  const [uniqueObjectColors, setUniqueObjectColors] = useState(false);
  const [focusRequest, setFocusRequest] = useState(null);
  const [followState, setFollowState] = useState(null);
  const [sourceProgress, setSourceProgress] = useState(null);
  const [sourceSelection, setSourceSelection] = useState(
    () =>
      initialSessionRef.current?.sourceSelection ??
      (initialSessionRef.current?.sourceName
        ? { name: initialSessionRef.current.sourceName, entries: [] }
        : null)
  );
  const [sourceMismatch, setSourceMismatch] = useState(false);
  const [dragTarget, setDragTarget] = useState('');
  const [cachedTexturePaths, setCachedTexturePaths] = useState(() => new Set());
  const [textureStatus, setTextureStatus] = useState({
    phase: 'idle',
    total: 0,
    loaded: 0,
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
  const [savedAt, setSavedAt] = useState(null);
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
  latestDocumentRef.current = document;
  latestDirtyRef.current = Boolean(state?.dirty);
  const hydrationRef = useRef({
    icao,
    enabled: editorSessionNeedsHydration(initialSessionRef.current),
  });
  if (hydrationRef.current.icao !== icao) {
    hydrationRef.current = { icao, enabled: true };
  }
  const selectedObject = document?.objects.find((object) => object.partId === state.selectedId);
  const issues = useMemo(() => (document ? validateEditorDocument(document) : []), [document]);
  const selectedIssues = issues.filter((issue) => issue.partId === state?.selectedId);
  const partMetadata = useMemo(
    () => buildPartMetadata(document?.objects ?? []),
    [document?.objects]
  );
  const idSuggestions = useMemo(
    () => barsIdSuggestions(document?.originalDivisions, selectedObject?.id),
    [document?.originalDivisions, selectedObject?.id]
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
        dispatch({ type: 'select', id: null });
        return;
      }
      const selectedTool = TOOLS.find(
        (candidate) =>
          candidate.shortcut.toLowerCase() === event.key.toLowerCase() &&
          (!candidate.xplaneOnly || document?.simulator === 'xplane')
      );
      if (selectedTool) {
        if (selectedTool.id === 'remove-light') {
          setVisibleCategories((categories) => new Set([...categories, 'light-rows']));
          setRightPanel('scenery');
        }
        setTool(selectedTool.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [document?.simulator, state?.selectedId]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      clearTimeout(autosaveTimerRef.current);
      if (latestDirtyRef.current && latestDocumentRef.current) {
        saveEditorDraft(latestDocumentRef.current);
      }
    },
    []
  );

  const selectTool = useCallback(
    (nextTool) => {
      if (!document) return;
      setFollowState(null);
      if (nextTool === 'remove-light') {
        setVisibleCategories((categories) => new Set([...categories, 'light-rows']));
        setRightPanel('scenery');
      }
      setTool(nextTool);
    },
    [document]
  );

  const handleMapClick = useCallback(
    (coordinate, metadata) => {
      if (!document) return;
      if (tool === 'split' && selectedObject) {
        const projection = nearestPointOnLine(coordinate, selectedObject.coordinates);
        if (!projection || projection.distanceMeters > snapToleranceMeters) return;
        const split = splitLineAt(selectedObject.coordinates, projection);
        if (!split) return;
        const sibling = {
          ...selectedObject,
          id:
            document.simulator === 'xplane'
              ? selectedObject.id
              : uniqueSiblingId(document.objects, selectedObject.id),
          partId: uniquePartId(document.objects, selectedObject.id),
          name: selectedObject.name,
          coordinates: split[1],
          sourceBindings: [],
        };
        dispatch({
          type: 'replace-objects',
          objects: document.objects
            .map((object) =>
              object.partId === selectedObject.partId
                ? { ...object, coordinates: split[0] }
                : object
            )
            .concat(sibling),
        });
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
    [document, selectedObject, showError, snapToleranceMeters, tool]
  );

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
      const id = uniqueManualId(document.objects);
      const match =
        document.simulator === 'xplane'
          ? matchSnappedReference(coordinates, referenceScene.features)
          : null;
      dispatch({
        type: 'add-object',
        match,
        object: {
          id,
          name: 'New object',
          type: 'lead_on',
          status: match ? 'matched' : 'manual',
          coordinates,
          color: '#22d3ee',
          sourceBindings: match?.bindings ?? (match?.binding ? [match.binding] : []),
        },
      });
      setTool('select');
      setRightPanel('object');
    },
    [document, referenceScene.features]
  );

  const handleGeometryChange = useCallback(
    (id, coordinates) => {
      if (coordinates.length < 2) return;
      const match =
        document?.simulator === 'xplane'
          ? matchSnappedReference(coordinates, referenceScene.features)
          : null;
      dispatch({
        type: 'update-object-geometry',
        id,
        coordinates,
        match,
      });
    },
    [document?.simulator, referenceScene.features]
  );

  const handleReferenceClick = useCallback(
    (feature, coordinate) => {
      if (tool === 'remove-light') {
        const properties = feature.properties ?? {};
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
    [document?.simulator, followState, referenceScene.features, selectedObject, showError, tool]
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
            setReferenceScene(message.result.scene);
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
      setSourceSelection(selection);
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
      const library = selectionFromInput(event.target.files);
      event.target.value = '';
      connectTextureLibrary(library);
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
        setSourceSelection(selection);
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
    const [hash, saved] = await Promise.all([draftHash(draftXml), saveEditorDraft(document)]);
    setSavedAt(saved.savedAt);
    navigate(`/contribute/test/${icao}`, {
      state: {
        draftXml,
        draftFileName: `${icao}-Draft.xml`,
        simulator: document.simulator,
        draftHash: hash,
        fromEditor: true,
      },
    });
  }, [document, icao, issues, navigate, showError]);

  if (!document) {
    return (
      <div className="min-h-dvh bg-zinc-950 text-white">
        <main className="min-h-dvh px-6 py-12">
          <div className="mx-auto max-w-4xl">
            <Link
              to={`/contribute/generator/${icao}`}
              className="inline-flex items-center gap-2 text-xs text-zinc-400 transition hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to draft generator
            </Link>
            <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
              <p className="font-mono text-xs text-zinc-500">{icao}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Open a draft
              </h1>
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
            <Link
              to={`/contribute/generator/${icao}`}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm text-zinc-500 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Back to draft generator
            </Link>

            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-6 sm:p-8">
              <p className="font-mono text-xs text-zinc-500">{icao}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white text-balance">
                Finish editor setup
              </h1>
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
                    sourceSelection?.name ||
                    (hasReferenceScene
                      ? `${referenceScene.features.length.toLocaleString()} references ready`
                      : 'Choose the airport scenery folder')
                  }
                  complete={hasReferenceScene}
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
                      className="h-full rounded-full bg-blue-400 transition-[width]"
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
              <span className="shrink-0 text-xs text-zinc-500">
                {formatSimulator(document.simulator)}
              </span>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  state.dirty ? 'bg-amber-400' : 'bg-emerald-400/70'
                }`}
                aria-label={state.dirty ? 'Saving draft' : 'Draft saved locally'}
                title={
                  state.dirty
                    ? 'Saving draft'
                    : savedAt
                      ? 'Draft saved locally'
                      : 'Local draft ready'
                }
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
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

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[13rem_minmax(0,1fr)_17rem] lg:overflow-hidden">
          <aside className="order-2 border-r border-zinc-800/80 bg-zinc-950 lg:order-1 lg:overflow-y-auto">
            <div className="p-2">
              <button
                type="button"
                onClick={() => selectTool('draw')}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-zinc-100 text-xs font-medium text-zinc-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
              >
                <MapPinPlus className="h-4 w-4" />
                Add object
              </button>
              <p className="mt-2 px-1 text-xs leading-4 text-zinc-500">
                Click an object to edit it. Click empty map space to deselect.
              </p>
            </div>
            <Section
              title="Objects"
              icon={CircleDot}
              open={objectsOpen}
              onToggle={() => setObjectsOpen((value) => !value)}
              badge={document.objects.length}
            >
              <div className="space-y-1 px-2 pb-3">
                {document.objects.map((object, objectIndex) => {
                  const objectIssues = issues.filter((issue) => issue.partId === object.partId);
                  const part = partMetadata.get(object.partId);
                  return (
                    <button
                      type="button"
                      key={`${object.id}:${objectIndex}`}
                      onClick={() => handleSelect(object.partId, { focus: true })}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                        object.partId === state.selectedId
                          ? 'bg-zinc-100 text-zinc-950'
                          : 'text-zinc-300 hover:bg-zinc-900'
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
                          className={`block truncate font-mono text-xs ${
                            object.partId === state.selectedId ? 'text-zinc-600' : 'text-zinc-500'
                          }`}
                        >
                          {object.id || 'BARS ID required'}
                        </span>
                      </span>
                      {part?.total > 1 ? (
                        <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                          {part.index}/{part.total}
                        </span>
                      ) : null}
                      {objectIssues.length > 0 ? (
                        <AlertTriangle
                          className={`h-3.5 w-3.5 ${
                            objectIssues.some((issue) => issue.severity === 'error')
                              ? 'text-rose-400'
                              : 'text-amber-400'
                          }`}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section
              title="Validation"
              icon={AlertTriangle}
              open={validationOpen}
              onToggle={() => setValidationOpen((value) => !value)}
              badge={issues.length}
            >
              <div className="max-h-[28vh] space-y-2 overflow-y-auto px-3 pb-4">
                {issues.length === 0 ? (
                  <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                    Ready to test. No geometry issues found.
                  </p>
                ) : (
                  issues.map((issue) => (
                    <button
                      type="button"
                      key={issue.id}
                      onClick={() => handleIssueSelect(issue)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-[11px] leading-4 ${
                        issue.severity === 'error'
                          ? 'border-rose-500/25 bg-rose-500/5 text-rose-200'
                          : 'border-amber-500/20 bg-amber-500/5 text-amber-100'
                      }`}
                    >
                      <span className="font-mono text-xs opacity-60">{issue.objectId}</span>
                      <span className="mt-0.5 block">{issue.message}</span>
                    </button>
                  ))
                )}
              </div>
            </Section>
          </aside>

          <section className="relative order-1 min-h-[60vh] overflow-hidden border-b border-zinc-800 bg-zinc-950 lg:order-2 lg:min-h-0 lg:border-b-0">
            <EditorMap
              airport={airport}
              document={document}
              referenceScene={referenceScene}
              sourceEntries={sourceSelection?.entries}
              sourceFingerprint={document.source?.fingerprint}
              selectedId={state.selectedId}
              tool={tool}
              visibleCategories={visibleCategories}
              divisionGhostsVisible={divisionGhostsVisible}
              snapEnabled={snapEnabled}
              uniqueObjectColors={uniqueObjectColors}
              focusRequest={focusRequest}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onGeometryChange={handleGeometryChange}
              onMapClick={handleMapClick}
              onReferenceClick={handleReferenceClick}
              onTextureStatus={setTextureStatus}
            />

            <div className="absolute left-3 top-3 flex flex-col gap-1 rounded-lg border border-zinc-700/80 bg-zinc-950/95 p-1 shadow-xl shadow-black/25 backdrop-blur">
              {TOOLS.filter(
                (candidate) => !candidate.xplaneOnly || document.simulator === 'xplane'
              ).map((candidate, index) => (
                <button
                  type="button"
                  key={candidate.id}
                  onClick={() => selectTool(candidate.id)}
                  disabled={
                    !selectedObject &&
                    !['select', 'draw', 'remove-light', 'marking-debug'].includes(candidate.id)
                  }
                  title={`${candidate.label} (${candidate.shortcut})`}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 disabled:opacity-30 ${
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
            </div>
          </section>

          <aside className="order-3 border-l border-zinc-800/80 bg-zinc-950 lg:overflow-y-auto">
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
                      <p className="mt-0.5 text-xs text-zinc-500">Files stay in this browser</p>
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
                  </div>

                  {sourceProgress ? (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 text-xs text-zinc-300">
                        <LoaderCircle className="h-3 w-3 animate-spin" />
                        <span className="truncate">{sourceProgress.stage}</span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded bg-zinc-800">
                        <div
                          className="h-full rounded bg-white transition-[width]"
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

                <div className="border-y border-zinc-800 px-3 py-3">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span>
                      <span className="block text-xs font-medium text-zinc-200">Snapping</span>
                      <span className="block text-xs text-zinc-500">
                        Snap points to simulator lines and lights
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={snapEnabled}
                      onChange={(event) => setSnapEnabled(event.target.checked)}
                      className="h-4 w-4 accent-white"
                    />
                  </label>
                  <div className="mt-3 border-t border-zinc-800 pt-3">
                    <p className="text-xs font-medium text-zinc-200">Object colors</p>
                    <div className="mt-2 grid grid-cols-2 rounded-md bg-zinc-900 p-1">
                      <button
                        type="button"
                        onClick={() => setUniqueObjectColors(false)}
                        className={`h-7 rounded text-xs font-medium transition-colors ${
                          !uniqueObjectColors
                            ? 'bg-zinc-700 text-white'
                            : 'text-zinc-500 hover:text-zinc-200'
                        }`}
                      >
                        By type
                      </button>
                      <button
                        type="button"
                        onClick={() => setUniqueObjectColors(true)}
                        className={`h-7 rounded text-xs font-medium transition-colors ${
                          uniqueObjectColors
                            ? 'bg-zinc-700 text-white'
                            : 'text-zinc-500 hover:text-zinc-200'
                        }`}
                      >
                        Unique
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs leading-4 text-zinc-500">
                      By type shows stop bars red and all other objects green.
                    </p>
                  </div>
                </div>
                {document.simulator === 'xplane' ? (
                  <div className="px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-zinc-200">Source light removals</p>
                        <p className="mt-1 text-xs leading-4 text-zinc-500">
                          Red rows on the map will be removed from the generated X-Plane scenery.
                          Use the remove tool, then click a source light row to include or exclude
                          it.
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-full bg-rose-500/10 px-2 py-1 font-mono text-xs text-rose-300"
                        aria-label={`${document.xplaneRemovals.length} source light removal rows`}
                        role="status"
                      >
                        {document.xplaneRemovals.length}
                      </span>
                    </div>
                    {document.xplaneRemovals.length > 0 ? (
                      <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
                        {document.xplaneRemovals.map((selector) => (
                          <div
                            key={`${selector.feature}:${selector.code}:${selector.run}`}
                            className="flex min-h-9 items-center gap-2 rounded-md bg-zinc-900 px-2"
                          >
                            <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-400">
                              code {selector.code} · run {selector.run} ·{' '}
                              {Math.round((selector.end - selector.start) * 100)}%
                            </span>
                            <button
                              type="button"
                              onClick={() => dispatch({ type: 'remove-xplane-removal', selector })}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                              aria-label={`Keep source light code ${selector.code}, run ${selector.run}`}
                              title="Keep these source lights"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-md bg-zinc-900 px-2.5 py-2 text-xs text-zinc-500">
                        No source light rows are marked for removal. Select the removal tool, then
                        select a source light row on the map.
                      </p>
                    )}
                  </div>
                ) : null}

                <div>
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
              </div>
            ) : null}

            {rightPanel === 'object' && selectedObject ? (
              <div className="p-3">
                <label className="block text-xs font-medium text-zinc-500">
                  Name
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      value={selectedObject.name}
                      onChange={(event) =>
                        dispatch({
                          type: 'update-object',
                          id: selectedObject.partId,
                          changes: { name: event.target.value },
                        })
                      }
                      className="h-9 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-100 outline-none transition-colors focus:border-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'delete-object', id: selectedObject.partId })}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      aria-label="Delete selected object"
                      title="Delete object"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </label>
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
                  Select an object to edit its name, BARS ID, shape or direction.
                </p>
              </div>
            ) : null}
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

function Section({ title, icon: Icon, open, onToggle, badge, children }) {
  return (
    <div className="border-b border-zinc-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-xs font-medium text-zinc-300 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/45"
      >
        <Icon className="h-4 w-4 text-zinc-500" />
        <span className="flex-1">{title}</span>
        <span className="font-mono text-xs text-zinc-500">{badge}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? '' : '-rotate-90'}`} />
      </button>
      {open ? children : null}
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

Section.propTypes = {
  title: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  open: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  badge: PropTypes.number.isRequired,
  children: PropTypes.node.isRequired,
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

function uniqueManualId(objects) {
  let index = 1;
  while (objects.some((object) => object.id === `BARS_MANUAL_${index}`)) index += 1;
  return `BARS_MANUAL_${index}`;
}

function objectDisplayColor(object, uniqueObjectColors) {
  if (uniqueObjectColors) return object.color;
  return object.type === 'stopbar' ? '#ef4444' : '#22c55e';
}

function uniqueSiblingId(objects, baseId) {
  let index = 2;
  while (objects.some((object) => object.id === `${baseId}_${index}`)) index += 1;
  return `${baseId}_${index}`;
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
