import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { Tooltip } from '../components/shared/Tooltip';
import useSearchQuery from '../hooks/useSearchQuery';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { Toast } from '../components/shared/Toast';
import { Dialog } from '../components/shared/Dialog';
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
  const vatsimUserId = useMemo(() => {
    if (!vatsimToken) {
      return null;
    }
    try {
      const segments = vatsimToken.split('.');
      if (segments.length < 2) {
        throw new Error('Malformed JWT');
      }
      const normalized = segments[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const payload = JSON.parse(atob(padded));
      return payload?.sub ?? null;
    } catch (err) {
      console.error('Failed to decode VATSIM token', err);
      return null;
    }
  }, [vatsimToken]);

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
  const [showToast, setShowToast] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    variant: 'success',
    title: '',
    description: '',
  });

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
          'https://v2.stopbars.com/contributions?status=approved'
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
            simulator: contribution.simulator,
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
        if (vatsimUserId) {
          const userResponse = await fetch(
            `https://v2.stopbars.com/contributions?user=${encodeURIComponent(vatsimUserId)}&summary=true`
          );

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
                simulator: contribution.simulator,
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
  }, [vatsimToken, vatsimUserId]);
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
            <Button
              onClick={handleContributeClick}
              disabled
              className="flex items-center space-x-2 opacity-60 cursor-not-allowed"
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
                    className="absolute bottom-0 h-0.5 bg-blue-500 transition-all duration-300 ease-out"
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
                {!user ? (
                  <Tooltip content="You must be logged in to view your contributions.">
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
                  </Tooltip>
                ) : (
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
                )}
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
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{contribution.scenery}</span>
                                  {contribution.simulator && (
                                    <span
                                      className={`text-xs px-2 py-0.5 rounded-full border ${
                                        contribution.simulator === 'msfs2024'
                                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                          : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                      }`}
                                    >
                                      {contribution.simulator === 'msfs2024'
                                        ? 'MSFS 2024'
                                        : contribution.simulator === 'msfs2020'
                                          ? 'MSFS 2020'
                                          : contribution.simulator}
                                    </span>
                                  )}
                                </div>
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
                                    className="px-4! py-2! text-sm bg-amber-600! hover:bg-amber-700! text-white!"
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
                                      className="px-4! py-2! text-sm"
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
                                      className="px-4! py-2! text-sm"
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

      <Dialog
        open={!!viewingRejection}
        onClose={() => setViewingRejection(null)}
        icon={AlertOctagon}
        iconColor="red"
        title="Rejection Reason"
        description={viewingRejection?.reason}
      />

      <Dialog
        open={!!confirmDelete}
        onClose={() => {
          setConfirmDelete(null);
          setDeleteConfirmation('');
        }}
        icon={AlertCircle}
        iconColor={confirmDelete?.status === 'pending' ? 'orange' : 'red'}
        title="Contribution Deletion"
        description="All contribution and scenery data will be permanently deleted and will no longer be available for approval. This action cannot be undone."
        isLoading={deleting}
        closeOnBackdrop={!deleting}
        closeOnEscape={!deleting}
        onSubmit={async () => {
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
                        contributions: group.contributions.filter((c) => c.id !== confirmDelete.id),
                      }
                    : group
                )
                .filter((group) => group.contributions.length > 0)
            );

            setConfirmDelete(null);
            setDeleteConfirmation('');
            setToastConfig({
              variant: 'success',
              title: 'Contribution Deleted',
              description: 'Your contribution has been successfully deleted.',
            });
            setShowToast(true);
          } catch (e) {
            console.error(e);
            setToastConfig({
              variant: 'destructive',
              title: 'Deletion Failed',
              description: 'Failed to delete contribution, try again later.',
            });
            setShowToast(true);
          } finally {
            setDeleting(false);
          }
        }}
        fields={
          confirmDelete
            ? [
                {
                  type: 'confirmation',
                  label: `Type ${confirmDelete.airport}-DELETE to confirm:`,
                  confirmText: `${confirmDelete.airport}-DELETE`,
                  value: deleteConfirmation,
                  onChange: setDeleteConfirmation,
                },
              ]
            : []
        }
        buttons={[
          {
            label: 'Delete',
            type: 'submit',
            variant: confirmDelete?.status === 'pending' ? 'primary' : 'destructive',
            icon: Trash2,
            loadingLabel: 'Deleting...',
            requiresValidation: true,
          },
          {
            label: 'Cancel',
            variant: 'outline',
            onClick: () => {
              setConfirmDelete(null);
              setDeleteConfirmation('');
            },
          },
        ]}
      />

      <Toast
        show={showToast}
        title={toastConfig.title}
        description={toastConfig.description}
        variant={toastConfig.variant}
        onClose={() => setShowToast(false)}
      />
    </Layout>
  );
};

export default ContributionDashboard;
