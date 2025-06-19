import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import { User, LogOut, AlertOctagon, Laptop, Shield, Eye, EyeOff, Copy, Check, RefreshCcw } from 'lucide-react';
import { formatDateAccordingToLocale } from '../utils/dateUtils';

const Account = () => {
  const { user, loading, logout, setUser } = useAuth();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [staffRoles, setStaffRoles] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [regeneratingApiKey, setRegeneratingApiKey] = useState(false);
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);
  const [regenerateError, setRegenerateError] = useState(null);

  useEffect(() => {
    const fetchStaffRole = async () => {
      const token = localStorage.getItem('vatsimToken');

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

    fetchStaffRole();
  }, [user]);

  const formatApiKey = (key) => {
    if (!key) return 'No API token generated';
    return showApiKey ? key : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••';
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
    const token = localStorage.getItem('vatsimToken');
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
    const token = localStorage.getItem('vatsimToken');

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-32 pb-20 bg-950">  <div className="max-w-5xl mx-auto px-6">
        <h1 className="text-4xl font-bold mb-8 text-white">Account Settings</h1>
        <div className="space-y-8">
          {staffRoles?.isStaff && (
            <Card className="p-8 border border-zinc-800 hover:border-zinc-700 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">Staff Access</h2>
                  <p className="text-zinc-400">Role: {staffRoles?.role?.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>
                </div>
                <Button
                  variant="primary"
                  onClick={() => window.location.href = '/staff'}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  <Laptop className="w-4 h-4 mr-2" />
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
                        <><Check className="w-4 h-4 mr-2" /> Copied!</>
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
                <p className="text-xs text-zinc-500 mt-2">Keep this token secret. Use it to authenticate API requests.</p>
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
                  <Shield className="w-4 h-4 mr-2" />
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