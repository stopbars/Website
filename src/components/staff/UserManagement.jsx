import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { 
  User, 
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
    case 1: // First + Last Initial
      const nameParts = user.full_name.split(' ');
      if (nameParts.length > 1) {
        return `${nameParts[0]} ${nameParts[nameParts.length - 1].charAt(0)}`;
      }
      return nameParts[0];
    case 2: // CID (VATSIM ID)
      return user.vatsim_id || 'Not set';
    default:
      return user.full_name.split(' ')[0]; // Fallback to first name
  }
};

const DeleteConfirmationModal = ({ user, onCancel, onConfirmDelete, isDeleting }) => {
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (deleteConfirmation === 'DELETE') {
      onConfirmDelete();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
        <div className="flex items-center space-x-3 mb-6">
          <AlertOctagon className="w-6 h-6 text-red-500" />
          <h3 className="text-xl font-bold text-red-500">Delete User Account</h3>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-zinc-200">
              You are about to delete the account for:
            </p>
            <div className="mt-2">
              <div className="flex items-center space-x-2 text-red-200">
                <Mail className="w-4 h-4" />
                <span>{user.email}</span>
              </div>
              {user.vatsim_id && (
                <div className="flex items-center space-x-2 text-red-200 mt-1">
                  <IdCard className="w-4 h-4" />
                  <span>VATSIM ID: {user.vatsim_id}</span>
                </div>
              )}
            </div>
          </div>

          <p className="text-zinc-300">
            This action cannot be undone. All associated data including API tokens, division memberships, and staff roles will be permanently deleted.
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
            </div>            <div className="flex space-x-3 mt-6">
              <Button
                type="submit"
                className={`${
                  deleteConfirmation === 'DELETE' && !isDeleting
                    ? '!bg-red-500 hover:!bg-red-600 text-white' 
                    : '!bg-zinc-700 !text-zinc-400 cursor-not-allowed'
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
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isDeleting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

DeleteConfirmationModal.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.number.isRequired,
    email: PropTypes.string.isRequired,
    vatsim_id: PropTypes.string
  }).isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirmDelete: PropTypes.func.isRequired,
  isDeleting: PropTypes.bool.isRequired
};

const RegenerateTokenModal = ({ user, onCancel, onConfirmRegenerate, isRegenerating }) => {
  const [regenerateConfirmation, setRegenerateConfirmation] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (regenerateConfirmation === 'REGENERATE') {
      onConfirmRegenerate();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
        <div className="flex items-center space-x-3 mb-6">
          <KeyRound className="w-6 h-6 text-orange-300" />
          <h3 className="text-xl font-bold text-orange-300">Regenerate API Token</h3>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <p className="text-zinc-200">
              You are about to regenerate the API Token for:
            </p>
            <div className="mt-2">
              <div className="flex items-center space-x-2 text-orange-200">
                <Mail className="w-4 h-4" />
                <span>{user.email}</span>
              </div>
              {user.vatsim_id && (
                <div className="flex items-center space-x-2 text-orange-200 mt-1">
                  <IdCard className="w-4 h-4" />
                  <span>VATSIM ID: {user.vatsim_id}</span>
                </div>
              )}
            </div>
          </div>

          <p className="text-zinc-300">
            This action cannot be undone. The API token will be regenerated and the old token will stop working.
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
                    ? '!bg-orange-500 hover:!bg-orange-600 text-white' 
                    : '!bg-zinc-700 !text-zinc-400 cursor-not-allowed'
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
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isRegenerating}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

RegenerateTokenModal.propTypes = {
  user: PropTypes.shape({
    id: PropTypes.number.isRequired,
    email: PropTypes.string.isRequired,
    vatsim_id: PropTypes.string
  }).isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirmRegenerate: PropTypes.func.isRequired,
  isRegenerating: PropTypes.bool.isRequired
};

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [success, setSuccess] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingUser, setDeletingUser] = useState(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [regeneratingUser, setRegeneratingUser] = useState(null);
  const [isRegeneratingToken, setIsRegeneratingToken] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    fetchUsers();
  }, [currentPage]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = getVatsimToken();
      const response = await fetch(`https://v2.stopbars.com/staff/users?page=${currentPage}&limit=${USERS_PER_PAGE}`, {
        headers: { 'X-Vatsim-Token': token }
      });

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
  };
  // No edit functionality needed

  const handleDeleteUser = async (userId) => {
    setIsDeletingUser(true);
    setError('');
  
    try {
      const token = getVatsimToken();
      const response = await fetch(`https://v2.stopbars.com/staff/users/${userId}`, {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': token }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }
  
      setUsers(users.filter(user => user.id !== userId));
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
      const user = users.find(u => u.id === userId);
      
      if (!user || !user.vatsim_id) {
        throw new Error('User VATSIM ID not found');
      }

      const response = await fetch(`https://v2.stopbars.com/staff/users/refresh-api-token`, {
        method: 'POST',
        headers: { 
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vatsimId: user.vatsim_id
        })
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
  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.vatsim_id && user.vatsim_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.id && user.id.toString().includes(searchTerm)) ||
    (user.full_name && user.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (getDisplayName(user).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const totalPages = Math.ceil(totalUsers / USERS_PER_PAGE);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      {/* Header and Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div className="flex items-center space-x-3 mb-4 md:mb-0">
          <h1 className="text-2xl font-bold">User Management</h1>
          {!loading && (
            <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs font-medium">
              {totalUsers} users
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={handleSearch}
            className="pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 w-64"
          />
        </div>
      </div>

      <div className="space-y-6">
        {/* Status Messages */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-500">{error}</p>
          </div>
        )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center space-x-3">
          <Check className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <p className="text-emerald-500">{success}</p>
        </div>
      )}

      {/* Users List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : (
        <>          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredUsers.map(user => (
              <Card key={user.id} className="p-4 hover:border-zinc-700 transition-colors">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <User className="w-6 h-6 text-zinc-400" />
                      <h3 className="font-medium truncate text-base">{user.vatsim_id || 'Not set'}</h3>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Button
                        variant="outline"
                        onClick={() => setRegeneratingUser(user)}
                        className="px-1.5 py-1.5 text-red-500 border-red-500/20 hover:bg-red-500/10"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => setDeletingUser(user)}
                        className="px-1.5 py-1.5 text-red-500 border-red-500/20 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>                  
                  
                  <div className="flex items-center space-x-2 mb-1.5">
                    <IdCard className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-300">
                      Account ID: {user.id || 'Not set'}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2 mb-1.5">
                    {user.is_staff && user.role && user.role.toLowerCase() !== 'user' ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
                    ) : (
                      <Shield className="w-3.5 h-3.5 text-zinc-400" />
                    )}
                    <span className="text-xs text-zinc-300">
                      Role: {user.is_staff ? `${user.role.replace(/_/g, ' ')}` : 'User'}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2 mb-1.5">
                    <Mail className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-300">
                      Email: {user.email}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2 mb-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-300">
                      Full Name: {user.full_name || 'Not set'}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2 mb-1.5">
                    <IdCard className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-300">
                      Display Name: {getDisplayName(user)}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2 mb-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-300">
                      Created: {formatLocalDateTime(user.created_at)}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-300">
                      Last Login: {formatLocalDateTime(user.last_login)}
                    </span>
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
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm"
            >
              <ChevronLeft className="w-3.5 h-3.5 mr-1.5" />
              Previous
            </Button>
            <span className="text-sm text-zinc-400">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1.5 text-sm"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </div>
        </>
      )}
      </div>
    </div>
  );
};

export default UserManagement;
