import { memo, useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
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
  AlertOctagon,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getVatsimToken } from '../utils/cookieUtils';

const groupContributionsByAirport = (contributions) => {
  const grouped = contributions.reduce((acc, contribution) => {
    const airport = contribution.airportIcao;

    if (!acc[airport]) {
      acc[airport] = { airport, contributions: [] };
    }

    acc[airport].contributions.push({
      id: contribution.id,
      scenery: contribution.packageName,
      simulator: contribution.simulator,
      status: contribution.status ?? 'approved',
      lastUpdated: contribution.submissionDate
        ? new Date(contribution.submissionDate).toISOString().split('T')[0]
        : null,
      rejectionReason: contribution.rejectionReason ?? null,
      userDisplayName: contribution.userDisplayName ?? null,
    });

    return acc;
  }, {});

  return Object.values(grouped);
};

/* oxlint-disable react-doctor/no-giant-component react-doctor/prefer-useReducer react-doctor/no-initialize-state react-doctor/exhaustive-deps react-doctor/no-fetch-in-effect react-doctor/prefer-module-scope-pure-function react-doctor/js-combine-iterations -- Dashboard tabs, indicator measurement, request state, and bounded presentation lists are cohesive; staged list transforms remain clearer than accumulator rewrites. */
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

        const [leaderboardResponse, contributionsResponse] = await Promise.all([
          fetch('https://v2.stopbars.com/contributions/leaderboard'),
          fetch('https://v2.stopbars.com/contributions?status=approved&simple=true'),
        ]);

        if (!leaderboardResponse.ok) throw new Error('Failed to fetch leaderboard data');
        if (!contributionsResponse.ok) throw new Error('Failed to fetch contributions');

        const [leaderboardData, contributionsData] = await Promise.all([
          leaderboardResponse.json(),
          contributionsResponse.json(),
        ]);

        // Format leaderboard data
        const formattedLeaderboard = leaderboardData.map((item) => ({
          name: item.name,
          contributions: item.count,
        }));
        const initialContributions = groupContributionsByAirport(
          contributionsData.contributions || []
        );

        setLeaderboard(formattedLeaderboard);
        setAllContributions(initialContributions);
        setLoading(false);

        const publicMetadataPromise = fetch('https://v2.stopbars.com/contributions?status=approved')
          .then((response) => {
            if (!response.ok) throw new Error('Failed to enrich contribution metadata');
            return response.json();
          })
          .then((data) => groupContributionsByAirport(data.contributions || []))
          .catch((error) => {
            console.error(error);
            return null;
          });

        // User contributions (if user is logged in)
        let userContribsArray = [];
        if (vatsimUserId) {
          const userResponse = await fetch(
            `https://v2.stopbars.com/contributions?user=${encodeURIComponent(vatsimUserId)}&summary=true`
          );

          if (userResponse.ok) {
            const userData = await userResponse.json();
            userContribsArray = groupContributionsByAirport(userData.contributions || []);

            // Store the summary data if available
            if (userData.summary) {
              setUserContributionSummary(userData.summary);
            }
          }
        }

        const enrichedContributions = await publicMetadataPromise;
        if (enrichedContributions) setAllContributions(enrichedContributions);
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
        <div className="min-h-screen pt-32 sm:pt-39 pb-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6" aria-busy="true">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 sm:gap-4 mb-8 sm:mb-12">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">Community Contributions</h1>
                <p className="text-zinc-400 text-sm sm:text-base">
                  Help expand the BARS compatibility by contributing your own scenery contributions
                </p>
              </div>
              <div className="h-10 w-56 rounded-lg bg-zinc-800 animate-pulse" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Card className="order-2 lg:order-1 p-4 sm:p-6 min-h-80">
                <div className="h-7 w-44 rounded bg-zinc-800 animate-pulse mb-6" />
                <div className="space-y-4">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className="h-13 rounded-lg bg-zinc-800/60 animate-pulse" />
                  ))}
                </div>
              </Card>
              <div className="lg:col-span-2 order-1 lg:order-2 min-h-150">
                <div className="h-10 border-b border-zinc-800 mb-6" />
                <div className="h-10 rounded-lg bg-zinc-800/60 animate-pulse mb-6" />
                <div className="space-y-6">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-36 rounded-lg border border-zinc-800 bg-zinc-900/40 animate-pulse"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-32 sm:pt-39 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 sm:gap-4 mb-8 sm:mb-12">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">Community Contributions</h1>
              <p className="text-zinc-400 text-sm sm:text-base">
                Help expand the BARS compatibility by contributing your own scenery contributions
              </p>
            </div>
            {!user ? (
              <Tooltip content="You must be logged in to contribute an airport.">
                <Button
                  onClick={handleContributeClick}
                  disabled
                  className="flex items-center space-x-2 opacity-60 cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  <span>Contribute New Airport</span>
                </Button>
              </Tooltip>
            ) : (
              <Button onClick={handleContributeClick} className="flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>Contribute New Airport</span>
              </Button>
            )}
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left column - Leaderboard */}
            <LeaderboardCard leaderboard={leaderboard} />

            {/* Right column - Contributions list & tabs */}
            <div className="lg:col-span-2 order-1 lg:order-2">
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
                  type="button"
                  ref={allTabRef}
                  className={`px-4 py-2 relative z-10 cursor-pointer transition-colors duration-200 border-b-2 ${
                    currentTab === 'all'
                      ? `${tabIndicator.ready ? 'text-white border-transparent' : 'text-white border-blue-500'}`
                      : 'text-zinc-400 hover:text-zinc-200 border-transparent'
                  }`}
                  onClick={() => setCurrentTab('all')}
                >
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 shrink-0 max-[500px]:hidden" />
                    <span>All Contributions</span>
                  </div>
                </button>
                {!user ? (
                  <Tooltip content="You must be logged in to view your contributions.">
                    <button
                      type="button"
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
                        <User className="w-4 h-4 shrink-0 max-[500px]:hidden" />
                        <span>Your Contributions</span>
                      </div>
                    </button>
                  </Tooltip>
                ) : (
                  <button
                    type="button"
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
                      <User className="w-4 h-4 shrink-0 max-[500px]:hidden" />
                      <span>Your Contributions</span>
                    </div>
                  </button>
                )}
              </div>

              {/* User Contribution Summary */}
              {currentTab === 'user' && userContributionSummary && (
                <div className="mb-6 p-4 bg-zinc-800/50 rounded-lg">
                  <h3 className="font-medium mb-3">Your Contribution Summary</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
                  aria-label="Search contributions"
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
                    className="p-4 sm:p-6 hover:border-zinc-700 transition-colors"
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
                              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg ${
                                contribution.status === 'approved'
                                  ? 'bg-zinc-800/50'
                                  : contribution.status === 'pending'
                                    ? 'bg-amber-900/20 border border-amber-900/40'
                                    : contribution.status === 'rejected'
                                      ? 'bg-red-900/20 border border-red-900/40'
                                      : 'bg-zinc-800/50'
                              }`}
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium break-all">
                                    {contribution.scenery}
                                  </span>
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
                                    Last updated: {contribution.lastUpdated ?? 'Loading…'}
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
                                  Last contributor: {contribution.userDisplayName ?? 'Loading…'}
                                </div>
                              </div>
                              {contribution.status === 'approved' && (
                                <button
                                  type="button"
                                  onClick={() => handleDownload(airport.airport, contribution.id)}
                                  className="w-full sm:w-auto shrink-0 px-5 py-2.5 rounded-lg text-sm bg-zinc-800 border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-zinc-100 transition-all duration-200 ease-in-out flex items-center justify-center gap-2"
                                  title="Download XML"
                                >
                                  <FileDown className="w-4 h-4" />
                                  Download XML
                                </button>
                              )}
                              {contribution.status === 'pending' && (
                                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                                  <Button
                                    className="px-4! py-2! text-sm bg-amber-600! hover:bg-amber-700! text-white! w-full sm:w-auto"
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
                                  <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setViewingRejection({
                                          airport: airport.airport,
                                          scenery: contribution.scenery,
                                          reason: contribution.rejectionReason,
                                        })
                                      }
                                      className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm bg-zinc-800 border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:text-zinc-100 transition-all duration-200 ease-in-out flex items-center justify-center gap-2 cursor-pointer"
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
                                  <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                                    <div className="text-xs text-zinc-400">No reason provided</div>
                                    <Button
                                      variant="destructive"
                                      className="px-4! py-2! text-sm w-full sm:w-auto"
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

      <DeleteContributionDialog
        contribution={confirmDelete}
        vatsimToken={vatsimToken}
        onClose={() => setConfirmDelete(null)}
        onDeleted={(deletedContribution) => {
          setUserContributions((previous) =>
            previous
              .map((group) =>
                group.airport === deletedContribution.airport
                  ? {
                      ...group,
                      contributions: group.contributions.filter(
                        (contribution) => contribution.id !== deletedContribution.id
                      ),
                    }
                  : group
              )
              .filter((group) => group.contributions.length > 0)
          );
          setConfirmDelete(null);
          setToastConfig({
            variant: 'success',
            title: 'Contribution Deleted',
            description: 'Your contribution has been successfully deleted.',
          });
          setShowToast(true);
        }}
        onError={() => {
          setToastConfig({
            variant: 'destructive',
            title: 'Deletion Failed',
            description: 'Failed to delete contribution, try again later.',
          });
          setShowToast(true);
        }}
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

const LeaderboardCard = memo(function LeaderboardCard({ leaderboard }) {
  return (
    <div className="order-2 lg:order-1">
      <Card className="p-4 sm:p-6">
        <div className="flex items-center space-x-3 mb-6">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h2 className="text-xl font-semibold">Top Contributors</h2>
        </div>

        <div className="space-y-4">
          {leaderboard.map((contributor, index) => (
            <div
              key={contributor.id ?? contributor.name ?? contributor.userDisplayName}
              className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50"
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                    index === 0
                      ? 'bg-amber-400 text-amber-950'
                      : index === 1
                        ? 'bg-zinc-300 text-zinc-800'
                        : index === 2
                          ? 'bg-amber-700 text-amber-100'
                          : 'bg-zinc-700'
                  }`}
                >
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{contributor.name}</div>
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
  );
});

