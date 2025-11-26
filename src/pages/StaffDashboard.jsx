import { useState, useEffect } from 'react';
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
  Loader,
  TowerControl,
  FileUp,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getVatsimToken } from '../utils/cookieUtils';

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
import VatSysProfiles from '../components/staff/VatSysProfiles';
import CacheManagement from '../components/staff/CacheManagement';
import BanManagement from '../components/staff/BanManagement';

// Tab configurations with role requirements
const TABS = {
  // Lead Developer Tabs
  userManagement: {
    id: 'userManagement',
    label: 'User Management',
    icon: Users,
    roles: ['lead_developer'],
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
    roles: ['lead_developer'],
    description: 'Manage software releases and changelogs',
    component: ReleaseManagement,
  },
  packagesManagement: {
    id: 'packagesManagement',
    label: 'BARS Packages',
    icon: Upload,
    roles: ['product_manager', 'lead_developer'],
    description: 'Upload installer data packages (models & removals)',
    component: PackagesManagement,
  },
  vatsysProfiles: {
    id: 'vatsysProfiles',
    label: 'vatSys Profiles',
    icon: FileUp,
    roles: ['product_manager', 'lead_developer'],
    description: 'Manage public vatSys profile XMLs',
    component: VatSysProfiles,
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
    roles: ['lead_developer'],
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

const StaffDashboard = () => {
  const [staffRoles, setStaffRoles] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success] = useState(null);
  const [refreshing, setRefreshing] = useState(false); // Add state for refreshing
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Note: active tab is kept in sync with URL ?tool=<tabId> so refresh/back links persist selection
  const { user } = useAuth();
  const token = getVatsimToken();

  useEffect(() => {
    const fetchStaffRoles = async () => {
      try {
        setLoading(true);

        const response = await fetch('https://v2.stopbars.com/auth/is-staff', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch staff roles');
        }

        const data = await response.json();

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
        setActiveTab(initialTab);

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
        console.error('Error fetching staff roles:', error);
        setError(error.message || 'Failed to load staff dashboard');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchStaffRoles();
    } else {
      setLoading(false);
      setError('Authentication required');
      navigate('/');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate, user]); // Function to refresh the current tab data by simulating a tab change

  // Keep activeTab in sync when the URL param changes (back/forward navigation)
  useEffect(() => {
    if (!staffRoles) return;
    const urlTool = searchParams.get('tool');
    if (!urlTool) return;

    // Validate access for the current roles
    const hasAccess = Object.values(TABS).some(
      (tab) => tab.id === urlTool && tab.roles.some((r) => staffRoles[r.toLowerCase()] === 1)
    );
    if (hasAccess && urlTool !== activeTab) {
      setActiveTab(urlTool);
    }
  }, [searchParams, staffRoles, activeTab]);
  const handleRefresh = async () => {
    if (refreshing) return; // Prevent multiple refreshes

    setRefreshing(true);

    // Store the current tab
    const currentTab = activeTab;

    // Simulate changing away from the tab
    setActiveTab(null);

    // Set a short timeout to ensure the component unmounts
    setTimeout(() => {
      // Change back to the original tab
      setActiveTab(currentTab);

      // Add a slight delay before turning off the refreshing state
      // to make the refresh action visible to the user
      setTimeout(() => {
        setRefreshing(false);
      }, 300);
    }, 100);
  };

  // Check if user has access to a specific tab
  const hasTabAccess = (tab) => {
    if (!staffRoles) return false;

    return tab.roles.some((role) => {
      const normalizedRole = role.toLowerCase();
      return staffRoles[normalizedRole] === 1;
    });
  };

  // Render tab content
  const renderTabContent = () => {
    const currentTab = TABS[activeTab];
    if (!currentTab) return null;

    if (currentTab.component) {
      const TabComponent = currentTab.component;
      return <TabComponent />;
    }

    return (
      <div className="text-center py-12">
        <p className="text-zinc-400">{currentTab.description} (Not implemented yet)</p>
      </div>
    );
  };

  if (loading) {
    return (
      <Layout>
        <div className="pt-32 pb-20">
          <div className="max-w-[1800px] mx-auto px-6 2xl:px-12">
            <div className="flex items-center justify-center h-64">
              <Loader className="w-8 h-8 animate-spin text-zinc-400" />
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
          <div className="max-w-[1800px] mx-auto px-6 2xl:px-12">
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
      <div className="pt-32 pb-20">
        <div className="max-w-[1800px] mx-auto px-6 2xl:px-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Staff Dashboard</h1>
              <p className="text-zinc-400">
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
            <div className="flex items-center space-x-1 mt-4">
              <iframe
                src="https://status.stopbars.com/badge?theme=dark"
                width="200"
                height="30"
                frameBorder="0"
                scrolling="no"
                style={{ colorScheme: 'normal' }}
                title="BARS Status"
              />
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={`p-2 rounded-lg cursor-pointer ${refreshing ? 'bg-blue-500/70' : 'bg-zinc-800 hover:bg-zinc-700'} transition-all duration-200`}
                title="Refresh current tool"
              >
                <RefreshCw className={`w-4 h-4 text-white ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {success && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center space-x-3 mb-6">
              <Check className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-emerald-500">{success}</p>
            </div>
          )}

          <div className="grid grid-cols-12 gap-6">
            {/* Sidebar with tabs */}
            <div className="col-span-3">
              <Card className="p-4 overflow-hidden">
                <nav className="space-y-3">
                  {/* Group tabs by category */}
                  {hasTabAccess(TABS.userManagement) && (
                    <div className="space-y-1 mb-2">
                      <div className="px-4 py-2">
                        <h4 className="text-xs font-medium text-zinc-500">System Management</h4>
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
                              key={tab.id}
                              onClick={() => {
                                setActiveTab(tab.id);
                                // Persist selection in URL (?tool=...)
                                setSearchParams((prev) => {
                                  const params = new URLSearchParams(prev);
                                  params.set('tool', tab.id);
                                  return params;
                                });
                              }}
                              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
                                isActive
                                  ? 'bg-blue-500/90 text-white shadow-md shadow-blue-500/20'
                                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
                              }`}
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
                        <h4 className="text-xs font-medium text-zinc-500">Content Management</h4>
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
                              key={tab.id}
                              onClick={() => {
                                setActiveTab(tab.id);
                                setSearchParams((prev) => {
                                  const params = new URLSearchParams(prev);
                                  params.set('tool', tab.id);
                                  return params;
                                });
                              }}
                              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
                                isActive
                                  ? 'bg-blue-500/90 text-white shadow-md shadow-blue-500/20'
                                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
                              }`}
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
                    (tab) =>
                      ['packagesManagement', 'vatsysProfiles'].includes(tab.id) && hasTabAccess(tab)
                  ) && (
                    <div className="space-y-1 mb-2">
                      <div className="px-4 py-2">
                        <h4 className="text-xs font-medium text-zinc-500">Data Management</h4>
                      </div>
                      {Object.values(TABS)
                        .filter(
                          (tab) =>
                            ['packagesManagement', 'vatsysProfiles'].includes(tab.id) &&
                            hasTabAccess(tab)
                        )
                        .map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              onClick={() => {
                                setActiveTab(tab.id);
                                setSearchParams((prev) => {
                                  const params = new URLSearchParams(prev);
                                  params.set('tool', tab.id);
                                  return params;
                                });
                              }}
                              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
                                isActive
                                  ? 'bg-blue-500/90 text-white shadow-md shadow-blue-500/20'
                                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
                              }`}
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
            <div className="col-span-9">
              <Card className="p-6">{renderTabContent()}</Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default StaffDashboard;
