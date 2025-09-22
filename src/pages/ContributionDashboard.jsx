import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import useSearchQuery from '../hooks/useSearchQuery';
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
  Loader,
  AlertOctagon,
  X,
  Trash2,
  AlertCircle,
  TowerControl,
  Box,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getVatsimToken } from '../utils/cookieUtils';

const ContributionDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const vatsimToken = getVatsimToken();

  const [loading, setLoading] = useState(true);
  const [, setError] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [allContributions, setAllContributions] = useState([]);
  const [userContributions, setUserContributions] = useState([]);
  const [userContributionSummary, setUserContributionSummary] = useState(null);
  const [searchTerm, setSearchTerm] = useSearchQuery();
  const [currentTab, setCurrentTab] = useState('all');
  const [viewingRejection, setViewingRejection] = useState(null); // { airport, scenery, reason }
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, airport, scenery }
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message }

  // Tab underline animation refs/state
  const allTabRef = useRef(null);
  const userTabRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0, ready: false });

  // On mount, set tab indicator if refs are available (fixes first click animation issue)
  useEffect(() => {
    let rafId;
    function pollForRefs() {
      const activeEl = allTabRef.current;
      const container = tabsContainerRef.current;
      if (activeEl && container) {
        const rect = activeEl.getBoundingClientRect();
        const parentRect = container.getBoundingClientRect();
        const left = rect.left - parentRect.left;
        const width = rect.width;
        setTabIndicator({ left, width, ready: true });
      } else {
        rafId = requestAnimationFrame(pollForRefs);
      }
    }
    pollForRefs();
    return () => rafId && cancelAnimationFrame(rafId);
  }, []);

  // Helper to update tab indicator
  const updateTabIndicator = () => {
    const activeEl = currentTab === 'all' ? allTabRef.current : userTabRef.current;
    const container = tabsContainerRef.current;
    if (activeEl && container) {
      const rect = activeEl.getBoundingClientRect();
      const parentRect = container.getBoundingClientRect();
      const left = rect.left - parentRect.left;
      const width = rect.width;
      setTabIndicator({ left, width, ready: true });
    }
  };

  useLayoutEffect(() => {
    updateTabIndicator();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab, user]);

  useEffect(() => {
    const handleResize = () => {
      const activeEl = currentTab === 'all' ? allTabRef.current : userTabRef.current;
      const container = tabsContainerRef.current;
      if (activeEl && container) {
        const rect = activeEl.getBoundingClientRect();
        const parentRect = container.getBoundingClientRect();
        setTabIndicator((t) => ({ ...t, left: rect.left - parentRect.left, width: rect.width }));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentTab]);
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch leaderboard data
        const leaderboardResponse = await fetch(
          'https://v2.stopbars.com/contributions/leaderboard'
        );
        if (!leaderboardResponse.ok) {
          throw new Error('Failed to fetch leaderboard data');
        }
        const leaderboardData = await leaderboardResponse.json();
        // Format leaderboard data
        const formattedLeaderboard = leaderboardData.map((item) => ({
          name: item.name,
          contributions: item.count,
        }));

        // Fetch all approved contributions
        const contributionsResponse = await fetch(
          'https://v2.stopbars.com/contributions?status=approved&limit=100'
        );
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
              contributions: [],
            };
          }

          acc[airport].contributions.push({
            id: contribution.id,
            scenery: contribution.packageName,
            status: contribution.status,
            lastUpdated: new Date(contribution.submissionDate).toISOString().split('T')[0],
            rejectionReason: contribution.rejectionReason,
            userDisplayName: contribution.userDisplayName,
          });
          (AlertCircle, TowerControl, Box);
          return acc;
        }, {});

        // Convert the grouped object to an array
        const allContribsArray = Object.values(groupedContributions);

        // User contributions (if user is logged in)
        let userContribsArray = [];
        if (user) {
          const userResponse = await fetch('https://v2.stopbars.com/contributions/user', {
            headers: {
              'X-Vatsim-Token': vatsimToken,
            },
          });

          if (userResponse.ok) {
            const userData = await userResponse.json();
            // Group user contributions by airport
            const groupedUserContributions = userData.contributions.reduce((acc, contribution) => {
              const airport = contribution.airportIcao;

              if (!acc[airport]) {
                acc[airport] = {
                  airport,
                  contributions: [],
                };
              }

              acc[airport].contributions.push({
                id: contribution.id,
                scenery: contribution.packageName,
                status: contribution.status,
                lastUpdated: new Date(contribution.submissionDate).toISOString().split('T')[0],
                rejectionReason: contribution.rejectionReason,
                userDisplayName: contribution.userDisplayName,
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
  }, [user, vatsimToken]);
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
  const filteredContributions = (
    currentTab === 'all' ? allContributions : userContributions
  ).filter(
    (airport) =>
      airport.airport.toLowerCase().includes(searchTerm.toLowerCase()) ||
      airport.contributions.some((c) => c.scenery.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen pt-32 pb-20 flex items-center">
          <div className="w-full max-w-7xl mx-auto px-6">
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center">
                <Loader className="w-9 h-9 animate-spin text-zinc-400" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-39 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-12">
            <div>
              <h1 className="text-3xl font-bold mb-2">Community Contributions</h1>
              <p className="text-zinc-400">
                Help expand the BARS network by contributing your own airport mappings
              </p>
            </div>
            <Button onClick={handleContributeClick} className="flex items-center space-x-2">
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
                        <div
                          className={`
                          w-7 h-7 rounded-full flex items-center justify-center text-sm
                          ${
                            index === 0
                              ? 'bg-amber-400 text-amber-950'
                              : index === 1
                                ? 'bg-zinc-300 text-zinc-800'
                                : index === 2
                                  ? 'bg-amber-700 text-amber-100'
                                  : 'bg-zinc-700'
                          }
                        `}
                        >
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
            <div className="lg:col-span-2">
              {/* Tabs */}
              <div
                ref={tabsContainerRef}
                className="relative flex mb-6 border-b border-zinc-800 select-none"
              >
                {/* Animated underline */}
                {tabIndicator.ready && (
                  <span
                    className="absolute bottom-0 h-[2px] bg-blue-500 transition-all duration-300 ease-out"
                    style={{ left: tabIndicator.left, width: tabIndicator.width }}
                  />
                )}
                <button
                  ref={allTabRef}
                  className={`px-4 py-2 relative z-10 cursor-pointer transition-colors duration-200 border-b-2 ${
                    currentTab === 'all'
                      ? `${tabIndicator.ready ? 'text-white border-transparent' : 'text-white border-blue-500'}`
                      : 'text-zinc-400 hover:text-zinc-200 border-transparent'
                  }`}
                  onClick={() => setCurrentTab('all')}
                >
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4" />
                    <span>All Contributions</span>
                  </div>
                </button>
                <button
                  ref={userTabRef}
                  className={`px-4 py-2 ml-4 relative z-10 cursor-pointer transition-colors duration-200 border-b-2 ${
                    currentTab === 'user'
                      ? `${tabIndicator.ready ? 'text-white border-transparent' : 'text-white border-blue-500'}`
                      : 'text-zinc-400 hover:text-zinc-200 border-transparent'
                  } ${!user ? 'opacity-40 cursor-not-allowed' : ''}`}
                  onClick={() => user && setCurrentTab('user')}
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
                  onChange={(e) => setSearchTerm(e.target.value)}
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

                {filteredContributions.map((airport) => (
                  <Card
                    key={airport.airport}
                    className="p-6 hover:border-zinc-700 transition-colors"
                  >
                    <div className="space-y-4">
                      {/* Airport Header */}
                      <div className="flex items-center justify-between border-b border-zinc-700 pb-4">
                        <div>
                          <div className="flex items-center space-x-3 mb-1">
                            <h3 className="font-semibold text-xl">{airport.airport}</h3>
                          </div>
                        </div>
                      </div>
                      {/* Scenery Packages */}
                      <div className="space-y-3">
                        {airport.contributions
                          .filter((contribution) =>
                            currentTab === 'all' ? contribution.status === 'approved' : true
                          )
                          .map((contribution) => (
                            <div
                              key={contribution.id}
                              className={`flex items-center justify-between p-3 rounded-lg ${
                                contribution.status === 'approved'
                                  ? 'bg-zinc-800/50'
                                  : contribution.status === 'pending'
                                    ? 'bg-amber-900/20 border border-amber-900/40'
                                    : contribution.status === 'rejected'
                                      ? 'bg-red-900/20 border border-red-900/40'
                                      : 'bg-zinc-800/50'
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="font-medium">{contribution.scenery}</div>
                                <div className="flex items-center space-x-2">
                                  <div className="text-xs text-zinc-400">
                                    Last updated: {contribution.lastUpdated}
                                  </div>
                                  {currentTab === 'user' && (
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded-full ${
                                        contribution.status === 'approved'
                                          ? 'bg-green-900/40 text-green-300'
                                          : contribution.status === 'pending'
                                            ? 'bg-amber-900/40 text-amber-300'
                                            : 'bg-red-900/40 text-red-300'
                                      }`}
                                    >
                                      {contribution.status.charAt(0).toUpperCase() +
                                        contribution.status.slice(1)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-zinc-400">
                                  Last contributor: {contribution.userDisplayName}
                                </div>
                              </div>
                              {contribution.status === 'approved' && (
                                <button
                                  onClick={() => handleDownload(airport.airport, contribution.id)}
                                  className="px-5 py-2.5 rounded-lg text-sm bg-zinc-800 border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-zinc-100 transition-all duration-200 ease-in-out flex items-center gap-2"
                                  title="Download XML"
                                >
                                  <FileDown className="w-4 h-4" />
                                  Download XML
                                </button>
                              )}
                              {contribution.status === 'pending' && (
                                <div className="flex items-center gap-2">
                                  <Button
                                    className="!px-4 !py-2 text-sm !bg-amber-600 hover:!bg-amber-700 !text-white"
                                    onClick={() =>
                                      setConfirmDelete({
                                        id: contribution.id,
                                        airport: airport.airport,
                                        scenery: contribution.scenery,
                                        status: contribution.status,
                                      })
                                    }
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete
                                  </Button>
                                </div>
                              )}
                              {contribution.status === 'rejected' &&
                                (contribution.rejectionReason ? (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() =>
                                        setViewingRejection({
                                          airport: airport.airport,
                                          scenery: contribution.scenery,
                                          reason: contribution.rejectionReason,
                                        })
                                      }
                                      className="px-4 py-2 rounded-lg text-sm bg-zinc-800 border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-zinc-100 transition-all duration-200 ease-in-out flex items-center gap-2 cursor-pointer"
                                      title="View Reason"
                                    >
                                      <AlertOctagon className="w-4 h-4" />
                                      View Reason
                                    </button>
                                    <Button
                                      variant="destructive"
                                      className="!px-4 !py-2 text-sm"
                                      onClick={() =>
                                        setConfirmDelete({
                                          id: contribution.id,
                                          airport: airport.airport,
                                          scenery: contribution.scenery,
                                          status: contribution.status,
                                        })
                                      }
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <div className="text-xs text-zinc-400">No reason provided</div>
                                    <Button
                                      variant="destructive"
                                      className="!px-4 !py-2 text-sm"
                                      onClick={() =>
                                        setConfirmDelete({
                                          id: contribution.id,
                                          airport: airport.airport,
                                          scenery: contribution.scenery,
                                          status: contribution.status,
                                        })
                                      }
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </Button>
                                  </div>
                                ))}
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

      {viewingRejection && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <AlertOctagon className="w-6 h-6 text-red-500" />
                <h3 className="text-xl font-semibold text-red-500">Rejection Reason</h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setViewingRejection(null)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg max-h-64 overflow-y-auto">
                <div className="space-y-2 mb-3">
                  <div className="flex items-center space-x-2 text-red-200">
                    <TowerControl className="w-4 h-4" />
                    <span>ICAO: {viewingRejection.airport}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-red-200">
                    <Box className="w-4 h-4" />
                    <span>Scenery: {viewingRejection.scenery}</span>
                  </div>
                </div>
                <div className="whitespace-pre-wrap break-words text-red-200">
                  {viewingRejection.reason}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in zoom-in-95">
          <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
            <div className="flex items-center space-x-3 mb-6">
              <AlertCircle
                className={`w-6 h-6 ${confirmDelete.status === 'pending' ? 'text-amber-500' : 'text-red-500'}`}
              />
              <h3
                className={`text-xl font-bold ${confirmDelete.status === 'pending' ? 'text-amber-500' : 'text-red-500'}`}
              >
                Confirm Contribution Deletion
              </h3>
            </div>
            <div className="space-y-4">
              <div
                className={`p-4 rounded-lg ${confirmDelete.status === 'pending' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-red-500/10 border border-red-500/20'}`}
              >
                <p className="text-zinc-200 mb-3">
                  You are about to delete the following contribution:
                </p>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 text-zinc-200">
                    <TowerControl className="w-4 h-4" />
                    <span>ICAO: {confirmDelete.airport}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-zinc-200">
                    <Box className="w-4 h-4" />
                    <span>Scenery: {confirmDelete.scenery}</span>
                  </div>
                </div>
              </div>
              <p className="text-zinc-300">
                All contribution and scenery data will be permanently deleted and will no longer be
                available for approval. This action cannot be undone.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const expectedConfirmation = `${confirmDelete.airport}-DELETE`;
                  if (deleteConfirmation === expectedConfirmation) {
                    (async () => {
                      if (!confirmDelete) return;
                      try {
                        setDeleting(true);
                        const response = await fetch(
                          `https://v2.stopbars.com/contributions/${confirmDelete.id}`,
                          {
                            method: 'DELETE',
                            headers: {
                              'X-Vatsim-Token': vatsimToken,
                            },
                          }
                        );
                        if (!response.ok) {
                          throw new Error('Delete failed');
                        }

                        setUserContributions((prev) =>
                          prev
                            .map((group) =>
                              group.airport === confirmDelete.airport
                                ? {
                                    ...group,
                                    contributions: group.contributions.filter(
                                      (c) => c.id !== confirmDelete.id
                                    ),
                                  }
                                : group
                            )
                            .filter((group) => group.contributions.length > 0)
                        );

                        setConfirmDelete(null);
                        setDeleteConfirmation('');
                        setToast({ type: 'success', message: 'Contribution successfully deleted' });
                      } catch (e) {
                        console.error(e);
                        setToast({
                          type: 'error',
                          message: 'Failed to delete contribution, try again later',
                        });
                      } finally {
                        setDeleting(false);
                        setTimeout(() => setToast(null), 3000);
                      }
                    })();
                  }
                }}
              >
                <div>
                  <label className="block text-sm font-medium mb-2 text-zinc-300">
                    Type {confirmDelete.airport}-DELETE to confirm:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    onPaste={(e) => e.preventDefault()}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-red-500"
                    disabled={deleting}
                  />
                </div>
                <div className="flex space-x-3 mt-6">
                  <Button
                    type="submit"
                    className={`${
                      deleteConfirmation === `${confirmDelete.airport}-DELETE` && !deleting
                        ? confirmDelete.status === 'pending'
                          ? '!bg-amber-600 hover:!bg-amber-700 text-white'
                          : '!bg-red-500 hover:!bg-red-600 text-white'
                        : '!bg-zinc-700 !text-zinc-400 cursor-not-allowed'
                    }`}
                    disabled={deleteConfirmation !== `${confirmDelete.airport}-DELETE` || deleting}
                  >
                    {deleting ? (
                      <>
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Contribution
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setConfirmDelete(null);
                      setDeleteConfirmation('');
                    }}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-8 left-8 p-4 rounded-lg z-50 animate-in fade-in slide-in-from-bottom-4 border ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500'
              : 'bg-red-500/10 border-red-500 text-red-500'
          }`}
        >
          <p>{toast.message}</p>
        </div>
      )}
    </Layout>
  );
};

export default ContributionDashboard;
