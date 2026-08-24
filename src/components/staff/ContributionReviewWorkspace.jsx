/* oxlint-disable react-doctor/no-set-state-after-await-in-effect react-doctor/prefer-html-dialog react-doctor/js-set-map-lookups -- Review generation owns AbortController cleanup; the full-screen portal implements focus and modal semantics, and visibility lookup is a tiny bounded list. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileCode2,
  Lightbulb,
  Loader,
  Route,
  SquarePen,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import XMLMap from '../shared/XMLMap';
import { Button } from '../shared/Button';
import { SimulatorBadge } from '../shared/SimulatorBadge';
import { getVatsimToken } from '../../utils/cookieUtils';
import { publicationError } from '../../utils/contributionContracts.js';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const COLOR_MODES = [
  {
    id: 'operational',
    label: 'Actual colors',
    description: 'As the lights will appear in the simulator.',
  },
  {
    id: 'type',
    label: 'Object type',
    description: 'Separates stopbars, lead-ons, stands and taxiway lights.',
  },
  {
    id: 'directionality',
    label: 'Direction',
    description: 'Green is bidirectional, orange is directional, grey is unspecified.',
  },
];

const TYPE_LABELS = {
  stopbar: 'Stopbars',
  lead_on: 'Lead-ons',
  stand: 'Stand lights',
  taxiway: 'Taxiway lights',
};

const TYPE_COLORS = {
  stopbar: '#fb7185',
  lead_on: '#facc15',
  stand: '#c084fc',
  taxiway: '#38bdf8',
};

const EMPTY_REVIEW_SUMMARY = {
  objectCount: 0,
  lightCount: 0,
  removeAreaCount: 0,
  typeCounts: {},
  objectTypes: [],
  directionalCount: 0,
  bidirectionalCount: 0,
  elevatedCount: 0,
  ihpCount: 0,
  issues: [],
};

const getText = (element, selector) => element?.querySelector(selector)?.textContent?.trim() || '';

const analyseContributionXml = (barsXml, supportsXml) => {
  if (!barsXml) return EMPTY_REVIEW_SUMMARY;

  const parser = new DOMParser();
  const document = parser.parseFromString(barsXml, 'text/xml');
  if (document.querySelector('parsererror')) {
    return {
      ...EMPTY_REVIEW_SUMMARY,
      issues: ['The generated BARS XML could not be parsed.'],
    };
  }

  const objects = [...document.getElementsByTagName('BarsObject')];
  const typeCounts = {};
  let lightCount = 0;
  let directionalCount = 0;
  let bidirectionalCount = 0;
  let elevatedCount = 0;
  let ihpCount = 0;
  let objectsWithoutLights = 0;
  let lightsWithoutPosition = 0;

  objects.forEach((object) => {
    const type = object.getAttribute('type') || 'unknown';
    const objectProperties = object.querySelector(':scope > Properties');
    const objectDirectionality = getText(objectProperties, 'Directionality').toLowerCase();
    const objectOrientation = getText(objectProperties, 'Orientation').toLowerCase();
    const objectElevated = getText(objectProperties, 'Elevated') === 'true';
    const objectIhp = getText(objectProperties, 'IHP') === 'true';
    const lights = [...object.getElementsByTagName('Light')];

    typeCounts[type] = (typeCounts[type] || 0) + lights.length;
    lightCount += lights.length;
    if (lights.length === 0) objectsWithoutLights += 1;

    lights.forEach((light) => {
      const properties = light.querySelector('Properties');
      const directionality = (
        getText(properties, 'Directionality') ||
        objectDirectionality ||
        getText(properties, 'Orientation') ||
        objectOrientation
      ).toLowerCase();

      if (
        directionality === 'bi-directional' ||
        directionality === 'bi' ||
        directionality === 'both'
      ) {
        bidirectionalCount += 1;
      } else if (directionality) {
        directionalCount += 1;
      }

      if (getText(properties, 'Elevated') === 'true' || objectElevated) elevatedCount += 1;
      if (getText(properties, 'IHP') === 'true' || objectIhp) ihpCount += 1;

      const position = getText(light, 'Position')
        .split(',')
        .map((value) => Number(value));
      if (position.length !== 2 || position.some((value) => !Number.isFinite(value))) {
        lightsWithoutPosition += 1;
      }
    });
  });

  const issues = [];
  if (objects.length === 0) issues.push('No BARS objects were generated.');
  if (lightCount === 0) issues.push('No lights were generated.');
  if (objectsWithoutLights > 0) {
    issues.push(
      `${objectsWithoutLights} object${objectsWithoutLights === 1 ? '' : 's'} contain no lights.`
    );
  }
  if (lightsWithoutPosition > 0) {
    issues.push(
      `${lightsWithoutPosition} light${lightsWithoutPosition === 1 ? '' : 's'} have no valid position.`
    );
  }
  if (typeCounts.unknown) {
    issues.push(
      `${typeCounts.unknown} light${typeCounts.unknown === 1 ? '' : 's'} use an unknown object type.`
    );
  }

  let removeAreaCount = 0;
  if (supportsXml) {
    const supportsDocument = parser.parseFromString(supportsXml, 'text/xml');
    if (!supportsDocument.querySelector('parsererror')) {
      removeAreaCount = supportsDocument.getElementsByTagName('LightSupport').length;
    }
  }

  return {
    objectCount: objects.length,
    lightCount,
    removeAreaCount,
    typeCounts,
    objectTypes: Object.keys(typeCounts).sort(),
    directionalCount,
    bidirectionalCount,
    elevatedCount,
    ihpCount,
    issues,
  };
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
  const blob = new Blob([formatXml(xml)], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const ReviewMetric = ({ value, label }) => (
  <div className="min-w-0 rounded-lg bg-black/35 px-3 py-2 shadow-[inset_0_0_0_1px_oklch(1_0_0/0.06)]">
    <p className="text-lg font-semibold tabular-nums text-white">{value}</p>
    <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
      {label}
    </p>
  </div>
);

ReviewMetric.propTypes = {
  value: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
};

const LayerToggle = ({ active, icon: Icon, label, detail, onClick }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-[background-color,color,box-shadow,transform] duration-[var(--duration-quick)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
      active
        ? 'bg-blue-500/12 text-white shadow-[inset_0_0_0_1px_oklch(0.623_0.214_259.815/0.28)]'
        : 'bg-zinc-900/60 text-zinc-400 shadow-[inset_0_0_0_1px_oklch(1_0_0/0.06)] hover:bg-zinc-800/80 hover:text-zinc-200'
    }`}
  >
    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-400' : ''}`} aria-hidden="true" />
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium">{label}</span>
      <span className="block truncate text-xs text-zinc-500">{detail}</span>
    </span>
    <span
      aria-hidden="true"
      className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-blue-400' : 'bg-zinc-700'}`}
    />
  </button>
);

LayerToggle.propTypes = {
  active: PropTypes.bool.isRequired,
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  detail: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
};

// The review workspace intentionally keeps evidence, filters and the final decision in one view.
// oxlint-disable-next-line react-doctor/no-giant-component, react-doctor/prefer-useReducer
const ContributionReviewWorkspace = ({ contribution, onClose, onApprove, onReject }) => {
  const workspaceRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [generatedFiles, setGeneratedFiles] = useState(null);
  const [generationError, setGenerationError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [isGenerating, setIsGenerating] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [updatedPackageName, setUpdatedPackageName] = useState(contribution.packageName);
  const [isEditingPackage, setIsEditingPackage] = useState(false);
  const [notesCopied, setNotesCopied] = useState(false);
  const [approveConfirmation, setApproveConfirmation] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [colorMode, setColorMode] = useState('operational');
  const [layers, setLayers] = useState({
    lights: true,
    paths: true,
    removeAreas: false,
  });
  const [visibleTypes, setVisibleTypes] = useState([]);

  const isBusy = isApproving || isRejecting;
  const packageNameIsValid = updatedPackageName.trim().length > 0;
  const summary = useMemo(
    () => analyseContributionXml(generatedFiles?.barsXml, generatedFiles?.supportsXml),
    [generatedFiles]
  );

  useEffect(() => {
    const controller = new AbortController();

    const generateReviewFiles = async () => {
      setIsGenerating(true);
      setGenerationError('');

      try {
        const formData = new FormData();
        const blob = new Blob([contribution.submittedXml], { type: 'application/xml' });
        formData.append('xmlFile', blob, `${contribution.airportIcao}_contribution.xml`);
        formData.append('icao', contribution.airportIcao);
        formData.append('simulator', contribution.simulator);

        const response = await fetch('https://v2.stopbars.com/supports/generate', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'The review geometry could not be generated.');
        }

        const data = await response.json();
        const reviewFiles = {
          supportsXml: data.supportsXml,
          barsXml: data.barsXml,
        };
        const reviewSummary = analyseContributionXml(reviewFiles.barsXml, reviewFiles.supportsXml);
        setVisibleTypes(reviewSummary.objectTypes);
        setGeneratedFiles(reviewFiles);
      } catch (error) {
        if (error.name !== 'AbortError') {
          setGenerationError(error.message);
        }
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
      if (focusable.length === 0) {
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
      const hasPackageNameChanged = updatedPackageName !== contribution.packageName;
      const response = await fetch(
        `https://v2.stopbars.com/contributions/${contribution.id}/decision`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Vatsim-Token': getVatsimToken(),
          },
          body: JSON.stringify({
            approved,
            ...(!approved && { rejectionReason: rejectionReason.trim() }),
            ...(hasPackageNameChanged && { newPackageName: updatedPackageName.trim() }),
          }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(
          errorBody.error || `Failed to ${approved ? 'approve' : 'reject'} contribution`
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
  };

  const statusLabel = isGenerating
    ? 'Generating review evidence'
    : generationError
      ? 'Map evidence unavailable'
      : summary.issues.length > 0
        ? 'Review warnings found'
        : 'Ready for review';

  return createPortal(
    <div
      ref={workspaceRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contribution-review-title"
      className="fixed inset-0 z-[70] flex min-h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100 focus:outline-none"
    >
      <header className="flex min-h-[4.5rem] shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-zinc-950/95 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={requestClose}
            disabled={isBusy}
            className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-[background-color,color,transform,opacity] hover:bg-zinc-800 hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:opacity-50"
            aria-label="Close contribution review"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2
                id="contribution-review-title"
                className="truncate text-lg font-semibold tracking-tight text-white"
              >
                {contribution.airportIcao} review
              </h2>
              <SimulatorBadge simulator={contribution.simulator} size="sm" />
            </div>
            <p className="truncate text-sm text-zinc-400">
              {updatedPackageName || contribution.packageName}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            role="status"
            className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium sm:inline-flex ${
              generationError || summary.issues.length > 0
                ? 'bg-amber-500/10 text-amber-300'
                : 'bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {isGenerating ? (
              <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : generationError || summary.issues.length > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {statusLabel}
          </span>
          <Button
            variant="outline"
            className="min-h-10 px-3 py-2"
            disabled={!generatedFiles?.barsXml}
            onClick={() =>
              downloadXml(
                generatedFiles.barsXml,
                `${contribution.airportIcao}_BARS_Contribution.xml`
              )
            }
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Download XML</span>
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:overflow-hidden">
        <main className="relative min-h-[55dvh] overflow-hidden bg-black lg:min-h-0">
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
            />
          ) : (
            <div className="flex h-full min-h-[55dvh] items-center justify-center p-6 lg:min-h-0">
              <div className="max-w-md rounded-xl bg-zinc-900/90 p-6 text-center shadow-[0_16px_48px_oklch(0_0_0/0.35),inset_0_0_0_1px_oklch(1_0_0/0.08)]">
                {generationError ? (
                  <>
                    <AlertTriangle
                      className="mx-auto mb-3 h-8 w-8 text-amber-400"
                      aria-hidden="true"
                    />
                    <h3 className="font-semibold text-white">
                      Map evidence could not be generated
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">{generationError}</p>
                  </>
                ) : (
                  <>
                    <Loader
                      className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-400"
                      aria-hidden="true"
                    />
                    <h3 className="font-semibold text-white">Building review evidence</h3>
                    <p className="mt-2 text-sm text-zinc-400">
                      Generating the exact lights and support footprints from this contribution.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {generatedFiles?.barsXml && (
            <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-center sm:inset-x-4">
              <div className="pointer-events-auto grid w-full max-w-xl grid-cols-3 gap-1.5 rounded-xl bg-zinc-950/88 p-1.5 shadow-[0_16px_48px_oklch(0_0_0/0.35),inset_0_0_0_1px_oklch(1_0_0/0.1)] backdrop-blur-md">
                <ReviewMetric value={summary.objectCount} label="Objects" />
                <ReviewMetric value={summary.lightCount} label="Lights" />
                <ReviewMetric value={summary.removeAreaCount} label="Removal areas" />
              </div>
            </div>
          )}
        </main>

        <aside
          aria-label="Contribution review controls"
          className="flex min-h-0 flex-col border-t border-white/10 bg-zinc-950 lg:border-s lg:border-t-0"
        >
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-5">
            <section aria-labelledby="visual-checks-heading">
              <div className="mb-3">
                <h3 id="visual-checks-heading" className="text-sm font-semibold text-white">
                  Visual checks
                </h3>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Change the view to spot gaps, overlaps and incorrect properties.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/40 p-1">
                {COLOR_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={colorMode === mode.id}
                    title={mode.description}
                    onClick={() => setColorMode(mode.id)}
                    className={`min-h-10 rounded-md px-2 text-xs font-medium transition-[background-color,color,box-shadow,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                      colorMode === mode.id
                        ? 'bg-zinc-700 text-white shadow-sm'
                        : 'text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-300'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 min-h-8 text-xs leading-4 text-zinc-500">
                {COLOR_MODES.find((mode) => mode.id === colorMode)?.description}
              </p>

              <div className="mt-3 grid gap-2">
                <LayerToggle
                  active={layers.lights}
                  icon={Lightbulb}
                  label="Light points"
                  detail={`${summary.lightCount} generated`}
                  onClick={() => setLayers((current) => ({ ...current, lights: !current.lights }))}
                />
                <LayerToggle
                  active={layers.paths}
                  icon={Route}
                  label="Object paths"
                  detail="Connects lights belonging to the same object"
                  onClick={() => setLayers((current) => ({ ...current, paths: !current.paths }))}
                />
                <LayerToggle
                  active={layers.removeAreas}
                  icon={XCircle}
                  label="Removal footprints"
                  detail={`${summary.removeAreaCount} support areas`}
                  onClick={() =>
                    setLayers((current) => ({
                      ...current,
                      removeAreas: !current.removeAreas,
                    }))
                  }
                />
              </div>
            </section>

            {summary.objectTypes.length > 0 && (
              <section aria-labelledby="object-types-heading">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 id="object-types-heading" className="text-sm font-semibold text-white">
                    Object types
                  </h3>
                  <button
                    type="button"
                    className="min-h-8 rounded-md px-2 text-xs font-medium text-blue-400 hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                    onClick={() =>
                      setVisibleTypes(
                        visibleTypes.length === summary.objectTypes.length
                          ? []
                          : summary.objectTypes
                      )
                    }
                  >
                    {visibleTypes.length === summary.objectTypes.length ? 'Hide all' : 'Show all'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {summary.objectTypes.map((type) => {
                    const active = visibleTypes.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleType(type)}
                        className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition-[background-color,color,box-shadow,transform] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                          active
                            ? 'bg-zinc-800 text-zinc-100 shadow-[inset_0_0_0_1px_oklch(1_0_0/0.1)]'
                            : 'bg-zinc-900 text-zinc-500 shadow-[inset_0_0_0_1px_oklch(1_0_0/0.05)]'
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: TYPE_COLORS[type] || '#a1a1aa' }}
                          aria-hidden="true"
                        />
                        {TYPE_LABELS[type] || type} · {summary.typeCounts[type]}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section aria-labelledby="evidence-heading">
              <h3 id="evidence-heading" className="text-sm font-semibold text-white">
                Decision evidence
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ReviewMetric value={summary.directionalCount} label="Directional" />
                <ReviewMetric value={summary.bidirectionalCount} label="Bidirectional" />
                <ReviewMetric value={summary.elevatedCount} label="Elevated" />
                <ReviewMetric value={summary.ihpCount} label="IHP lights" />
              </div>

              {summary.issues.length > 0 && (
                <div className="mt-3 rounded-lg bg-amber-500/8 p-3 shadow-[inset_0_0_0_1px_oklch(0.769_0.188_70.08/0.2)]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    Check before deciding
                  </div>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100/70">
                    {summary.issues.map((issue) => (
                      <li key={issue}>• {issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section aria-labelledby="submission-heading">
              <h3 id="submission-heading" className="text-sm font-semibold text-white">
                Submission
              </h3>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                  <div className="min-w-0">
                    <dt className="text-xs text-zinc-500">Submitted by</dt>
                    <dd className="truncate text-zinc-200">
                      {contribution.userDisplayName || contribution.userId}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarDays
                    className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500"
                    aria-hidden="true"
                  />
                  <div>
                    <dt className="text-xs text-zinc-500">Submitted</dt>
                    <dd className="text-zinc-200">
                      {new Date(contribution.submissionDate).toLocaleString()}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-xs text-zinc-500">Package name</dt>
                      <button
                        type="button"
                        onClick={() => setIsEditingPackage((current) => !current)}
                        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                        aria-label={
                          isEditingPackage ? 'Finish editing package name' : 'Edit package name'
                        }
                      >
                        {isEditingPackage ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <SquarePen className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {isEditingPackage ? (
                      <>
                        <input
                          aria-label="Updated package name"
                          aria-invalid={!packageNameIsValid}
                          value={updatedPackageName}
                          onChange={(event) => setUpdatedPackageName(event.target.value)}
                          className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        {!packageNameIsValid && (
                          <p className="mt-1 text-xs text-red-400">Package name is required.</p>
                        )}
                      </>
                    ) : (
                      <dd className="break-words text-zinc-200">{updatedPackageName}</dd>
                    )}
                  </div>
                </div>
              </dl>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-zinc-500">Contributor notes</p>
                  {contribution.notes && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(contribution.notes);
                        setNotesCopied(true);
                        setTimeout(() => setNotesCopied(false), 2000);
                      }}
                      className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                      aria-label="Copy contributor notes"
                    >
                      {notesCopied ? (
                        <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-900/70 p-3 text-sm leading-6 text-zinc-300 shadow-[inset_0_0_0_1px_oklch(1_0_0/0.06)]">
                  {contribution.notes || 'No notes provided.'}
                </p>
              </div>
            </section>

            <section>
              <button
                type="button"
                aria-expanded={showSource}
                onClick={() => setShowSource((current) => !current)}
                className="flex min-h-10 w-full items-center justify-between rounded-lg px-2 text-sm font-medium text-zinc-400 hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              >
                Source details
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${showSource ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
              {showSource && (
                <div className="mt-2 space-y-2">
                  <p className="break-all rounded-lg bg-black/35 p-3 font-mono text-xs leading-5 text-zinc-500">
                    Contribution ID: {contribution.id}
                  </p>
                  <Button
                    variant="outline"
                    className="w-full px-3 py-2 text-sm"
                    onClick={() =>
                      downloadXml(
                        contribution.submittedXml,
                        `${contribution.airportIcao}_submitted.xml`
                      )
                    }
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download submitted XML
                  </Button>
                </div>
              )}
            </section>
          </div>

          <section
            aria-labelledby="decision-heading"
            className="shrink-0 border-t border-white/10 bg-zinc-950 p-4 shadow-[0_-16px_40px_oklch(0_0_0/0.24)] sm:p-5"
          >
            <h3 id="decision-heading" className="text-sm font-semibold text-white">
              Decision
            </h3>
            {decisionError && (
              <p role="alert" className="mt-2 rounded-lg bg-red-500/10 p-2.5 text-sm text-red-300">
                {decisionError}
              </p>
            )}
            {approveConfirmation ? (
              <div className="mt-3 rounded-lg bg-emerald-500/8 p-3 shadow-[inset_0_0_0_1px_oklch(0.696_0.17_162.48/0.22)]">
                <p className="text-sm font-medium text-emerald-200">
                  Publish this contribution to BARS?
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="px-3 py-2"
                    onClick={() => setApproveConfirmation(false)}
                    disabled={isBusy}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-emerald-500 px-3 py-2 text-zinc-950 hover:bg-emerald-400"
                    onClick={() => submitDecision(true)}
                    disabled={isBusy || !packageNameIsValid}
                  >
                    {isApproving ? (
                      <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Confirm approval
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className="mt-3 w-full bg-emerald-500 px-4 py-2 text-zinc-950 hover:bg-emerald-400"
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
                Approve contribution
              </Button>
            )}

            <form
              className="mt-3"
              onSubmit={(event) => {
                event.preventDefault();
                submitDecision(false);
              }}
            >
              <label htmlFor="review-rejection-reason" className="sr-only">
                Rejection reason
              </label>
              <textarea
                id="review-rejection-reason"
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="Reason required to reject…"
                rows={2}
                required
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/45"
              />
              <Button
                type="submit"
                variant="destructive"
                className="mt-2 w-full px-4 py-2"
                disabled={isBusy || !rejectionReason.trim() || !packageNameIsValid}
              >
                {isRejecting ? (
                  <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                )}
                Reject contribution
              </Button>
            </form>
          </section>
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
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onApprove: PropTypes.func.isRequired,
  onReject: PropTypes.func.isRequired,
};

export default ContributionReviewWorkspace;
