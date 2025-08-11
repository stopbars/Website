import { useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { 
  Search, MapPin, Loader, Check, 
  CircleDot, ActivitySquare, ArrowUpDown, MenuIcon,
  Square
} from 'lucide-react';
import { Button } from '../components/shared/Button';

const ITEMS_PER_PAGE = 12;

const GlobalStatus = () => {
  const [airports, setAirports] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sceneryFilter, setSceneryFilter] = useState('all');
  const [view, setView] = useState('grid');
  const [stats, setStats] = useState({ totalAirports: 0, totalSceneries: 0 });
  const [sortConfig, setSortConfig] = useState({ key: 'icao', direction: 'asc' });
  const [continentFilter, setContinentFilter] = useState('all');
  const [activeAirports, setActiveAirports] = useState({});
  const [controllerFilter, setControllerFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [globalResponse, activeResponse] = await Promise.all([
          fetch('https://api.stopbars.com/airports/global-status'),
          fetch('https://api.stopbars.com/all')
        ]);
        
        if (!globalResponse.ok) throw new Error('Failed to fetch data');
        const globalData = await globalResponse.json();
        const activeData = await activeResponse.json();

        setAirports(globalData.airports);
        setStats({
          totalAirports: globalData.totalAirports,
          totalSceneries: globalData.totalSceneries
        });

        const active = {};
        activeData.runways?.forEach(runway => {
          if (new Date(runway.expiresAt) > new Date()) {
            active[runway.airportICAO] = true;
          }
        });
        setActiveAirports(active);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
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

  const filteredAirports = useMemo(() => {
    return Object.entries(airports)
      .filter(([icao, data]) => {
        const matchesSearch = icao.toLowerCase().includes(searchTerm.toLowerCase()) ||
          data.sceneries.some(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
        
        const matchesScenery = sceneryFilter === 'all' ? true :
          sceneryFilter === 'default' ? 
            data.sceneries.some(s => s.name.includes('Default')) :
            data.sceneries.some(s => !s.name.includes('Default'));

        const matchesContinent = continentFilter === 'all' ? true :
          getAirportContinent(icao) === continentFilter;
        
        const matchesController = controllerFilter === 'all' ? true :
          controllerFilter === 'active' ? activeAirports[icao] : !activeAirports[icao];

        return matchesSearch && matchesScenery && matchesContinent && matchesController;
      })
      .sort((a, b) => {
        if (sortConfig.key === 'icao') {
          return sortConfig.direction === 'asc' ? 
            a[0].localeCompare(b[0]) : 
            b[0].localeCompare(a[0]);
        }
        return 0;
      });
  }, [airports, searchTerm, sceneryFilter, sortConfig, continentFilter, controllerFilter, activeAirports]);

  const paginatedAirports = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAirports.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAirports, currentPage]);

  const totalPages = Math.ceil(filteredAirports.length / ITEMS_PER_PAGE);

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          {/* Header with Live Status */}          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 mb-8">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 mb-2">
                <h1 className="text-3xl font-bold">Global BARS Status</h1>
                <div className="flex items-center space-x-2 px-3 py-1 bg-zinc-800 rounded-full self-start mt-2 sm:mt-0">
                  <CircleDot className="w-3 h-3 text-emerald-400" />
                  <span className="text-sm text-zinc-300">
                    {Object.keys(activeAirports).length} Active Now
                  </span>
                </div>
              </div>
              <p className="text-zinc-400">Live airport lighting availability across {stats.totalAirports} airports</p>
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
          {/* Controls */}
          <div className="space-y-4 mb-8">
            {/* Search */}
            <div className="w-full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by ICAO or scenery name...."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <select
                value={controllerFilter}
                onChange={(e) => setControllerFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 w-full"
              >
                <option value="all">All Airports</option>
                <option value="active">Active Airports</option>
                <option value="inactive">Un-Active Airports</option>
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

              <select
                value={sceneryFilter}
                onChange={(e) => setSceneryFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 w-full"
              >
                <option value="all">All Scenery</option>
                <option value="default">Default Only</option>
                <option value="addon">Add-on Only</option>
              </select>

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

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader className="w-8 h-8 animate-spin text-zinc-400" />
            </div>
          ) : error ? (
            <Card className="p-6 text-red-400">{error}</Card>
          ) : (
            <>
              {view === 'grid' ? (                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedAirports.map(([icao, data]) => (
                    <Card key={icao} className="p-4 sm:p-6 hover:border-zinc-700 transition-all duration-200">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <MapPin className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className="text-lg font-medium">{icao}</h3>
                              <span className={`flex h-2 w-2 rounded-full ${
                                activeAirports[icao] ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                              }`} />
                            </div>
                            <div className="text-xs text-zinc-500">{getAirportContinent(icao)}</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-zinc-300 mb-2">
                            <div className="flex items-center space-x-2">
                              <ActivitySquare className={`w-4 h-4 flex-shrink-0 ${activeAirports[icao] ? 'text-emerald-500' : 'text-zinc-500'}`} />
                              <span>{activeAirports[icao] ? 'Active Controller' : 'No Active Controller'}</span>
                            </div>
                          </h4>
                        </div>

                        <div>
                          <h4 className="text-sm font-medium text-zinc-300 mb-2">Runways</h4>
                          <div className="flex flex-wrap gap-2">
                            {data.runways.map((runway) => (
                              <span 
                                key={runway} 
                                className={`px-2 py-1 rounded text-xs ${
                                  activeAirports[icao] 
                                    ? 'bg-emerald-500/20 text-emerald-400' 
                                    : 'bg-zinc-800'
                                }`}
                              >
                                {runway}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-medium text-zinc-300 mb-2">Compatible Scenery</h4>
                          <div className="space-y-2">
                            {data.sceneries.map((scenery, idx) => (
                              <div key={idx} className="flex items-center text-sm text-zinc-400 group">
                                <Check className="w-4 h-4 mr-2 flex-shrink-0 text-emerald-500 opacity-75 group-hover:opacity-100 transition-opacity" />
                                <span className="group-hover:text-zinc-300 transition-colors break-words">
                                  {scenery.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
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
                            <th className="text-center py-3 px-4 font-medium">Status</th>
                            <th className="text-left py-3 px-4 font-medium">Runways</th>
                            <th className="text-left py-3 px-4 font-medium">Scenery Support</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {paginatedAirports.map(([icao, data]) => (
                            <tr key={icao} className="hover:bg-zinc-800/50">
                              <td className="py-4 px-4">
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">{icao}</span>
                                  <span className={`flex h-2 w-2 rounded-full ${
                                    activeAirports[icao] ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                                  }`} />
                                </div>
                              </td>
                              <td className="py-4 px-4 text-zinc-400">
                                {getAirportContinent(icao)}
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex items-center justify-center">
                                  <ActivitySquare className={`w-4 h-4 ${activeAirports[icao] ? 'text-emerald-500' : 'text-zinc-500'}`} />
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-wrap gap-2">
                                  {data.runways.map(runway => (
                                    <span key={runway} className={`px-2 py-1 rounded text-xs ${
                                      activeAirports[icao] ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800'
                                    }`}>
                                      {runway}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <div className="flex flex-col space-y-1">
                                  {data.sceneries.map((scenery, idx) => (
                                    <div key={idx} className="flex items-center text-sm text-zinc-400">
                                      <Check className="w-4 h-4 mr-2 flex-shrink-0 text-emerald-500" />
                                      <span>{scenery.name}</span>
                                    </div>
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

              {/* Pagination */}
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
                      <span className="text-zinc-400">
                        Page {currentPage} of {totalPages}
                      </span>
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