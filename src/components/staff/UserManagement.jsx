import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import useSearchQuery from '../../hooks/useSearchQuery';
import { Card } from '../shared/Card';
import { Dialog } from '../shared/Dialog';
import { Toast } from '../shared/Toast';
import { Tooltip } from '../shared/Tooltip';
import {
  User,
  Users,
  Search,
  Mail,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertOctagon,
  Loader,
  IdCard,
  KeyRound,
  Globe,
  Map,
  MapPin,
  Ban,
} from 'lucide-react';
import { formatLocalDateTime } from '../../utils/dateUtils';
import { getVatsimToken } from '../../utils/cookieUtils';

const USERS_PER_PAGE = 6;

// Component to show truncated text with tooltip only when needed
const TruncatedName = ({ name }) => {
  const textRef = useRef(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const checkTruncation = () => {
      if (textRef.current) {
        setIsTruncated(textRef.current.scrollWidth > textRef.current.clientWidth);
      }
    };
    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [name]);

  const content = (
    <h3 ref={textRef} className="font-medium text-white truncate">
      {name}
    </h3>
  );

  if (isTruncated) {
    return <Tooltip content={name}>{content}</Tooltip>;
  }

  return content;
};

TruncatedName.propTypes = {
  name: PropTypes.string.isRequired,
};

