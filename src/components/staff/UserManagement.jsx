import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import useSearchQuery from '../../hooks/useSearchQuery';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Tooltip } from '../shared/Tooltip';
import {
  User,
  Users,
  Search,
  Mail,
  AlertTriangle,
  Check,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertOctagon,
  Loader,
  IdCard,
  KeyRound,
  Shield,
  ShieldCheck,
  Globe,
  Map,
  MapPin,
  Ban,
} from 'lucide-react';
import { formatLocalDateTime } from '../../utils/dateUtils';
import { getVatsimToken } from '../../utils/cookieUtils';

const USERS_PER_PAGE = 6;

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

const DeleteConfirmationModal = ({ user, onCancel, onConfirmDelete, isDeleting }) => {
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  // Lock background scroll when modal is open
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (deleteConfirmation === 'DELETE') {
      onConfirmDelete();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 w-screen h-screen bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-x-hidden overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full border border-zinc-800 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center space-x-3 mb-6">
          <AlertOctagon className="w-6 h-6 text-red-500" />
          <h3 className="text-xl font-bold text-red-500">Delete User Account</h3>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-zinc-200">You are about to delete the account for:</p>
            <div className="mt-2">
              <div className="flex items-center space-x-2 text-red-200">
                <User className="w-4 h-4" />
                <span>{user.full_name || 'Not set'}</span>
              </div>
              <div className="flex items-center space-x-2 text-red-200 mt-1">
                <Mail className="w-4 h-4" />
                <span>{user.email}</span>
              </div>
            </div>
          </div>

          <p className="text-zinc-300">
            This action cannot be undone. All associated data including API tokens, division
            memberships, and staff roles will be permanently deleted.
          </p>

          <form onSubmit={handleSubmit}>
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
                disabled={isDeleting}
              />
            </div>{' '}
            <div className="flex space-x-3 mt-6">
              <Button
                type="submit"
                className={`${
                  deleteConfirmation === 'DELETE' && !isDeleting
                    ? 'bg-red-500! hover:bg-red-600! text-white'
                    : 'bg-zinc-700! text-zinc-400! cursor-not-allowed'
                }`}
                disabled={deleteConfirmation !== 'DELETE' || isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel} disabled={isDeleting}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};

DeleteConfirmationModal.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.number.isRequired,
    full_name: PropTypes.string,
    email: PropTypes.string.isRequired,
    vatsim_id: PropTypes.string,
  }).isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirmDelete: PropTypes.func.isRequired,
  isDeleting: PropTypes.bool.isRequired,
};

