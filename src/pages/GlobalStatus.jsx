import { useState, useEffect, useMemo } from 'react';
import useSearchQuery from '../hooks/useSearchQuery';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Dropdown } from '../components/shared/Dropdown';
import {
  AlertCircle,
  MapPin,
  MenuIcon,
  Plane,
  RefreshCw,
  Search,
  Square,
  Users,
  X,
} from 'lucide-react';
import { Button } from '../components/shared/Button';
import { PageLoading } from '../components/shared/PageLoading';
import { RouteLink } from '../components/shared/RouteLink';
import { getSimulatorLabel } from '../utils/simulatorPresentation';

const ITEMS_PER_PAGE = 12;
const REFRESH_INTERVAL_MS = 15000;
const REQUEST_TIMEOUT_MS = 45000;

const CONTINENT_OPTIONS = [
  { value: 'all', label: 'All continents' },
  { value: 'North America', label: 'North America' },
  { value: 'South America', label: 'South America' },
  { value: 'Europe', label: 'Europe' },
  { value: 'Asia', label: 'Asia' },
  { value: 'Oceania', label: 'Oceania' },
  { value: 'Africa', label: 'Africa' },
  { value: 'Other', label: 'Other' },
];

const ACTIVITY_OPTIONS = [
  { value: 'all', label: 'All activity' },
  { value: 'active', label: 'Active now' },
  { value: 'inactive', label: 'No current activity' },
];

const SORT_OPTIONS = [
  { value: 'icao-asc', label: 'ICAO A–Z' },
  { value: 'icao-desc', label: 'ICAO Z–A' },
  { value: 'activity-desc', label: 'Most active' },
];

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

const getTotalConnections = (status) => (status?.controllers || 0) + (status?.pilots || 0);

const formatCount = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const getStatusSimulatorLabel = (simulator) =>
  simulator?.trim().toLowerCase() === 'xplane' ? 'X-Plane 12' : getSimulatorLabel(simulator);

