import { useState, useEffect, useMemo } from 'react';
import { Button } from '../shared/Button';
import { useNavigate } from 'react-router-dom';
import {
  ActivitySquare,
  CircleDot,
  ChevronLeft,
  ChevronRight,
  Users,
  Radio,
  MapPin,
} from 'lucide-react';
import { Card } from '../shared/Card';

const ITEMS_PER_PAGE = 6;

export const Airports = () => {
  const navigate = useNavigate();
  // Approved airports from contributions API: { [icao]: { packages: string[] } }
  const [airports, setAirports] = useState({});
  // Live state map from v2 /state: { [icao]: { controllers: number, pilots: number, lightsOn: number } }
  const [liveMap, setLiveMap] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [contribRes, stateRes] = await Promise.all([
          fetch('https://v2.stopbars.com/contributions?status=approved'),
          fetch('https://v2.stopbars.com/state?airport=all'),
        ]);

        const contribData = await contribRes.json();
        const stateData = await stateRes.json();

        // Build airport -> packages map
        const byAirport = {};
        (contribData.contributions || []).forEach((c) => {
          const icao = (c.airportIcao || '').toUpperCase();
          if (!icao) return;
          if (!byAirport[icao]) byAirport[icao] = { packages: new Set() };
          if (c.packageName) byAirport[icao].packages.add(c.packageName);
        });
        // Convert package sets to arrays
        const airportsObj = Object.fromEntries(
          Object.entries(byAirport).map(([icao, v]) => [
            icao,
            { packages: Array.from(v.packages).sort() },
          ])
        );
        setAirports(airportsObj);

        // Build live map: states array of airports active right now
        const map = {};
        (stateData.states || []).forEach((s) => {
          const icao = (s.airport || '').toUpperCase();
          if (!icao) return;
          const lightsOn = (s.objects || []).filter((o) => o.state === true).length;
          map[icao] = {
            controllers: (s.controllers || []).length,
            pilots: (s.pilots || []).length,
            lightsOn,
          };
        });
        setLiveMap(map);
      } catch (err) {
        console.error('Error:', err);
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

  const sortedAirports = useMemo(() => {
    return Object.entries(airports).sort(([icaoA], [icaoB]) => {
      const aActive = !!liveMap[icaoA];
      const bActive = !!liveMap[icaoB];
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return icaoA.localeCompare(icaoB);
    });
  }, [airports, liveMap]);

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
              <p className="text-zinc-400">Real-time BARS connection status</p>
              <div className="flex items-center space-x-2 px-3 py-1 bg-zinc-800 rounded-full">
                <CircleDot className="w-3 h-3 text-emerald-400" />
                <span className="text-sm text-zinc-300">
                  {Object.keys(liveMap).length} Active Now
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
                <Card
                  key={icao}
                  className="p-4 sm:p-6 hover:border-zinc-700 transition-all duration-200"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <MapPin className="w-5 h-5 text-zinc-400 shrink-0" />
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-lg font-medium">{icao}</h3>
                          <span
                            className={`flex h-2 w-2 rounded-full ${liveMap[icao] ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`}
                          />
                        </div>
                        <div className="text-xs text-zinc-300">{getAirportContinent(icao)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-zinc-400" />
                        {liveMap[icao]?.controllers || 0} Controllers
                      </div>
                      <div className="flex items-center gap-2">
                        <Radio className="w-4 h-4 text-zinc-400" />
                        {liveMap[icao]?.pilots || 0} Pilots
                      </div>
                    </div>

                    {data.packages?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-zinc-300 mb-2">Packages</h4>
                        <div className="flex flex-wrap gap-2">
                          {data.packages.map((pkg) => (
                            <span
                              key={pkg}
                              className={`px-2 py-1 rounded text-xs ${liveMap[icao] ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800'}`}
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

            {totalPages > 1 && (
              <div className="mt-8 flex justify-center">
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="w-4 h-4" aria-label="Previous Page" />
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
                    <ChevronRight className="w-4 h-4" aria-label="Next Page" />
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
