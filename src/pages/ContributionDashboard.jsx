import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { 
  Trophy, 
  Users, 
  User, 
  Map, 
  Search,
  FileDown,
  Plus,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getVatsimToken } from '../utils/cookieUtils';

const ContributionDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const vatsimToken = getVatsimToken();
  
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(null);  const [leaderboard, setLeaderboard] = useState([]);
  const [allContributions, setAllContributions] = useState([]);
  const [userContributions, setUserContributions] = useState([]);
  const [userContributionSummary, setUserContributionSummary] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentTab, setCurrentTab] = useState('all');
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch leaderboard data
        const leaderboardResponse = await fetch('https://v2.stopbars.com/contributions/leaderboard');
        if (!leaderboardResponse.ok) {
          throw new Error('Failed to fetch leaderboard data');
        }
        const leaderboardData = await leaderboardResponse.json();
          // Format leaderboard data
        const formattedLeaderboard = leaderboardData.map(item => ({
          name: item.name,
          contributions: item.count
        }));
        
        // Fetch all approved contributions
        const contributionsResponse = await fetch('https://v2.stopbars.com/contributions?status=approved&limit=100');
        if (!contributionsResponse.ok) {
          throw new Error('Failed to fetch contributions');
        }
        const contributionsData = await contributionsResponse.json();
          // Group contributions by airport
        const groupedContributions = contributionsData.contributions.reduce((acc, contribution) => {
          const airport = contribution.airportIcao;
          
          if (!acc[airport]) {
            acc[airport] = {
              airport,
              contributions: []
            };
          }
          
          acc[airport].contributions.push({
            id: contribution.id,
            scenery: contribution.packageName,
            status: contribution.status,
            lastUpdated: new Date(contribution.submissionDate).toISOString().split('T')[0],
            rejectionReason: contribution.rejectionReason
          });
          
          return acc;
        }, {});
        
        // Convert the grouped object to an array
        const allContribsArray = Object.values(groupedContributions);
        
        // User contributions (if user is logged in)
        let userContribsArray = [];
        if (user) {
          const userResponse = await fetch('https://v2.stopbars.com/contributions/user', {
            headers: {
              'X-Vatsim-Token': vatsimToken
            }
          });
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
              // Group user contributions by airport
            const groupedUserContributions = userData.contributions.reduce((acc, contribution) => {
              const airport = contribution.airportIcao;
              
              if (!acc[airport]) {
                acc[airport] = {
                  airport,
                  contributions: []
                };
              }
              
              acc[airport].contributions.push({
                id: contribution.id,
                scenery: contribution.packageName,
                status: contribution.status,
                lastUpdated: new Date(contribution.submissionDate).toISOString().split('T')[0],
                rejectionReason: contribution.rejectionReason
              });
              
              return acc;
            }, {});
              userContribsArray = Object.values(groupedUserContributions);
            
            // Store the summary data if available
            if (userData.summary) {
              setUserContributionSummary(userData.summary);
            }
          }
        }

        setLeaderboard(formattedLeaderboard);
        setAllContributions(allContribsArray);
        setUserContributions(userContribsArray);
        
      } catch (err) {
        setError('Failed to load contribution data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);
  const handleDownload = async (airportCode, sceneryId) => {
    try {
      // Fetch the specific contribution
      const response = await fetch(`https://v2.stopbars.com/contributions/${sceneryId}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch contribution data');
      }
      
      const contribution = await response.json();
      
      // Create a blob with the XML content
      const blob = new Blob([contribution.submittedXml], { type: 'application/xml' });
      
      // Create a download link and trigger it
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${airportCode}-${contribution.packageName.replace(/\s+/g, '-')}.xml`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
    } catch (error) {
      console.error('Download error:', error);
      alert(`Error downloading XML: ${error.message}`);
    }
  };

  const handleContributeClick = () => {
    navigate('/contribute/new');
  };
  // For "all" tab, only show approved contributions
  // For "user" tab, show all contributions with their statuses
  const filteredContributions = (currentTab === 'all' ? allContributions : userContributions)
    .filter(airport => 
      airport.airport.toLowerCase().includes(searchTerm.toLowerCase()) ||
      airport.contributions.some(c => 
        c.scenery.toLowerCase().includes(searchTerm.toLowerCase())
      )
    );

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen pt-32 pb-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-3xl font-bold mb-2">Community Contributions</h1>
              <p className="text-zinc-400">Help expand the BARS network by contributing your own airport mappings</p>
            </div>
            <Button 
              onClick={handleContributeClick}
              className="flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Contribute New Airport</span>
            </Button>
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left column - Leaderboard */}
            <div>
              <Card className="p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <h2 className="text-xl font-semibold">Top Contributors</h2>
                </div>
                
                <div className="space-y-4">                  
                  {leaderboard.map((contributor, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`
                          w-7 h-7 rounded-full flex items-center justify-center text-sm
                          ${index === 0 ? 'bg-amber-400 text-amber-950' : 
                            index === 1 ? 'bg-zinc-300 text-zinc-800' : 
                            index === 2 ? 'bg-amber-700 text-amber-100' : 'bg-zinc-700'}
                        `}>
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-medium">{contributor.name}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{contributor.contributions}</div>
                        <div className="text-xs text-zinc-400">contributions</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Right column - Contributions list & tabs */}
            <div className="lg:col-span-2">              {/* Tabs */}
              <div className="flex mb-6 border-b border-zinc-800">
                <button
                  className={`px-4 py-2 border-b-2 cursor-pointer ${
                    currentTab === 'all' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                  onClick={() => setCurrentTab('all')}
                >
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4" />
                    <span>All Contributions</span>
                  </div>
                </button>
                
                <button
                  className={`px-4 py-2 border-b-2 ml-4 cursor-pointer ${
                    currentTab === 'user' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                  onClick={() => setCurrentTab('user')}
                  disabled={!user}
                >
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4" />
                    <span>Your Contributions</span>
                  </div>
                </button>
              </div>
              
              {/* User Contribution Summary */}
              {currentTab === 'user' && userContributionSummary && (
                <div className="mb-6 p-4 bg-zinc-800/50 rounded-lg">
                  <h3 className="font-medium mb-3">Your Contribution Summary</h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-zinc-700/50 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold">{userContributionSummary.total}</div>
                      <div className="text-sm text-zinc-400">Total</div>
                    </div>
                    <div className="bg-green-900/30 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold">{userContributionSummary.approved}</div>
                      <div className="text-sm text-green-400">Approved</div>
                    </div>
                    <div className="bg-amber-900/30 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold">{userContributionSummary.pending}</div>
                      <div className="text-sm text-amber-400">Pending</div>
                    </div>
                    <div className="bg-red-900/30 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold">{userContributionSummary.rejected}</div>
                      <div className="text-sm text-red-400">Rejected</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Search bar */}
              <div className="mb-6 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by airport or scenery..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full px-10 py-2 bg-zinc-800 rounded-lg border border-zinc-700 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Contribution list */}
              <div className="space-y-6">
                {filteredContributions.length === 0 && (
                  <div className="p-8 text-center bg-zinc-800/50 rounded-lg">
                    {currentTab === 'user' && !user ? (
                      <>
                        <User className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                        <p className="text-zinc-400">Please sign in to view your contributions</p>
                      </>
                    ) : (
                      <>
                        <Map className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                        <p className="text-zinc-400">
                          No {currentTab === 'user' ? 'personal' : ''} contributions found
                          {searchTerm && ' matching your search criteria'}
                        </p>
                      </>
                    )}
                  </div>
                )}

                {filteredContributions.map(airport => (
                  <Card key={airport.airport} className="p-6 hover:border-zinc-700 transition-colors">
                    <div className="space-y-4">
                      {/* Airport Header */}
                      <div className="flex items-center justify-between border-b border-zinc-700 pb-4">
                        <div>
                          <div className="flex items-center space-x-3 mb-1">
                            <h3 className="font-semibold text-xl">{airport.airport}</h3>
                          </div>
                        </div>
                      </div>                      {/* Scenery Packages */}
                      <div className="space-y-3">
                        {airport.contributions
                          .filter(contribution => currentTab === 'all' ? contribution.status === 'approved' : true)
                          .map(contribution => (
                          <div 
                            key={contribution.id}
                            className={`flex items-center justify-between p-3 rounded-lg ${
                              contribution.status === 'approved' ? 'bg-zinc-800/50' : 
                              contribution.status === 'pending' ? 'bg-amber-900/20 border border-amber-900/40' :
                              contribution.status === 'rejected' ? 'bg-red-900/20 border border-red-900/40' : 
                              'bg-zinc-800/50'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="font-medium">{contribution.scenery}</div>
                              <div className="flex items-center space-x-2">
                                <div className="text-xs text-zinc-400">
                                  Last updated: {contribution.lastUpdated}
                                </div>
                                {currentTab === 'user' && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    contribution.status === 'approved' ? 'bg-green-900/40 text-green-300' : 
                                    contribution.status === 'pending' ? 'bg-amber-900/40 text-amber-300' : 
                                    'bg-red-900/40 text-red-300'
                                  }`}>
                                    {contribution.status.charAt(0).toUpperCase() + contribution.status.slice(1)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {contribution.status === 'approved' && (
                              <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => handleDownload(airport.airport, contribution.id)}
                                className="flex items-center space-x-2 text-xs"
                              >
                                <FileDown className="w-3 h-3" />
                                <span>Download XML</span>
                              </Button>
                            )}
                            {contribution.status === 'pending' && (
                              <div className="text-xs text-amber-400 font-medium">
                                Awaiting Review
                              </div>
                            )}                              
                            {contribution.status === 'rejected' && (
                              <div className="text-xs flex items-center">
                                <span className="text-zinc-400">Rejection reason: </span>
                                <span className="text-red-400 ml-1">{contribution.rejectionReason || 'No reason provided'}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ContributionDashboard;