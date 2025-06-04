import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { 
  Users, 
  Search, 
  Shield, 
  Mail,
  AlertTriangle,
  Check,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertOctagon,
  BadgeCheck,
  Loader
} from 'lucide-react';
import { formatLocalDateTime } from '../../utils/dateUtils';

const USERS_PER_PAGE = 10;

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
                  <Shield className="w-4 h-4" />
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
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-red-500"
                disabled={isDeleting}
              />
            </div>            <div className="flex space-x-3 mt-6">
              <Button
                type="submit"
                className="!bg-red-500 hover:!bg-red-600 text-white"
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

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [success, setSuccess] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingUser, setDeletingUser] = useState(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    fetchUsers();
  }, [currentPage]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('vatsimToken');
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
      const token = localStorage.getItem('vatsimToken');
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
  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.vatsim_id && user.vatsim_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (user.id && user.id.toString().includes(searchTerm))
  );

  const totalPages = Math.ceil(totalUsers / USERS_PER_PAGE);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  return (
    <div className="space-y-6">
      {/* Header and Search */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Users className="w-6 h-6 text-zinc-400" />
          <h2 className="text-xl font-semibold">User Management</h2>
          {!loading && <span className="text-sm text-zinc-500">({totalUsers} users)</span>}
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
              <Card key={user.id} className="p-6 hover:border-zinc-700 transition-colors">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <Mail className="w-5 h-5 text-zinc-400" />
                      <h3 className="font-medium truncate">{user.email}</h3>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setDeletingUser(user)}
                      className="px-2 py-2 text-red-500 border-red-500/20 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>                  <div className="flex items-center space-x-3 mb-2">
                    <Shield className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm text-zinc-300">
                      VATSIM ID: {user.vatsim_id || 'Not set'}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-3 mb-4">
                    <Users className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm text-zinc-300">
                      Account ID: {user.id}
                    </span>
                  </div>
                  
                  <div className="flex items-center space-x-3 mb-4">
                    <BadgeCheck className={`w-4 h-4 ${user.is_staff ? 'text-emerald-400' : 'text-zinc-500'}`} />
                    <span className="text-sm text-zinc-300">
                      Status: {user.is_staff ? `Staff (${user.role.replace(/_/g, ' ')})` : 'Regular User'}
                    </span>
                  </div>
                  
                  <div className="space-y-2 text-sm text-zinc-400">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4" />
                      <span>Created: {formatLocalDateTime(user.created_at)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4" />
                      <span>Last Login: {formatLocalDateTime(user.last_login)}</span>
                    </div>
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

          {/* Pagination Controls */}
          <div className="flex items-center justify-between mt-6">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>
            <span className="text-sm text-zinc-400">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-4"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default UserManagement;
