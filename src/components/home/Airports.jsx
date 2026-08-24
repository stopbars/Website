import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, CircleAlert, MapPin, Plane, RefreshCw, TowerControl } from 'lucide-react';
import { Card } from '../shared/Card';
import { PageLoading } from '../shared/PageLoading';
import { RouteLink } from '../shared/RouteLink';
import { getSimulatorLabel } from '../../utils/simulatorPresentation';

const ITEMS_PREVIEWED = 6;
const REFRESH_INTERVAL_MS = 15000;
const REQUEST_TIMEOUT_MS = 45000;

const getAirportContinent = (icao) => {
  const prefix = icao.charAt(0);
  switch (prefix) {
    case 'K':
    case 'C':
    case 'M':
      return 'North America';
    case 'S':
      return 'South America';
    case 'E':
    case 'L':
      return 'Europe';
    case 'R':
    case 'Z':
    case 'V':
    case 'O':
    case 'U':
      return 'Asia';
    case 'Y':
    case 'N':
      return 'Oceania';
    case 'F':
    case 'D':
    case 'G':
    case 'H':
      return 'Africa';
    default:
      return 'Other';
  }
};

const getStatusSimulatorLabel = (simulator) =>
  simulator?.trim().toLowerCase() === 'xplane' ? 'X-Plane 12' : getSimulatorLabel(simulator);

const formatCount = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

