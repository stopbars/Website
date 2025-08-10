import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { getVatsimToken } from '../../utils/cookieUtils';
import { 
  Plus, 
  Users, 
  TowerControl, 
  Edit, 
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader,
  Building2,
  AlertOctagon,
  Check,
  IdCard
} from 'lucide-react';

const DeleteConfirmationModal = ({ division, onCancel, onConfirmDelete, isDeleting }) => {
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
          <h3 className="text-xl font-bold text-red-500">Delete Division</h3>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-zinc-200">
              You are about to delete the division:
            </p>
            <div className="mt-2">
              <div className="flex items-center space-x-2 text-red-200">
                <Building2 className="w-4 h-4" />
                <span>{division.name}</span>
              </div>
              <div className="flex items-center space-x-2 text-red-200 mt-1">
                <IdCard className="w-4 h-4" />
                <span className="text-sm">Division ID: {division.id}</span>
              </div>
            </div>
          </div>

          <p className="text-zinc-300">
            This action cannot be undone. All associated data including managed points, requested airports, division members, everything will be permanently deleted.
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
            </div>
            <div className="flex space-x-3 mt-6">
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
                    Delete Division
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
  division: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired
  }).isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirmDelete: PropTypes.func.isRequired,
  isDeleting: PropTypes.bool.isRequired
};

const EditDivisionModal = ({ division, onCancel, onConfirmEdit, isEditing }) => {
  const [newDivisionName, setNewDivisionName] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (newDivisionName.trim() && newDivisionName.trim() !== division.name) {
      onConfirmEdit(newDivisionName.trim());
    }
  };

  const isValidName = newDivisionName.trim() && newDivisionName.trim() !== division.name;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
        <div className="flex items-center space-x-3 mb-6">
          <Edit className="w-6 h-6 text-orange-300" />
          <h3 className="text-xl font-bold text-orange-300">Edit Division Name</h3>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
            <p className="text-zinc-200">
              You are about to edit the division name for:
            </p>
            <div className="mt-2">
              <div className="flex items-center space-x-2 text-orange-200">
                <Building2 className="w-4 h-4" />
                <span>{division.name}</span>
              </div>
              <div className="flex items-center space-x-2 text-orange-200 mt-1">
                <IdCard className="w-4 h-4" />
                <span className="text-sm">Division ID: {division.id}</span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium mb-2 text-zinc-300">
                New Division Name:
              </label>
              <input
                type="text"
                value={newDivisionName}
                onChange={(e) => setNewDivisionName(e.target.value)}
                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-orange-500"
                disabled={isEditing}
                placeholder="Enter new division name"
              />
            </div>
            <div className="flex space-x-3 mt-6">
              <Button
                type="submit"
                className={`${
                  isValidName && !isEditing
                    ? '!bg-orange-500 hover:!bg-orange-600 text-white' 
                    : '!bg-zinc-700 !text-zinc-400 cursor-not-allowed'
                }`}
                disabled={!isValidName || isEditing}
              >
                {isEditing ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Edit className="w-4 h-4 mr-2" />
                    Rename Division
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isEditing}
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

EditDivisionModal.propTypes = {
  division: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired
  }).isRequired,
  onCancel: PropTypes.func.isRequired,
  onConfirmEdit: PropTypes.func.isRequired,
  isEditing: PropTypes.bool.isRequired
};