const RegenerateTokenModal = ({ user, onCancel, onConfirmRegenerate, isRegenerating }) => {
  const [regenerateConfirmation, setRegenerateConfirmation] = useState('');
  // Lock background scroll when modal is open
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (regenerateConfirmation === 'REGENERATE') {
      onConfirmRegenerate();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 w-screen h-screen bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-x-hidden overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full border border-zinc-800 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center space-x-3 mb-6">
          <KeyRound className="w-6 h-6 text-orange-300" />
          <h3 className="text-xl font-bold text-orange-300">Regenerate API Token</h3>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <p className="text-zinc-200">You are about to regenerate the API Token for:</p>
            <div className="mt-2">
              <div className="flex items-center space-x-2 text-orange-200">
                <User className="w-4 h-4" />
                <span>{user.full_name || 'Not set'}</span>
              </div>
              <div className="flex items-center space-x-2 text-orange-200 mt-1">
                <Mail className="w-4 h-4" />
                <span>{user.email}</span>
              </div>
            </div>
          </div>

          <p className="text-zinc-300">
            This action cannot be undone. The API token will be regenerated and the old token will
            stop working.
          </p>

          <form onSubmit={handleSubmit}>
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
                disabled={isRegenerating}
              />
            </div>
            <div className="flex space-x-3 mt-6">
              <Button
                type="submit"
                className={`${
                  regenerateConfirmation === 'REGENERATE' && !isRegenerating
                    ? 'bg-orange-500! hover:bg-orange-600! text-white'
                    : 'bg-zinc-700! text-zinc-400! cursor-not-allowed'
                }`}
                disabled={regenerateConfirmation !== 'REGENERATE' || isRegenerating}
              >
                {isRegenerating ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4 mr-2" />
                    Regenerate Token
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={onCancel} disabled={isRegenerating}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
};

RegenerateTokenModal.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.number.isRequired,
    full_name: PropTypes.string,
    email: PropTypes.string.isRequired,
    vatsim_id: PropTypes.string,
  }).isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirmRegenerate: PropTypes.func.isRequired,
  isRegenerating: PropTypes.bool.isRequired,
};

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useSearchQuery();
  const [success, setSuccess] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingUser, setDeletingUser] = useState(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [regeneratingUser, setRegeneratingUser] = useState(null);
  const [isRegeneratingToken, setIsRegeneratingToken] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);
  const navigate = useNavigate();

  const handleBanUser = (vatsimId) => {
    if (!vatsimId) return;
    navigate(`/staff?tool=banManagement&vatsimId=${vatsimId}`);
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const token = getVatsimToken();
      const response = await fetch(
        `https://v2.stopbars.com/staff/users?page=${currentPage}&limit=${USERS_PER_PAGE}`,
        {
          headers: { 'X-Vatsim-Token': token },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.users);
      setTotalUsers(data.total);
      setError('');
    } catch (err) {
      setError('Failed to load users. Please try again.');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    fetchUsers();
  }, [currentPage, fetchUsers]);
  // No edit functionality needed

  const handleDeleteUser = async (userId) => {
    setIsDeletingUser(true);
    setError('');

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
      setSuccess('User deleted successfully');
      setDeletingUser(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const cancelDelete = () => {
    setDeletingUser(null);
    setError('');
  };

  const handleRegenerateToken = async (userId) => {
    setIsRegeneratingToken(true);
    setError('');

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

      setSuccess('API token has been successfully refreshed');
      setRegeneratingUser(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRegeneratingToken(false);
    }
  };

  const cancelRegenerate = () => {
    setRegeneratingUser(null);
    setError('');
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

  const totalPages = Math.ceil(totalUsers / USERS_PER_PAGE);

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

      {/* Status Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}

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
              {filteredUsers.map((user) => (
                <Card
                  key={user.id}
                  className="p-5 hover:border-zinc-600/50 transition-all duration-200 hover:bg-zinc-800/30"
                >
                  <div className="space-y-4">
                    {/* User Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-zinc-400" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-medium text-white truncate">
                            {user.full_name || 'Not Set'}
                          </h3>
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

                    {/* Role Badge */}
                    <div>
                      {user.is_staff ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <ShieldCheck className="w-3 h-3" />
                          Staff
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                          <Shield className="w-3 h-3" />
                          User
                        </span>
                      )}
                    </div>

                    {/* User Details */}
                    <div className="space-y-2 pt-2 border-t border-zinc-800">
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-zinc-300 truncate">{user.email}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <IdCard className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-zinc-300">VATSIM: {user.vatsim_id || 'Not set'}</span>
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
                      <Tooltip content="Created at">
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
            {deletingUser && (
              <DeleteConfirmationModal
                user={deletingUser}
                onCancel={cancelDelete}
                onConfirmDelete={() => handleDeleteUser(deletingUser.id)}
                isDeleting={isDeletingUser}
              />
            )}

            {/* Regenerate Token Modal */}
            {regeneratingUser && (
              <RegenerateTokenModal
                user={regeneratingUser}
                onCancel={cancelRegenerate}
                onConfirmRegenerate={() => handleRegenerateToken(regeneratingUser.id)}
                isRegenerating={isRegeneratingToken}
              />
            )}

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
    </div>
  );
};

export default UserManagement;