LeaderboardCard.propTypes = {
  leaderboard: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      name: PropTypes.string.isRequired,
      userDisplayName: PropTypes.string,
      contributions: PropTypes.number.isRequired,
    })
  ).isRequired,
};

function DeleteContributionDialog({ contribution, vatsimToken, onClose, onDeleted, onError }) {
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleClose = () => {
    if (deleting) return;
    setConfirmation('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!contribution) return;
    try {
      setDeleting(true);
      const response = await fetch(`https://v2.stopbars.com/contributions/${contribution.id}`, {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': vatsimToken },
      });
      if (!response.ok) throw new Error('Delete failed');
      setConfirmation('');
      onDeleted(contribution);
    } catch (error) {
      console.error(error);
      onError();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={!!contribution}
      onClose={handleClose}
      icon={AlertCircle}
      iconColor={contribution?.status === 'pending' ? 'orange' : 'red'}
      title="Contribution Deletion"
      description="All contribution and scenery data will be permanently deleted and will no longer be available for approval. This action cannot be undone."
      isLoading={deleting}
      closeOnBackdrop={!deleting}
      closeOnEscape={!deleting}
      onSubmit={handleSubmit}
      fields={
        contribution
          ? [
              {
                type: 'confirmation',
                label: `Type ${contribution.airport}-DELETE to confirm:`,
                confirmText: `${contribution.airport}-DELETE`,
                value: confirmation,
                onChange: setConfirmation,
              },
            ]
          : []
      }
      buttons={[
        {
          label: 'Delete',
          type: 'submit',
          variant: contribution?.status === 'pending' ? 'primary' : 'destructive',
          icon: Trash2,
          loadingLabel: 'Deleting...',
          requiresValidation: true,
        },
        { label: 'Cancel', variant: 'outline', onClick: handleClose },
      ]}
    />
  );
}

DeleteContributionDialog.propTypes = {
  contribution: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    airport: PropTypes.string.isRequired,
    status: PropTypes.string,
  }),
  vatsimToken: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onDeleted: PropTypes.func.isRequired,
  onError: PropTypes.func.isRequired,
};

export default ContributionDashboard;
