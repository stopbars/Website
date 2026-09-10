/* oxlint-disable react-doctor/no-set-state-after-await-in-effect react-doctor/prefer-html-dialog -- Review generation owns AbortController cleanup; the full-screen portal implements focus and modal semantics. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Lightbulb,
  Loader,
  Palette,
  Route,
  SquarePen,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import XMLMap from '../shared/XMLMap';
import { Button } from '../shared/Button';
import { SimulatorBadge } from '../shared/SimulatorBadge';
import { IconSwap } from '../shared/IconSwap';
import { getVatsimToken } from '../../utils/cookieUtils';
import { publicationError } from '../../utils/contributionContracts.js';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

const COLOR_MODES = [
  { id: 'object', label: 'Unique objects' },
  { id: 'operational', label: 'Actual colors' },
  { id: 'type', label: 'Object types' },
  { id: 'directionality', label: 'Direction' },
];

const TYPE_LABELS = {
  stopbar: 'Stopbars',
  lead_on: 'Lead-ons',
  stand: 'Stand lights',
  taxiway: 'Taxiway lights',
  unknown: 'Unknown',
};

const TYPE_COLORS = {
  stopbar: '#fb7185',
  lead_on: '#facc15',
  stand: '#c084fc',
  taxiway: '#38bdf8',
  unknown: '#a1a1aa',
};

const EMPTY_REVIEW_SUMMARY = { lightCount: 0, typeCounts: {}, objectTypes: [], issues: [] };

const getText = (element, selector) => element?.querySelector(selector)?.textContent?.trim() || '';

const analyseContributionXml = (barsXml) => {
  if (!barsXml) return EMPTY_REVIEW_SUMMARY;

  const document = new DOMParser().parseFromString(barsXml, 'text/xml');
  if (document.querySelector('parsererror')) {
    return { ...EMPTY_REVIEW_SUMMARY, issues: ['The generated XML could not be parsed.'] };
  }

  const objects = [...document.getElementsByTagName('BarsObject')];
  const typeCounts = {};
  const issues = [];
  let lightCount = 0;
  let emptyObjects = 0;
  let invalidPositions = 0;

  objects.forEach((object) => {
    const type = object.getAttribute('type') || 'unknown';
    const lights = [...object.getElementsByTagName('Light')];
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    lightCount += lights.length;
    if (lights.length === 0) emptyObjects += 1;

    lights.forEach((light) => {
      const position = getText(light, 'Position').split(',').map(Number);
      if (position.length !== 2 || position.some((value) => !Number.isFinite(value))) {
        invalidPositions += 1;
      }
    });
  });

  if (objects.length === 0) issues.push('No BARS objects were generated.');
  if (lightCount === 0) issues.push('No lights were generated.');
  if (emptyObjects) {
    issues.push(`${emptyObjects} object${emptyObjects === 1 ? '' : 's'} contain no lights.`);
  }
  if (invalidPositions) {
    issues.push(
      `${invalidPositions} light${invalidPositions === 1 ? '' : 's'} have no valid position.`
    );
  }
  if (typeCounts.unknown) {
    issues.push(
      `${typeCounts.unknown} object${typeCounts.unknown === 1 ? '' : 's'} use an unknown type.`
    );
  }

  return { lightCount, typeCounts, objectTypes: Object.keys(typeCounts).sort(), issues };
};

const formatXml = (xml) => {
  const withBreaks = xml.replace(/(>)(<)(\/*)/g, '$1\r\n$2$3');
  let depth = 0;

  return withBreaks
    .split('\r\n')
    .map((node) => {
      if (/^<\/\w/.test(node)) depth = Math.max(0, depth - 1);
      const formatted = `${'  '.repeat(depth)}${node}`;
      if (/^<\w[^>]*[^/]>.*$/.test(node) && !/.+<\/\w[^>]*>$/.test(node)) depth += 1;
      return formatted;
    })
    .join('\r\n');
};

const downloadXml = (xml, fileName) => {
  const url = URL.createObjectURL(new Blob([formatXml(xml)], { type: 'application/xml' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const ToolbarButton = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={active}
    title={label}
    onClick={onClick}
    className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg transition-[background-color,color,transform] duration-[var(--duration-quick)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${
      active ? 'bg-blue-500 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
    }`}
  >
    <Icon className="h-4 w-4" aria-hidden="true" />
  </button>
);

ToolbarButton.propTypes = {
  active: PropTypes.bool.isRequired,
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
};

const ObjectInspector = ({ object, onClear }) => {
  if (!object) {
    return (
      <div className="rounded-xl bg-zinc-900/55 px-4 py-5 text-center shadow-[inset_0_0_0_1px_oklch(1_0_0/0.06)]">
        <p className="text-sm font-medium text-zinc-300">No object selected</p>
        <p className="mt-1 text-xs text-zinc-500">Select a light or path on the map.</p>
      </div>
    );
  }

  const properties = [
    ['Type', TYPE_LABELS[object.type] || object.type],
    ['Lights', object.lightCount],
    ['Color', object.color],
    ['Direction', object.directionality],
    ['Orientation', object.orientation],
    ['Elevated', object.elevated ? 'Yes' : null],
    ['IHP', object.ihp ? 'Yes' : null],
  ].filter(([, value]) => value !== '' && value !== null && value !== undefined);

  return (
    <section
      aria-labelledby="selected-object-heading"
      className="rounded-xl bg-zinc-900/70 p-4 shadow-[inset_0_0_0_1px_oklch(0.623_0.214_259.815/0.3)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-blue-400">
            Selected object
          </p>
          <h3 id="selected-object-heading" className="mt-1 break-all font-mono text-sm text-white">
            {object.id}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
          aria-label="Clear selected object"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {properties.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="mt-0.5 break-words text-sm text-zinc-200">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

ObjectInspector.propTypes = {
  object: PropTypes.shape({
    id: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    lightCount: PropTypes.number.isRequired,
    color: PropTypes.string,
    directionality: PropTypes.string,
    orientation: PropTypes.string,
    elevated: PropTypes.bool,
    ihp: PropTypes.bool,
  }),
  onClear: PropTypes.func.isRequired,
};

const ContributionDetails = ({
  contribution,
  isPending,
  packageName,
  packageNameIsValid,
  isEditingPackage,
  notesCopied,
  onEditPackage,
  onPackageNameChange,
  onCopyNotes,
  onDownload,
}) => (
  <details className="group rounded-xl bg-zinc-900/45 shadow-[inset_0_0_0_1px_oklch(1_0_0/0.06)]">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-3 text-sm font-medium text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70">
      Contribution details
      <ChevronDown
        className="h-4 w-4 text-zinc-500 transition-transform duration-[var(--duration-quick)] group-open:rotate-180"
        aria-hidden="true"
      />
    </summary>
    <div className="space-y-4 px-3 pb-3">
      <div className="flex items-start gap-3">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
        <div className="min-w-0 text-sm">
          <p className="truncate text-zinc-200">
            {contribution.userDisplayName || contribution.userId}
          </p>
          {contribution.userDisplayName && (
            <p className="mt-0.5 font-mono text-xs text-zinc-500">CID {contribution.userId}</p>
          )}
          <p className="mt-1 text-xs text-zinc-500">
            {new Date(contribution.submissionDate).toLocaleString()}
          </p>
        </div>
      </div>

      <div>
        <div className="flex min-h-8 items-center justify-between gap-2">
          <p className="text-xs text-zinc-500">Package name</p>
          {isPending && (
            <button
              type="button"
              onClick={onEditPackage}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              aria-label={isEditingPackage ? 'Finish editing package name' : 'Edit package name'}
            >
              {isEditingPackage ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <SquarePen className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
        {isEditingPackage ? (
          <>
            <input
              aria-label="Updated package name"
              aria-invalid={!packageNameIsValid}
              value={packageName}
              onChange={(event) => onPackageNameChange(event.target.value)}
              className="min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-400/70 sm:text-sm"
            />
            {!packageNameIsValid && (
              <p className="mt-1 text-xs text-red-400">Enter a package name.</p>
            )}
          </>
        ) : (
          <p className="break-words text-sm text-zinc-200">{packageName}</p>
        )}
      </div>

      {contribution.notes && (
        <div>
          <div className="flex min-h-8 items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">Contributor notes</p>
            <button
              type="button"
              onClick={onCopyNotes}
              className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
              aria-label="Copy contributor notes"
            >
              {notesCopied ? (
                <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">
            {contribution.notes}
          </p>
        </div>
      )}

      <Button variant="outline" className="w-full px-3 py-2 text-sm" onClick={onDownload}>
        <Download className="h-4 w-4" aria-hidden="true" />
        Download submitted XML
      </Button>
    </div>
  </details>
);

ContributionDetails.propTypes = {
  contribution: PropTypes.shape({
    userId: PropTypes.string.isRequired,
    userDisplayName: PropTypes.string,
    submissionDate: PropTypes.string.isRequired,
    notes: PropTypes.string,
  }).isRequired,
  isPending: PropTypes.bool.isRequired,
  packageName: PropTypes.string.isRequired,
  packageNameIsValid: PropTypes.bool.isRequired,
  isEditingPackage: PropTypes.bool.isRequired,
  notesCopied: PropTypes.bool.isRequired,
  onEditPackage: PropTypes.func.isRequired,
  onPackageNameChange: PropTypes.func.isRequired,
  onCopyNotes: PropTypes.func.isRequired,
  onDownload: PropTypes.func.isRequired,
};

// oxlint-disable-next-line react-doctor/no-giant-component, react-doctor/no-high-complexity-react-function, react-doctor/prefer-useReducer -- The portal keeps its focus trap, map generation and decision transaction in one lifecycle; visual sections are split into focused components above.
const ContributionReviewWorkspace = ({ contribution, onClose, onApprove, onReject }) => {
  const workspaceRef = useRef(null);
  const previousFocusRef = useRef(null);
  const copyTimerRef = useRef(null);
  const [generatedFiles, setGeneratedFiles] = useState(null);
  const [generationError, setGenerationError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [updatedPackageName, setUpdatedPackageName] = useState(contribution.packageName);
  const [isEditingPackage, setIsEditingPackage] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const [approveConfirmation, setApproveConfirmation] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [colorMode, setColorMode] = useState('object');
  const [selectedObject, setSelectedObject] = useState(null);
  const [layers, setLayers] = useState({ lights: true, paths: true, removeAreas: false });
  const [visibleTypes, setVisibleTypes] = useState([]);
  const visibleTypeSet = useMemo(() => new Set(visibleTypes), [visibleTypes]);

  const isBusy = isApproving || isRejecting;
  const isPending = contribution.status === 'pending';
  const packageNameIsValid = updatedPackageName.trim().length > 0;
  const summary = useMemo(
    () => analyseContributionXml(generatedFiles?.barsXml),
    [generatedFiles?.barsXml]
  );

  const copyValue = useCallback((field, value) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedField(''), 1800);
  }, []);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  useEffect(() => {
    const controller = new AbortController();
    const generateReviewFiles = async () => {
      setIsGenerating(true);
      setGenerationError('');

      try {
        const formData = new FormData();
        formData.append(
          'xmlFile',
          new Blob([contribution.submittedXml], { type: 'application/xml' }),
          `${contribution.airportIcao}_contribution.xml`
        );
        formData.append('icao', contribution.airportIcao);
        formData.append('simulator', contribution.simulator);

        const response = await fetch('https://v2.stopbars.com/supports/generate', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Unable to generate the review map.');
        }

        const data = await response.json();
        const files = { supportsXml: data.supportsXml, barsXml: data.barsXml };
        setVisibleTypes(analyseContributionXml(files.barsXml).objectTypes);
        setGeneratedFiles(files);
      } catch (error) {
        if (error.name !== 'AbortError') setGenerationError(error.message);
      } finally {
        if (!controller.signal.aborted) setIsGenerating(false);
      }
    };

    generateReviewFiles();
    return () => controller.abort();
  }, [contribution.airportIcao, contribution.simulator, contribution.submittedXml]);

  const requestClose = useCallback(() => {
    if (!isBusy) onClose();
  }, [isBusy, onClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = setTimeout(() => workspaceRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !workspaceRef.current) return;

      const focusable = [...workspaceRef.current.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (!focusable.length) {
        event.preventDefault();
        workspaceRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [requestClose]);

  const submitDecision = async (approved) => {
    const setLoading = approved ? setIsApproving : setIsRejecting;
    setLoading(true);
    setDecisionError('');

    try {
      const packageChanged = updatedPackageName !== contribution.packageName;
      const response = await fetch(
        `https://v2.stopbars.com/contributions/${contribution.id}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Vatsim-Token': getVatsimToken() },
          body: JSON.stringify({
            approved,
            ...(!approved && { rejectionReason: rejectionReason.trim() }),
            ...(packageChanged && { newPackageName: updatedPackageName.trim() }),
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.error || `Unable to ${approved ? 'approve' : 'reject'} contribution.`
        );
      }

      const decision = await response.json();
      if (approved) {
        const error = publicationError(decision);
        if (error) throw new Error(error);
      }

      await (approved ? onApprove() : onReject());
      onClose();
    } catch (error) {
      setDecisionError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleType = (type) => {
    setVisibleTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
    );
    if (selectedObject?.type === type && visibleTypes.includes(type)) setSelectedObject(null);
  };

  return createPortal(
    <div
      ref={workspaceRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contribution-review-title"
      className="fixed inset-0 z-[70] flex min-h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100 focus:outline-none"
    >
      <header className="flex min-h-[4.25rem] shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950/95 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={requestClose}
            disabled={isBusy}
            className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 disabled:opacity-50"
            aria-label="Close contribution review"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                id="contribution-review-title"
                className="truncate text-base font-semibold text-white sm:text-lg"
              >
                {contribution.airportIcao} review
              </h2>
              <SimulatorBadge simulator={contribution.simulator} size="sm" />
              {isGenerating && (
                <Loader
                  className="h-3.5 w-3.5 animate-spin text-zinc-500"
                  aria-label="Loading map"
                />
              )}
            </div>
            <p className="truncate text-xs text-zinc-500 sm:text-sm">{updatedPackageName}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-1.5">
          <code className="hidden max-w-48 truncate rounded-md bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-500 md:block">
            {contribution.id}
          </code>
          <button
            type="button"
            onClick={() => copyValue('id', contribution.id)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
            aria-label="Copy contribution ID"
          >
            <IconSwap active={copiedField === 'id'}>
              <Copy className="h-4 w-4" />
              <Check className="h-4 w-4 text-emerald-400" />
            </IconSwap>
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:overflow-hidden">
        <main className="relative min-h-[58dvh] overflow-hidden bg-black lg:min-h-0">
          {generatedFiles?.barsXml ? (
            <XMLMap
              xmlData={generatedFiles.barsXml}
              removeAreasXmlData={generatedFiles.supportsXml}
              height="100%"
              showLights={layers.lights}
              showPolyLines={layers.paths}
              showRemoveAreas={layers.removeAreas}
              colorMode={colorMode}
              visibleTypes={visibleTypes}
              selectedObjectId={selectedObject?.id}
              onObjectSelect={setSelectedObject}
              styleControlPosition="bottom-right"
            />
          ) : (
            <div className="flex h-full min-h-[58dvh] items-center justify-center p-6 lg:min-h-0">
              {generationError ? (
                <div className="max-w-sm rounded-xl bg-zinc-900 p-5 text-center shadow-[inset_0_0_0_1px_oklch(1_0_0/0.08)]">
                  <AlertTriangle className="mx-auto h-6 w-6 text-amber-400" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-white">Unable to generate the map</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">{generationError}</p>
                </div>
              ) : (
                <Loader
                  className="h-7 w-7 animate-spin text-blue-400"
                  aria-label="Generating review map"
                />
              )}
            </div>
          )}

          {generatedFiles?.barsXml && (
            <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
              <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-xl bg-zinc-950/90 p-1.5 shadow-[0_12px_36px_oklch(0_0_0/0.38),inset_0_0_0_1px_oklch(1_0_0/0.1)] backdrop-blur-md">
                <div className="relative flex min-h-10 items-center gap-2 rounded-lg bg-zinc-900 px-2.5">
                  <Palette className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                  <label htmlFor="review-color-mode" className="sr-only">
                    Map colors
                  </label>
                  <select
                    id="review-color-mode"
                    value={colorMode}
                    onChange={(event) => setColorMode(event.target.value)}
                    className="min-h-10 appearance-none bg-transparent pe-5 text-sm font-medium text-zinc-200 focus:outline-none"
                  >
                    {COLOR_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id} className="bg-zinc-900">
                        {mode.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute end-2 h-3.5 w-3.5 text-zinc-600"
                    aria-hidden="true"
                  />
                </div>
                <ToolbarButton
                  active={layers.lights}
                  icon={Lightbulb}
                  label="Toggle lights"
                  onClick={() => setLayers((current) => ({ ...current, lights: !current.lights }))}
                />
                <ToolbarButton
                  active={layers.paths}
                  icon={Route}
                  label="Toggle object paths"
                  onClick={() => setLayers((current) => ({ ...current, paths: !current.paths }))}
                />
                <ToolbarButton
                  active={layers.removeAreas}
                  icon={XCircle}
                  label="Toggle removal areas"
                  onClick={() =>
                    setLayers((current) => ({ ...current, removeAreas: !current.removeAreas }))
                  }
                />
              </div>
            </div>
          )}
        </main>

        <aside
          aria-label="Contribution review"
          className="flex min-h-0 flex-col border-t border-white/10 bg-zinc-950 lg:border-s lg:border-t-0"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
            <section aria-labelledby="objects-heading">
              <div className="flex min-h-9 items-center justify-between gap-3">
                <h3 id="objects-heading" className="text-sm font-semibold text-white">
                  Objects
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setVisibleTypes(
                      visibleTypes.length === summary.objectTypes.length ? [] : summary.objectTypes
                    );
                    setSelectedObject(null);
                  }}
                  className="min-h-8 rounded-md px-2 text-xs font-medium text-zinc-400 hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70"
                >
                  {visibleTypes.length === summary.objectTypes.length ? 'Hide all' : 'Show all'}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {summary.objectTypes.map((type) => {
                  const active = visibleTypeSet.has(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleType(type)}
                      className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-medium active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 ${active ? 'bg-zinc-800 text-white' : 'bg-zinc-900/60 text-zinc-500'}`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: TYPE_COLORS[type] || TYPE_COLORS.unknown }}
                        aria-hidden="true"
                      />
                      {TYPE_LABELS[type] || type}
                      <span className="tabular-nums text-zinc-500">{summary.typeCounts[type]}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <ObjectInspector object={selectedObject} onClear={() => setSelectedObject(null)} />

            {summary.issues.length > 0 && (
              <details className="group rounded-xl bg-amber-500/7 shadow-[inset_0_0_0_1px_oklch(0.769_0.188_70.08/0.18)]">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-medium text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  {summary.issues.length} warning{summary.issues.length === 1 ? '' : 's'}
                  <ChevronDown
                    className="ms-auto h-4 w-4 transition-transform duration-[var(--duration-quick)] group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <ul className="space-y-1 px-3 pb-3 text-xs leading-5 text-amber-100/75">
                  {summary.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </details>
            )}

            {!isPending && (
              <section
                className={`rounded-xl p-3 ${contribution.status === 'approved' ? 'bg-emerald-500/8' : contribution.status === 'rejected' ? 'bg-red-500/8' : 'bg-zinc-900/60'}`}
              >
                <p className="text-sm font-medium capitalize text-white">{contribution.status}</p>
                {contribution.decisionDate && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {new Date(contribution.decisionDate).toLocaleString()}
                  </p>
                )}
                {contribution.status === 'rejected' && (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                    {contribution.rejectionReason || 'No rejection reason was recorded.'}
                  </p>
                )}
              </section>
            )}

            <ContributionDetails
              contribution={contribution}
              isPending={isPending}
              packageName={updatedPackageName}
              packageNameIsValid={packageNameIsValid}
              isEditingPackage={isEditingPackage}
              notesCopied={copiedField === 'notes'}
              onEditPackage={() => setIsEditingPackage((current) => !current)}
              onPackageNameChange={setUpdatedPackageName}
              onCopyNotes={() => copyValue('notes', contribution.notes)}
              onDownload={() =>
                downloadXml(contribution.submittedXml, `${contribution.airportIcao}_submitted.xml`)
              }
            />
          </div>

          {isPending && (
            <section
              aria-label="Decision"
              className="shrink-0 border-t border-white/10 bg-zinc-950 p-4 shadow-[0_-16px_36px_oklch(0_0_0/0.22)]"
            >
              {decisionError && (
                <p
                  id="review-decision-error"
                  role="alert"
                  className="mb-3 rounded-lg bg-red-500/10 p-2.5 text-sm text-red-300"
                >
                  {decisionError}
                </p>
              )}
              {approveConfirmation ? (
                <div className="rounded-xl bg-emerald-500/8 p-3 shadow-[inset_0_0_0_1px_oklch(0.696_0.17_162.48/0.22)]">
                  <p className="text-sm font-medium text-emerald-200">Publish this contribution?</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setApproveConfirmation(false)}
                      disabled={isBusy}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                      onClick={() => submitDecision(true)}
                      disabled={isBusy || !packageNameIsValid}
                    >
                      {isApproving ? (
                        <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      )}
                      Approve
                    </Button>
                  </div>
                </div>
              ) : showRejectForm ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!rejectionReason.trim()) {
                      setDecisionError('Enter a rejection reason.');
                      return;
                    }
                    submitDecision(false);
                  }}
                >
                  <label
                    htmlFor="review-rejection-reason"
                    className="text-sm font-medium text-white"
                  >
                    Rejection reason
                  </label>
                  <textarea
                    id="review-rejection-reason"
                    value={rejectionReason}
                    onChange={(event) => {
                      setRejectionReason(event.target.value);
                      if (decisionError === 'Enter a rejection reason.') setDecisionError('');
                    }}
                    aria-invalid={decisionError === 'Enter a rejection reason.'}
                    aria-describedby={
                      decisionError === 'Enter a rejection reason.'
                        ? 'review-decision-error'
                        : undefined
                    }
                    rows={3}
                    required
                    className="mt-2 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base text-white focus:outline-none focus:ring-2 focus:ring-red-400/70 sm:text-sm"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowRejectForm(false)}
                      disabled={isBusy}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="destructive"
                      disabled={isBusy || !packageNameIsValid}
                    >
                      {isRejecting ? (
                        <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                      )}
                      Reject
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    onClick={() => setShowRejectForm(true)}
                    disabled={isBusy}
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    Reject
                  </Button>
                  <Button
                    className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                    onClick={() => setApproveConfirmation(true)}
                    disabled={
                      isBusy ||
                      isGenerating ||
                      !!generationError ||
                      summary.lightCount === 0 ||
                      !packageNameIsValid
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Approve
                  </Button>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>,
    document.body
  );
};

ContributionReviewWorkspace.propTypes = {
  contribution: PropTypes.shape({
    id: PropTypes.string.isRequired,
    airportIcao: PropTypes.string.isRequired,
    packageName: PropTypes.string.isRequired,
    userId: PropTypes.string.isRequired,
    userDisplayName: PropTypes.string,
    simulator: PropTypes.string,
    submittedXml: PropTypes.string.isRequired,
    notes: PropTypes.string,
    submissionDate: PropTypes.string.isRequired,
    status: PropTypes.oneOf(['pending', 'approved', 'rejected', 'outdated']).isRequired,
    rejectionReason: PropTypes.string,
    decisionDate: PropTypes.string,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onApprove: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
};

export default ContributionReviewWorkspace;