/* oxlint-disable react-doctor/no-giant-component react-doctor/no-high-complexity-react-function react-doctor/prefer-useReducer react-doctor/no-fetch-in-effect react-doctor/no-set-state-after-await-in-effect react-doctor/async-parallel -- Live status polling owns cancellation and guards every post-await update; filtering and the coordinated data sources share one view. */
const GlobalStatus = () => {
  // airports: { [icao]: { packages: string[] } }
  const [airports, setAirports] = useState({});
  // live: { [icao]: { controllers: number, pilots: number } }
  const [live, setLive] = useState({});
  const [loading, setLoading] = useState(true);
  const [airportsLoaded, setAirportsLoaded] = useState(false);
  const [activityPending, setActivityPending] = useState(true);
  const [error, setError] = useState('');
  const [hasLiveData, setHasLiveData] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchTerm, setSearchTerm] = useSearchQuery();
  const [view, setView] = useState('grid');
  const [sortValue, setSortValue] = useState('icao-asc');
  const [continentFilter, setContinentFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

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
          throw new Error(`Supported airports request failed (${contribRes.status})`);
        }

        const contribData = await contribRes.json();
        if (!active) return;

        const byAirport = {};
        (contribData.contributions || []).forEach((contribution) => {
          const icao = (contribution.airportIcao || '').toUpperCase();
          if (!icao) return;
          if (!byAirport[icao]) byAirport[icao] = { packages: new Set() };

          if (contribution.packageName) {
            const simulator = contribution.simulator?.trim();
            const packageLabel = simulator
              ? `${contribution.packageName} · ${getStatusSimulatorLabel(simulator)}`
              : contribution.packageName;
            byAirport[icao].packages.add(packageLabel);
          }
        });

        const airportsObj = Object.fromEntries(
          Object.entries(byAirport).map(([icao, data]) => [
            icao,
            { packages: Array.from(data.packages).sort() },
          ])
        );

        setAirports(airportsObj);
        setAirportsLoaded(true);
        setLoading(false);

        const stateRes = await fetch('https://v2.stopbars.com/state?airport=all', {
          signal: controller.signal,
        });
        if (!stateRes.ok) {
          throw new Error(`Live activity request failed (${stateRes.status})`);
        }

        const stateData = await stateRes.json();
        if (!active) return;

        const liveMap = {};
        (stateData.states || []).forEach((state) => {
          const icao = (state.airport || '').toUpperCase();
          if (!icao || !airportsObj[icao]) return;
          liveMap[icao] = {
            controllers: (state.controllers || []).length,
            pilots: (state.pilots || []).length,
          };
        });

        setLive(liveMap);
        setError('');
        setHasLiveData(true);
        setActivityPending(false);
      } catch (fetchError) {
        if (active && (fetchError.name !== 'AbortError' || timedOut)) {
          setError(
            timedOut
              ? 'Live activity request timed out.'
              : fetchError.message || 'Live activity is temporarily unavailable.'
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
  }, [refreshKey]);

  const airportsList = useMemo(() => Object.entries(airports), [airports]);

  const filteredAirports = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return airportsList
      .filter(([icao, data]) => {
        const matchesSearch =
          !term ||
          icao.toLowerCase().includes(term) ||
          data.packages.some((packageName) => packageName.toLowerCase().includes(term));
        const matchesContinent =
          continentFilter === 'all' || getAirportContinent(icao) === continentFilter;
        const isActive = Boolean(live[icao]);
        const matchesActivity =
          activityFilter === 'all' || (activityFilter === 'active' ? isActive : !isActive);

        return matchesSearch && matchesContinent && matchesActivity;
      })
      .sort((a, b) => {
        if (sortValue === 'activity-desc') {
          const activityDifference =
            getTotalConnections(live[b[0]]) - getTotalConnections(live[a[0]]);
          return activityDifference || a[0].localeCompare(b[0]);
        }
        return sortValue === 'icao-desc' ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]);
      });
  }, [airportsList, searchTerm, continentFilter, activityFilter, sortValue, live]);

  const totalPages = Math.ceil(filteredAirports.length / ITEMS_PER_PAGE);
  const displayedPage = Math.min(currentPage, Math.max(totalPages, 1));

  const paginatedAirports = useMemo(() => {
    const startIndex = (displayedPage - 1) * ITEMS_PER_PAGE;
    return filteredAirports.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAirports, displayedPage]);

  const totalAirports = airportsList.length;
  const totalConnections = Object.values(live).reduce(
    (total, status) => total + getTotalConnections(status),
    0
  );
  const hasFilters = Boolean(searchTerm || continentFilter !== 'all' || activityFilter !== 'all');

  const resetFilters = () => {
    setSearchTerm('');
    setContinentFilter('all');
    setActivityFilter('all');
    setCurrentPage(1);
  };

  const retry = () => {
    if (!airportsLoaded) setLoading(true);
    if (!hasLiveData) setActivityPending(true);
    setRefreshKey((key) => key + 1);
  };

  return (
    <Layout>
      <div className="min-h-screen pt-40 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <header className="mb-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <h1 className="text-3xl font-bold">Live airport activity</h1>
                <p className="mt-2 text-sm text-zinc-400 sm:text-base">
                  See where pilots and controllers are currently connected to BARS.
                </p>
              </div>

              {!loading && airportsLoaded && (
                <div className="inline-flex self-start items-center gap-2 whitespace-nowrap rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${!activityPending && totalConnections > 0 ? 'bg-emerald-400' : 'bg-zinc-500'}`}
                    aria-hidden="true"
                  />
                  {activityPending ? (
                    <span className="text-zinc-400">Checking live connections…</span>
                  ) : (
                    <>
                      <span className="font-semibold tabular-nums text-zinc-100">
                        {totalConnections}
                      </span>
                      <span className="text-zinc-500">Pilots and controllers connected</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </header>

          {loading ? (
            <PageLoading label="Loading airport activity…" variant="status-content" />
          ) : !airportsLoaded ? (
            <Card className="p-6" role="alert">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold text-red-300">Live activity unavailable</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Unable to load airport activity. Try again.
                  </p>
                  <Button variant="outline" onClick={retry} className="mt-4 px-4 py-2">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Try again
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {error && (
                <Card className="mb-6 border-red-900/70 bg-red-950/30 p-4" role="alert">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <AlertCircle
                        className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-medium text-red-300">Live refresh failed</p>
                        <p className="text-sm text-zinc-400">
                          {hasLiveData
                            ? 'Showing the last known activity. We will keep retrying.'
                            : 'Supported airports are available, but live connection data is delayed. We will keep retrying.'}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={retry} className="shrink-0 px-4 py-2">
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      Retry now
                    </Button>
                  </div>
                </Card>
              )}

              <section aria-labelledby="activity-directory-heading">
                <h2 id="activity-directory-heading" className="sr-only">
                  Supported airport activity
                </h2>

                <div className="mb-5 space-y-3">
                  <div className="relative">
                    <label htmlFor="global-status-search" className="sr-only">
                      Search supported airports and scenery
                    </label>
                    <Search
                      className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
                      aria-hidden="true"
                    />
                    <input
                      id="global-status-search"
                      type="search"
                      name="airport-search"
                      autoComplete="off"
                      placeholder="Search by ICAO or supported scenery…"
                      value={searchTerm}
                      onChange={(event) => {
                        setSearchTerm(event.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-3 pr-10 pl-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setCurrentPage(1);
                        }}
                        className="absolute right-2 top-1/2 flex min-h-10 min-w-10 -translate-y-1/2 cursor-pointer items-center justify-center text-zinc-400 transition-colors duration-[var(--duration-quick)] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                        aria-label="Clear search"
                      >
                        <X className="h-5 w-5" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <Dropdown
                      aria-label="Filter by activity"
                      options={ACTIVITY_OPTIONS}
                      value={activityFilter}
                      onChange={(value) => {
                        setActivityFilter(value);
                        setCurrentPage(1);
                      }}
                    />
                    <Dropdown
                      aria-label="Filter by continent"
                      options={CONTINENT_OPTIONS}
                      value={continentFilter}
                      onChange={(value) => {
                        setContinentFilter(value);
                        setCurrentPage(1);
                      }}
                    />
                    <Dropdown
                      aria-label="Sort airports"
                      options={SORT_OPTIONS}
                      value={sortValue}
                      onChange={(value) => {
                        setSortValue(value);
                        setCurrentPage(1);
                      }}
                    />
                    <div
                      className="flex rounded-lg border border-zinc-700 bg-zinc-900 p-1"
                      aria-label="View style"
                      role="group"
                    >
                      <button
                        type="button"
                        onClick={() => setView('grid')}
                        className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm transition-[background-color,color] duration-[var(--duration-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 lg:flex-none ${
                          view === 'grid'
                            ? 'bg-zinc-700 text-white'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        aria-pressed={view === 'grid'}
                      >
                        <Square className="h-4 w-4" aria-hidden="true" /> Grid
                      </button>
                      <button
                        type="button"
                        onClick={() => setView('list')}
                        className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm transition-[background-color,color] duration-[var(--duration-quick)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 lg:flex-none ${
                          view === 'list'
                            ? 'bg-zinc-700 text-white'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                        aria-pressed={view === 'list'}
                      >
                        <MenuIcon className="h-4 w-4" aria-hidden="true" /> List
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-zinc-400" aria-live="polite">
                    Showing {filteredAirports.length} of {totalAirports} supported{' '}
                    {totalAirports === 1 ? 'airport' : 'airports'}
                  </p>
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="text-sm text-zinc-300 underline decoration-zinc-600 underline-offset-4 transition-colors duration-[var(--duration-quick)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                    >
                      Reset filters
                    </button>
                  )}
                </div>

                {filteredAirports.length === 0 ? (
                  <Card className="p-8 text-center">
                    <MapPin className="mx-auto h-6 w-6 text-zinc-500" aria-hidden="true" />
                    <h3 className="mt-3 font-semibold">No supported airports found</h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      Try a different search or clear the selected filters.
                    </p>
                    <Button variant="outline" onClick={resetFilters} className="mt-5 px-4 py-2">
                      Reset filters
                    </Button>
                  </Card>
                ) : view === 'grid' ? (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {paginatedAirports.map(([icao, data]) => {
                      const status = live[icao];
                      const isActive = Boolean(status);
                      return (
                        <Card
                          key={icao}
                          className="p-4 transition-[border-color] duration-[var(--duration-quick)] hover:border-zinc-700 sm:p-6"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <MapPin
                                className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400"
                                aria-hidden="true"
                              />
                              <div>
                                <h3 className="text-lg font-medium">{icao}</h3>
                                <p className="text-xs text-zinc-400">{getAirportContinent(icao)}</p>
                              </div>
                            </div>
                            <span
                              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-xs ${
                                isActive
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-zinc-500'}`}
                                aria-hidden="true"
                              />
                              {activityPending
                                ? 'Checking activity…'
                                : isActive
                                  ? 'Active'
                                  : 'No current activity'}
                            </span>
                          </div>

                          <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-zinc-300">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                              <span>{formatCount(status?.controllers || 0, 'controller')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Plane className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                              <span>{formatCount(status?.pilots || 0, 'pilot')}</span>
                            </div>
                          </div>

                          {data.packages.length > 0 && (
                            <div className="mt-5">
                              <h4 className="mb-2 text-sm font-medium text-zinc-300">
                                Supported scenery
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {data.packages.map((packageName) => (
                                  <span
                                    key={packageName}
                                    className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
                                  >
                                    {packageName}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card className="p-0">
                    <div
                      className="overflow-x-auto rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                      role="region"
                      aria-label="Supported airport activity table"
                      tabIndex={0}
                    >
                      <table className="min-w-[760px] w-full">
                        <caption className="sr-only">
                          Live activity and supported scenery for BARS airports
                        </caption>
                        <thead className="border-b border-zinc-800">
                          <tr>
                            <th scope="col" className="px-4 py-3 text-left font-medium">
                              Airport
                            </th>
                            <th scope="col" className="px-4 py-3 text-left font-medium">
                              Activity
                            </th>
                            <th scope="col" className="px-4 py-3 text-left font-medium">
                              Controllers
                            </th>
                            <th scope="col" className="px-4 py-3 text-left font-medium">
                              Pilots
                            </th>
                            <th scope="col" className="px-4 py-3 text-left font-medium">
                              Supported scenery
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {paginatedAirports.map(([icao, data]) => {
                            const status = live[icao];
                            const isActive = Boolean(status);
                            return (
                              <tr key={icao} className="hover:bg-zinc-800/50">
                                <td className="px-4 py-4">
                                  <span className="font-medium">{icao}</span>
                                  <span className="mt-0.5 block text-xs text-zinc-500">
                                    {getAirportContinent(icao)}
                                  </span>
                                </td>
                                <td className="px-4 py-4">
                                  <span className={isActive ? 'text-emerald-300' : 'text-zinc-400'}>
                                    {activityPending
                                      ? 'Checking activity…'
                                      : isActive
                                        ? 'Active'
                                        : 'No current activity'}
                                  </span>
                                </td>
                                <td className="px-4 py-4 text-zinc-300">
                                  {status?.controllers || 0}
                                </td>
                                <td className="px-4 py-4 text-zinc-300">{status?.pilots || 0}</td>
                                <td className="px-4 py-4">
                                  <div className="flex flex-wrap gap-2">
                                    {data.packages.map((packageName) => (
                                      <span
                                        key={packageName}
                                        className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300"
                                      >
                                        {packageName}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {totalPages > 1 && (
                  <nav className="mt-8 flex justify-center" aria-label="Airport results pages">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(Math.max(1, displayedPage - 1))}
                        disabled={displayedPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="rounded-lg bg-zinc-800 px-4 py-2 text-zinc-400">
                        Page {displayedPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        onClick={() => setCurrentPage(Math.min(totalPages, displayedPage + 1))}
                        disabled={displayedPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </nav>
                )}
              </section>

              <Card className="mt-10 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">Help expand BARS coverage</h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Airport or scenery support missing? Add it through the contribution workflow.
                  </p>
                </div>
                <RouteLink
                  to="/contribute"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-[background-color,border-color,color,transform] duration-[var(--duration-quick)] hover:border-zinc-600 hover:bg-zinc-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                >
                  Contribute
                </RouteLink>
              </Card>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default GlobalStatus;
