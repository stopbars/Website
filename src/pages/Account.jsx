import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { User, LogOut, AlertOctagon, Link, Shield, OctagonAlert, Eye, EyeOff, Copy, Check, RefreshCcw, Building2, Loader } from 'lucide-react';
import { formatDateAccordingToLocale } from '../utils/dateUtils';
import { getVatsimToken } from '../utils/cookieUtils';

const Account = () => {
  const { user, loading, logout, setUser, refreshUserData } = useAuth();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [staffRoles, setStaffRoles] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [regeneratingApiKey, setRegeneratingApiKey] = useState(false);
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);
  const [regenerateError, setRegenerateError] = useState(null);
  const [userDivisions, setUserDivisions] = useState([]);
  const [displayMode, setDisplayMode] = useState(user?.display_mode ?? 0);
  const [displayModeStatus, setDisplayModeStatus] = useState(null); // {type:'success'|'error', message:string}

  // Sync local state when user loads / changes
  useEffect(() => {
    if (user?.display_mode !== undefined && user.display_mode !== displayMode) {
      setDisplayMode(user.display_mode);
    }
  }, [user?.display_mode, displayMode]);

  useEffect(() => {
    const fetchStaffRole = async () => {
      const token = getVatsimToken();

      try {
        const response = await fetch('https://v2.stopbars.com/auth/is-staff', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const { isStaff, role } = await response.json();
          setStaffRoles({ isStaff, role });
        }
      } catch (error) {
        console.error('Failed to fetch staff role:', error);
      }
    };

    const fetchUserDivisions = async () => {
      const token = getVatsimToken();

      try {
        const response = await fetch('https://v2.stopbars.com/divisions/user', {
          headers: {
            'X-Vatsim-Token': token
          }
        });

        if (response.ok) {
          const divisions = await response.json();
          setUserDivisions(divisions);
        }
      } catch (error) {
        console.error('Failed to fetch user divisions:', error);
      }
    };

    fetchStaffRole();
    fetchUserDivisions();
  }, [user]);

  const formatRole = (role) => {
    return role
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatApiKey = (key) => {
    if (!key) return 'No API token generated';
    return showApiKey ? key : '•'.repeat(key.length);
  };

  const handleCopyApiKey = async () => {
    try {
      await navigator.clipboard.writeText(user?.api_key);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy API key:', err);
    }
  };

  const handleDeleteAccount = async () => {
    const token = getVatsimToken();
    try {
      const response = await fetch('https://v2.stopbars.com/auth/delete', {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': token }
      });
      if (response.ok) logout();
    } catch (error) {
      console.error(error);
    }
  };
  const handleRegenerateApiKey = async () => {
    setRegeneratingApiKey(true);
    const token = getVatsimToken();

    try {
      const response = await fetch('https://v2.stopbars.com/auth/regenerate-api-key', {
        method: 'POST',
        headers: { 'X-Vatsim-Token': token }
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limit error handling
          const errorData = data;
          setRegenerateError({
            message: errorData.message,
            retryAfter: errorData.retryAfter
          });
          return;
        }
        throw new Error('Failed to regenerate API key');
      }

      // Update the user object with the new API key
      setUser(prevUser => ({
        ...prevUser,
        api_key: data.apiKey
      }));

      // Show the API key after regenerating
      setShowApiKey(true);
      setIsRegenerateDialogOpen(false);
    } catch (error) {
      console.error('Failed to regenerate API key:', error);
      setRegenerateError({ message: 'Failed to regenerate API key. Please try again.' });
    } finally {
      setRegeneratingApiKey(false);
    }
  };

  const displayModeOptions = [
    { value: 0, label: 'First Name', example: (user?.full_name ? user.full_name.split(' ')[0] : 'John') },
    { value: 1, label: 'First Name + Last Initial', example: (() => {
      if (!user?.full_name) return 'John D';
      const parts = user.full_name.split(' ');
      if (parts.length === 1) return parts[0];
      return `${parts[0]} ${parts[parts.length - 1][0]}`;
    })() },
    { value: 2, label: 'VATSIM CID', example: user?.vatsim_id || '1234567' }
  ];

  const computeDisplayName = (fullName, cid, mode) => {
    if (!fullName && mode !== 2) return cid || '';
    const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
    switch (mode) {
      case 0:
        return parts[0] || cid || '';
      case 1: {
        if (parts.length === 0) return cid || '';
        const last = parts[parts.length - 1] || '';
        return `${parts[0]}${last ? ' ' + last[0] : ''}`.trim();
      }
      case 2:
        return cid || '';
      default:
        return fullName || cid || '';
    }
  };

  const handleUpdateDisplayMode = (newMode) => {
    if (user?.display_mode === newMode) return; // no change
    const token = getVatsimToken();
    const prevUser = user ? { ...user } : null;
    setDisplayMode(newMode);

    // Optimistic update of user in context
    if (user) {
      const optimisticName = computeDisplayName(user.full_name, user.vatsim_id, newMode);
      setUser({ ...user, display_mode: newMode, display_name: optimisticName });
    }
    setDisplayModeStatus({ type: 'success', message: 'Display mode updated.' });

    // Fire & forget request
    fetch('https://v2.stopbars.com/auth/display-mode', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Vatsim-Token': token
      },
      body: JSON.stringify({ mode: newMode })
    }).then(res => {
      if (!res.ok) throw new Error('Failed');
      // Optionally refresh in background to ensure server canonical values
      setTimeout(() => { refreshUserData().catch(() => {}); }, 500);
    }).catch(err => {
      console.error('Failed to persist display mode:', err);
      setDisplayModeStatus({ type: 'error', message: 'Failed to save preference. Reverted.' });
      if (prevUser) {
        setUser(prevUser);
        setDisplayMode(prevUser.display_mode);
      }
    });
  };

  // Auto clear success message after a few seconds
  useEffect(() => {
    if (displayModeStatus?.type === 'success') {
      const t = setTimeout(() => setDisplayModeStatus(null), 3000);
      return () => clearTimeout(t);
    }
  }, [displayModeStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="w-12 h-12 animate-spin text-zinc-300" />
      </div>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-40 pb-20 bg-950">  <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-4xl font-bold mb-8 text-white">Account Settings</h1>
        <div className="space-y-8">
          {staffRoles?.isStaff && (
            <Card className="p-8 border border-zinc-800 hover:border-zinc-700 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <Shield className="w-6 h-6 text-blue-400" />
                    <h2 className="text-2xl font-semibold">Staff Access</h2>
                  </div>
                  <p className="text-zinc-400">Role: {staffRoles?.role?.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>
                </div>
                <Button
                  variant="primary"
                  onClick={() => window.location.href = '/staff'}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  <Link className="w-4 h-4 mr-2" />
                  Staff Dashboard
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-8 border border-zinc-800 hover:border-zinc-700 transition-all duration-300">
            <div className="flex items-center space-x-3 mb-8">
              <User className="w-6 h-6 text-blue-400" />
              <h2 className="text-2xl font-semibold">Account Details</h2>
            </div>

            <div className="space-y-8">
              <div>
                <label className="text-sm font-medium text-zinc-400 mb-2 block">API Token</label>
                <div className="bg-zinc-900/80 p-4 rounded-lg border border-zinc-800 mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-mono text-sm truncate pr-4 flex-1">
                      {formatApiKey(user?.api_key)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="min-w-[90px] shrink-0 hover:bg-zinc-800"
                    >
                      {showApiKey ? (
                        <><EyeOff className="w-4 h-4 mr-2" /> Hide</>
                      ) : (
                        <><Eye className="w-4 h-4 mr-2" /> Show</>
                      )}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyApiKey}
                      className={`min-w-[100px] ${copySuccess ? 'bg-green-500/20 text-green-400' : 'hover:bg-zinc-800'}`}
                    >
                      {copySuccess ? (
                        <><Check className="w-4 h-4 mr-2 text-green-400" /> Copied </>
                      ) : (
                        <><Copy className="w-4 h-4 mr-2" /> Copy</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsRegenerateDialogOpen(true)}
                      className="min-w-[130px] hover:bg-zinc-800 text-blue-400 border-blue-500/20"
                    >
                      <RefreshCcw className="w-4 h-4 mr-2" /> Regenerate
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-zinc-500 mt-2">Keep this token secret, never share it with anyone. It is used to authenticate API requests.</p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {[
                  { label: 'VATSIM CID', value: user?.vatsim_id },
                  { label: 'Email', value: user?.email }
                ].map(field => (
                  <div key={field.label} className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/50 hover:border-zinc-700/50">
                    <label className="text-sm font-medium text-zinc-400 block mb-1">{field.label}</label>
                    <p className="font-medium">{field.value}</p>
                  </div>
                ))}
              </div>

              {/* Display Name Mode */}
              <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">Preferred Display Name Mode</h3>
                    <p className="text-sm text-zinc-400">Controls how your name appears publicly across BARS.</p>
                  </div>
                  {user?.display_name && (
                    <div className="text-sm text-zinc-300 bg-zinc-800/60 px-3 py-1 rounded-full border border-zinc-700/60">
                      Current: <span className="font-medium">{user.display_name}</span>
                    </div>
                  )}
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  {displayModeOptions.map(opt => {
                    const active = Number(displayMode) === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleUpdateDisplayMode(opt.value)}
                        className={`text-left group relative rounded-lg border p-4 transition-all ${active ? 'border-blue-500/60 bg-blue-500/10' : 'border-zinc-800/70 hover:border-zinc-600/60 hover:bg-zinc-800/40'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{opt.label}</span>
                          <span className={`w-3 h-3 rounded-full border ${active ? 'bg-blue-500 border-blue-400 shadow-[0_0_0_3px_rgba(59,130,246,0.3)]' : 'border-zinc-600 group-hover:border-zinc-400'}`}></span>
                        </div>
                        <p className="text-xs text-zinc-400">Example: <span className="text-zinc-300 font-mono">{opt.example}</span></p>
                      </button>
                    );
                  })}
                </div>
                {displayModeStatus && (
                  <div className={`mt-4 text-sm rounded-md px-3 py-2 border ${displayModeStatus.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                    {displayModeStatus.message}
                  </div>
                )}
              </div>

              <div className="bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                <div className="grid md:grid-cols-3 gap-6 p-6">
                  <div className="space-y-2">
                    <h3 className="text-zinc-400 text-sm font-medium">Account ID</h3>
                    <p className="font-medium">{user?.id}</p>
                  </div>
                  <div className="space-y-2">            <h3 className="text-zinc-400 text-sm font-medium">Created At</h3>
                    <p className="font-medium">
                      {formatDateAccordingToLocale(user?.created_at)}
                    </p>
                  </div>
                  <div className="space-y-2">            <h3 className="text-zinc-400 text-sm font-medium">Last Login</h3>
                    <p className="font-medium">
                      {formatDateAccordingToLocale(user?.last_login)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {userDivisions.length > 0 && (
            <Card className="p-8 border border-zinc-800 hover:border-zinc-700 transition-all duration-300">
              <div className="flex items-center space-x-3 mb-8">
                <Building2 className="w-6 h-6 text-blue-400" />
                <h2 className="text-2xl font-semibold">Your Divisions</h2>
              </div>

              <div className="space-y-4">
                {userDivisions.map((userDiv) => {
                  const division = userDiv.division ?? userDiv;
                  const role = userDiv.role;
                  
                  return division && (
                    <div key={division.id} className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-lg border border-zinc-800/50 hover:border-zinc-700/50">
                      <div>
                        <h3 className="text-xl font-semibold text-white">{division.name}</h3>
                        <p className="text-zinc-400">Your Role: {formatRole(role)}</p>
                      </div>
                      <Button
                        variant="primary"
                        onClick={() => window.location.href = `/divisions/${division.id}/manage`}
                        className="bg-blue-500 hover:bg-blue-600"
                      >
                        <Link className="w-4 h-4 mr-2" />
                        Manage Division
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-8 border-red-500/20 hover:border-red-500/30 transition-all duration-300">
            <div className="flex items-center space-x-3 mb-8">
              <AlertOctagon className="w-6 h-6 text-red-500" />
              <h2 className="text-2xl font-semibold text-red-500">Danger Zone</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-6 bg-red-500/5 rounded-lg border border-red-500/10">
                <div>
                  <h3 className="font-medium text-red-400">Sign Out</h3>
                  <p className="text-sm text-zinc-400">End your current session</p>
                </div>
                <Button
                  variant="outline"
                  className="border-red-500/20 text-red-500 hover:bg-red-500/10"
                  onClick={logout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>

              <div className="flex items-center justify-between p-6 bg-red-500/5 rounded-lg border border-red-500/10">
                <div>
                  <h3 className="font-medium text-red-400">Delete Account</h3>
                  <p className="text-sm text-zinc-400">
                    Permanently delete your BARS account and all stored data.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-red-500/20 text-red-500 hover:bg-red-500/10"
                  onClick={() => setIsDeleteDialogOpen(true)}
                >
                  <OctagonAlert className="w-4 h-4 mr-2" />
                  Delete Account
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {isDeleteDialogOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-zinc-900 p-8 rounded-lg max-w-md w-full mx-4 border border-red-500/20">
              <h2 className="text-2xl font-semibold text-red-500 mb-4">
                Delete Account
              </h2>
              <p className="text-zinc-400 mb-6">
                This action cannot be undone. This will permanently delete your
                account and remove all associated data.
              </p>
              <div className="flex space-x-4">
                <Button
                  className="!bg-red-500 hover:!bg-red-600 text-white"
                  onClick={handleDeleteAccount}
                >
                  Delete Account
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(false)}
                  className="hover:bg-zinc-800"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
        {isRegenerateDialogOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
            <div className="bg-zinc-900 p-8 rounded-lg max-w-md w-full mx-4 border border-blue-500/20">
              <h2 className="text-2xl font-semibold text-blue-500 mb-4">
                Regenerate API Key
              </h2>

              {regenerateError ? (
                <>
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg mb-6">
                    <div className="flex items-center space-x-3 mb-2">
                      <AlertOctagon className="w-5 h-5 text-red-500 flex-shrink-0" />
                      <p className="text-red-400 font-medium">Rate Limit Exceeded</p>
                    </div>
                    <p className="text-zinc-400">
                      {regenerateError.message}
                    </p>
                    {regenerateError.retryAfter && (
                      <div className="mt-3 pt-3 border-t border-red-500/20 text-zinc-400 text-sm">
                        <span>You can try again in: </span>
                        <span className="font-mono text-red-400">
                          {Math.floor(regenerateError.retryAfter / 3600)} hours, {Math.floor((regenerateError.retryAfter % 3600) / 60)} minutes
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRegenerateError(null);
                        setIsRegenerateDialogOpen(false);
                      }}
                      className="hover:bg-zinc-800"
                    >
                      Close
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-zinc-400 mb-6">
                    Are you sure you want to regenerate your API key? Your current key will stop working immediately, and all services using it will need to be updated with the new key.
                  </p>
                  <div className="flex space-x-4">
                    <Button
                      className="!bg-blue-500 hover:!bg-blue-600 text-white"
                      onClick={handleRegenerateApiKey}
                      disabled={regeneratingApiKey}
                    >
                      {regeneratingApiKey ? (
                        <>
                          <RefreshCcw className="w-4 h-4 mr-2 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCcw className="w-4 h-4 mr-2" />
                          Yes, Regenerate Key
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsRegenerateDialogOpen(false)}
                      className="hover:bg-zinc-800"
                      disabled={regeneratingApiKey}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </Layout>
  );
};

export default Account;