import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Button } from '../components/shared/Button';
import {
  User,
  LogOut,
  AlertOctagon,
  Link,
  Shield,
  OctagonAlert,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCcw,
  Building2,
  Loader,
} from 'lucide-react';
import { formatDateAccordingToLocale } from '../utils/dateUtils';
import { getVatsimToken } from '../utils/cookieUtils';
import { Toast } from '../components/shared/Toast';

const Account = () => {
  const { user, loading, logout, setUser, refreshUserData } = useAuth();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [staffRoles, setStaffRoles] = useState(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [regeneratingApiKey, setRegeneratingApiKey] = useState(false);
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);
  const [regenerateError, setRegenerateError] = useState(null);
  const [regenerateConfirmation, setRegenerateConfirmation] = useState('');
  const [userDivisions, setUserDivisions] = useState([]);
  const [displayMode, setDisplayMode] = useState(user?.display_mode ?? 0);
  const [isDisplayModeSaving, setIsDisplayModeSaving] = useState(false);
  const [pendingDisplayMode, setPendingDisplayMode] = useState(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [showRegenerateSuccessToast, setShowRegenerateSuccessToast] = useState(false);
  const [showRegenerateErrorToast, setShowRegenerateErrorToast] = useState(false);
  const [regenerateErrorMessage, setRegenerateErrorMessage] = useState('');
  const [showDeleteSuccessToast, setShowDeleteSuccessToast] = useState(false);
  const [showDeleteErrorToast, setShowDeleteErrorToast] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState('');
  const displayModeRequestRef = useRef({ id: 0, controller: null });
  const refreshDebounceRef = useRef(null);

  // Sync local state when user loads / changes
  useEffect(() => {
    // Don't override local selection while a change is pending
    if (isDisplayModeSaving) return;
    if (user?.display_mode !== undefined && user.display_mode !== displayMode) {
      setDisplayMode(user.display_mode);
    }
  }, [user?.display_mode, displayMode, isDisplayModeSaving]);

  // When server reflects the pending mode, clear saving state
  useEffect(() => {
    if (
      isDisplayModeSaving &&
      pendingDisplayMode != null &&
      user?.display_mode === pendingDisplayMode
    ) {
      setIsDisplayModeSaving(false);
      setPendingDisplayMode(null);
    }
  }, [user?.display_mode, isDisplayModeSaving, pendingDisplayMode]);

  useEffect(() => {
    const fetchStaffRole = async () => {
      const token = getVatsimToken();

      try {
        const response = await fetch('https://v2.stopbars.com/auth/is-staff', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
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
            'X-Vatsim-Token': token,
          },
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
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatApiKey = (key) => {
    if (!key) return 'No API token generated';
    return showApiKey ? key : '•'.repeat(key.length);
  };

  // Format objects like { name: 'Asia Pacific', id: 'APAC' } as "Asia Pacific - APAC"
  const formatIdName = (obj) => {
    if (!obj) return '—';
    const id = obj?.id ?? '';
    const name = obj?.name ?? '';
    if (id && name) return `${name} - ${id}`;
    return name || id || '—';
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
    setIsDeletingAccount(true);
    const token = getVatsimToken();
    try {
      const response = await fetch('https://v2.stopbars.com/auth/delete', {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': token },
      });

      if (response.ok) {
        setIsDeleteDialogOpen(false);
        setDeleteConfirmation('');
        setShowDeleteSuccessToast(true);
        // Give the toast a moment to show before logout
        setTimeout(() => {
          logout();
        }, 2000);
      } else {
        throw new Error('Failed to delete account');
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
      setIsDeleteDialogOpen(false);
      setDeleteConfirmation('');
      setDeleteErrorMessage(error.message || 'Failed to delete account, please try again.');
      setShowDeleteErrorToast(true);
    } finally {
      setIsDeletingAccount(false);
    }
  };
  const handleRegenerateApiKey = async () => {
    setRegeneratingApiKey(true);
    const token = getVatsimToken();

    try {
      const response = await fetch('https://v2.stopbars.com/auth/regenerate-api-key', {
        method: 'POST',
        headers: { 'X-Vatsim-Token': token },
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limit - use the message from the API
          throw new Error(
            data.message ||
              'You can only regenerate your API key once every 24 hours, please try again later.'
          );
        }
        throw new Error('Failed to regenerate API key');
      }

      // Update the user object with the new API key
      setUser((prevUser) => ({
        ...prevUser,
        api_key: data.apiKey,
      }));

      setShowApiKey(false);
      setIsRegenerateDialogOpen(false);
      setRegenerateConfirmation('');
      setShowRegenerateSuccessToast(true);
    } catch (error) {
      console.error('Failed to regenerate API key:', error);
      setIsRegenerateDialogOpen(false);
      setRegenerateConfirmation('');
      setRegenerateErrorMessage(error.message);
      setShowRegenerateErrorToast(true);
    } finally {
      setRegeneratingApiKey(false);
    }
  };

  const displayModeOptions = [
    {
      value: 0,
      label: 'First Name',
      example: user?.full_name ? user.full_name.split(' ')[0] : 'John',
    },
    {
      value: 1,
      label: 'First Name + Last Initial',
      example: (() => {
        if (!user?.full_name) return 'John D';
        const parts = user.full_name.split(' ');
        if (parts.length === 1) return parts[0];
        return `${parts[0]} ${parts[parts.length - 1][0]}`;
      })(),
    },
    { value: 2, label: 'VATSIM CID', example: user?.vatsim_id || '1234567' },
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
    // Avoid redundant updates
    const sameAsUser = Number(user?.display_mode) === Number(newMode);
    const sameAsPending = Number(pendingDisplayMode) === Number(newMode);
    if ((sameAsUser && !isDisplayModeSaving) || (sameAsPending && isDisplayModeSaving)) {
      return;
    }
    const token = getVatsimToken();
    const prevUser = user ? { ...user } : null;
    setDisplayMode(newMode);

    // Optimistic update of user in context
    if (user) {
      const optimisticName = computeDisplayName(user.full_name, user.vatsim_id, newMode);
      setUser({ ...user, display_mode: newMode, display_name: optimisticName });
    }
    setIsDisplayModeSaving(true);
    setPendingDisplayMode(newMode);

    // Fire & forget request
    // Cancel any in-flight request (latest-wins)
    if (displayModeRequestRef.current.controller) {
      displayModeRequestRef.current.controller.abort();
    }
    const controller = new AbortController();
    const requestId = (displayModeRequestRef.current.id || 0) + 1;
    displayModeRequestRef.current = { id: requestId, controller };

    fetch('https://v2.stopbars.com/auth/display-mode', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Vatsim-Token': token,
      },
      body: JSON.stringify({ mode: newMode }),
      signal: controller.signal,
    })
      .then((res) => {
        // Ignore stale responses
        if (displayModeRequestRef.current.id !== requestId) return;
        if (!res.ok) throw new Error('Failed');
        setShowSuccessToast(true);
        setIsDisplayModeSaving(false);
        setPendingDisplayMode(null);
        // Debounced background refresh to align with server canonical values
        if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = setTimeout(() => {
          // Silent refresh so we don't toggle global loading state
          refreshUserData({ silent: true }).catch(() => {});
          refreshDebounceRef.current = null;
        }, 600);
      })
      .catch((err) => {
        // Handle abort errors and stale responses
        const aborted = err?.name === 'AbortError';
        if (aborted) {
          // If the aborted request is still considered the latest, clear pending so user can retry
          if (displayModeRequestRef.current.id === requestId) {
            setIsDisplayModeSaving(false);
            setPendingDisplayMode(null);
          }
          return;
        }
        if (displayModeRequestRef.current.id !== requestId) return;
        console.error('Failed to persist display mode:', err);
        setShowErrorToast(true);
        setIsDisplayModeSaving(false);
        setPendingDisplayMode(null);
        if (prevUser) {
          setUser(prevUser);
          setDisplayMode(prevUser.display_mode);
        }
      });
  };

  // Cleanup on unmount: abort any in-flight request and clear timers
  useEffect(() => {
    return () => {
      if (displayModeRequestRef.current.controller) {
        displayModeRequestRef.current.controller.abort();
      }
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="w-12 h-12 animate-spin text-zinc-300" />
      </div>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen pt-40 pb-20 bg-950">
        {' '}
        <div className="max-w-5xl mx-auto px-6">
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
                    <p className="text-zinc-400">
                      Role:{' '}
                      {staffRoles?.role
                        ?.replace(/_/g, ' ')
                        .split(' ')
                        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ')}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => (window.location.href = '/staff')}
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
                          <>
                            <EyeOff className="w-4 h-4 mr-2" /> Hide
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 mr-2" /> Show
                          </>
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
                          <>
                            <Check className="w-4 h-4 mr-2 text-green-400" /> Copied{' '}
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-2" /> Copy
                          </>
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
                  <p className="text-sm text-zinc-500 mt-2">
                    Keep this token secret, never share it with anyone. It is used to authenticate
                    API requests.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {[
                    { label: 'VATSIM CID', value: user?.vatsim_id },
                    { label: 'Email', value: user?.email },
                  ].map((field) => (
                    <div
                      key={field.label}
                      className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800/50 hover:border-zinc-700/50"
                    >
                      <label className="text-sm font-medium text-zinc-400 block mb-1">
                        {field.label}
                      </label>
                      <p className="font-medium">{field.value}</p>
                    </div>
                  ))}
                </div>

                <div className="bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                  <div className="grid md:grid-cols-3 gap-6 p-6">
                    <div className="space-y-2">
                      <h3 className="text-zinc-400 text-sm font-medium">Region</h3>
                      <p className="font-medium">{formatIdName(user?.region)}</p>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-zinc-400 text-sm font-medium">Division</h3>
                      <p className="font-medium">{formatIdName(user?.division)}</p>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-zinc-400 text-sm font-medium">Subdivision</h3>
                      <p className="font-medium">
                        {user?.subdivision ? formatIdName(user?.subdivision) : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Display Name Mode */}
                <div className="bg-zinc-900/50 p-6 rounded-lg border border-zinc-800/50 hover:border-zinc-700/50 transition-colors">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div>
                      <h3 className="text-lg font-semibold">Preferred Display Name Mode</h3>
                      <p className="text-sm text-zinc-400">
                        Choose how your name appears publicly across BARS.
                      </p>
                    </div>
                    {user?.display_name && (
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-zinc-300 bg-zinc-800/60 px-3 py-1 rounded-full border border-zinc-700/60">
                          Current: <span className="font-medium">{user.display_name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid md:grid-cols-3 gap-4">
                    {displayModeOptions.map((opt) => {
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
                            <span
                              className={`w-3 h-3 rounded-full border ${active ? 'bg-blue-500 border-blue-400 shadow-[0_0_0_3px_rgba(59,130,246,0.3)]' : 'border-zinc-600 group-hover:border-zinc-400'}`}
                            ></span>
                          </div>
                          <p className="text-xs text-zinc-400">
                            Example: <span className="text-zinc-300 font-mono">{opt.example}</span>
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-zinc-900/50 rounded-lg border border-zinc-800/50">
                  <div className="grid md:grid-cols-3 gap-6 p-6">
                    <div className="space-y-2">
                      <h3 className="text-zinc-400 text-sm font-medium">Account ID</h3>
                      <p className="font-medium">{user?.id}</p>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-zinc-400 text-sm font-medium">Created At</h3>
                      <p className="font-medium">{formatDateAccordingToLocale(user?.created_at)}</p>
                    </div>
                    <div className="space-y-2">
                      {' '}
                      <h3 className="text-zinc-400 text-sm font-medium">Last Login</h3>
                      <p className="font-medium">{formatDateAccordingToLocale(user?.last_login)}</p>
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

                    return (
                      division && (
                        <div
                          key={division.id}
                          className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-lg border border-zinc-800/50 hover:border-zinc-700/50"
                        >
                          <div>
                            <h3 className="text-xl font-semibold text-white">{division.name}</h3>
                            <p className="text-zinc-400">Your Role: {formatRole(role)}</p>
                          </div>
                          <Button
                            variant="primary"
                            onClick={() =>
                              (window.location.href = `/divisions/${division.id}/manage`)
                            }
                            className="bg-blue-500 hover:bg-blue-600"
                          >
                            <Link className="w-4 h-4 mr-2" />
                            Manage Division
                          </Button>
                        </div>
                      )
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
                  <Button variant="outline" onClick={logout}>
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
                  <Button variant="outline" onClick={() => setIsDeleteDialogOpen(true)}>
                    <OctagonAlert className="w-4 h-4 mr-2" />
                    Delete Account
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {isDeleteDialogOpen && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
                <div className="flex items-center space-x-3 mb-6">
                  <AlertOctagon className="w-6 h-6 text-red-500" />
                  <h3 className="text-xl font-semibold text-red-500">Delete Account</h3>
                </div>

                <div className="space-y-4">
                  <p className="text-zinc-300">
                    This action cannot be undone. This will permanently delete your account and
                    remove all associated data.
                  </p>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (deleteConfirmation === 'DELETE' && !isDeletingAccount) {
                        handleDeleteAccount();
                      }
                    }}
                  >
                    <div>
                      <label className="block text-sm font-medium mb-2 text-zinc-300">
                        Type DELETE to confirm:
                      </label>
                      <input
                        type="text"
                        value={deleteConfirmation}
                        onChange={(e) => setDeleteConfirmation(e.target.value)}
                        onPaste={(e) => e.preventDefault()}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-red-500"
                        disabled={isDeletingAccount}
                      />
                    </div>
                    <div className="flex space-x-3 mt-6">
                      <Button
                        type="submit"
                        className={`${
                          deleteConfirmation === 'DELETE' && !isDeletingAccount
                            ? 'bg-red-500! text-white'
                            : 'bg-zinc-700! text-zinc-400! cursor-not-allowed'
                        }`}
                        disabled={deleteConfirmation !== 'DELETE' || isDeletingAccount}
                      >
                        {isDeletingAccount ? (
                          <>
                            <Loader className="w-4 h-4 mr-2 animate-spin" />
                            Deleting...
                          </>
                        ) : (
                          'Delete'
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setDeleteConfirmation('');
                          setIsDeleteDialogOpen(false);
                        }}
                        className="hover:bg-zinc-800"
                        disabled={isDeletingAccount}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
          {isRegenerateDialogOpen && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
                <div className="flex items-center space-x-3 mb-6">
                  <RefreshCcw className="w-6 h-6 text-orange-400" />
                  <h3 className="text-xl font-semibold text-orange-400">Regenerate API Token</h3>
                </div>

                {regenerateError ? (
                  <>
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg mb-6">
                      <div className="flex items-center space-x-3 mb-2">
                        <AlertOctagon className="w-5 h-5 text-red-500 shrink-0" />
                        <p className="text-red-400 font-medium">Rate Limit Exceeded</p>
                      </div>
                      <p className="text-zinc-400">{regenerateError.message}</p>
                      {regenerateError.retryAfter && (
                        <div className="mt-3 pt-3 border-t border-red-500/20 text-zinc-400 text-sm">
                          <span>You can try again in: </span>
                          <span className="font-mono text-red-400">
                            {Math.floor(regenerateError.retryAfter / 3600)} hours,{' '}
                            {Math.floor((regenerateError.retryAfter % 3600) / 60)} minutes
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
                    <div className="space-y-4">
                      <p className="text-zinc-300">
                        This action cannot be undone, your current key will stop working
                        immediately, and all services using it will need to be updated with the new
                        key.
                      </p>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (regenerateConfirmation === 'REGENERATE') {
                            handleRegenerateApiKey();
                          }
                        }}
                      >
                        <div>
                          <label className="block text-sm font-medium mb-2 text-zinc-300">
                            Type REGENERATE to confirm:
                          </label>
                          <input
                            type="text"
                            value={regenerateConfirmation}
                            onChange={(e) => setRegenerateConfirmation(e.target.value)}
                            onPaste={(e) => e.preventDefault()}
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-orange-500"
                            disabled={regeneratingApiKey}
                          />
                        </div>
                        <div className="flex space-x-3 mt-6">
                          <Button
                            type="submit"
                            className={`${
                              regenerateConfirmation === 'REGENERATE' && !regeneratingApiKey
                                ? 'bg-orange-500! text-white'
                                : 'bg-zinc-700! text-zinc-400! cursor-not-allowed'
                            }`}
                            disabled={regenerateConfirmation !== 'REGENERATE' || regeneratingApiKey}
                          >
                            {regeneratingApiKey ? (
                              <>
                                <Loader className="w-4 h-4 mr-2 animate-spin" />
                                Regenerating...
                              </>
                            ) : (
                              <>
                                <RefreshCcw className="w-4 h-4 mr-2" />
                                Regenerate Token
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setRegenerateConfirmation('');
                              setIsRegenerateDialogOpen(false);
                            }}
                            className="hover:bg-zinc-800"
                            disabled={regeneratingApiKey}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast notifications */}
      <Toast
        title="Success"
        description="Preferred Display Name updated successfully."
        variant="success"
        show={showSuccessToast}
        onClose={() => setShowSuccessToast(false)}
      />

      <Toast
        title="Error"
        description="Failed to save preference, display name has been reverted."
        variant="destructive"
        show={showErrorToast}
        onClose={() => setShowErrorToast(false)}
      />

      <Toast
        title="Success"
        description="API Token successfully regenerated"
        variant="success"
        show={showRegenerateSuccessToast}
        onClose={() => setShowRegenerateSuccessToast(false)}
      />

      <Toast
        title="Error"
        description={regenerateErrorMessage || 'Failed to regenerate API token, please try again.'}
        variant="destructive"
        show={showRegenerateErrorToast}
        onClose={() => setShowRegenerateErrorToast(false)}
      />

      <Toast
        title="Account Deleted"
        description="Your account has been successfully deleted. You will be redirected shortly."
        variant="success"
        show={showDeleteSuccessToast}
        onClose={() => setShowDeleteSuccessToast(false)}
      />

      <Toast
        title="Error"
        description={deleteErrorMessage || 'Failed to delete account, please try again.'}
        variant="destructive"
        show={showDeleteErrorToast}
        onClose={() => setShowDeleteErrorToast(false)}
      />
    </Layout>
  );
};

export default Account;