/* oxlint-disable react-doctor/no-fetch-in-effect react-doctor/no-set-state-after-await-in-effect react-doctor/no-giant-component react-doctor/prefer-useReducer react-doctor/rerender-state-only-in-handlers react-doctor/prefer-tag-over-role -- The homepage preview keeps its coordinated loading, stale-data, retry, and polling states together; retryKey deliberately restarts the effect, the live error is a status message rather than form output, and every owned request and timer is cleaned up. */
export const Airports = () => {
  const [airports, setAirports] = useState({});
  const [liveMap, setLiveMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [activityPending, setActivityPending] = useState(true);
  const [refreshError, setRefreshError] = useState('');
  const [hasLiveData, setHasLiveData] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    let controller;
    let refreshTimer;
    let requestTimeout;

    const fetchData = async () => {
      controller = new AbortController();
      let timedOut = false;
      requestTimeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const contribRes = await fetch(
          'https://v2.stopbars.com/contributions?status=approved&simple=true',
          { signal: controller.signal }
        );
        if (!contribRes.ok) {
          throw new Error('The supported airport service did not return a successful response.');
        }

        const contribData = await contribRes.json();
        if (!active) return;

        const byAirport = {};
        (contribData.contributions || []).forEach((contribution) => {
          const icao = (contribution.airportIcao || '').toUpperCase();
          if (!icao) return;

          if (!byAirport[icao]) byAirport[icao] = { scenery: new Map() };
          if (contribution.packageName) {
            const simulator = contribution.simulator || '';
            const key = `${contribution.packageName}\u0000${simulator}`;
            byAirport[icao].scenery.set(key, {
              packageName: contribution.packageName,
              simulator,
            });
          }
        });

        const airportsObj = Object.fromEntries(
          Object.entries(byAirport).map(([icao, value]) => [
            icao,
            {
              scenery: Array.from(value.scenery.values()).sort((a, b) =>
                `${a.packageName}${a.simulator}`.localeCompare(`${b.packageName}${b.simulator}`)
              ),
            },
          ])
        );

        setAirports(airportsObj);
        setLoading(false);

        const stateRes = await fetch('https://v2.stopbars.com/state?airport=all', {
          signal: controller.signal,
        });
        if (!stateRes.ok) {
          throw new Error('The live activity service did not return a successful response.');
        }

        const stateData = await stateRes.json();
        if (!active) return;

        const nextLiveMap = {};
        (stateData.states || []).forEach((state) => {
          const icao = (state.airport || '').toUpperCase();
          if (!icao) return;

          nextLiveMap[icao] = {
            controllers: (state.controllers || []).length,
            pilots: (state.pilots || []).length,
          };
        });

        setLiveMap(nextLiveMap);
        setHasLiveData(true);
        setRefreshError('');
        setActivityPending(false);
      } catch (error) {
        if (active && (error.name !== 'AbortError' || timedOut)) {
          setRefreshError(
            timedOut
              ? 'Live activity took too long to respond.'
              : 'Live activity could not be refreshed.'
          );
          setActivityPending(false);
        }
      } finally {
        window.clearTimeout(requestTimeout);
        if (active) {
          setLoading(false);
          refreshTimer = window.setTimeout(fetchData, REFRESH_INTERVAL_MS);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
      window.clearTimeout(refreshTimer);
      window.clearTimeout(requestTimeout);
      controller?.abort();
    };
  }, [retryKey]);

  const sortedAirports = useMemo(
    () =>
      Object.entries(airports).sort(([icaoA], [icaoB]) => {
        const aActive = Boolean(liveMap[icaoA]);
        const bActive = Boolean(liveMap[icaoB]);
        if (aActive !== bActive) return aActive ? -1 : 1;
        return icaoA.localeCompare(icaoB);
      }),
    [airports, liveMap]
  );

  const previewAirports = sortedAirports.slice(0, ITEMS_PREVIEWED);
  const totalConnections = sortedAirports.reduce((total, [icao]) => {
    const status = liveMap[icao];
    return total + (status?.controllers || 0) + (status?.pilots || 0);
  }, 0);

  return (
    <section className="deferred-section home-section home-section-band" id="status">
      <div className="home-shell">
        <div className="home-section-header flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h2 className="home-section-title">Live airport activity</h2>
              {!loading && (
                <div className="mt-3 inline-flex min-h-8 items-center gap-2 rounded-full bg-zinc-800 px-3 py-1 text-sm text-zinc-300">
                  <span
                    className={`h-2 w-2 rounded-full ${refreshError ? 'bg-red-400' : totalConnections > 0 ? 'bg-emerald-400' : 'bg-zinc-500'}`}
                    aria-hidden="true"
                  />
                  {activityPending
                    ? 'Checking live activity…'
                    : refreshError
                      ? 'Refresh delayed'
                      : formatCount(totalConnections, 'live connection')}
                </div>
              )}
            </div>
            <p className="home-section-copy">
              See where pilots and controllers are currently connected to BARS.
            </p>
          </div>

          <RouteLink
            to="/status"
            className="group inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 font-medium text-zinc-100 transition-[background-color,border-color,color] duration-[var(--duration-quick)] hover:border-zinc-600 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:self-auto"
          >
            View all airport activity
            <ChevronRight
              className="h-4 w-4 transition-transform duration-[var(--duration-quick)] group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </RouteLink>
        </div>

        {loading ? (
          <PageLoading label="Loading airport status…" variant="airport-list" />
        ) : (
          <>
            {refreshError && (
              <div
                className="mb-6 flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
                role="status"
              >
                <div className="flex items-start gap-3">
                  <CircleAlert
                    className="mt-0.5 h-4 w-4 shrink-0 text-red-300"
                    aria-hidden="true"
                  />
                  <p className="text-red-100">
                    {hasLiveData
                      ? `${refreshError} Showing the last known activity.`
                      : `${refreshError} Live activity is temporarily unavailable.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(!hasLiveData);
                    if (!hasLiveData) setActivityPending(true);
                    setRetryKey((key) => key + 1);
                  }}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2 font-medium text-red-100 transition-colors duration-[var(--duration-quick)] hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/50 sm:self-auto"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </button>
              </div>
            )}

            {previewAirports.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {previewAirports.map(([icao, data]) => {
                  const liveState = liveMap[icao];
                  return (
                    <Card
                      key={icao}
                      className="home-panel p-4 transition-[border-color] duration-[var(--duration-quick)] hover:border-zinc-700 sm:p-6"
                    >
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <MapPin className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden="true" />
                          <div>
                            <h3 className="text-lg font-medium">{icao}</h3>
                            <p className="text-xs text-zinc-400">{getAirportContinent(icao)}</p>
                          </div>
                        </div>
                        {activityPending ? (
                          <div className="inline-flex items-center gap-2 rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300">
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-zinc-500"
                              aria-hidden="true"
                            />
                            Checking activity…
                          </div>
                        ) : liveState ? (
                          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                              aria-hidden="true"
                            />
                            Active
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300">
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-zinc-500"
                              aria-hidden="true"
                            />
                            No current activity
                          </div>
                        )}
                      </div>

                      <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-zinc-300">
                          <div className="flex items-center gap-2">
                            <TowerControl className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                            {formatCount(liveState?.controllers || 0, 'controller')}
                          </div>
                          <div className="flex items-center gap-2">
                            <Plane className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                            {formatCount(liveState?.pilots || 0, 'pilot')}
                          </div>
                        </div>

                        {data.scenery?.length > 0 && (
                          <div>
                            <h4 className="mb-2 text-sm font-medium text-zinc-300">
                              Supported scenery
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {data.scenery.map((scenery) => (
                                <span
                                  key={JSON.stringify([scenery.packageName, scenery.simulator])}
                                  className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
                                >
                                  {scenery.packageName} ·{' '}
                                  {getStatusSimulatorLabel(scenery.simulator)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              !refreshError && (
                <div className="home-panel p-6 text-center">
                  <p className="font-medium text-zinc-200">No supported airports are listed yet.</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Add support for an airport or scenery package through the contribution flow.
                  </p>
                </div>
              )
            )}
          </>
        )}
      </div>
    </section>
  );
};
