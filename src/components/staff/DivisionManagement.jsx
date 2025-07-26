import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { getVatsimToken } from '../../utils/cookieUtils';
import { 
  Plus, 
  Users, 
  TowerControl, 
  Edit, 
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader,
  Building2
} from 'lucide-react';

const DivisionManagement = () => {
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDivisions, setExpandedDivisions] = useState({});
  const [divisionMembers, setDivisionMembers] = useState({});
  const [divisionAirports, setDivisionAirports] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});
  const navigate = useNavigate();
  const token = getVatsimToken();

  useEffect(() => {
    const fetchDivisions = async () => {
      try {
        const response = await fetch('https://v2.stopbars.com/divisions', {
          headers: { 'X-Vatsim-Token': token }
        });

        if (!response.ok) throw new Error('Failed to fetch divisions');
        const divisionsData = await response.json();
        setDivisions(divisionsData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (token) fetchDivisions();
  }, [token]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Helper function to get status color for airports
  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'bg-green-400';
      case 'pending':
        return 'bg-orange-400';
      case 'rejected':
        return 'bg-red-400';
      default:
        return 'bg-gray-400';
    }
  };

  const toggleDivisionExpansion = async (divisionId) => {
    const isExpanded = expandedDivisions[divisionId];
    
    if (isExpanded) {
      // Collapse the division
      setExpandedDivisions(prev => ({ ...prev, [divisionId]: false }));
    } else {
      // Expand and fetch details
      setExpandedDivisions(prev => ({ ...prev, [divisionId]: true }));
      
      if (!divisionMembers[divisionId] || !divisionAirports[divisionId]) {
        setLoadingDetails(prev => ({ ...prev, [divisionId]: true }));
        
        try {
          // Fetch members and airports in parallel
          const [membersResponse, airportsResponse] = await Promise.all([
            fetch(`https://v2.stopbars.com/divisions/${divisionId}/members`, {
              headers: { 'X-Vatsim-Token': token }
            }),
            fetch(`https://v2.stopbars.com/divisions/${divisionId}/airports`, {
              headers: { 'X-Vatsim-Token': token }
            })
          ]);

          if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            setDivisionMembers(prev => ({ ...prev, [divisionId]: membersData }));
          }

          if (airportsResponse.ok) {
            const airportsData = await airportsResponse.json();
            setDivisionAirports(prev => ({ ...prev, [divisionId]: airportsData }));
          }
        } catch (err) {
          console.error(`Failed to fetch details for division ${divisionId}:`, err);
        } finally {
          setLoadingDetails(prev => ({ ...prev, [divisionId]: false }));
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-white">Division Management</h2>
          <div className="animate-pulse bg-zinc-700 h-10 w-32 rounded-lg"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse bg-zinc-800 h-24 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-white">Division Management</h2>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Building2 className="w-6 h-6 text-zinc-400" />
          <h2 className="text-2xl font-semibold text-white">Division Management</h2>
        </div>
        <Button onClick={() => navigate('/divisions/new')}>
          <Plus className="w-4 h-4 mr-2" />
          Create Division
        </Button>
      </div>

      <div className="space-y-4">
        {divisions.length > 0 ? (
          <div className="space-y-4">
            {divisions.map(division => {
              const isExpanded = expandedDivisions[division.id];
              const isLoadingDetails = loadingDetails[division.id];
              const members = divisionMembers[division.id] || [];
              const airports = divisionAirports[division.id] || [];

              return (
                <Card key={division.id} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="flex items-center space-x-1">
                            <h4 className="text-xl font-semibold text-white">{division.name}</h4>
                            <span className="text-sm text-zinc-400 opacity-70">#{division.id}</span>
                          </div>
                          <p className="text-zinc-400 text-sm">{formatDate(division.created_at)}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            onClick={() => toggleDivisionExpansion(division.id)}
                            variant="secondary"
                            className="px-2 py-2"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                          <Button
                            disabled
                            variant="secondary"
                            className="opacity-50 cursor-not-allowed px-2 py-2"
                            title="Coming soon"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            disabled
                            variant="secondary"
                            className="opacity-50 cursor-not-allowed text-red-400 px-2 py-2"
                            title="Coming soon"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {division.description && (
                        <div className="mt-3">
                          <p className="text-zinc-300 text-sm">{division.description}</p>
                        </div>
                      )}

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-6 pt-6 border-t border-zinc-800">
                          {isLoadingDetails ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader className="w-6 h-6 animate-spin text-zinc-400" />
                              <span className="ml-2 text-zinc-400">Loading details...</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Members */}
                              <div>
                                <h5 className="text-lg font-semibold text-white mb-3 flex items-center">
                                  <Users className="w-5 h-5 mr-2" />
                                  Members
                                </h5>
                                {members.length > 0 ? (
                                  <div className="space-y-2">
                                    {members.map(member => (
                                      <div key={member.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                                        <div>
                                          <p className="text-white font-medium">{member.vatsim_id}</p>
                                          <p className="text-zinc-400 text-sm">
                                            {member.role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-zinc-400 text-sm">No members found</p>
                                )}
                              </div>

                              {/* Airports */}
                              <div>
                                <h5 className="text-lg font-semibold text-white mb-3 flex items-center">
                                  <TowerControl className="w-5 h-5 mr-2" />
                                  Airports
                                </h5>
                                {airports.length > 0 ? (
                                  <div className="space-y-2">
                                    {airports.map(airport => (
                                      <div key={airport.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                                        <div>
                                          <p className="text-white font-medium">{airport.icao}</p>
                                          <div className="flex items-center space-x-2">
                                            <span className="text-zinc-400 text-sm">Status: {airport.status.charAt(0).toUpperCase() + airport.status.slice(1)}</span>
                                            <div className="relative">
                                              <div className={`w-2 h-2 rounded-full ${getStatusColor(airport.status)} transition-colors duration-300 shadow-lg`}></div>
                                              <div 
                                                className={`absolute inset-0 w-2 h-2 rounded-full ${getStatusColor(airport.status)} animate-pulse opacity-50`}
                                                style={{ animationDuration: '3s' }}
                                              ></div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-zinc-400 text-sm">No airports found</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <TowerControl className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
            <h4 className="text-lg font-semibold text-white mb-2">No divisions found</h4>
            <p className="text-zinc-400 mb-4">Create your first division to get started</p>
            <Button onClick={() => navigate('/divisions/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Division
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
};

export default DivisionManagement;
