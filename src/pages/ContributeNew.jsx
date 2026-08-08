import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Toast } from '../components/shared/Toast';
import { ContributionFlowHeader } from '../components/contributions/ContributionFlowHeader';
import { AlertCircle, Search, BookOpen, ArrowRight } from 'lucide-react';

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
            context="Enter the airport ICAO to review its current BARS layout."
          />

          <Card className="mx-auto max-w-xl p-6 sm:p-8">
            <AirportSearchForm />

            <div className="mt-6 text-center">
              <a
                href="https://docs.stopbars.com/contributions"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
              >
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                Read contribution guide
              </a>
            </div>
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
  const icaoInputRef = useRef(null);

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
            className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"
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
            }}
            placeholder="YSSY"
            maxLength={4}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'icao-help icao-error' : 'icao-help'}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 pl-10 text-lg uppercase text-white outline-none transition-colors placeholder:text-zinc-600 hover:border-zinc-600 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/35"
          />
        </div>
        <p id="icao-help" className="mt-2 text-sm text-zinc-500">
          Four letters or numbers.
        </p>
        {error && (
          <div id="icao-error" className="mt-2 flex items-center gap-1.5 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <Button type="submit" className="w-full">
        Review map
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  );
}

export default ContributeNew;
