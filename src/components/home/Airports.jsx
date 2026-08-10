import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  CircleAlert,
  Lightbulb,
  MapPin,
  Plane,
  RefreshCw,
  Users,
} from 'lucide-react';
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

const formatUpdatedTime = (date) =>
  date?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const getStatusSimulatorLabel = (simulator) =>
  simulator?.trim().toLowerCase() === 'xplane' ? 'X-Plane 12' : getSimulatorLabel(simulator);

const formatCount = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

/* oxlint-disable react-doctor/no-fetch-in-effect react-doctor/no-set-state-after-await-in-effect react-doctor/no-giant-component react-doctor/prefer-useReducer -- The homepage preview keeps its coordinated loading, stale-data, retry, and polling states together; every owned request and timer is cleaned up. */
export const Airports = () => {
  const [airports, setAirports] = useState({});
  const [liveMap, setLiveMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [activityPending, setActivityPending] = useState(true);
  const [refreshError, setRefreshError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    let controller;
    let refreshTimer;
    let requestTimeout;

    const fetchData = async () => {
      controller = new AbortController();
      let timedOut = false;
      requestTimeout = setTimeout(() => {
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
            lightsOn: (state.objects || []).filter((object) => object.state === true).length,
          };
        });

        setLiveMap(nextLiveMap);
        setLastUpdated(new Date());
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
        clearTimeout(requestTimeout);
        if (active) {
          setLoading(false);
          refreshTimer = setTimeout(fetchData, REFRESH_INTERVAL_MS);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
      clearTimeout(refreshTimer);
      clearTimeout(requestTimeout);
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
  const activeAirportCount = sortedAirports.filter(([icao]) => Boolean(liveMap[icao])).length;
  const hasLastKnownData = lastUpdated !== null;

  return (
    <section className="deferred-section bg-zinc-900/50 py-24" id="status">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-8 flex flex-col gap-5 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-bold">Live airport activity</h2>
              {!loading && (
                <div className="inline-flex min-h-8 items-center gap-2 rounded-full bg-zinc-800 px-3 py-1 text-sm text-zinc-300">
                  <span
                    className={`h-2 w-2 rounded-full ${refreshError ? 'bg-red-400' : activeAirportCount > 0 ? 'bg-emerald-400' : 'bg-zinc-500'}`}
                    aria-hidden="true"
                  />
                  {activityPending
                    ? 'Checking live activity…'
                    : refreshError
                      ? 'Refresh delayed'
                      : activeAirportCount > 0
                        ? `${activeAirportCount} active now`
                        : 'No airports active right now'}
                </div>
              )}
            </div>
            <p className="text-sm text-zinc-300 sm:text-base">
              See where pilots and controllers are currently connected to BARS.
            </p>
            {!loading && lastUpdated && (
              <p className="mt-2 text-xs text-zinc-500">
                Updated {formatUpdatedTime(lastUpdated)} · Refreshes 15 seconds after each check
              </p>
            )}
          </div>

          <RouteLink
            to="/status"
            className="group inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 font-medium text-zinc-100 transition-[background-color,border-color,color] duration-150 hover:border-zinc-600 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:self-auto"
          >
            View all airport activity
            <ChevronRight
              className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5"
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
                    {hasLastKnownData
                      ? `${refreshError} Showing the last update from ${formatUpdatedTime(lastUpdated)}.`
                      : `${refreshError} Live activity is temporarily unavailable.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(!hasLastKnownData);
                    if (!hasLastKnownData) setActivityPending(true);
                    setRetryKey((key) => key + 1);
                  }}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2 font-medium text-red-100 transition-colors duration-150 hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/50 sm:self-auto"
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
                      className="p-4 transition-[border-color] duration-150 hover:border-zinc-700 sm:p-6"
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
                            <Users className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                            {formatCount(liveState?.controllers || 0, 'controller')}
                          </div>
                          <div className="flex items-center gap-2">
                            <Plane className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                            {formatCount(liveState?.pilots || 0, 'pilot')}
                          </div>
                          {liveState && (
                            <div className="col-span-2 flex items-center gap-2 text-zinc-400">
                              <Lightbulb className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                              {formatCount(liveState.lightsOn, 'light')} illuminated
                            </div>
                          )}
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
                <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center">
                  <p className="font-medium text-zinc-200">No supported airports are listed yet.</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    Add support for an airport or scenery package through the contribution flow.
                  </p>
                </div>
              )
            )}

            <div className="mt-8 flex justify-center">
              <RouteLink
                to="/contribute"
                className="rounded text-sm font-medium text-zinc-400 underline decoration-zinc-600 underline-offset-4 transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
              >
                Airport or scenery missing? Contribute support
              </RouteLink>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
