import { useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { 
  Search, MapPin, Loader, Check, 
  CircleDot, ActivitySquare, ArrowUpDown, MenuIcon,
  Square, Map, ChevronDown
} from 'lucide-react';
import { Button } from '../components/shared/Button';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useRef } from 'react';

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
  const [showControllerDropdown, setShowControllerDropdown] = useState(false);
  const [showContinentDropdown, setShowContinentDropdown] = useState(false);
  const [showSceneryDropdown, setShowSceneryDropdown] = useState(false);
  const controllerDropdownRef = useRef(null);
  const continentDropdownRef = useRef(null);
  const sceneryDropdownRef = useRef(null);

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (controllerDropdownRef.current && !controllerDropdownRef.current.contains(event.target)) {
        setShowControllerDropdown(false);
      }
      if (continentDropdownRef.current && !continentDropdownRef.current.contains(event.target)) {
        setShowContinentDropdown(false);
      }
      if (sceneryDropdownRef.current && !sceneryDropdownRef.current.contains(event.target)) {
        setShowSceneryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
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
      <div className="min-h-screen pt-44 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          {/* Header with Live Status */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 mb-6">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 mb-2">
                <h1 className="text-3xl font-bold">Global BARS Status</h1>
                <div className="flex items-center space-x-2 px-3 py-1 bg-zinc-800 rounded-full self-start mt-4">
                  <CircleDot className="w-3 h-3 text-emerald-400" />
                  <span className="text-sm text-zinc-300">
                    {Object.keys(activeAirports).length} Active Now
                  </span>
                </div>
              </div>
              <p className="text-zinc-400">Live airport lighting availability across {stats.totalAirports} airports</p>
            </div>
            <div className="flex items-center space-x-4 self-start mt-4">
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
              <Button
                variant={view === 'map' ? 'primary' : 'outline'}
                onClick={() => setView('map')}
                className="p-2"
              >
                <Map className="w-5 h-5" />
              </Button>
            </div>
          </div>{/* Controls */}
          <div className="space-y-4 mb-8">
            {/* Search */}
            <div className="w-full">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by ICAO or scenery name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Controller Filter Dropdown */}
              <div className="relative" ref={controllerDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowControllerDropdown((v) => !v)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-750"
                >
                  <span className={controllerFilter !== 'all' ? 'text-white' : 'text-zinc-500'}>
                    {controllerFilter === 'all' ? 'All Airports' : controllerFilter === 'active' ? 'Active Airports' : 'Un-Active Airports'}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showControllerDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showControllerDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
                    {[
                      { value: 'all', label: 'All Airports' },
                      { value: 'active', label: 'Active Airports' },
                      { value: 'inactive', label: 'Un-Active Airports' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setControllerFilter(option.value);
                          setShowControllerDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 ${controllerFilter === option.value ? 'bg-zinc-700 text-blue-400' : 'text-white hover:text-zinc-100'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Continent Filter Dropdown */}
              <div className="relative" ref={continentDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowContinentDropdown((v) => !v)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-750"
                >
                  <span className={continentFilter !== 'all' ? 'text-white' : 'text-zinc-500'}>
                    {continentFilter === 'all' ? 'All Continents' : continentFilter}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showContinentDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showContinentDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
                    {[
                      { value: 'all', label: 'All Continents' },
                      { value: 'North America', label: 'North America' },
                      { value: 'South America', label: 'South America' },
                      { value: 'Europe', label: 'Europe' },
                      { value: 'Asia', label: 'Asia' },
                      { value: 'Oceania', label: 'Oceania' },
                      { value: 'Africa', label: 'Africa' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setContinentFilter(option.value);
                          setShowContinentDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 ${continentFilter === option.value ? 'bg-zinc-700 text-blue-400' : 'text-white hover:text-zinc-100'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Scenery Filter Dropdown */}
              <div className="relative" ref={sceneryDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowSceneryDropdown((v) => !v)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-750"
                >
                  <span className={sceneryFilter !== 'all' ? 'text-white' : 'text-zinc-500'}>
                    {sceneryFilter === 'all' ? 'All Scenery' : sceneryFilter === 'default' ? 'Default Only' : 'Add-on Only'}
                  </span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showSceneryDropdown ? 'rotate-180' : ''}`} />
                </button>
                {showSceneryDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
                    {[
                      { value: 'all', label: 'All Scenery' },
                      { value: 'default', label: 'Default Only' },
                      { value: 'addon', label: 'Add-on Only' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSceneryFilter(option.value);
                          setShowSceneryDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 ${sceneryFilter === option.value ? 'bg-zinc-700 text-blue-400' : 'text-white hover:text-zinc-100'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sort Button (unchanged) */}
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
              ) : view === 'list' ? (
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
              ) : (
                <div className="h-[600px] rounded-lg overflow-hidden">
                  <MapContainer
                    center={[0, 0]}
                    zoom={2}
                    style={{ height: '100%', width: '100%' }}
                    className="rounded-lg"
                  >
                    <TileLayer
                      url={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${import.meta.env.VITE_MAPBOX_TOKEN}`}
                      attribution='© <a href="https://www.mapbox.com/">Mapbox</a>'
                    />
                  </MapContainer>
                </div>
              )}
              {/* Pagination */}
              {totalPages > 1 && view !== 'map' && (
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