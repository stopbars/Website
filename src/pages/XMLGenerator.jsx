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
  LockKeyhole,
  RefreshCcw,
  TriangleAlert,
} from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Toast } from '../components/shared/Toast';
import { Breadcrumb, BreadcrumbItem } from '../components/shared/Breadcrumb';
import { PageLoading } from '../components/shared/PageLoading';
import DraftGeneratorMap from '../features/draft-generator/DraftGeneratorMap';
import { selectionFromDrop, selectionFromInput } from '../features/draft-generator/local-package';
import {
  fetchContributionPolicy,
  getContributionDisabledMessage,
} from '../utils/contributionPolicy';

// This workflow coordinates upload, worker progress, preview, and export in one cohesive screen.
// oxlint-disable react-doctor/no-giant-component
const XMLGenerator = () => {
  const { icao: urlIcao } = useParams();
  const navigate = useNavigate();
  const folderInputRef = useRef(null);
  const workerRef = useRef(null);
  const requestIdRef = useRef(0);
  const normalizedIcao = useMemo(() => urlIcao?.trim().toUpperCase() || '', [urlIcao]);

  const [airport, setAirport] = useState(null);
  const [divisionPoints, setDivisionPoints] = useState([]);
  const [contributionPolicy, setContributionPolicy] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
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

  const contributionsDisabled =
    contributionPolicy?.managed && !contributionPolicy?.contributionsEnabled;
  const generationPolicyBlocked = contributionsDisabled && !import.meta.env.DEV;
  const disabledContributionMessage = getContributionDisabledMessage(contributionPolicy);
  const isGenerating = generation.status === 'running';
  const draftFileName = `${normalizedIcao || 'airport'}-Draft.xml`;
  const divisionGeojson = useMemo(() => buildDivisionGeojson(divisionPoints), [divisionPoints]);

  useEffect(() => {
    if (!normalizedIcao || !/^[A-Z0-9]{4}$/.test(normalizedIcao)) {
      navigate('/contribute/new', { state: { error: 'airport_load_failed' } });
      return undefined;
    }

    const controller = new AbortController();
    const loadData = async () => {
      setLoadingData(true);
      try {
        const [airportResponse, pointsResponse, policy] = await Promise.all([
          fetch(`https://v2.stopbars.com/airports?icao=${normalizedIcao}`, {
            signal: controller.signal,
          }),
          fetch(`https://v2.stopbars.com/airports/${normalizedIcao}/points`, {
            signal: controller.signal,
          }),
          fetchContributionPolicy(normalizedIcao),
        ]);
        if (!airportResponse.ok || !pointsResponse.ok) {
          throw new Error('Failed to load airport data');
        }

        const [airportData, pointsData] = await Promise.all([
          airportResponse.json(),
          pointsResponse.json(),
        ]);
        if (!Array.isArray(pointsData) || pointsData.length === 0) {
          navigate(`/contribute/map/${normalizedIcao}`);
          return;
        }

        setAirport({
          icao: airportData.icao,
          name: airportData.name,
          latitude: airportData.latitude,
          longitude: airportData.longitude,
          elevation_m: airportData.elevation_m,
        });
        setDivisionPoints(
          pointsData.map((point) => ({
            id: point.id,
            type: point.type,
            name: point.name,
            coordinates: point.coordinates,
            directionality: point.directionality,
            color: point.color || undefined,
            elevated: point.elevated,
            ihp: point.ihp,
          }))
        );
        setContributionPolicy(policy);
      } catch (loadError) {
        if (loadError.name === 'AbortError') return;
        console.error(loadError);
        navigate('/contribute/new', { state: { error: 'airport_load_failed' } });
      } finally {
        if (!controller.signal.aborted) setLoadingData(false);
      }
    };

    loadData();
    return () => controller.abort();
  }, [navigate, normalizedIcao]);

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

  const applySelection = useCallback((nextSelection) => {
    if (!nextSelection?.entries?.length) {
      throw new Error('No files were found. Choose the airport package or its scenery folder.');
    }
    setSelection(nextSelection);
    setResult(null);
    setGeneration({ status: 'idle', stage: '', progress: 0 });
  }, []);

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
    if (isGenerating) return;

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

  const handleGenerate = () => {
    if (!selection || !airport || generationPolicyBlocked || isGenerating) return;

    terminateWorker();
    setResult(null);
    setGeneration({ status: 'running', stage: 'Starting local generator', progress: 3 });
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
        setGeneration({ status: 'complete', stage: 'Draft ready', progress: 100 });
        terminateWorker();
        return;
      }
      if (message.type === 'error') {
        setGeneration({ status: 'error', stage: '', progress: 0 });
        showError(message.error || 'The draft could not be generated.');
        terminateWorker();
      }
    };
    worker.onerror = (event) => {
      setGeneration({ status: 'error', stage: '', progress: 0 });
      showError(event.message || 'The local generator stopped unexpectedly.');
      terminateWorker();
    };
    worker.postMessage({
      type: 'generate',
      id: requestId,
      entries: selection.entries,
      icao: normalizedIcao,
      altitude: Number.isFinite(airport.elevation_m) ? airport.elevation_m : 0,
      divisionPoints,
    });
  };

  const handleDownload = () => {
    if (!result?.xmlBlob || result.matchedCount === 0) return;
    downloadBlob(result.xmlBlob, draftFileName);
  };

  const handleContinue = async () => {
    if (!result?.xmlBlob || result.matchedCount === 0) return;
    const draftXml = await result.xmlBlob.text();
    navigate(`/contribute/test/${normalizedIcao}`, {
      state: { draftXml, draftFileName },
    });
  };

  if (loadingData) {
    return <PageLoading page label="Loading draft generator…" />;
  }

  return (
    <Layout>
      <main className="min-h-screen pb-20 pt-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-8 mt-6">
            <Breadcrumb>
              <BreadcrumbItem title="Map" link={`/contribute/map/${normalizedIcao}`} />
              <BreadcrumbItem title="Draft generator" />
            </Breadcrumb>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  Draft generator
                </h1>
                <p className="mt-2 text-sm text-zinc-400">
                  {airport?.icao} · {airport?.name}
                </p>
              </div>
              {result ? (
                <p className="text-sm text-zinc-500">
                  Generated locally in {result.elapsedSeconds}s
                </p>
              ) : null}
            </div>
          </div>

          {contributionsDisabled ? (
            <div className="mb-6 flex items-start rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <AlertCircle className="mr-3 h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm text-amber-300">{disabledContributionMessage}</p>
                {import.meta.env.DEV ? (
                  <p className="mt-1 text-xs text-amber-200">
                    Draft generation is temporarily enabled in local development.
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
              bounds={result?.bounds}
            />

            <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <FileCode2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="font-medium text-white">Scenery package</h2>
                    <p className="text-xs text-zinc-500">MSFS package or scenery folder</p>
                  </div>
                </div>

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
                    {selection?.name || 'Choose your scenery folder'}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {selection
                      ? `${selection.entries.length.toLocaleString()} files indexed`
                      : 'You can also drag the folder here.'}
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
                    {selection ? 'Choose another folder' : 'Choose scenery folder'}
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

                <div className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-zinc-500">
                  <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <span>
                    Scenery data is processed on this device and does not leave your browser.
                  </span>
                </div>

                {isGenerating ? (
                  <GenerationProgress generation={generation} />
                ) : (
                  <Button
                    onClick={handleGenerate}
                    disabled={!selection || generationPolicyBlocked}
                    className="mt-5 w-full"
                  >
                    {result ? (
                      <RefreshCcw className="h-4 w-4" />
                    ) : (
                      <FileCode2 className="h-4 w-4" />
                    )}
                    {result ? 'Generate again' : 'Generate draft'}
                  </Button>
                )}
              </Card>

              {result ? (
                <ResultPanel
                  result={result}
                  onDownload={handleDownload}
                  onContinue={handleContinue}
                />
              ) : null}
            </aside>
          </div>
        </div>
      </main>

      <Toast
        title="Draft generator"
        description={error}
        variant="destructive"
        show={showErrorToast}
        onClose={() => {
          setShowErrorToast(false);
          setError('');
        }}
      />
    </Layout>
  );
};
// oxlint-enable react-doctor/no-giant-component

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
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm text-emerald-300">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        <span>{generation.stage}</span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-label="Draft generation progress"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={generation.progress}
      >
        <div
          className="h-full rounded-full bg-emerald-400 transition-[width] duration-500 ease-out"
          style={{ width: `${generation.progress}%` }}
        />
      </div>
    </div>
  );
}

function ResultPanel({ result, onDownload, onContinue }) {
  const hasMatches = result.matchedCount > 0;
  const hasManualWork = result.manualCount > 0;
  const hasRemovalReview = result.removalReview.length > 0;
  const consolidatedObjects = result.duplicateDivisionLeadOns + result.duplicateSimulatorLeadOns;

  return (
    <Card className="p-5">
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
          <h2 className="font-medium text-white">
            {hasMatches ? 'Draft ready' : 'No automatic matches'}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            {result.matchedCount} matched
            {hasManualWork ? ` · ${result.manualCount} need manual work` : ' · no missing objects'}
          </p>
        </div>
      </div>

      {hasManualWork ? (
        <div className="mt-4 rounded-lg border border-rose-500/25 bg-rose-500/5 p-3">
          <p className="text-xs leading-relaxed text-rose-300">
            Red objects were not added to the XML. Add them manually during scenery editing.
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

      {hasRemovalReview ? (
        <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
          <p className="text-xs leading-relaxed text-amber-200">
            {result.removalReview.length} matched{' '}
            {result.removalReview.length === 1 ? 'object was' : 'objects were'} added to the XML,
            but the automatic remover was skipped to protect nearby simulator lighting. Review the
            amber geometry during testing.
          </p>
        </div>
      ) : null}

      {consolidatedObjects > 0 ? (
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
          {consolidatedObjects} overlapping{' '}
          {consolidatedObjects === 1 ? 'object was' : 'objects were'} consolidated before matching.
        </p>
      ) : null}

      <div className="mt-5 space-y-3 border-t border-zinc-800 pt-5">
        <Button onClick={onDownload} disabled={!hasMatches} variant="secondary" className="w-full">
          <Download className="h-4 w-4" />
          Download XML
        </Button>
        <Button onClick={onContinue} disabled={!hasMatches} className="w-full">
          Continue to testing
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
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
    removalReview: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        type: PropTypes.string.isRequired,
      })
    ).isRequired,
    duplicateDivisionLeadOns: PropTypes.number.isRequired,
    duplicateSimulatorLeadOns: PropTypes.number.isRequired,
  }).isRequired,
  onDownload: PropTypes.func.isRequired,
  onContinue: PropTypes.func.isRequired,
};

export default XMLGenerator;
