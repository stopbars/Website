import { useRef, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Toast } from '../components/shared/Toast';
import { ContributionFlowHeader } from '../components/contributions/ContributionFlowHeader';
import { SubmissionSuccess } from '../components/contributions/SubmissionSuccess';
import { FileUp, Upload, Check, Loader, Search } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getVatsimToken } from '../utils/cookieUtils';
import { getContributionDisabledMessage } from '../utils/contributionPolicy';
import {
  getCachedContributionAirport,
  getCachedContributionPolicy,
  loadContributionAirport,
  loadContributionPolicy,
} from '../utils/contributionFlowData.js';
import {
  contributionProofError,
  contributionSubmissionError,
  contributionSubmissionProof,
} from '../utils/contributionContracts.js';

const FAST_TRACK_PREFERENCE_PREFIX = 'bars:contributions:fast-track:v1:';

const readFastTrackPreference = (vatsimId) => {
  if (!vatsimId) return false;
  try {
    return globalThis.localStorage.getItem(`${FAST_TRACK_PREFERENCE_PREFIX}${vatsimId}`) === 'true';
  } catch {
    return false;
  }
};

/* oxlint-disable react-doctor/no-giant-component react-doctor/no-high-complexity-react-function react-doctor/prefer-useReducer react-doctor/rerender-state-only-in-handlers react-doctor/no-event-handler react-doctor/no-chain-state-updates react-doctor/no-fetch-in-effect -- File preloading, package suggestions, validation, and submission are a cohesive wizard; its guarded one-shot requests and ordered state transitions preserve navigation behavior. */
const ContributeDetails = () => {
  const { icao } = useParams();
  const location = useLocation();
  const navigationState = location.state;
  const { user } = useAuth();
  const vatsimToken = getVatsimToken();
  const submissionProof = contributionSubmissionProof(navigationState);
  const cachedAirport = getCachedContributionAirport(icao);
  const cachedPolicy = getCachedContributionPolicy(icao);

  const [sceneryName, setSceneryName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [preloaded, setPreloaded] = useState(false);
  const [airport, setAirport] = useState(cachedAirport);
  const [contributionPolicy, setContributionPolicy] = useState(cachedPolicy);
  const notesRef = useRef('');
  const sceneryInputRef = useRef(null);
  const simulatorGroupRef = useRef(null);
  const acknowledgementRef = useRef(null);
  const selectedFileCardRef = useRef(null);
  const [error, setError] = useState('');
  const [errorTitle, setErrorTitle] = useState('Error');
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(null);
  const [allPackages, setAllPackages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [fastTrackRequested, setFastTrackRequested] = useState(() =>
    readFastTrackPreference(user?.vatsim_id)
  );
  const [simulator, setSimulator] = useState(() =>
    navigationState?.simulator === 'xplane' ? 'xplane' : 'msfs2024'
  );
  const contributionsDisabled =
    contributionPolicy?.managed && !contributionPolicy?.contributionsEnabled;
  const disabledContributionMessage = getContributionDisabledMessage(contributionPolicy);

  useEffect(() => {
    setFastTrackRequested(readFastTrackPreference(user?.vatsim_id));
  }, [user?.vatsim_id]);

  const updateFastTrackPreference = (enabled) => {
    setFastTrackRequested(enabled);
    if (!user?.vatsim_id) return;
    try {
      globalThis.localStorage.setItem(
        `${FAST_TRACK_PREFERENCE_PREFIX}${user.vatsim_id}`,
        enabled ? 'true' : 'false'
      );
    } catch {
      // The current submission still uses the selected value when storage is unavailable.
    }
  };

  // Preload file from navigation state if provided
  useEffect(() => {
    // Only preload if we have the raw original XML passed from previous step
    if (!preloaded && navigationState?.originalXml) {
      try {
        const { originalXml, fileName } = navigationState;
        const blob = new Blob([originalXml], { type: 'application/xml' });
        const syntheticFile = new File([blob], fileName || `${icao}.xml`, {
          type: 'application/xml',
        });
        setSelectedFile(syntheticFile);
        setPreloaded(true);
      } catch (e) {
        console.error('Failed to preload tested XML:', e);
      }
    }
  }, [navigationState, preloaded, icao]);

  // Fetch airport information
  useEffect(() => {
    if (cachedAirport && cachedPolicy) return undefined;
    let cancelled = false;
    const fetchAirport = async () => {
      try {
        const [responseResult, policyResult] = await Promise.allSettled([
          cachedAirport ? Promise.resolve(cachedAirport) : loadContributionAirport(icao),
          cachedPolicy ? Promise.resolve(cachedPolicy) : loadContributionPolicy(icao),
        ]);

        if (cancelled) return;
        if (policyResult.status === 'fulfilled') {
          setContributionPolicy(policyResult.value);
        } else {
          console.error('Error fetching contribution policy:', policyResult.reason);
        }

        if (responseResult.status === 'fulfilled') {
          setAirport(responseResult.value);
        }
      } catch (error) {
        console.error('Error fetching airport:', error);
      }
    };

    fetchAirport();
    return () => {
      cancelled = true;
    };
  }, [cachedAirport, cachedPolicy, icao]);

  // Fetch top packages when component loads
  useEffect(() => {
    let cancelled = false;
    const fetchTopPackages = async () => {
      try {
        const response = await fetch('https://v2.stopbars.com/contributions/top-packages', {
          headers: {
            'X-Vatsim-Token': vatsimToken,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (!cancelled) setAllPackages(data.map((pkg) => pkg.packageName));
        }
      } catch (error) {
        if (!cancelled) console.error('Error fetching top packages:', error);
      }
    };

    fetchTopPackages();
    return () => {
      cancelled = true;
    };
  }, [vatsimToken]);

  // Handle input change for scenery name with suggestions
  const handleSceneryNameChange = (e) => {
    const value = e.target.value;
    setSceneryName(value);

    if (value.length > 1) {
      const filteredSuggestions = allPackages
        .filter((pkg) => pkg.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 6);

      setSuggestions(filteredSuggestions);
      setShowSuggestions(filteredSuggestions.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Select a suggestion
  const selectSuggestion = (suggestion) => {
    setSceneryName(suggestion);
    setShowSuggestions(false);
  };

  const selectAdjacentSimulator = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const simulators = ['msfs2024', 'msfs2020', 'xplane'];
    const currentIndex = simulators.indexOf(simulator);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? simulators.length - 1
          : (currentIndex +
              (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) +
              simulators.length) %
            simulators.length;
    setSimulator(simulators[nextIndex]);
    simulatorGroupRef.current
      ?.querySelector(`[data-simulator="${simulators[nextIndex]}"]`)
      ?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (contributionsDisabled) {
      setErrorTitle('Contributions Disabled');
      setError(disabledContributionMessage);
      setShowErrorToast(true);
      return;
    }

    if (!user) {
      setErrorTitle('Error');
      setError('You must be logged in to submit a contribution');
      setShowErrorToast(true);
      return;
    }

    if (!sceneryName) {
      setErrorTitle('Error');
      setError('Enter or select a scenery package name.');
      setShowErrorToast(true);
      sceneryInputRef.current?.focus();
      return;
    }

    if (!selectedFile) {
      setErrorTitle('Error');
      setError('Return to the test step and prepare a valid contribution draft.');
      setShowErrorToast(true);
      selectedFileCardRef.current?.focus();
      return;
    }

    const proofError = contributionProofError(submissionProof, simulator);
    if (proofError) {
      setErrorTitle('Test this draft again');
      setError(proofError);
      setShowErrorToast(true);
      selectedFileCardRef.current?.focus();
      return;
    }

    if (!simulator) {
      setErrorTitle('Error');
      setError('Select the simulator this contribution supports.');
      setShowErrorToast(true);
      simulatorGroupRef.current?.focus();
      return;
    }

    if (!acknowledged) {
      setErrorTitle('Error');
      setError('Confirm the contribution acknowledgement before submitting.');
      setShowErrorToast(true);
      acknowledgementRef.current?.focus();
      return;
    }

    setError('');
    setShowErrorToast(false);
    setIsSubmitting(true);

    try {
      const fileContent = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(selectedFile);
      });

      const payload = {
        airportIcao: icao,
        packageName: sceneryName,
        simulator: simulator,
        submittedXml: fileContent,
        generationToken: submissionProof.generationToken,
        generationHash: submissionProof.generationHash,
        notes: notesRef.current || undefined,
        fastTrackRequested: user.fast_track?.enabled === true && fastTrackRequested,
      };

      const response = await fetch('https://v2.stopbars.com/contributions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vatsim-Token': vatsimToken,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('You are being rate limited, please try again shortly.');
        }
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(contributionSubmissionError(response.status, errorData.error));
        } else {
          const errorText = await response.text();
          throw new Error(contributionSubmissionError(response.status, errorText));
        }
      }

      setSubmissionSuccess(await response.json());
    } catch (err) {
      setErrorTitle('Unable to submit contribution');
      setError(err.message || 'Check your connection and try again.');
      setShowErrorToast(true);
      console.error('Submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submissionSuccess) {
    return (
      <SubmissionSuccess
        icao={icao}
        published={submissionSuccess.fastTrack?.status === 'published'}
      />
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="mx-auto max-w-4xl px-6">
          <ContributionFlowHeader
            current="submit"
            title="Submit contribution"
            icao={icao}
            context={airport?.name ? `${icao} · ${airport.name}` : icao}
          />

          {contributionsDisabled && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center">
              <FileUp className="w-5 h-5 text-amber-400 mr-3 shrink-0" />
              <p className="text-sm text-amber-400">{disabledContributionMessage}</p>
            </div>
          )}

          <div>
            <div>
              <Card className="p-6 sm:p-8">
                <form onSubmit={handleSubmit} className="space-y-8">
                  <h2 className="text-xl font-semibold text-white">Final details</h2>
                  <div>
                    <label htmlFor="scenery-package" className="block text-sm font-medium mb-2">
                      Scenery package
                    </label>
                    <div className="relative">
                      <div className="flex items-center relative">
                        <input
                          id="scenery-package"
                          ref={sceneryInputRef}
                          aria-label="Scenery package"
                          type="text"
                          value={sceneryName}
                          onChange={handleSceneryNameChange}
                          onFocus={() => {
                            if (sceneryName.length <= 1) return;
                            const matchingPackages = allPackages
                              .filter((pkg) =>
                                pkg.toLowerCase().includes(sceneryName.toLowerCase())
                              )
                              .slice(0, 6);
                            setSuggestions(matchingPackages);
                            setShowSuggestions(matchingPackages.length > 0);
                          }}
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                          placeholder="Enter scenery name (e.g., FlyTampa, iniBuilds)"
                          maxLength={64}
                          className="w-full px-4 py-2 pl-10 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                        <Search className="absolute left-3 w-4 h-4 text-zinc-500" />
                      </div>
                      {showSuggestions && suggestions.length > 0 && (
                        <ul className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg max-h-60 overflow-auto">
                          {suggestions.map((suggestion) => (
                            <li key={suggestion}>
                              <button
                                type="button"
                                className="w-full px-4 py-2 text-left hover:bg-zinc-700 cursor-pointer"
                                onClick={() => selectSuggestion(suggestion)}
                              >
                                {suggestion}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Simulator selection */}
                  <div>
                    <span id="simulator-label" className="block text-sm font-medium mb-2">
                      Simulator
                    </span>
                    <div
                      ref={simulatorGroupRef}
                      role="radiogroup"
                      aria-labelledby="simulator-label"
                      tabIndex={-1}
                      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={simulator === 'msfs2024'}
                        tabIndex={simulator === 'msfs2024' ? 0 : -1}
                        data-simulator="msfs2024"
                        onClick={() => setSimulator('msfs2024')}
                        onKeyDown={selectAdjacentSimulator}
                        className={`flex items-center justify-center p-3 rounded-lg border-2 transition-[background-color,border-color,color] duration-[var(--duration-quick)] ${
                          simulator === 'msfs2024'
                            ? 'border-blue-500 bg-blue-500/10 text-white'
                            : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                        }`}
                      >
                        <span className="font-medium">MSFS 2024</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={simulator === 'msfs2020'}
                        tabIndex={simulator === 'msfs2020' ? 0 : -1}
                        data-simulator="msfs2020"
                        onClick={() => setSimulator('msfs2020')}
                        onKeyDown={selectAdjacentSimulator}
                        className={`flex items-center justify-center p-3 rounded-lg border-2 transition-[background-color,border-color,color] duration-[var(--duration-quick)] ${
                          simulator === 'msfs2020'
                            ? 'border-purple-500 bg-purple-500/10 text-white'
                            : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                        }`}
                      >
                        <span className="font-medium">MSFS 2020</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={simulator === 'xplane'}
                        tabIndex={simulator === 'xplane' ? 0 : -1}
                        data-simulator="xplane"
                        onClick={() => setSimulator('xplane')}
                        onKeyDown={selectAdjacentSimulator}
                        className={`flex items-center justify-center p-3 rounded-lg border-2 transition-[background-color,border-color,color] duration-[var(--duration-quick)] ${
                          simulator === 'xplane'
                            ? 'border-emerald-500 bg-emerald-500/10 text-white'
                            : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                        }`}
                      >
                        <span className="font-medium">X-Plane</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contribution-notes" className="block text-sm font-medium mb-2">
                      Notes <span className="ml-1 font-normal text-zinc-500">(optional)</span>
                    </label>
                    <textarea
                      id="contribution-notes"
                      defaultValue=""
                      onChange={(event) => {
                        notesRef.current = event.target.value;
                      }}
                      placeholder="Anything the review team should know"
                      maxLength={1000}
                      className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 min-h-25 resize-none"
                    ></textarea>
                  </div>

                  <div
                    ref={selectedFileCardRef}
                    tabIndex={-1}
                    className={`flex items-center gap-3 rounded-lg border p-4 ${
                      selectedFile
                        ? 'border-emerald-500/25 bg-emerald-500/10'
                        : 'border-rose-500/25 bg-rose-500/10'
                    }`}
                  >
                    {selectedFile ? (
                      <Check className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <FileUp className="h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100">
                        {selectedFile ? 'Tested draft ready' : 'Tested draft missing'}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {selectedFile?.name || 'Return to the test step before submitting.'}
                      </p>
                    </div>
                  </div>

                  {user?.fast_track?.enabled ? (
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                        fastTrackRequested
                          ? 'border-emerald-500/35 bg-emerald-500/10'
                          : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={fastTrackRequested}
                        onChange={(event) => updateFastTrackPreference(event.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-white">
                          Fast-track this contribution
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-zinc-400">
                          Fast-track access is available based on your contribution history. Turn it
                          on to skip the usual staff review when automated checks pass.
                        </span>
                      </span>
                    </label>
                  ) : null}

                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                      acknowledged
                        ? 'border-emerald-500/35 bg-emerald-500/10'
                        : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
                    }`}
                  >
                    <input
                      ref={acknowledgementRef}
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-500"
                    />
                    <span>
                      <span className="block text-sm font-medium text-white">Ready to submit</span>
                      <span className="mt-1 block text-xs leading-5 text-zinc-400">
                        I followed the contribution guide, tested this draft, and confirm the work
                        is my own.
                      </span>
                    </span>
                  </label>

                  <Button
                    type="submit"
                    disabled={contributionsDisabled || isSubmitting}
                    className="w-full"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                        <span>Submitting contribution…</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        <span>Submit contribution</span>
                      </>
                    )}
                  </Button>
                </form>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Error Toast */}
      <Toast
        title={errorTitle}
        description={error}
        variant="destructive"
        show={showErrorToast}
        onClose={() => {
          setShowErrorToast(false);
          setError('');
          setErrorTitle('Error');
        }}
      />
    </Layout>
  );
};

export default ContributeDetails;
