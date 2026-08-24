import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Toast } from '../components/shared/Toast';
import { ContributionFlowHeader } from '../components/contributions/ContributionFlowHeader';
import { AlertCircle, ArrowRight, BookOpen, Search } from 'lucide-react';

const AIRPORT_SUGGESTIONS = ['YSSY', 'EGLL', 'KJFK', 'WSSS', 'OMDB', 'KLAX', 'RJTT'];
const SUGGESTION_INTERVAL_MS = 2000;
const SUGGESTION_TRANSITION_MS = 220;
const CONTRIBUTION_GUIDE_URL = 'https://docs.stopbars.com/contributions';

const ContributeNew = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showToast, setShowToast] = useState(false);

  // Check for error in navigation state on mount
  useEffect(() => {
    if (location.state?.error === 'airport_load_failed') {
      setShowToast(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  return (
    <Layout>
      <div className="min-h-screen pb-20 pt-32">
        <div className="mx-auto w-full max-w-4xl px-6">
          <ContributionFlowHeader
            current="airport"
            title="Start a contribution"
            align="center"
            showGuide={false}
          />

          <Card className="mx-auto max-w-xl p-6 sm:p-8">
            <p className="mb-6 text-center text-sm text-zinc-400 text-pretty">
              Enter the airport ICAO to review its current BARS layout.
            </p>
            <AirportSearchForm />
          </Card>
        </div>
      </div>

      {/* Toast for error messages */}
      <Toast
        title="Unable to load airport"
        description="Check the ICAO and try again."
        variant="destructive"
        show={showToast}
        onClose={() => setShowToast(false)}
      />
    </Layout>
  );
};

function AirportSearchForm() {
  const navigate = useNavigate();
  const [icao, setIcao] = useState('');
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [isSuggestionTransitioning, setIsSuggestionTransitioning] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const icaoInputRef = useRef(null);
  const currentSuggestion = AIRPORT_SUGGESTIONS[suggestionIndex];
  const nextSuggestion = AIRPORT_SUGGESTIONS[(suggestionIndex + 1) % AIRPORT_SUGGESTIONS.length];

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionPreferenceChange = (event) => {
      setPrefersReducedMotion(event.matches);
      setIsSuggestionTransitioning(false);
    };

    motionPreference.addEventListener('change', handleMotionPreferenceChange);
    return () => motionPreference.removeEventListener('change', handleMotionPreferenceChange);
  }, []);

  useEffect(() => {
    if (icao || isFocused || prefersReducedMotion) return undefined;

    let transitionTimer;
    const cycleTimer = window.setInterval(() => {
      setIsSuggestionTransitioning(true);
      transitionTimer = window.setTimeout(() => {
        setSuggestionIndex((index) => (index + 1) % AIRPORT_SUGGESTIONS.length);
        setIsSuggestionTransitioning(false);
      }, SUGGESTION_TRANSITION_MS);
    }, SUGGESTION_INTERVAL_MS);

    return () => {
      window.clearInterval(cycleTimer);
      window.clearTimeout(transitionTimer);
    };
  }, [icao, isFocused, prefersReducedMotion]);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!icao) {
      setError('Enter a four-character airport ICAO.');
      icaoInputRef.current?.focus();
      return;
    }

    if (!/^[A-Za-z0-9]{4}$/.test(icao)) {
      setError('Use exactly four letters or numbers.');
      icaoInputRef.current?.focus();
      return;
    }

    setError('');
    navigate(`/contribute/map/${icao.toUpperCase()}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="icao" className="mb-2 block text-sm font-medium text-zinc-200">
          Airport ICAO
        </label>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <input
            id="icao"
            ref={icaoInputRef}
            name="airport-icao"
            type="text"
            autoComplete="off"
            spellCheck="false"
            value={icao}
            onChange={(event) => {
              setIcao(event.target.value.toUpperCase());
              setError('');
              setIsSuggestionTransitioning(false);
            }}
            onFocus={() => {
              setIsFocused(true);
              setIsSuggestionTransitioning(false);
            }}
            onBlur={() => setIsFocused(false)}
            maxLength={4}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'icao-error' : undefined}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 pl-10 text-lg uppercase text-white outline-none transition-colors placeholder:text-zinc-600 hover:border-zinc-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/35"
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 left-10 right-4 z-10 overflow-hidden transition-opacity duration-[var(--duration-quick)] ${
              icao || isFocused ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <span
              className={`absolute inset-y-0 flex items-center text-lg text-zinc-600 ${
                isSuggestionTransitioning ? 'airport-suggestion-exit' : ''
              }`}
            >
              {currentSuggestion}
            </span>
            <span
              className={`airport-suggestion-next absolute inset-y-0 flex items-center text-lg text-zinc-600 ${
                isSuggestionTransitioning ? 'airport-suggestion-enter' : ''
              }`}
            >
              {nextSuggestion}
            </span>
          </span>
        </div>
        {error && (
          <div id="icao-error" className="mt-2 flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <Button type="submit" className="w-full">
        Review airport
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>

      <a
        href={CONTRIBUTION_GUIDE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-zinc-700/60 bg-zinc-800/50 px-4 py-3 text-center text-sm font-medium whitespace-nowrap text-zinc-300 transition-[background-color,border-color,color,transform,opacity] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] hover:border-zinc-600 hover:bg-zinc-800 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        <BookOpen className="h-4 w-4" aria-hidden="true" />
        View contribution guide
      </a>
    </form>
  );
}

export default ContributeNew;
