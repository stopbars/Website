import { useState, useEffect, useMemo } from 'react';
import useSearchQuery from '../hooks/useSearchQuery';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Dropdown } from '../components/shared/Dropdown';
import {
  Search,
  MapPin,
  Loader,
  ArrowUpDown,
  MenuIcon,
  Square,
  Users,
  Plane,
  X,
} from 'lucide-react';
import { Button } from '../components/shared/Button';

const ITEMS_PER_PAGE = 12;

const GlobalStatus = () => {
  // airports: { [icao]: { packages: string[] } }
  const [airports, setAirports] = useState({});
  // live: { [icao]: { controllers: number, pilots: number, lightsOn: number } }
  const [live, setLive] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useSearchQuery();
  const [view, setView] = useState('grid');
  const [sortConfig, setSortConfig] = useState({ key: 'icao', direction: 'asc' });
  const [continentFilter, setContinentFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all'); // all | active | inactive
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setError('');
        const [contribRes, stateRes] = await Promise.all([
          fetch('https://v2.stopbars.com/contributions?status=approved&simple=true'),
          fetch('https://v2.stopbars.com/state?airport=all'),
        ]);

        const contribData = await contribRes.json();
        const stateData = await stateRes.json();

        // Build airports map
        const byAirport = {};
        (contribData.contributions || []).forEach((c) => {
          const icao = (c.airportIcao || '').toUpperCase();
          if (!icao) return;
          if (!byAirport[icao]) byAirport[icao] = { packages: new Set() };
          if (c.packageName) byAirport[icao].packages.add(c.packageName);
        });
        const airportsObj = Object.fromEntries(
          Object.entries(byAirport).map(([icao, v]) => [
            icao,
            { packages: Array.from(v.packages).sort() },
          ])
        );
        setAirports(airportsObj);

        // Build live map
        const liveMap = {};
        (stateData.states || []).forEach((s) => {
          const icao = (s.airport || '').toUpperCase();
          if (!icao) return;
          const lightsOn = (s.objects || []).filter((o) => o.state === true).length;
          liveMap[icao] = {
            controllers: (s.controllers || []).length,
            pilots: (s.pilots || []).length,
            lightsOn,
          };
        });
        setLive(liveMap);
      } catch (err) {
        setError(err.message || 'Failed to load status');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

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

  const airportsList = useMemo(() => Object.entries(airports), [airports]);

  const filteredAirports = useMemo(() => {
    return airportsList
      .filter(([icao, data]) => {
        const term = searchTerm.trim().toLowerCase();
        const matchesSearch =
          term === ''
            ? true
            : icao.toLowerCase().includes(term) ||
              (data.packages || []).some((p) => p.toLowerCase().includes(term));

        const matchesContinent =
          continentFilter === 'all' ? true : getAirportContinent(icao) === continentFilter;

        const isActive = !!live[icao];
        const matchesActivity =
          activityFilter === 'all' ? true : activityFilter === 'active' ? isActive : !isActive;

        return matchesSearch && matchesContinent && matchesActivity;
      })
      .sort((a, b) => {
        if (sortConfig.key === 'icao') {
          return sortConfig.direction === 'asc'
            ? a[0].localeCompare(b[0])
            : b[0].localeCompare(a[0]);
        }
        return 0;
      });
  }, [airportsList, searchTerm, continentFilter, activityFilter, sortConfig, live]);

  const paginatedAirports = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAirports.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAirports, currentPage]);

  const totalPages = Math.ceil(filteredAirports.length / ITEMS_PER_PAGE);
  const totalAirports = airportsList.length;

  return (
    <Layout>
      <div className="min-h-screen pt-40 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 mb-8">
            <div>
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:space-x-3 mb-2">
                <h1 className="text-3xl font-bold">Global BARS Status</h1>
                <div className="flex items-center space-x-2 px-3 py-1 bg-zinc-800 rounded-full self-start mb-2 sm:mb-0 sm:mt-2">
                  <div className="relative">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${Object.keys(live).length === 0 ? 'bg-red-400' : 'bg-emerald-400'} transition-colors duration-300 shadow-lg`}
                    ></div>
                    <div
                      className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${Object.keys(live).length === 0 ? 'bg-red-400' : 'bg-emerald-400'} animate-pulse opacity-50`}
                      style={{ animationDuration: '3s' }}
                    ></div>
                    <div
                      className={`absolute -inset-0.5 w-3.5 h-3.5 rounded-full ${Object.keys(live).length === 0 ? 'bg-red-400' : 'bg-emerald-400'} animate-ping opacity-20`}
                      style={{ animationDuration: '3s' }}
                    ></div>
                  </div>
                  <span className="text-sm text-zinc-300">
                    {Object.keys(live).length} Active Now
                  </span>
                </div>
              </div>
              <p className="text-sm sm:text-base text-zinc-400">
                Real-time BARS connection status across {totalAirports} airports!
              </p>
            </div>
            <div className="flex items-center space-x-4 self-start">
              <Button
                variant={view === 'grid' ? 'primary' : 'outline'}
                onClick={() => setView('grid')}
                className="p-2"
                aria-label="Grid view"
                aria-pressed={view === 'grid'}
              >
                <Square className="w-5 h-5" aria-hidden="true" />
              </Button>
              <Button
                variant={view === 'list' ? 'primary' : 'outline'}
                onClick={() => setView('list')}
                className="p-2"
                aria-label="List view"
                aria-pressed={view === 'list'}
              >
                <MenuIcon className="w-5 h-5" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setSortConfig((prev) => ({
                    key: 'icao',
                    direction: prev.direction === 'asc' ? 'desc' : 'asc',
                  }))
                }
                className="p-2"
                aria-label="Sort by ICAO"
              >
                <ArrowUpDown className="w-5 h-5" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="flex-1">
                <div className="relative">
                  <label htmlFor="global-status-search" className="sr-only">
                    Search airports
                  </label>
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5"
                    aria-hidden="true"
                  />
                  <input
                    id="global-status-search"
                    type="text"
                    placeholder="Search by ICAO or package name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer text-zinc-400 hover:text-zinc-300 transition-colors"
                      aria-label="Clear search"
                    >
                      <X className="w-5 h-5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-full lg:w-48">
                  <label htmlFor="activity-filter" className="sr-only">
                    Filter by activity
                  </label>
                  <Dropdown
                    options={[
                      { value: 'all', label: 'All Airports' },
                      { value: 'active', label: 'Active Airports' },
                      { value: 'inactive', label: 'Inactive Airports' },
                    ]}
                    value={activityFilter}
                    onChange={(value) => setActivityFilter(value)}
                  />
                </div>

                <div className="w-full lg:w-48">
                  <label htmlFor="continent-filter" className="sr-only">
                    Filter by continent
                  </label>
                  <Dropdown
                    options={[
                      { value: 'all', label: 'All Continents' },
                      { value: 'North America', label: 'North America' },
                      { value: 'South America', label: 'South America' },
                      { value: 'Europe', label: 'Europe' },
                      { value: 'Asia', label: 'Asia' },
                      { value: 'Oceania', label: 'Oceania' },
                      { value: 'Africa', label: 'Africa' },
                    ]}
                    value={continentFilter}
                    onChange={(value) => setContinentFilter(value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
              <Loader className="w-8 h-8 animate-spin text-zinc-400" aria-hidden="true" />
              <span className="sr-only">Loading global status…</span>
            </div>
          ) : error ? (
            <Card className="p-6 text-red-400" role="alert">
              {error}
            </Card>
          ) : (
            <>
              {view === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedAirports.map(([icao, data]) => (
                    <Card
                      key={icao}
                      className="p-4 sm:p-6 hover:border-zinc-700 transition-all duration-200"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <MapPin className="w-5 h-5 text-zinc-400 shrink-0" aria-hidden="true" />
                          <div>
                            <div className="flex items-center space-x-2">
                              <h2 className="text-lg font-medium">{icao}</h2>
                              {live[icao] ? (
                                <div className="relative flex h-2 w-2">
                                  <span
                                    className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"
                                    style={{ animationDuration: '3s' }}
                                  ></span>
                                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-lg"></span>
                                </div>
                              ) : (
                                <span
                                  className="flex h-2 w-2 rounded-full bg-zinc-600"
                                  aria-hidden="true"
                                />
                              )}
                            </div>
                            <div className="text-xs text-zinc-400">{getAirportContinent(icao)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                            {live[icao]?.controllers || 0} Controllers
                          </div>
                          <div className="flex items-center gap-2">
                            <Plane className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                            {live[icao]?.pilots || 0} Pilots
                          </div>
                        </div>

                        {data.packages?.length > 0 && (
                          <div>
                            <h3 className="text-sm font-medium text-zinc-300 mb-2">Packages</h3>
                            <div className="flex flex-wrap gap-2">
                              {data.packages.map((pkg) => (
                                <span
                                  key={pkg}
                                  className={`px-2 py-1 rounded text-xs ${live[icao] ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800'}`}
                                >
                                  {pkg}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="overflow-auto">
                  <Card className="p-4">
                    <div className="min-w-[800px]">
                      <table className="w-full">
                        <thead className="border-b border-zinc-800">
                          <tr>
                            <th scope="col" className="text-left py-3 px-4 font-medium">
                              ICAO
                            </th>
                            <th scope="col" className="text-left py-3 px-4 font-medium">
                              Continent
                            </th>
                            <th scope="col" className="text-center py-3 px-4 font-medium">
                              Connections
                            </th>
                            <th scope="col" className="text-left py-3 px-4 font-medium">
                              Packages
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {paginatedAirports.map(([icao, data]) => (
                            <tr key={icao} className="hover:bg-zinc-800/50">
                              <td className="py-4 px-4">
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">{icao}</span>
                                  {live[icao] ? (
                                    <div className="relative flex h-2 w-2">
                                      <span
                                        className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping"
                                        style={{ animationDuration: '3s' }}
                                      ></span>
                                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-lg"></span>
                                    </div>
                                  ) : (
                                    <span
                                      className="flex h-2 w-2 rounded-full bg-zinc-600"
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4 text-zinc-400">
                                {getAirportContinent(icao)}
                              </td>
                              <td className="py-4 px-4 text-center text-zinc-300">
                                {(live[icao]?.controllers || 0) + (live[icao]?.pilots || 0)}
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-wrap gap-2">
                                  {data.packages?.map((pkg) => (
                                    <span
                                      key={pkg}
                                      className="px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-300"
                                    >
                                      {pkg}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}

              {totalPages > 1 && (
                <div className="mt-8 flex justify-center">
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center px-4 py-2 bg-zinc-800 rounded-lg">
                      <span className="text-zinc-400">
                        Page {currentPage} of {totalPages}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default GlobalStatus;
