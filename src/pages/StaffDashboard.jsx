import { useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { useAuth } from '../hooks/useAuth';
import {
  Users,
  Shield,
  FileQuestion,
  Building2,
  Upload,
  Map,
  MessageSquareWarning,
  MessageSquare,
  Settings,
  AlertTriangle,
  Check,
  RefreshCw,
  TowerControl,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Dropdown } from '../components/shared/Dropdown';
import { getVatsimToken } from '../utils/cookieUtils';
import { PageLoading } from '../components/shared/PageLoading';

// Import existing components
import UserManagement from '../components/staff/UserManagement';
import ContributionManagement from '../components/staff/ContributionManagement';
import NotamManagement from '../components/staff/notamManagement';
import DivisionManagement from '../components/staff/DivisionManagement';
import AirportManagement from '../components/staff/AirportManagement';
import FAQManagement from '../components/staff/FAQManagement';
import ReleaseManagement from '../components/staff/ReleaseManagement';
import StaffManagement from '../components/staff/StaffManagement';
import ContactMessages from '../components/staff/ContactMessages';
import PackagesManagement from '../components/staff/PackagesManagement';
import CacheManagement from '../components/staff/CacheManagement';
import BanManagement from '../components/staff/BanManagement';

// Tab configurations with role requirements
const TABS = {
  // Lead Developer Tabs
  userManagement: {
    id: 'userManagement',
    label: 'User Management',
    icon: Users,
    roles: ['lead_developer', 'product_manager'],
    description: 'Manage user accounts and permissions',
    component: UserManagement,
  },
  staffManagement: {
    id: 'staffManagement',
    label: 'Staff Management',
    icon: Shield,
    roles: ['lead_developer'],
    description: 'Manage staff roles and permissions',
    component: StaffManagement,
  },
  divisionManagement: {
    id: 'divisionManagement',
    label: 'Division Management',
    icon: Building2,
    roles: ['lead_developer', 'product_manager'],
    description: 'Manage divisions and their settings',
    component: DivisionManagement,
  },
  releaseManagement: {
    id: 'releaseManagement',
    label: 'Release Management',
    icon: Upload,
    roles: ['lead_developer', 'product_manager'],
    description: 'Manage software releases and changelogs',
    component: ReleaseManagement,
  },
  packagesManagement: {
    id: 'packagesManagement',
    label: 'BARS Packages',
    icon: Upload,
    roles: ['lead_developer'],
    description: 'Upload installer data packages (models & removals)',
    component: PackagesManagement,
  },
  cacheManagement: {
    id: 'cacheManagement',
    label: 'Cache Management',
    icon: Settings,
    roles: ['lead_developer'],
    description: 'Purge cache keys and namespaces',
    component: CacheManagement,
  },
  banManagement: {
    id: 'banManagement',
    label: 'Ban Management',
    icon: AlertTriangle,
    roles: ['lead_developer', 'product_manager'],
    description: 'List, create, and remove user bans',
    component: BanManagement,
  },

  // Product Manager & Lead Developer Tabs
  airportManagement: {
    id: 'airportManagement',
    label: 'Airport Management',
    icon: TowerControl,
    roles: ['product_manager', 'lead_developer'],
    description: 'Review and approve airport submissions',
    component: AirportManagement,
  },
  contributionManagement: {
    id: 'contributionManagement',
    label: 'Contribution Management',
    icon: Map,
    roles: ['product_manager', 'lead_developer'],
    description: 'Review and manage user contributions',
    component: ContributionManagement,
  },
  notamManagement: {
    id: 'notamManagement',
    label: 'NOTAM Management',
    icon: MessageSquareWarning,
    roles: ['product_manager', 'lead_developer'],
    description: 'Update and post new website NOTAMs',
    component: NotamManagement,
  },
  faqManagement: {
    id: 'faqManagement',
    label: 'FAQ Management',
    icon: FileQuestion,
    roles: ['product_manager', 'lead_developer'],
    description: 'Manage and update the FAQ section',
    component: FAQManagement,
  },
  contactMessages: {
    id: 'contactMessages',
    label: 'Contact Messages',
    icon: MessageSquare,
    roles: ['product_manager', 'lead_developer'],
    description: 'View and respond to user contact messages',
    component: ContactMessages,
  },
};

// The dashboard coordinates a small, fixed tab registry; splitting it or replacing bounded
// filter/map passes would add complexity without changing user-visible performance. The slow
// status pulse matches the footer's deliberately ambient health indicator.
// oxlint-disable react-doctor/no-giant-component react-doctor/js-combine-iterations react-doctor/no-chain-state-updates react-doctor/no-long-transition-duration
const StaffDashboard = () => {
  const [staffRoles, setStaffRoles] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success] = useState(null);
  const [refreshing, setRefreshing] = useState(false); // Add state for refreshing
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusColor, setStatusColor] = useState('bg-gray-400');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // The URL is the source of truth for the active tool so clicks and browser navigation
  // cannot race against a second, local copy of the selection.
  const { user } = useAuth();
  const token = getVatsimToken();

  // Match the footer's health indicator without embedding the status page.
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect -- Health polling owns cancellation and refreshes infrequently.
  useEffect(() => {
    let activeController;

    const fetchStatus = async () => {
      activeController?.abort();
      activeController = new AbortController();

      try {
        const response = await fetch('https://v2.stopbars.com/health', {
          signal: activeController.signal,
        });
        const data = await response.json();
        const services = Object.values(data);
        const okCount = services.filter((status) => status === 'ok').length;

        if (okCount === services.length) setStatusColor('bg-green-400');
        else if (okCount === 0) setStatusColor('bg-red-400');
        else setStatusColor('bg-orange-400');
      } catch (statusError) {
        if (statusError.name !== 'AbortError') setStatusColor('bg-gray-400');
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 300000);

    return () => {
      clearInterval(interval);
      activeController?.abort();
    };
  }, []);

  // The request is aborted when authentication inputs change or the page unmounts.
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const fetchStaffRoles = async () => {
      try {
        setLoading(true);

        const response = await fetch('https://v2.stopbars.com/auth/is-staff', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch staff roles');
        }

        const data = await response.json();
        if (!active) return;

        // Prepare roles object
        const roles = {};

        // Add staff role
        if (data.isStaff && data.role) {
          roles[data.role.toLowerCase()] = 1;
        }

        // Add user roles if present
        if (user?.roles) {
          Object.assign(roles, user.roles);
        }

        setStaffRoles(roles);

        // Determine accessible tabs from the fetched roles
        const accessibleTabs = Object.values(TABS).filter((tab) =>
          tab.roles.some((role) => roles[role.toLowerCase()] === 1)
        );

        if (accessibleTabs.length === 0) {
          // No accessible tabs - redirect to account page
          navigate('/account');
          setError('You do not have access to the staff dashboard');
          return;
        }

        // Read the desired tool from URL and validate access
        const urlTool = searchParams.get('tool');
        const isUrlToolValid = urlTool && accessibleTabs.some((t) => t.id === urlTool);

        const initialTab = isUrlToolValid ? urlTool : accessibleTabs[0].id;

        // If URL didn't have a valid tool, update it to reflect the chosen tab
        if (!isUrlToolValid) {
          setSearchParams(
            (prev) => {
              const params = new URLSearchParams(prev);
              params.set('tool', initialTab);
              return params;
            },
            { replace: true }
          );
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error fetching staff roles:', error);
        setError(error.message || 'Failed to load staff dashboard');
      } finally {
        if (active) setLoading(false);
      }
    };

    if (token) {
      fetchStaffRoles();
    } else {
      setLoading(false);
      setError('Authentication required');
      navigate('/');
    }
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate, user]); // Function to refresh the current tab data by simulating a tab change

  const handleRefresh = () => {
    if (refreshing) return; // Prevent multiple refreshes

    setRefreshing(true);
    setRefreshKey((key) => key + 1);
    setTimeout(() => {
      setRefreshing(false);
    }, 300);
  };

  // Mobile nav options — grouped with section headers and icons
  const mobileNavOptions = useMemo(() => {
    if (!staffRoles) return [];
    const hasAccess = (tab) => tab.roles.some((r) => staffRoles[r.toLowerCase()] === 1);
    const groups = [
      {
        label: 'System Management',
        ids: [
          'userManagement',
          'staffManagement',
          'divisionManagement',
          'cacheManagement',
          'banManagement',
          'releaseManagement',
        ],
      },
      {
        label: 'Content Management',
        ids: [
          'airportManagement',
          'contributionManagement',
          'notamManagement',
          'faqManagement',
          'contactMessages',
        ],
      },
      {
        label: 'Data Management',
        ids: ['packagesManagement'],
      },
    ];
    const opts = [];
    for (const group of groups) {
      const tabs = group.ids.map((id) => TABS[id]).filter((tab) => tab && hasAccess(tab));
      if (tabs.length > 0) {
        opts.push({ label: group.label, isHeader: true });
        for (const tab of tabs) {
          opts.push({ value: tab.id, label: tab.label, icon: tab.icon });
        }
      }
    }
    return opts;
  }, [staffRoles]);

  // Check if user has access to a specific tab
  const hasTabAccess = (tab) => {
    if (!staffRoles) return false;

    return tab.roles.some((role) => {
      const normalizedRole = role.toLowerCase();
      return staffRoles[normalizedRole] === 1;
    });
  };

  const requestedTab = searchParams.get('tool');
  const activeTab =
    Object.values(TABS).find((tab) => tab.id === requestedTab && hasTabAccess(tab))?.id ??
    Object.values(TABS).find(hasTabAccess)?.id ??
    null;
  const activeTabConfig = TABS[activeTab];
  const ActiveToolComponent = activeTabConfig?.component;

  if (loading) {
    return <PageLoading page label="Loading staff dashboard…" />;
  }

  if (error) {
    return (
      <Layout>
        <div className="pt-32 pb-20">
          <div className="max-w-450 mx-auto px-6 2xl:px-12">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-red-500">{error}</p>
            </div>
            <Button onClick={() => navigate('/account')} className="mt-4">
              Back to Account
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="staff-dashboard pt-28 pb-20 sm:pt-32">
        <div className="max-w-450 mx-auto px-6 2xl:px-12">
          <div className="flex flex-col gap-4 mb-7 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Staff Dashboard</h1>
              <p className="mt-1.5 text-sm text-zinc-400">
                {(() => {
                  const hour = new Date().getHours();
                  let greeting;
                  if (hour < 12) greeting = 'Good morning';
                  else if (hour < 18) greeting = 'Good afternoon';
                  else greeting = 'Good evening';
                  const firstName =
                    user?.first_name ||
                    (user?.full_name || user?.fullName || user?.name || user?.email || '').split(
                      ' '
                    )[0] ||
                    'there';
                  return `${greeting}, ${firstName}`;
                })()}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-1.5">
              <a
                href="https://status.stopbars.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden min-h-9 items-center gap-2 rounded-lg bg-zinc-800 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white sm:inline-flex"
                aria-label="Open BARS service status"
              >
                <span>Status</span>
                <span className="relative mt-0.5 h-2.5 w-2.5 shrink-0">
                  <span
                    className={`block h-2.5 w-2.5 rounded-full ${statusColor} transition-colors duration-300`}
                  />
                  <span
                    className={`absolute inset-0 h-2.5 w-2.5 rounded-full ${statusColor} animate-pulse opacity-50`}
                    style={{ animationDuration: '3s' }}
                  />
                  <span
                    className={`absolute -inset-0.5 h-3.5 w-3.5 rounded-full ${statusColor} animate-ping opacity-20`}
                    style={{ animationDuration: '3s' }}
                  />
                </span>
              </a>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border transition-colors duration-150 ${refreshing ? 'border-blue-500/30 bg-blue-500/15 text-blue-300' : 'border-transparent bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'}`}
                aria-label="Refresh current tool"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {success && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center space-x-3 mb-6">
              <Check className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-emerald-500">{success}</p>
            </div>
          )}

          {/* Mobile nav dropdown */}
          {activeTab && mobileNavOptions.length > 0 && (
            <div className="md:hidden mb-4">
              <Dropdown
                options={mobileNavOptions}
                value={activeTab}
                onChange={(tabId) => {
                  setSearchParams((prev) => {
                    const params = new URLSearchParams(prev);
                    params.set('tool', tabId);
                    return params;
                  });
                }}
                placeholder="Select a tool..."
              />
            </div>
          )}

          <div className="grid grid-cols-12 items-start gap-5">
            {/* Sidebar with tabs — hidden on mobile */}
            <div className="hidden md:block md:col-span-3">
              <Card className="sticky top-24 overflow-hidden p-3">
                <nav className="space-y-2" aria-label="Staff tools">
                  {/* Group tabs by category */}
                  {hasTabAccess(TABS.userManagement) && (
                    <div className="space-y-1 mb-2">
                      <div className="px-4 py-2">
                        <h4 className="text-xs font-medium text-zinc-500">System management</h4>
                      </div>
                      {Object.values(TABS)
                        .filter(
                          (tab) =>
                            [
                              'userManagement',
                              'staffManagement',
                              'divisionManagement',
                              'cacheManagement',
                              'banManagement',
                              'releaseManagement',
                            ].includes(tab.id) && hasTabAccess(tab)
                        )
                        .map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;

                          return (
                            <button
                              type="button"
                              key={tab.id}
                              onClick={() => {
                                // Persist selection in URL (?tool=...)
                                setSearchParams((prev) => {
                                  const params = new URLSearchParams(prev);
                                  params.set('tool', tab.id);
                                  return params;
                                });
                              }}
                              className={`w-full flex items-center space-x-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
                                isActive
                                  ? 'border-blue-500/25 bg-blue-500/12 text-blue-200'
                                  : 'border-transparent text-zinc-400 hover:bg-zinc-800/70 hover:text-white'
                              }`}
                              aria-current={isActive ? 'page' : undefined}
                            >
                              <Icon className="w-4 h-4 shrink-0" />
                              <span className="text-sm">{tab.label}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}

                  {/* Content Management Group */}
                  {Object.values(TABS).some(
                    (tab) =>
                      [
                        'airportManagement',
                        'contributionManagement',
                        'notamManagement',
                        'faqManagement',
                        'contactMessages',
                      ].includes(tab.id) && hasTabAccess(tab)
                  ) && (
                    <div className="space-y-1 mb-2">
                      <div className="px-4 py-2">
                        <h4 className="text-xs font-medium text-zinc-500">Content management</h4>
                      </div>
                      {Object.values(TABS)
                        .filter(
                          (tab) =>
                            [
                              'airportManagement',
                              'contributionManagement',
                              'notamManagement',
                              'faqManagement',
                              'contactMessages',
                            ].includes(tab.id) && hasTabAccess(tab)
                        )
                        .map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;

                          return (
                            <button
                              type="button"
                              key={tab.id}
                              onClick={() => {
                                setSearchParams((prev) => {
                                  const params = new URLSearchParams(prev);
                                  params.set('tool', tab.id);
                                  return params;
                                });
                              }}
                              className={`w-full flex items-center space-x-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
                                isActive
                                  ? 'border-blue-500/25 bg-blue-500/12 text-blue-200'
                                  : 'border-transparent text-zinc-400 hover:bg-zinc-800/70 hover:text-white'
                              }`}
                              aria-current={isActive ? 'page' : undefined}
                            >
                              <Icon className="w-4 h-4 shrink-0" />
                              <span className="text-sm">{tab.label}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                  {/* Data Management Group (packages) */}
                  {Object.values(TABS).some(
                    (tab) => ['packagesManagement'].includes(tab.id) && hasTabAccess(tab)
                  ) && (
                    <div className="space-y-1 mb-2">
                      <div className="px-4 py-2">
                        <h4 className="text-xs font-medium text-zinc-500">Data management</h4>
                      </div>
                      {Object.values(TABS)
                        .filter(
                          (tab) => ['packagesManagement'].includes(tab.id) && hasTabAccess(tab)
                        )
                        .map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              type="button"
                              key={tab.id}
                              onClick={() => {
                                setSearchParams((prev) => {
                                  const params = new URLSearchParams(prev);
                                  params.set('tool', tab.id);
                                  return params;
                                });
                              }}
                              className={`w-full flex items-center space-x-3 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${
                                isActive
                                  ? 'border-blue-500/25 bg-blue-500/12 text-blue-200'
                                  : 'border-transparent text-zinc-400 hover:bg-zinc-800/70 hover:text-white'
                              }`}
                              aria-current={isActive ? 'page' : undefined}
                            >
                              <Icon className="w-4 h-4 shrink-0" />
                              <span className="text-sm">{tab.label}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                </nav>
              </Card>
            </div>

            {/* Main content area */}
            <div className="col-span-12 md:col-span-9">
              <Card className="staff-tool-surface min-w-0 overflow-hidden p-0">
                {ActiveToolComponent ? (
                  <ActiveToolComponent key={`${activeTabConfig.id}-${refreshKey}`} />
                ) : activeTabConfig ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-zinc-400">
                      {activeTabConfig.description} (Not implemented yet)
                    </p>
                  </div>
                ) : null}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
// oxlint-enable react-doctor/no-giant-component react-doctor/js-combine-iterations react-doctor/no-chain-state-updates react-doctor/no-long-transition-duration

export default StaffDashboard;
