import { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { useAuth } from '../context/AuthContext';
import { 
  BarChart2, 
  Users, 
  ClipboardList,
  Shield,
  BookOpen,
  FileQuestion,
  Building2,
  Upload,
  Map,
  MessageSquareWarning,
  Settings,
  AlertTriangle,
  Check,
  RefreshCw,
  Loader,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Import existing components
import UserManagement from '../components/staff/UserManagement';
import ContributionManagement from '../components/staff/ContributionManagement';
import NotamManagement from '../components/staff/notamManagement';
import DivisionManagement from '../components/staff/DivisionManagement';
import AirportManagement from '../components/staff/AirportManagement';

// Tab configurations with role requirements
const TABS = {
  // Lead Developer Tabs
  userManagement: {
    id: 'userManagement',
    label: 'User Management',
    icon: Users,
    roles: ['lead_developer'],
    description: 'Manage user accounts and permissions',
    component: UserManagement
  },
  staffManagement: {
    id: 'staffManagement',
    label: 'Staff Management',
    icon: Shield,
    roles: ['lead_developer'],
    description: 'Manage staff roles and permissions',
    component: () => <div>Staff Management Component (Coming Soon)</div>
  },
  divisionManagement: {
    id: 'divisionManagement',
    label: 'Division Management',
    icon: Building2,
    roles: ['lead_developer', 'product_manager'],
    description: 'Manage divisions and their settings',
    component: DivisionManagement
  },
  releaseManagement: {
    id: 'releaseManagement',
    label: 'Release Management',
    icon: Upload,
    roles: ['lead_developer'],
    description: 'Manage software releases and changelogs',
    component: () => <div>Release Management Component (Coming Soon)</div>
  },
  systemSettings: {
    id: 'systemSettings',
    label: 'System Settings',
    icon: Settings,
    roles: ['lead_developer'],
    description: 'Configure system parameters',
    component: () => <div>System Settings Component (Coming Soon)</div>
  },
  
  // Product Manager & Lead Developer Tabs
  airportManagement: {
    id: 'airportManagement',
    label: 'Airport Management',
    icon: Building2,
    roles: ['product_manager', 'lead_developer'],
    description: 'Review and approve airport submissions',
    component: AirportManagement
  },  contributionManagement: {
    id: 'contributionManagement',
    label: 'Contribution Management',
    icon: Map,
    roles: ['product_manager', 'lead_developer', 'MAP_APPROVER'],
    description: 'Review and manage user contributions',
    component: ContributionManagement
  },  notamManagement: {
    id: 'notamManagement',
    label: 'NOTAM Management',
    icon: MessageSquareWarning,
    roles: ['product_manager', 'lead_developer'],
    description: 'Update and post new website NOTAMs',
    component: NotamManagement
  },
  docsManagement: {
    id: 'docsManagement',
    label: 'Documentation',
    icon: BookOpen,
    roles: ['product_manager', 'lead_developer'],
    description: 'Manage and update documentation',
    component: () => <div>Documentation Management Component (Coming Soon)</div>
  },
  faqManagement: {
    id: 'faqManagement',
    label: 'FAQs',
    icon: FileQuestion,
    roles: ['product_manager', 'lead_developer'],
    description: 'Manage and update the FAQ section',
    component: () => <div>FAQ Management Component (Coming Soon)</div>
  },
  productStats: {
    id: 'productStats',
    label: 'Product Stats',
    icon: BarChart2,
    roles: ['product_manager', 'lead_developer'],
    description: 'View BARS usage statistics',
    component: () => <div>Product Stats Component (Coming Soon)</div>
  },
  
  // MAP_APPROVER Tabs
  mapReview: {
    id: 'mapReview',
    label: 'Map Review',
    icon: ClipboardList,
    roles: ['MAP_APPROVER', 'product_manager', 'lead_developer'],
    description: 'Review and approve map submissions',
    component: () => <div>Map Review Component (Coming Soon)</div>
  }
};

const StaffDashboard = () => {
  const [staffRoles, setStaffRoles] = useState(null);
  const [activeTab, setActiveTab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success,] = useState(null);
  const [refreshing, setRefreshing] = useState(false); // Add state for refreshing
  const navigate = useNavigate();
  const { user } = useAuth();
  const token = localStorage.getItem('vatsimToken');

  useEffect(() => {
    const fetchStaffRoles = async () => {
      try {
        setLoading(true);
        
        const response = await fetch('https://v2.stopbars.com/auth/is-staff', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
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
        
        // Set initial active tab to first accessible tab
        const accessibleTabs = Object.values(TABS).filter(tab => 
          tab.roles.some(role => {
            const normalizedRole = role.toLowerCase();
            return roles[normalizedRole] === 1;
          })
        );
        
        if (accessibleTabs.length > 0) {
          setActiveTab(accessibleTabs[0].id);
        } else {
          // No accessible tabs - redirect to account page
          navigate('/account');
          setError('You do not have access to the staff dashboard');
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
  }, [token, navigate, user]);  // Function to refresh the current tab data by simulating a tab change
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
    
    return tab.roles.some(role => {
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
          <div className="max-w-7xl mx-auto px-6">
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
          <div className="max-w-7xl mx-auto px-6">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-500">{error}</p>
            </div>
            <Button 
              onClick={() => navigate('/account')} 
              className="mt-4"
            >
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
        <div className="max-w-7xl mx-auto px-6">          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Staff Dashboard</h1>
              <p className="text-zinc-400">Welcome back, {user?.email}</p>
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
              <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
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
                        .filter(tab => ['userManagement', 'staffManagement', 'divisionManagement', 'systemSettings', 'releaseManagement'].includes(tab.id) && hasTabAccess(tab))
                        .map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;
                          
                          return (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id)}
                              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
                                isActive 
                                  ? 'bg-blue-500/90 text-white shadow-md shadow-blue-500/20' 
                                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
                              }`}
                            >
                              <Icon className="w-4 h-4 flex-shrink-0" />
                              <span className="text-sm">{tab.label}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                  
                  {/* Content Management Group */}
                  {Object.values(TABS).some(tab => 
                    ['airportManagement', 'contributionManagement', 'notamManagement', 'docsManagement', 'faqManagement'].includes(tab.id) && hasTabAccess(tab)
                  ) && (
                    <div className="space-y-1 mb-2">
                      <div className="px-4 py-2">
                        <h4 className="text-xs font-medium text-zinc-500">Content Management</h4>
                      </div>
                      {Object.values(TABS)
                        .filter(tab => ['airportManagement', 'contributionManagement', 'notamManagement', 'docsManagement', 'faqManagement'].includes(tab.id) && hasTabAccess(tab))
                        .map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;
                          
                          return (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id)}
                              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
                                isActive 
                                  ? 'bg-blue-500/90 text-white shadow-md shadow-blue-500/20' 
                                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
                              }`}
                            >
                              <Icon className="w-4 h-4 flex-shrink-0" />
                              <span className="text-sm">{tab.label}</span>
                            </button>
                          );
                        })}
                    </div>
                  )}
                  
                  {/* Other Tools */}
                  {Object.values(TABS).some(tab => 
                    ['mapReview', 'productStats'].includes(tab.id) && hasTabAccess(tab)
                  ) && (
                    <div className="space-y-1">
                      <div className="px-4 py-2">
                        <h4 className="text-xs font-medium text-zinc-500">Analytics & Review</h4>
                      </div>
                      {Object.values(TABS)
                        .filter(tab => ['mapReview', 'productStats'].includes(tab.id) && hasTabAccess(tab))
                        .map((tab) => {
                          const Icon = tab.icon;
                          const isActive = activeTab === tab.id;
                          
                          return (
                            <button
                              key={tab.id}
                              onClick={() => setActiveTab(tab.id)}
                              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
                                isActive 
                                  ? 'bg-blue-500/90 text-white shadow-md shadow-blue-500/20' 
                                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/70'
                              }`}
                            >
                              <Icon className="w-4 h-4 flex-shrink-0" />
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
              <Card className="p-6">
                {renderTabContent()}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default StaffDashboard;
