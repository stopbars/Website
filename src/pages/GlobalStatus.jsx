import { useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import {
  Search, MapPin, Loader,
  CircleDot, ArrowUpDown, MenuIcon, Square,
  Users, Radio
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
  const [searchTerm, setSearchTerm] = useState('');
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
          fetch('https://v2.stopbars.com/contributions?status=approved'),
          fetch('https://v2.stopbars.com/state?airport=all')
        ]);

        const contribData = await contribRes.json();
        const stateData = await stateRes.json();

        // Build airports map
        const byAirport = {};
        (contribData.contributions || []).forEach(c => {
          const icao = (c.airportIcao || '').toUpperCase();
          if (!icao) return;
          if (!byAirport[icao]) byAirport[icao] = { packages: new Set() };
          if (c.packageName) byAirport[icao].packages.add(c.packageName);
        });
        const airportsObj = Object.fromEntries(
          Object.entries(byAirport).map(([icao, v]) => [icao, { packages: Array.from(v.packages).sort() }])
        );
        setAirports(airportsObj);

        // Build live map
        const liveMap = {};
        (stateData.states || []).forEach(s => {
          const icao = (s.airport || '').toUpperCase();
          if (!icao) return;
          const lightsOn = (s.objects || []).filter(o => o.state === true).length;
          liveMap[icao] = {
            controllers: (s.controllers || []).length,
            pilots: (s.pilots || []).length,
            lightsOn
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
      case 'K': case 'C': case 'M': return 'North America';
      case 'S': return 'South America';
      case 'E': case 'L': return 'Europe';
      case 'R': case 'Z': case 'V': case 'O': case 'U': return 'Asia';
      case 'Y': case 'N': return 'Oceania';
      case 'F': case 'D': case 'G': case 'H': return 'Africa';
      default: return 'Other';
    }
  };

  const airportsList = useMemo(() => Object.entries(airports), [airports]);

  const filteredAirports = useMemo(() => {
    return airportsList
      .filter(([icao, data]) => {
        const term = searchTerm.trim().toLowerCase();
        const matchesSearch = term === ''
          ? true
          : icao.toLowerCase().includes(term) || (data.packages || []).some(p => p.toLowerCase().includes(term));

        const matchesContinent = continentFilter === 'all' ? true : getAirportContinent(icao) === continentFilter;

        const isActive = !!live[icao];
        const matchesActivity = activityFilter === 'all' ? true : activityFilter === 'active' ? isActive : !isActive;

        return matchesSearch && matchesContinent && matchesActivity;
      })
      .sort((a, b) => {
        if (sortConfig.key === 'icao') {
          return sortConfig.direction === 'asc' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
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
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 mb-8">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 mb-2">
                <h1 className="text-3xl font-bold">Global BARS Status</h1>
                <div className="flex items-center space-x-2 px-3 py-1 bg-zinc-800 rounded-full self-start mt-2 sm:mt-0">
                  <CircleDot className="w-3 h-3 text-emerald-400" />
                  <span className="text-sm text-zinc-300">
                    {Object.keys(live).length} Active Now
                  </span>
                </div>
              </div>
              <p className="text-zinc-400">Real-time BARS connection status across {totalAirports} airports!</p>
            </div>
            <div className="flex items-center space-x-4 self-start">
              <Button
                variant={view === 'grid' ? 'primary' : 'outline'}
                onClick={() => setView('grid')}
                className="p-2"
              >
                <Square className="w-5 h-5" />
              </Button>
              <Button
                variant={view === 'list' ? 'primary' : 'outline'}
                onClick={() => setView('list')}
                className="p-2"
              >
                <MenuIcon className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <div className="w-full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by ICAO or package name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 w-full"
              >
                <option value="all">All Airports</option>
                <option value="active">Active Airports</option>
                <option value="inactive">Inactive Airports</option>
              </select>

              <select
                value={continentFilter}
                onChange={(e) => setContinentFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 w-full"
              >
                <option value="all">All Continents</option>
                <option value="North America">North America</option>
                <option value="South America">South America</option>
                <option value="Europe">Europe</option>
                <option value="Asia">Asia</option>
                <option value="Oceania">Oceania</option>
                <option value="Africa">Africa</option>
              </select>

              <div className="hidden lg:block" />

              <Button
                variant="outline"
                onClick={() => setSortConfig(prev => ({
                  key: 'icao',
                  direction: prev.direction === 'asc' ? 'desc' : 'asc'
                }))}
                className="w-full flex justify-center items-center"
              >
                <ArrowUpDown className="w-4 h-4 mr-2" />
                Sort by ICAO
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          ) : error ? (
            <Card className="p-6 text-red-400">{error}</Card>
          ) : (
            <>
              {view === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedAirports.map(([icao, data]) => (
                    <Card key={icao} className="p-4 sm:p-6 hover:border-zinc-700 transition-all duration-200">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <MapPin className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="text-lg font-medium">{icao}</h3>
                              <span className={`flex h-2 w-2 rounded-full ${live[icao] ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                            </div>
                            <div className="text-xs text-zinc-500">{getAirportContinent(icao)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
                          <div className="flex items-center gap-2"><Users className="w-4 h-4 text-zinc-400" />{live[icao]?.controllers || 0} Controllers</div>
                          <div className="flex items-center gap-2"><Radio className="w-4 h-4 text-zinc-400" />{live[icao]?.pilots || 0} Pilots</div>
                        </div>

                        {data.packages?.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-zinc-300 mb-2">Packages</h4>
                            <div className="flex flex-wrap gap-2">
                              {data.packages.map(pkg => (
                                <span key={pkg} className={`px-2 py-1 rounded text-xs ${live[icao] ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800'}`}>
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
                            <th className="text-left py-3 px-4 font-medium">ICAO</th>
                            <th className="text-left py-3 px-4 font-medium">Continent</th>
                            <th className="text-center py-3 px-4 font-medium">Connections</th>
                            <th className="text-left py-3 px-4 font-medium">Packages</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {paginatedAirports.map(([icao, data]) => (
                            <tr key={icao} className="hover:bg-zinc-800/50">
                              <td className="py-4 px-4">
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">{icao}</span>
                                  <span className={`flex h-2 w-2 rounded-full ${live[icao] ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                                </div>
                              </td>
                              <td className="py-4 px-4 text-zinc-400">{getAirportContinent(icao)}</td>
                              <td className="py-4 px-4 text-center text-zinc-300">
                                {(live[icao]?.controllers || 0) + (live[icao]?.pilots || 0)}
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-wrap gap-2">
                                  {data.packages?.map(pkg => (
                                    <span key={pkg} className="px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-300">{pkg}</span>
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
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <div className="flex items-center px-4 py-2 bg-zinc-800 rounded-lg">
                      <span className="text-zinc-400">Page {currentPage} of {totalPages}</span>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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