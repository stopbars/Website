import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileCode2,
  FolderOpen,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Toast } from '../components/shared/Toast';
import { Dialog } from '../components/shared/Dialog';
import { ContributionFlowHeader } from '../components/contributions/ContributionFlowHeader';
import { PageLoading } from '../components/shared/PageLoading';
import DraftGeneratorMap from '../features/draft-generator/DraftGeneratorMap';
import { createEditorDocument } from '../features/contribution-editor/editor-model.js';
import { reconnectMsfsRenderBundleFiles } from '../features/msfs-renderer/msfs-texture-files.js';
import {
  cacheReferenceTextures,
  editorSessionKey,
  requestPersistentEditorStorage,
  saveEditorDraft,
  saveReferenceScene,
  setEditorSession,
} from '../features/contribution-editor/editor-session.js';
import {
  detectScenerySimulator,
  isCommunityFolderSelection,
  scenerySelectionFingerprint,
  selectionFromDrop,
  selectionFromInput,
} from '../features/draft-generator/local-package';
import { getContributionDisabledMessage } from '../utils/contributionPolicy';
import {
  getCachedContributionContext,
  loadContributionContext,
} from '../utils/contributionFlowData.js';
import { preloadRoute } from '../utils/routeModules.js';

// This workflow coordinates upload, worker progress, preview, and export in one cohesive screen.
// oxlint-disable react-doctor/no-giant-component react-doctor/no-high-complexity-react-function react-doctor/no-loading-flag-reset-outside-finally -- This cohesive worker flow resets route loading inside finally after its cancellation check.
const XMLGenerator = () => {
  const { icao: urlIcao } = useParams();
  const navigate = useNavigate();
  const folderInputRef = useRef(null);
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  const normalizedIcao = useMemo(() => urlIcao?.trim().toUpperCase() || '', [urlIcao]);
  const cachedContext = useMemo(
    () =>
      /^[A-Z0-9]{4}$/.test(normalizedIcao) ? getCachedContributionContext(normalizedIcao) : null,
    [normalizedIcao]
  );

  const [airport, setAirport] = useState(() => cachedContext?.airport ?? null);
  const [divisionPoints, setDivisionPoints] = useState(() => cachedContext?.points ?? []);
  const [contributionPolicy, setContributionPolicy] = useState(() => cachedContext?.policy ?? null);
  const [loadingData, setLoadingData] = useState(() => !cachedContext);
  const [selection, setSelection] = useState(null);
  const [isReadingDrop, setIsReadingDrop] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [generation, setGeneration] = useState({
    status: 'idle',
    stage: '',
    progress: 0,
  });
  const [result, setResult] = useState(null);
  const [geojsonUrl, setGeojsonUrl] = useState('');
  const [simulatorGeojsonUrl, setSimulatorGeojsonUrl] = useState('');
  const [error, setError] = useState('');
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [showMsfsEditorDialog, setShowMsfsEditorDialog] = useState(false);
  const msfsAcknowledgedRef = useRef(false);
  const [msfsAcknowledgementChecked, setMsfsAcknowledgementChecked] = useState(false);

  const contributionsDisabled =
    contributionPolicy?.managed && !contributionPolicy?.contributionsEnabled;
  const generationPolicyBlocked = contributionsDisabled && !import.meta.env.DEV;
  const disabledContributionMessage = getContributionDisabledMessage(contributionPolicy);
  const isGenerating = generation.status === 'running';
  const draftFileName = `${normalizedIcao || 'airport'}-Draft.xml`;
  const diagnosticFileName = `${normalizedIcao || 'airport'}-Draft-diagnostic.json`;
  const divisionGeojson = useMemo(() => buildDivisionGeojson(divisionPoints), [divisionPoints]);
  const selectedSimulator = useMemo(
    () => (selection ? detectScenerySimulator(selection.entries) : null),
    [selection]
  );

  useEffect(() => {
    if (!normalizedIcao || !/^[A-Z0-9]{4}$/.test(normalizedIcao)) {
      navigate('/contribute/new', { state: { error: 'airport_load_failed' } });
      return undefined;
    }
    if (cachedContext) {
      if (cachedContext.points.length === 0) navigate(`/contribute/map/${normalizedIcao}`);
      return undefined;
    }

    let cancelled = false;
    const loadData = async () => {
      setLoadingData(true);
      try {
        const context = await loadContributionContext(normalizedIcao);
        if (cancelled) return;
        if (context.points.length === 0) {
          navigate(`/contribute/map/${normalizedIcao}`);
          return;
        }
        setAirport(context.airport);
        setDivisionPoints(context.points);
        setContributionPolicy(context.policy);
      } catch (loadError) {
        if (cancelled) return;
        console.error(loadError);
        navigate('/contribute/new', { state: { error: 'airport_load_failed' } });
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };

    loadData();
    return () => {
      cancelled = true;
    };
  }, [cachedContext, navigate, normalizedIcao]);

  useEffect(() => {
    if (!result?.geojsonBlob) {
      setGeojsonUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(result.geojsonBlob);
    setGeojsonUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  useEffect(() => {
    if (!result?.simulatorGeojsonBlob) {
      setSimulatorGeojsonUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(result.simulatorGeojsonBlob);
    setSimulatorGeojsonUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  useEffect(() => terminateWorker, [terminateWorker]);

  const showError = useCallback((message) => {
    setError(message);
    setShowErrorToast(true);
  }, []);

  const startGeneration = useCallback(
    (nextSelection) => {
      if (!nextSelection || !airport || generationPolicyBlocked || isGenerating) return;

      terminateWorker();
      setResult(null);
      setGeneration({ status: 'running', stage: 'Reading scenery package', progress: 3 });
      const requestId = ++requestIdRef.current;
      const worker = new Worker(
        new URL('../features/draft-generator/draft-generator.worker.js', import.meta.url),
        { type: 'module' }
      );
      workerRef.current = worker;

      worker.onmessage = (event) => {
        const message = event.data;
        if (message.id !== requestId) return;
        if (message.type === 'stage') {
          setGeneration({ status: 'running', stage: message.stage, progress: message.progress });
          return;
        }
        if (message.type === 'complete') {
          setResult(message.result);
          setGeneration({ status: 'complete', stage: 'XML ready', progress: 100 });
          terminateWorker();
          return;
        }
        if (message.type === 'error') {
          setGeneration({ status: 'error', stage: '', progress: 0 });
          showError(message.error || 'The XML could not be generated. Choose another folder.');
          terminateWorker();
        }
      };
      worker.onerror = (event) => {
        setGeneration({ status: 'error', stage: '', progress: 0 });
        showError(event.message || 'The generator stopped. Choose the folder and try again.');
        terminateWorker();
      };
      worker.postMessage({
        type: 'generate',
        id: requestId,
        entries: nextSelection.entries,
        icao: normalizedIcao,
        altitude: Number.isFinite(airport.elevation_m) ? airport.elevation_m : 0,
        airportPosition: {
          latitude: airport.latitude,
          longitude: airport.longitude,
        },
        divisionPoints,
        packageName: nextSelection.name,
        includeDiagnostics: import.meta.env.DEV,
      });
    },
    [
      airport,
      divisionPoints,
      generationPolicyBlocked,
      isGenerating,
      normalizedIcao,
      showError,
      terminateWorker,
    ]
  );

  const applySelection = useCallback(
    (nextSelection) => {
      if (isCommunityFolderSelection(nextSelection)) {
        throw new Error(
          'You selected the Community folder. Choose the airport package inside it instead.'
        );
      }
      if (!nextSelection?.entries?.length) {
        throw new Error('No files were found. Choose the airport scenery package.');
      }
      if (!hasScenerySource(nextSelection.entries)) {
        throw new Error(
          'No supported airport scenery files were found. Choose a package containing BGL, XML, apt.dat, or DSF files.'
        );
      }
      setSelection(nextSelection);
      startGeneration(nextSelection);
    },
    [startGeneration]
  );

  const handleFolderChange = (event) => {
    try {
      const nextSelection = selectionFromInput(event.target.files);
      if (nextSelection) applySelection(nextSelection);
    } catch (selectionError) {
      showError(selectionError instanceof Error ? selectionError.message : String(selectionError));
    } finally {
      event.target.value = '';
    }
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDragActive(false);
    if (isGenerating || generationPolicyBlocked) return;

    setIsReadingDrop(true);
    try {
      const nextSelection = await selectionFromDrop(event.dataTransfer);
      if (nextSelection) applySelection(nextSelection);
    } catch (dropError) {
      showError(dropError instanceof Error ? dropError.message : String(dropError));
    } finally {
      setIsReadingDrop(false);
    }
  };

  const handleDownload = () => {
    if (!result?.xmlBlob || result.matchedCount === 0) return;
    downloadBlob(result.xmlBlob, draftFileName);
  };

  const handleDiagnosticDownload = () => {
    if (!import.meta.env.DEV || !result?.diagnosticBlob) return;
    downloadBlob(result.diagnosticBlob, diagnosticFileName);
  };

  const openEditor = async () => {
    if (!result?.xmlBlob || result.matchedCount === 0) return;
    const editorRoute = preloadRoute(`/contribute/editor/${normalizedIcao}`);
    const [draftXml, draftGeojson, referenceScene] = await Promise.all([
      result.xmlBlob.text(),
      result.geojsonBlob.text().then(JSON.parse),
      result.referenceSceneBlob.text().then(JSON.parse),
    ]);
    const sourceFingerprint = scenerySelectionFingerprint(selection?.entries);
    const document = createEditorDocument({
      icao: normalizedIcao,
      simulator: result.simulator,
      altitude: Number.isFinite(airport?.elevation_m) ? airport.elevation_m : 0,
      draftGeojson,
      draftXml,
      source: {
        name: selection?.name || 'Scenery package',
        fingerprint: sourceFingerprint,
      },
    });
    requestPersistentEditorStorage();
    const persistenceTasks = [
      saveEditorDraft(document),
      saveReferenceScene(
        normalizedIcao,
        result.simulator,
        referenceScene,
        selection?.name || 'Scenery package',
        sourceFingerprint
      ),
      editorRoute,
    ];
    if (result.simulator === 'xplane') {
      persistenceTasks.push(
        cacheReferenceTextures(sourceFingerprint, referenceScene, selection?.entries)
      );
    }
    await Promise.all(persistenceTasks);
    const renderBundle =
      result.simulator === 'msfs'
        ? reconnectMsfsRenderBundleFiles(result.renderBundle, selection?.entries)
        : result.renderBundle;
    const sessionKey = editorSessionKey(normalizedIcao, result.simulator);
    setEditorSession(sessionKey, {
      airport,
      document,
      referenceScene,
      renderBundle: renderBundle || null,
      removalContext: result.removalContext || null,
      sourceSelection: selection,
    });
    navigate(`/contribute/editor/${normalizedIcao}?simulator=${result.simulator}`, {
      state: { sessionKey, simulator: result.simulator },
    });
  };

  const handleOpenEditor = () => {
    if (result?.simulator === 'msfs' && !msfsAcknowledgedRef.current) {
      setMsfsAcknowledgementChecked(false);
      setShowMsfsEditorDialog(true);
      return;
    }
    void openEditor();
  };

  const continueWithMsfsEditor = () => {
    if (!msfsAcknowledgementChecked) return;
    msfsAcknowledgedRef.current = true;
    setShowMsfsEditorDialog(false);
    void openEditor();
  };

  if (loadingData) {
    return <PageLoading page label="Loading XML generator…" />;
  }

  return (
    <Layout>
      <div className="min-h-screen pb-20 pt-32">
        <div className="mx-auto max-w-7xl px-6">
          <ContributionFlowHeader
            current="draft"
            title="Create XML"
            icao={normalizedIcao}
            context={`${airport?.icao} · ${airport?.name}`}
          />

          {contributionsDisabled ? (
            <div className="mb-6 flex items-start rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <AlertCircle className="mr-3 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm text-amber-300">{disabledContributionMessage}</p>
                {import.meta.env.DEV ? (
                  <p className="mt-1 text-xs text-amber-200">
                    XML generation is temporarily enabled in local development.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <DraftGeneratorMap
              airport={airport}
              geojsonUrl={geojsonUrl}
              simulatorGeojsonUrl={simulatorGeojsonUrl}
              divisionGeojson={divisionGeojson}
              diagnosticBlob={result?.diagnosticBlob}
              bounds={result?.bounds}
            />

            <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                    <FileCode2 className="h-5 w-5" />
                  </div>
                  <h2 className="font-medium text-white">Choose airport scenery</h2>
                </div>

                {!selection ? (
                  <p className="mt-4 text-xs leading-relaxed text-zinc-400">
                    For MSFS, select the airport package from your Community folder. For X-Plane,
                    select the custom airport package or Global Airports folder.
                  </p>
                ) : null}

                <div
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (!isGenerating) setIsDragActive(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (event.currentTarget === event.target) setIsDragActive(false);
                  }}
                  onDrop={handleDrop}
                  className={`mt-4 rounded-lg border border-dashed p-4 transition-colors ${
                    isDragActive
                      ? 'border-emerald-400 bg-emerald-400/10'
                      : 'border-zinc-700 bg-zinc-950/40'
                  }`}
                >
                  <p className="truncate text-sm font-medium text-zinc-200">
                    {selection?.name || 'Drag the scenery package here'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {selection
                      ? `${selection.entries.length.toLocaleString()} files indexed · ${
                          selectedSimulator === 'xplane' ? 'X-Plane detected' : 'MSFS detected'
                        }`
                      : 'Or choose the folder below.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    disabled={isGenerating || isReadingDrop || generationPolicyBlocked}
                    className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:border-zinc-600 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isReadingDrop ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <FolderOpen className="h-4 w-4" />
                    )}
                    {selection ? 'Choose another folder' : 'Choose folder to start'}
                  </button>
                  <input
                    ref={folderInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFolderChange}
                    webkitdirectory=""
                    multiple
                    aria-label="Choose scenery package folder"
                  />
                </div>

                {isGenerating ? <GenerationProgress generation={generation} /> : null}

                {result ? (
                  <ResultPanel
                    result={result}
                    onDownload={handleDownload}
                    onDownloadDiagnostic={handleDiagnosticDownload}
                    onOpenEditor={handleOpenEditor}
                  />
                ) : null}
              </Card>
            </aside>
          </div>
        </div>
      </div>

      <Toast
        title="XML generator"
        description={error}
        variant="destructive"
        show={showErrorToast}
        onClose={() => {
          setShowErrorToast(false);
          setError('');
        }}
      />
      <Dialog
        open={showMsfsEditorDialog}
        onClose={() => {
          setShowMsfsEditorDialog(false);
          setMsfsAcknowledgementChecked(false);
        }}
        icon={TriangleAlert}
        iconColor="orange"
        title="MSFS Editor is Experimental"
        description="Some airport packages may not render completely or correctly. Review the generated scenery carefully before submitting, or use the legacy in-simulator workflow."
        maxWidth="lg"
        buttons={[
          {
            label: 'Continue with MSFS Editor',
            onClick: continueWithMsfsEditor,
            disabled: !msfsAcknowledgementChecked,
            className: 'min-w-0 flex-1 px-4 text-sm',
          },
          {
            label: 'Use Legacy XML',
            variant: 'outline',
            className: 'min-w-0 flex-1 px-4 text-sm',
            onClick: () => {
              setShowMsfsEditorDialog(false);
              navigate(`/contribute/test/${normalizedIcao}`);
            },
          },
        ]}
      >
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
            msfsAcknowledgementChecked
              ? 'border-emerald-500/35 bg-emerald-500/10'
              : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
          }`}
        >
          <input
            type="checkbox"
            checked={msfsAcknowledgementChecked}
            onChange={(event) => setMsfsAcknowledgementChecked(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-500"
          />
          <span className="text-sm leading-6 text-zinc-300">
            I understand the MSFS editor may be incomplete or incorrect.
          </span>
        </label>
      </Dialog>
    </Layout>
  );
};
// oxlint-enable react-doctor/no-giant-component react-doctor/no-high-complexity-react-function

function buildDivisionGeojson(points) {
  const features = [];
  for (const point of points) {
    const rawCoordinates = Array.isArray(point.coordinates)
      ? point.coordinates
      : point.coordinates
        ? [point.coordinates]
        : [];
    const coordinates = [];
    rawCoordinates.forEach((coordinate) => {
      if (Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lng)) {
        coordinates.push([coordinate.lng, coordinate.lat]);
      }
    });
    if (coordinates.length === 0) continue;

    features.push({
      type: 'Feature',
      properties: {
        featureType: 'division-original',
        divisionId: String(point.id ?? ''),
        divisionType: point.type || 'unknown',
        title: point.name || String(point.id || 'Division object'),
      },
      geometry:
        coordinates.length === 1
          ? { type: 'Point', coordinates: coordinates[0] }
          : { type: 'LineString', coordinates },
    });
  }
  return { type: 'FeatureCollection', features };
}

function GenerationProgress({ generation }) {
  return (
    <div
      className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm text-emerald-300">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        <span>{generation.stage}</span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-label="XML generation progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={generation.progress}
      >
        <div
          className="h-full rounded-full bg-emerald-400 transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-smooth-out)]"
          style={{ width: `${generation.progress}%` }}
        />
      </div>
    </div>
  );
}

function ResultPanel({ result, onDownload, onDownloadDiagnostic, onOpenEditor }) {
  const hasMatches = result.matchedCount > 0;
  const hasManualWork = result.manualCount > 0;

  return (
    <section className="mt-5 border-t border-zinc-800 pt-5" aria-labelledby="draft-result-title">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            hasMatches ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
          }`}
        >
          {hasMatches ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <TriangleAlert className="h-5 w-5" />
          )}
        </div>
        <div>
          <h2 id="draft-result-title" className="font-medium text-white">
            {hasMatches ? 'XML ready' : 'No automatic matches'}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
            {result.matchedCount} matched
            {hasManualWork ? ` · ${result.manualCount} need editing` : ''}
          </p>
        </div>
      </div>

      {hasManualWork ? (
        <div className="mt-4 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3">
          <p className="text-xs leading-relaxed text-rose-300">
            Red objects were not added to the XML. Add them in the editor.
          </p>
          <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
            {result.manualReview.map((item) => (
              <div key={`${item.id}:${item.type}`} className="rounded-md bg-zinc-950/60 px-3 py-2">
                <p className="truncate text-xs font-medium text-zinc-200">{item.name}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{formatType(item.type)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-3 border-t border-zinc-800 pt-5">
        <Button onClick={onOpenEditor} disabled={!hasMatches} className="w-full">
          Open editor
          <ArrowRight className="motion-forward h-4 w-4" />
        </Button>
        <Button onClick={onDownload} disabled={!hasMatches} variant="outline" className="w-full">
          <Download className="h-4 w-4" />
          Download XML
        </Button>
        {import.meta.env.DEV && result.diagnosticBlob ? (
          <Button onClick={onDownloadDiagnostic} variant="secondary" className="w-full">
            <Download className="h-4 w-4" />
            Download diagnostic JSON
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function hasScenerySource(entries) {
  return entries.some((entry) =>
    /(?:\.bgl|\.xml|\.dsf|(?:^|\/)apt\.dat)$/i.test(String(entry.path || '').replaceAll('\\', '/'))
  );
}

function formatType(type) {
  return String(type || 'object')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

GenerationProgress.propTypes = {
  generation: PropTypes.shape({
    stage: PropTypes.string.isRequired,
    progress: PropTypes.number.isRequired,
  }).isRequired,
};

ResultPanel.propTypes = {
  result: PropTypes.shape({
    matchedCount: PropTypes.number.isRequired,
    manualCount: PropTypes.number.isRequired,
    manualReview: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        type: PropTypes.string.isRequired,
      })
    ).isRequired,
    duplicateDivisionLeadOns: PropTypes.number.isRequired,
    duplicateSimulatorLeadOns: PropTypes.number.isRequired,
    simulator: PropTypes.oneOf(['msfs', 'xplane']).isRequired,
    sourceSummary: PropTypes.shape({
      aptDatSourceFile: PropTypes.string,
      aptDatFilesParsed: PropTypes.number,
      dsfFilesDecoded: PropTypes.number,
    }).isRequired,
    diagnosticBlob: PropTypes.instanceOf(Blob),
  }).isRequired,
  onDownload: PropTypes.func.isRequired,
  onDownloadDiagnostic: PropTypes.func.isRequired,
  onOpenEditor: PropTypes.func.isRequired,
};

export default XMLGenerator;
