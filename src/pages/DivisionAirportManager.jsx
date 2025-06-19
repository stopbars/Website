import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { MapPin, ArrowLeft, Search, Plus } from 'lucide-react';
import AirportPointEditor from '../components/divisions/AirportPointEditor';

const DivisionAirportManager = () => {
  const { divisionId, airportId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('vatsimToken');
  
  const [division, setDivision] = useState(null);
  const [airports, setAirports] = useState([]);
  const [filteredAirports, setFilteredAirports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Fetch division data and airports
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch division info
        const divisionResponse = await fetch(`https://v2.stopbars.com/divisions/${divisionId}`, {
          headers: { 'X-Vatsim-Token': token }
        });
        
        if (!divisionResponse.ok) throw new Error('Failed to fetch division data');
        const divisionData = await divisionResponse.json();
        setDivision(divisionData);
        
        // Fetch division airports
        const airportsResponse = await fetch(`https://v2.stopbars.com/divisions/${divisionId}/airports`, {
          headers: { 'X-Vatsim-Token': token }
        });
        
        if (!airportsResponse.ok) throw new Error('Failed to fetch airports');
        const airportsData = await airportsResponse.json();
        setAirports(airportsData.airports || []);
        setFilteredAirports(airportsData.airports || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    if (divisionId && token) {
      fetchData();
    }
  }, [divisionId, token]);
  
  // Filter airports based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredAirports(airports);
      return;
    }
    
    const filtered = airports.filter(airport => 
      airport.icao.toLowerCase().includes(searchTerm.toLowerCase()) ||
      airport.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    setFilteredAirports(filtered);
  }, [searchTerm, airports]);
  
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  if (loading && !division) {
    return (
      <Layout>
        <div className="pt-32 pb-20">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  
  if (error) {
    return (
      <Layout>
        <div className="pt-32 pb-20">
          <div className="container mx-auto px-4">
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
              <p className="text-red-500">{error}</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  
  // If we have an airportId, show the point editor for that specific airport
  if (airportId) {
    return (
      <Layout>
        <div className="pt-20 pb-20">
          <div className="container mx-auto px-0">
            <div>
              <AirportPointEditor/>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="pt-32 pb-20">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {division?.name} - Airport Management
              </h1>
              <p className="text-zinc-400">
                Manage airport points for the BARS system in your division&apos;s FIR
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(`/divisions/${divisionId}/manage`)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Division
            </Button>
          </div>
          
          {/* Search and filter */}
          <Card className="mb-6 p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search airports by ICAO or name..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full pl-10 pr-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent transition-all"
              />
            </div>
          </Card>
          
          {/* Airports grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAirports.map(airport => (
              <Card
                key={airport.id}
                className="p-6 hover:border-zinc-700 transition-all duration-200 cursor-pointer"
                onClick={() => navigate(`/divisions/${divisionId}/airports/${airport.icao}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <MapPin className="w-5 h-5 text-zinc-400" />
                    <div>
                      <h3 className="font-medium text-xl">{airport.icao}</h3>
                      <p className="text-zinc-400 text-sm">{airport.name}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Points:</span>
                    <span className="font-medium">{airport.pointCount || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-400">Last Updated:</span>
                    <span className="font-medium">{airport.lastUpdated ? new Date(airport.lastUpdated).toLocaleDateString() : 'Never'}</span>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button
                    variant="outline"
                    className="text-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/divisions/${divisionId}/airports/${airport.icao}`);
                    }}
                  >
                    <MapPin className="w-4 h-4 mr-2" />
                    Manage Points
                  </Button>
                </div>
              </Card>
            ))}
            
            {/* Add new airport card */}
            <Card 
              className="p-6 border border-dashed border-zinc-800 hover:border-zinc-700 transition-all duration-200 flex flex-col justify-center items-center cursor-pointer h-full"
              onClick={() => navigate(`/divisions/${divisionId}/airports/add`)}
            >
              <div className="h-12 w-12 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <Plus className="w-6 h-6 text-zinc-400" />
              </div>
              <h3 className="font-medium mb-2">Add New Airport</h3>
              <p className="text-zinc-400 text-sm text-center">
                Request to add a new airport to your division
              </p>
            </Card>
            
            {filteredAirports.length === 0 && searchTerm && (
              <div className="col-span-full p-8 text-center">
                <p className="text-zinc-400">No airports found matching &quot;{searchTerm}&quot;</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default DivisionAirportManager;