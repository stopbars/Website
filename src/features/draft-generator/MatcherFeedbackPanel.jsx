import PropTypes from 'prop-types';
import { Check, ClipboardCopy, LoaderCircle, RotateCcw, X } from 'lucide-react';

export function MatcherFeedbackPanel({
  division,
  simulator,
  scope,
  sectionPointCount,
  comment,
  status,
  copying,
  copied,
  onScopeChange,
  onCommentChange,
  onFinishAtEndpoint,
  onCopy,
  onReset,
  onClose,
}) {
  const sectionIncomplete = scope === 'section' && sectionPointCount < 2;
  return (
    <section
      className="rounded-xl border border-cyan-400/30 bg-zinc-950 p-4 text-zinc-100 shadow-lg"
      aria-labelledby="matcher-feedback-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="matcher-feedback-title" className="text-sm font-semibold">
              Capture expected match
            </h2>
            <span className="rounded bg-cyan-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-300">
              Dev
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            Pick the division object, then the simulator row it should match.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close matcher feedback tool"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        <SelectionStep
          number="1"
          label="Division object"
          value={division?.properties?.title}
          detail={division?.properties?.divisionId}
          selected={Boolean(division)}
          color="pink"
        />
        <SelectionStep
          number="2"
          label="Simulator row"
          value={simulator?.properties?.title}
          detail={simulator?.properties?.simulatorType}
          selected={Boolean(simulator)}
          color="cyan"
        />
      </ol>

      <MatcherScopeFieldset
        scope={scope}
        sectionPointCount={sectionPointCount}
        onScopeChange={onScopeChange}
        onFinishAtEndpoint={onFinishAtEndpoint}
      />

      <label
        htmlFor="matcher-feedback-comment"
        className="mt-3 block text-xs font-medium text-zinc-300"
      >
        Note <span className="font-normal text-zinc-500">optional</span>
      </label>
      <textarea
        id="matcher-feedback-comment"
        value={comment}
        onChange={(event) => onCommentChange(event.target.value)}
        rows={2}
        placeholder="Example: Keep going to the east end of this row."
        className="mt-2 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
      />

      <p className="mt-3 min-h-5 text-xs text-zinc-300" role="status" aria-live="polite">
        {status}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyReportButton
          copying={copying}
          copied={copied}
          disabled={!division || !simulator || sectionIncomplete || copying}
          onClick={onCopy}
        />
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 transition-[border-color,background-color,scale] hover:border-zinc-600 hover:bg-zinc-800 active:scale-96 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
        >
          <RotateCcw className="h-4 w-4" />
          New pair
        </button>
      </div>
    </section>
  );
}

function MatcherScopeFieldset({ scope, sectionPointCount, onScopeChange, onFinishAtEndpoint }) {
  return (
    <fieldset className="mt-3">
      <legend className="text-xs font-medium text-zinc-300">Expected simulator geometry</legend>
      <div className="mt-2 grid grid-cols-2 rounded-lg bg-zinc-900 p-1">
        <ScopeButton active={scope === 'whole-row'} onClick={() => onScopeChange('whole-row')}>
          Whole row
        </ScopeButton>
        <ScopeButton active={scope === 'section'} onClick={() => onScopeChange('section')}>
          Pick section
        </ScopeButton>
      </div>
      {scope === 'section' ? (
        <SectionSelectionHelp
          sectionPointCount={sectionPointCount}
          onFinishAtEndpoint={onFinishAtEndpoint}
        />
      ) : null}
    </fieldset>
  );
}

function SectionSelectionHelp({ sectionPointCount, onFinishAtEndpoint }) {
  return (
    <>
      <p className="mt-2 text-xs text-zinc-400">{sectionSelectionInstruction(sectionPointCount)}</p>
      {sectionPointCount === 1 ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <EndpointButton onClick={() => onFinishAtEndpoint('start')}>
            Finish at row start
          </EndpointButton>
          <EndpointButton onClick={() => onFinishAtEndpoint('end')}>
            Finish at row end
          </EndpointButton>
        </div>
      ) : null}
    </>
  );
}

function sectionSelectionInstruction(sectionPointCount) {
  if (sectionPointCount === 0) return 'Click where the match should start.';
  if (sectionPointCount === 1) {
    return 'Now click where it should end, or finish at a row endpoint.';
  }
  return 'Section selected. Click the line again to choose a new start.';
}

function CopyReportButton({ copying, copied, disabled, onClick }) {
  const Icon = copying ? LoaderCircle : copied ? Check : ClipboardCopy;
  const label = copying ? 'Building report' : copied ? 'Copied to clipboard' : 'Copy report';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition-[background-color,scale] hover:bg-cyan-400 active:scale-96 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
    >
      <Icon className={`h-4 w-4 ${copying ? 'animate-spin' : ''}`} />
      {label}
    </button>
  );
}

function ScopeButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color,scale] active:scale-96 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
        active
          ? 'bg-zinc-700 text-zinc-50 shadow-sm'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

function EndpointButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs font-medium text-zinc-300 transition-[border-color,background-color,scale] hover:border-yellow-400/50 hover:bg-zinc-800 active:scale-96 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/70"
    >
      {children}
    </button>
  );
}

function SelectionStep({ number, label, value, detail, selected, color }) {
  const selectedClasses =
    color === 'pink' ? 'border-pink-400/40 bg-pink-400/10' : 'border-cyan-400/40 bg-cyan-400/10';
  return (
    <li
      className={`min-w-0 rounded-lg border p-3 ${
        selected ? selectedClasses : 'border-zinc-800 bg-zinc-900/70'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            selected ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          {selected ? <Check className="h-3 w-3" /> : number}
        </span>
        <span className="text-xs font-medium text-zinc-300">{label}</span>
      </div>
      <p className="mt-2 truncate text-xs font-medium text-zinc-100">
        {value || (number === '1' ? 'Click a pink object' : 'Click a cyan or purple row')}
      </p>
      {detail ? <p className="mt-0.5 truncate text-[10px] text-zinc-500">{detail}</p> : null}
    </li>
  );
}

MatcherFeedbackPanel.propTypes = {
  division: PropTypes.object,
  simulator: PropTypes.object,
  scope: PropTypes.oneOf(['whole-row', 'section']).isRequired,
  sectionPointCount: PropTypes.number.isRequired,
  comment: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  copying: PropTypes.bool.isRequired,
  copied: PropTypes.bool.isRequired,
  onScopeChange: PropTypes.func.isRequired,
  onCommentChange: PropTypes.func.isRequired,
  onFinishAtEndpoint: PropTypes.func.isRequired,
  onCopy: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

ScopeButton.propTypes = {
  active: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

EndpointButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

SelectionStep.propTypes = {
  number: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  detail: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selected: PropTypes.bool.isRequired,
  color: PropTypes.oneOf(['pink', 'cyan']).isRequired,
};

MatcherScopeFieldset.propTypes = {
  scope: PropTypes.oneOf(['whole-row', 'section']).isRequired,
  sectionPointCount: PropTypes.number.isRequired,
  onScopeChange: PropTypes.func.isRequired,
  onFinishAtEndpoint: PropTypes.func.isRequired,
};

SectionSelectionHelp.propTypes = {
  sectionPointCount: PropTypes.number.isRequired,
  onFinishAtEndpoint: PropTypes.func.isRequired,
};

CopyReportButton.propTypes = {
  copying: PropTypes.bool.isRequired,
  copied: PropTypes.bool.isRequired,
  disabled: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
};