const DivisionManagement = () => {
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState('');
  const [expandedDivisions, setExpandedDivisions] = useState({});
  const [divisionMembers, setDivisionMembers] = useState({});
  const [divisionAirports, setDivisionAirports] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});
  const [deletingDivision, setDeletingDivision] = useState(null);
  const [isDeletingDivision, setIsDeletingDivision] = useState(false);
  const [editingDivision, setEditingDivision] = useState(null);
  const [isEditingDivision, setIsEditingDivision] = useState(false);
  const navigate = useNavigate();
  const token = getVatsimToken();

  useEffect(() => {
    const fetchDivisions = async () => {
      try {
        const response = await fetch('https://v2.stopbars.com/divisions', {
          headers: { 'X-Vatsim-Token': token }
        });

        if (!response.ok) throw new Error('Failed to fetch divisions');
        const divisionsData = await response.json();
        setDivisions(divisionsData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (token) fetchDivisions();
  }, [token]);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Helper function to get status color for airports
  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'bg-green-400';
      case 'pending':
        return 'bg-orange-400';
      case 'rejected':
        return 'bg-red-400';
      default:
        return 'bg-gray-400';
    }
  };

  const toggleDivisionExpansion = async (divisionId) => {
    const isExpanded = expandedDivisions[divisionId];
    
    if (isExpanded) {
      // Collapse the division
      setExpandedDivisions(prev => ({ ...prev, [divisionId]: false }));
    } else {
      // Expand and fetch details
      setExpandedDivisions(prev => ({ ...prev, [divisionId]: true }));
      
      if (!divisionMembers[divisionId] || !divisionAirports[divisionId]) {
        setLoadingDetails(prev => ({ ...prev, [divisionId]: true }));
        
        try {
          // Fetch members and airports in parallel
          const [membersResponse, airportsResponse] = await Promise.all([
            fetch(`https://v2.stopbars.com/divisions/${divisionId}/members`, {
              headers: { 'X-Vatsim-Token': token }
            }),
            fetch(`https://v2.stopbars.com/divisions/${divisionId}/airports`, {
              headers: { 'X-Vatsim-Token': token }
            })
          ]);

          if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            setDivisionMembers(prev => ({ ...prev, [divisionId]: membersData }));
          }

          if (airportsResponse.ok) {
            const airportsData = await airportsResponse.json();
            setDivisionAirports(prev => ({ ...prev, [divisionId]: airportsData }));
          }
        } catch (err) {
          console.error(`Failed to fetch details for division ${divisionId}:`, err);
        } finally {
          setLoadingDetails(prev => ({ ...prev, [divisionId]: false }));
        }
      }
    }
  };

  const handleDeleteDivision = async (divisionId) => {
    setIsDeletingDivision(true);
    setError('');
  
    try {
      const response = await fetch(`https://v2.stopbars.com/divisions/${divisionId}`, {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': token }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete division');
      }
  
      setDivisions(divisions.filter(division => division.id !== divisionId));
      setSuccess('Division deleted successfully');
      setDeletingDivision(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDeletingDivision(false);
    }
  };

  const cancelDelete = () => {
    setDeletingDivision(null);
    setError('');
  };

  const handleEditDivision = async (divisionId, newName) => {
    setIsEditingDivision(true);
    setError('');
  
    try {
      const response = await fetch(`https://v2.stopbars.com/divisions/${divisionId}`, {
        method: 'PUT',
        headers: { 
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newName
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update division name');
      }
  
      // Update the division in the local state
      setDivisions(prevDivisions => 
        prevDivisions.map(division => 
          division.id === divisionId 
            ? { ...division, name: newName }
            : division
        )
      );
      
      setSuccess('Division name updated successfully');
      setEditingDivision(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsEditingDivision(false);
    }
  };

  const cancelEdit = () => {
    setEditingDivision(null);
    setError('');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold text-white">Division Management</h2>
          <div className="animate-pulse bg-zinc-700 h-10 w-32 rounded-lg"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse bg-zinc-800 h-24 rounded-lg"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-white">Division Management</h2>
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h1 className="text-2xl font-bold mb-4 md:mb-0">Division Management</h1>
        <Button onClick={() => navigate('/divisions/new')} className="text-sm px-3 py-1.5">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Create Division
        </Button>
      </div>

      <div className="space-y-4">
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

        {divisions.length > 0 ? (
          <div className="space-y-4">
            {divisions.map(division => {
              const isExpanded = expandedDivisions[division.id];
              const isLoadingDetails = loadingDetails[division.id];
              const members = divisionMembers[division.id] || [];
              const airports = divisionAirports[division.id] || [];

              return (
                <Card key={division.id} className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="flex items-center space-x-1">
                            <h4 className="text-xl font-semibold text-white">{division.name}</h4>
                            <span className="text-sm text-zinc-400 opacity-70">#{division.id}</span>
                          </div>
                          <p className="text-zinc-400 text-sm">{formatDate(division.created_at)}</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            onClick={() => toggleDivisionExpansion(division.id)}
                            variant="secondary"
                            className="px-2 py-2"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                          <Button
                            onClick={() => setEditingDivision(division)}
                            variant="secondary"
                            className="text-orange-400 hover:bg-orange-500/10 px-2 py-2"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => setDeletingDivision(division)}
                            variant="secondary"
                            className="text-red-400 px-2 py-2"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {division.description && (
                        <div className="mt-3">
                          <p className="text-zinc-300 text-sm">{division.description}</p>
                        </div>
                      )}

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="mt-6 pt-6 border-t border-zinc-800">
                          {isLoadingDetails ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader className="w-6 h-6 animate-spin text-zinc-400" />
                              <span className="ml-2 text-zinc-400">Loading details...</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              {/* Members */}
                              <div>
                                <h5 className="text-lg font-semibold text-white mb-3 flex items-center">
                                  <Users className="w-5 h-5 mr-2" />
                                  Members
                                </h5>
                                {members.length > 0 ? (
                                  <div className="space-y-2">
                                    {members.map(member => (
                                      <div key={member.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                                        <div>
                                          <p className="text-white font-medium">{member.display_name}</p>
                                          <p className="text-zinc-400 text-sm">
                                            {member.role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-zinc-400 text-sm">No members found</p>
                                )}
                              </div>

                              {/* Airports */}
                              <div>
                                <h5 className="text-lg font-semibold text-white mb-3 flex items-center">
                                  <TowerControl className="w-5 h-5 mr-2" />
                                  Airports
                                </h5>
                                {airports.length > 0 ? (
                                  <div className="space-y-2">
                                    {airports.map(airport => (
                                      <div key={airport.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                                        <div>
                                          <p className="text-white font-medium">{airport.icao}</p>
                                          <div className="flex items-center space-x-2">
                                            <span className="text-zinc-400 text-sm">Status: {airport.status.charAt(0).toUpperCase() + airport.status.slice(1)}</span>
                                            <div className="relative">
                                              <div className={`w-2 h-2 rounded-full ${getStatusColor(airport.status)} transition-colors duration-300 shadow-lg`}></div>
                                              <div 
                                                className={`absolute inset-0 w-2 h-2 rounded-full ${getStatusColor(airport.status)} animate-pulse opacity-50`}
                                                style={{ animationDuration: '3s' }}
                                              ></div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-zinc-400 text-sm">No airports found</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <TowerControl className="w-12 h-12 text-zinc-400 mx-auto mb-4" />
            <h4 className="text-lg font-semibold text-white mb-2">No divisions found</h4>
            <p className="text-zinc-400 mb-4">Create your first division to get started</p>
            <Button onClick={() => navigate('/divisions/new')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Division
            </Button>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingDivision && (
        <DeleteConfirmationModal
          division={deletingDivision}
          onCancel={cancelDelete}
          onConfirmDelete={() => handleDeleteDivision(deletingDivision.id)}
          isDeleting={isDeletingDivision}
        />
      )}

      {/* Edit Division Modal */}
      {editingDivision && (
        <EditDivisionModal
          division={editingDivision}
          onCancel={cancelEdit}
          onConfirmEdit={(newName) => handleEditDivision(editingDivision.id, newName)}
          isEditing={isEditingDivision}
        />
      )}
    </div>
  );
};

export default DivisionManagement;
