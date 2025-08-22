import { useState, useEffect } from 'react';
import { Button } from '../shared/Button';
import { useNavigate } from 'react-router-dom';
import { ActivitySquare, CircleDot, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '../shared/Card';

const ITEMS_PER_PAGE = 6;

export const Airports = () => {
  const navigate = useNavigate();
  const [airports, setAirports] = useState({});
  const [activeAirports, setActiveAirports] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [globalResponse, activeResponse] = await Promise.all([
          fetch('https://api.stopbars.com/airports/global-status'),
          fetch('https://api.stopbars.com/all')
        ]);
        
        const globalData = await globalResponse.json();
        const activeData = await activeResponse.json();

        setAirports(globalData.airports || {});

        const active = {};
        activeData.runways?.forEach(runway => {
          if (new Date(runway.expiresAt) > new Date()) {
            active[runway.airportICAO] = true;
          }
        });
        setActiveAirports(active);
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const sortedAirports = Object.entries(airports)
    .sort(([icaoA], [icaoB]) => {
      if (activeAirports[icaoA] && !activeAirports[icaoB]) return -1;
      if (!activeAirports[icaoA] && activeAirports[icaoB]) return 1;
      return icaoA.localeCompare(icaoB);
    });

  const totalPages = Math.ceil(sortedAirports.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedAirports = sortedAirports.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <section className="py-24 bg-zinc-900/50" id="status">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 sm:mb-12 gap-4">
          <div>
            <h2 className="text-3xl font-bold mb-2">Live BARS Network</h2>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-zinc-400">Real-time airport lighting status</p>
              <div className="flex items-center space-x-2 px-3 py-1 bg-zinc-800 rounded-full">
                <CircleDot className="w-3 h-3 text-emerald-400" />
                <span className="text-sm text-zinc-300">
                  {Object.keys(activeAirports).length} Active Now
                </span>
              </div>
            </div>
          </div>
          <Button 
            onClick={() => navigate('/status')}
            className="flex items-center self-start sm:self-center"
          >
            <ActivitySquare className="w-4 h-4 mr-2" />
            Full Status Page
          </Button>
        </div>

        {loading ? (
          <div className="text-center text-zinc-400">Loading status...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedAirports.map(([icao, data]) => (
                <Card key={icao} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-lg font-medium">{icao}</h3>
                      <span className={`flex h-2 w-2 rounded-full ${
                        activeAirports[icao] ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                      }`} />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {data.runways.map(runway => (
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
                    <div className="text-sm text-zinc-400 space-y-1">
                      {data.sceneries.map(s => (
                        <div key={s.name}>{s.name}</div>
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex justify-center">
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4" aria-label='Previous Page' />
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
                    <ChevronRight className="w-4 h-4" aria-label='Next Page' />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default Airports;