// Helper function to calculate display name based on display mode
const getDisplayName = (user) => {
  if (!user.full_name) return 'Not set';

  const displayMode = user.display_mode ?? 0; // Default to 0 if not provided

  switch (displayMode) {
    case 0: // First name only
      return user.full_name.split(' ')[0];
    case 1: {
      // First + Last Initial
      const nameParts = user.full_name.split(' ');
      if (nameParts.length > 1) {
        return `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}`;
      }
      return nameParts[0];
    }
    case 2: // CID (VATSIM ID)
      return user.vatsim_id || 'Not set';
    default:
      return user.full_name.split(' ')[0]; // Fallback to first name
  }
};

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useSearchQuery();
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingUser, setDeletingUser] = useState(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [regeneratingUser, setRegeneratingUser] = useState(null);
  const [isRegeneratingToken, setIsRegeneratingToken] = useState(false);
  const [regenerateConfirmation, setRegenerateConfirmation] = useState('');
  const [totalUsers, setTotalUsers] = useState(0);
  const [copiedEmail, setCopiedEmail] = useState(null);
  const [copiedCid, setCopiedCid] = useState(null);

  // Toast states
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const navigate = useNavigate();

  const handleBanUser = (vatsimId) => {
    if (!vatsimId) return;
    navigate(`/staff?tool=banManagement&vatsimId=${vatsimId}`);
  };

  const handleCopyEmail = async (userId, email) => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(userId);
      setTimeout(() => setCopiedEmail(null), 1500);
    } catch (err) {
      console.error('Failed to copy email:', err);
    }
  };

  const handleCopyCid = async (userId, cid) => {
    if (!cid) return;
    try {
      await navigator.clipboard.writeText(cid);
      setCopiedCid(userId);
      setTimeout(() => setCopiedCid(null), 1500);
    } catch (err) {
      console.error('Failed to copy CID:', err);
    }
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const token = getVatsimToken();
      const response = await fetch('https://v2.stopbars.com/staff/users', {
        headers: { 'X-Vatsim-Token': token },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      const allUsers = Array.isArray(data) ? data : data.users || [];
      const total = Array.isArray(data) ? data.length : (data.total ?? allUsers.length);

      setUsers(allUsers);
      setTotalUsers(total);
    } catch (err) {
      setErrorMessage('Failed to load users. Please try again.');
      setShowErrorToast(true);
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);
  // No edit functionality needed

  const handleDeleteUser = async (userId) => {
    setIsDeletingUser(true);

    try {
      const token = getVatsimToken();
      const response = await fetch(`https://v2.stopbars.com/staff/users/${userId}`, {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': token },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      setUsers(users.filter((user) => user.id !== userId));
      setSuccessMessage('User deleted successfully');
      setShowSuccessToast(true);
      setDeletingUser(null);
      setDeleteConfirmation('');
    } catch (err) {
      setErrorMessage(err.message);
      setShowErrorToast(true);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const cancelDelete = () => {
    setDeletingUser(null);
    setDeleteConfirmation('');
  };

  const handleRegenerateToken = async (userId) => {
    setIsRegeneratingToken(true);

    try {
      const token = getVatsimToken();
      const user = users.find((u) => u.id === userId);

      if (!user || !user.vatsim_id) {
        throw new Error('User VATSIM ID not found');
      }

      const response = await fetch(`https://v2.stopbars.com/staff/users/refresh-api-token`, {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vatsimId: user.vatsim_id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to regenerate token');
      }

      setSuccessMessage('API token has been successfully refreshed');
      setShowSuccessToast(true);
      setRegeneratingUser(null);
      setRegenerateConfirmation('');
    } catch (err) {
      setErrorMessage(err.message);
      setShowErrorToast(true);
    } finally {
      setIsRegeneratingToken(false);
    }
  };

  const cancelRegenerate = () => {
    setRegeneratingUser(null);
    setRegenerateConfirmation('');
  };
  const filteredUsers = users.filter(
    (user) =>
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.vatsim_id && user.vatsim_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.id && user.id.toString().includes(searchTerm)) ||
      (user.full_name && user.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      getDisplayName(user).toLowerCase().includes(searchTerm.toLowerCase()) ||
      // Also allow searching by region/division/subdivision
      (user.region &&
        ((user.region.name && user.region.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (user.region.id && user.region.id.toLowerCase().includes(searchTerm.toLowerCase())))) ||
      (user.division &&
        ((user.division.name &&
          user.division.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (user.division.id &&
            user.division.id.toLowerCase().includes(searchTerm.toLowerCase())))) ||
      (user.subdivision &&
        ((user.subdivision.name &&
          user.subdivision.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (user.subdivision.id &&
            user.subdivision.id.toLowerCase().includes(searchTerm.toLowerCase()))))
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">User Management</h2>
          <p className="text-sm text-zinc-400 mt-1">Manage user accounts and permissions</p>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
              <Users className="w-4 h-4 mr-2 text-zinc-400" />
              {totalUsers} users
            </span>
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={handleSearch}
              className="pl-9 pr-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 w-64 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Users List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredUsers.length === 0 && (
                <div className="col-span-full p-8 text-center border border-dashed border-zinc-700/50 rounded-xl bg-zinc-800/20">
                  <User className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">No users found</p>
                </div>
              )}
              {paginatedUsers.map((user) => (
                <Card
                  key={user.id}
                  className="p-5 hover:border-zinc-600/50 transition-all duration-200 hover:bg-zinc-800/30"
                >
                  <div className="space-y-4">
                    {/* User Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${user.is_staff ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-zinc-800 border border-zinc-700'}`}
                        >
                          <User
                            className={`w-5 h-5 ${user.is_staff ? 'text-blue-400' : 'text-zinc-400'}`}
                          />
                        </div>
                        <div className="min-w-0">
                          <TruncatedName name={user.full_name || 'Not Set'} />
                          <p className="text-xs text-zinc-500">ID: {user.id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setRegeneratingUser(user)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-orange-400 hover:bg-orange-500/10 transition-colors"
                          title="Regenerate API Token"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleBanUser(user.vatsim_id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Ban User"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingUser(user)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* User Details */}
                    <div className="space-y-2 pt-2 border-t border-zinc-800">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-3.5 h-3.5 text-zinc-500" />
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={() => handleCopyEmail(user.id, user.email)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleCopyEmail(user.id, user.email);
                            }
                          }}
                          className={`truncate cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded ${copiedEmail === user.id ? 'text-green-400' : 'text-zinc-300 hover:text-white'}`}
                        >
                          {user.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <IdCard className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-zinc-300">VATSIM: </span>
                        {user.vatsim_id ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={() => handleCopyCid(user.id, user.vatsim_id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleCopyCid(user.id, user.vatsim_id);
                              }
                            }}
                            className={`cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 rounded ${copiedCid === user.id ? 'text-green-400' : 'text-zinc-300 hover:text-white'}`}
                          >
                            {user.vatsim_id}
                          </span>
                        ) : (
                          <span className="text-zinc-300">Not set</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-zinc-300">
                          {user.region?.name || user.region?.id || 'No region'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Map className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-zinc-300">
                          {user.division?.name || user.division?.id || 'No division'}
                        </span>
                      </div>
                      {(user.subdivision?.name || user.subdivision?.id) && (
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-zinc-300">
                            {user.subdivision?.name || user.subdivision?.id}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Timestamps */}
                    <div className="flex items-center justify-between pt-3 border-t border-zinc-800 text-xs text-zinc-500">
                      <Tooltip content="Created At">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          <span>{formatLocalDateTime(user.created_at)}</span>
                        </div>
                      </Tooltip>
                      <Tooltip content="Last Login">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          <span>{formatLocalDateTime(user.last_login)}</span>
                        </div>
                      </Tooltip>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Delete Confirmation Modal */}
            <Dialog
              open={!!deletingUser}
              onClose={cancelDelete}
              icon={AlertOctagon}
              iconColor="red"
              title="Delete User Account"
              description="This action cannot be undone. All associated data including API tokens, division memberships, and staff roles will be permanently deleted."
              isLoading={isDeletingUser}
              closeOnBackdrop={!isDeletingUser}
              closeOnEscape={!isDeletingUser}
              onSubmit={() => handleDeleteUser(deletingUser?.id)}
              fields={[
                {
                  type: 'confirmation',
                  label: 'Type DELETE to confirm:',
                  confirmText: 'DELETE',
                  value: deleteConfirmation,
                  onChange: setDeleteConfirmation,
                },
              ]}
              buttons={[
                {
                  label: 'Delete Account',
                  type: 'submit',
                  variant: 'destructive',
                  icon: Trash2,
                  loadingLabel: 'Deleting...',
                  requiresValidation: true,
                },
                {
                  label: 'Cancel',
                  variant: 'outline',
                  onClick: cancelDelete,
                },
              ]}
            >
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
                <p className="text-zinc-200">You are about to delete the account for:</p>
                <div className="mt-2">
                  <div className="flex items-center space-x-2 text-red-200">
                    <User className="w-4 h-4" />
                    <span>{deletingUser?.full_name || 'Not set'}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-red-200 mt-1">
                    <Mail className="w-4 h-4" />
                    <span>{deletingUser?.email}</span>
                  </div>
                </div>
              </div>
            </Dialog>

            {/* Regenerate Token Modal */}
            <Dialog
              open={!!regeneratingUser}
              onClose={cancelRegenerate}
              icon={KeyRound}
              iconColor="orange"
              title="Regenerate API Token"
              description="This action cannot be undone. The API token will be regenerated and the old token will stop working."
              isLoading={isRegeneratingToken}
              closeOnBackdrop={!isRegeneratingToken}
              closeOnEscape={!isRegeneratingToken}
              onSubmit={() => handleRegenerateToken(regeneratingUser?.id)}
              fields={[
                {
                  type: 'confirmation',
                  label: 'Type REGENERATE to confirm:',
                  confirmText: 'REGENERATE',
                  value: regenerateConfirmation,
                  onChange: setRegenerateConfirmation,
                },
              ]}
              buttons={[
                {
                  label: 'Regenerate Token',
                  type: 'submit',
                  variant: 'primary',
                  icon: KeyRound,
                  loadingLabel: 'Regenerating...',
                  requiresValidation: true,
                },
                {
                  label: 'Cancel',
                  variant: 'outline',
                  onClick: cancelRegenerate,
                },
              ]}
            >
              <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg mb-4">
                <p className="text-zinc-200">You are about to regenerate the API Token for:</p>
                <div className="mt-2">
                  <div className="flex items-center space-x-2 text-orange-200">
                    <User className="w-4 h-4" />
                    <span>{regeneratingUser?.full_name || 'Not set'}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-orange-200 mt-1">
                    <Mail className="w-4 h-4" />
                    <span>{regeneratingUser?.email}</span>
                  </div>
                </div>
              </div>
            </Dialog>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-300 bg-zinc-800/50 border border-zinc-700/50 rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm text-zinc-400">
                Page <span className="font-medium text-zinc-300">{currentPage}</span> of{' '}
                <span className="font-medium text-zinc-300">{totalPages}</span>
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-zinc-300 bg-zinc-800/50 border border-zinc-700/50 rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Toast Notifications */}
      <Toast
        title="Success"
        description={successMessage}
        variant="success"
        show={showSuccessToast}
        onClose={() => setShowSuccessToast(false)}
      />

      <Toast
        title="Error"
        description={errorMessage}
        variant="destructive"
        show={showErrorToast}
        onClose={() => setShowErrorToast(false)}
      />
    </div>
  );
};

export default UserManagement;
