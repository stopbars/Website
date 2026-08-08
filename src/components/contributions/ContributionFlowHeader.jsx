import PropTypes from 'prop-types';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';

const FLOW_STEPS = [
  { id: 'airport', label: 'Airport' },
  { id: 'review', label: 'Review map' },
  { id: 'draft', label: 'Draft' },
  { id: 'editor', label: 'Editor' },
  { id: 'test', label: 'Test' },
  { id: 'submit', label: 'Submit' },
];

function stepHref(step, icao) {
  if (step === 'airport') return '/contribute/new';
  if (!icao) return null;
  if (step === 'review') return `/contribute/map/${icao}`;
  if (step === 'draft') return `/contribute/generator/${icao}`;
  if (step === 'editor') return `/contribute/editor/${icao}`;
  if (step === 'test') return `/contribute/test/${icao}`;
  if (step === 'submit') return `/contribute/details/${icao}`;
  return null;
}

export function ContributionFlowHeader({ current, title, icao = '', context = '' }) {
  const currentIndex = FLOW_STEPS.findIndex((step) => step.id === current);

  return (
    <header className="mb-8 mt-6">
      <div className="sm:hidden" aria-label="Contribution progress">
        <div className="flex items-center justify-between gap-4 text-xs font-medium">
          <span className="text-zinc-500">
            Step {currentIndex + 1} of {FLOW_STEPS.length}
          </span>
          <span className="text-zinc-200">{FLOW_STEPS[currentIndex].label}</span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
          <div
            className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
            style={{ width: `${((currentIndex + 1) / FLOW_STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <nav aria-label="Contribution progress" className="hidden pb-2 sm:block">
        <ol className="flex min-w-max items-center" role="list">
          {FLOW_STEPS.map((step, index) => {
            const complete = index < currentIndex;
            const active = index === currentIndex;
            const href = complete ? stepHref(step.id, icao) : null;
            const content = (
              <>
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums ${
                    complete
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : active
                        ? 'border-blue-400/60 bg-blue-500/15 text-blue-200'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-500'
                  }`}
                  aria-hidden="true"
                >
                  {complete ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : index + 1}
                </span>
                <span
                  className={`text-xs font-medium ${
                    active ? 'text-zinc-100' : complete ? 'text-zinc-300' : 'text-zinc-600'
                  }`}
                >
                  {step.label}
                </span>
              </>
            );

            return (
              <li key={step.id} className="flex items-center">
                {href ? (
                  <Link
                    to={href}
                    className="flex min-h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                  >
                    {content}
                    <span className="sr-only">, completed</span>
                  </Link>
                ) : (
                  <div
                    className="flex min-h-10 items-center gap-2 px-2"
                    aria-current={active ? 'step' : undefined}
                  >
                    {content}
                  </div>
                )}
                {index < FLOW_STEPS.length - 1 ? (
                  <span
                    className={`mx-1 h-px w-5 ${complete ? 'bg-emerald-500/40' : 'bg-zinc-800'}`}
                    aria-hidden="true"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="mt-5">
        <h1 className="text-3xl font-bold tracking-tight text-white text-balance">{title}</h1>
        {context ? <p className="mt-2 text-sm text-zinc-400 text-pretty">{context}</p> : null}
      </div>
    </header>
  );
}

ContributionFlowHeader.propTypes = {
  current: PropTypes.oneOf(FLOW_STEPS.map((step) => step.id)).isRequired,
  title: PropTypes.string.isRequired,
  icao: PropTypes.string,
  context: PropTypes.string,
};
