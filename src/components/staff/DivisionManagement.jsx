import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Dialog } from '../shared/Dialog';
import { Toast } from '../shared/Toast';
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
  Settings,
  Layers,
} from 'lucide-react';

const DivisionManagement = () => {
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedDivisions, setExpandedDivisions] = useState({});
  const [divisionMembers, setDivisionMembers] = useState({});
  const [divisionAirports, setDivisionAirports] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});
  const [deletingDivision, setDeletingDivision] = useState(null);
  const [isDeletingDivision, setIsDeletingDivision] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [editingDivision, setEditingDivision] = useState(null);
  const [isEditingDivision, setIsEditingDivision] = useState(false);
  const [newDivisionName, setNewDivisionName] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCreatingDivision, setIsCreatingDivision] = useState(false);
  const [createDivisionName, setCreateDivisionName] = useState('');
  const [createDivisionHeadCid, setCreateDivisionHeadCid] = useState('');
  const [toast, setToast] = useState({
    show: false,
    title: '',
    description: '',
    variant: 'default',
  });
  const navigate = useNavigate();
  const token = getVatsimToken();

  useEffect(() => {
    const fetchDivisions = async () => {
      try {
        const response = await fetch('https://v2.stopbars.com/divisions', {
          headers: { 'X-Vatsim-Token': token },
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
      day: 'numeric',
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
      setExpandedDivisions((prev) => ({ ...prev, [divisionId]: false }));
    } else {
      // Expand and fetch details
      setExpandedDivisions((prev) => ({ ...prev, [divisionId]: true }));

      if (!divisionMembers[divisionId] || !divisionAirports[divisionId]) {
        setLoadingDetails((prev) => ({ ...prev, [divisionId]: true }));

        try {
          // Fetch members and airports in parallel
          const [membersResponse, airportsResponse] = await Promise.all([
            fetch(`https://v2.stopbars.com/divisions/${divisionId}/members`, {
              headers: { 'X-Vatsim-Token': token },
            }),
            fetch(`https://v2.stopbars.com/divisions/${divisionId}/airports`, {
              headers: { 'X-Vatsim-Token': token },
            }),
          ]);

          if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            setDivisionMembers((prev) => ({ ...prev, [divisionId]: membersData }));
          }

          if (airportsResponse.ok) {
            const airportsData = await airportsResponse.json();
            setDivisionAirports((prev) => ({ ...prev, [divisionId]: airportsData }));
          }
        } catch (err) {
          console.error(`Failed to fetch details for division ${divisionId}:`, err);
        } finally {
          setLoadingDetails((prev) => ({ ...prev, [divisionId]: false }));
        }
      }
    }
  };

  const handleDeleteDivision = async (divisionId) => {
    setIsDeletingDivision(true);
    setError('');

    const divisionName = deletingDivision?.name;

    try {
      const response = await fetch(`https://v2.stopbars.com/divisions/${divisionId}`, {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': token },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete division');
      }

      setDivisions(divisions.filter((division) => division.id !== divisionId));
      setDeletingDivision(null);
      setToast({
        show: true,
        title: `${divisionName} Deleted`,
        description: 'The division has been permanently deleted.',
        variant: 'success',
      });
    } catch (err) {
      setToast({
        show: true,
        title: 'Failed to Delete Division',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsDeletingDivision(false);
    }
  };

  const cancelDelete = () => {
    setDeletingDivision(null);
    setDeleteConfirmation('');
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
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newName,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update division name');
      }

      // Update the division in the local state
      setDivisions((prevDivisions) =>
        prevDivisions.map((division) =>
          division.id === divisionId ? { ...division, name: newName } : division
        )
      );

      setEditingDivision(null);
      setNewDivisionName('');
      setToast({
        show: true,
        title: `${newName} Updated`,
        description: 'The division name has been successfully changed.',
        variant: 'success',
      });
    } catch (err) {
      setToast({
        show: true,
        title: 'Failed to Update Division',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsEditingDivision(false);
    }
  };

  const cancelEdit = () => {
    setEditingDivision(null);
    setNewDivisionName('');
    setError('');
  };

  const handleCreateDivision = async () => {
    setIsCreatingDivision(true);
    setError('');

    try {
      const response = await fetch('https://v2.stopbars.com/divisions', {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: createDivisionName.trim(),
          headVatsimId: createDivisionHeadCid.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create division');
      }

      const division = await response.json();
      const divisionName = createDivisionName.trim();
      const headCid = createDivisionHeadCid.trim();
      setDivisions((prev) => [...prev, division]);
      setShowCreateDialog(false);
      setCreateDivisionName('');
      setCreateDivisionHeadCid('');
      setToast({
        show: true,
        title: `${divisionName} Created`,
        description: `This division has been made, with Nav Head ${headCid}.`,
        variant: 'success',
      });
      navigate(`/divisions/${division.id}/manage`);
    } catch (err) {
      setToast({
        show: true,
        title: 'Failed to Create Division',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsCreatingDivision(false);
    }
  };

  const cancelCreate = () => {
    setShowCreateDialog(false);
    setCreateDivisionName('');
    setCreateDivisionHeadCid('');
    setError('');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div className="animate-pulse bg-zinc-700 h-8 w-48 rounded mb-4 md:mb-0"></div>
          <div className="animate-pulse bg-zinc-700 h-9 w-32 rounded-lg"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6">
              <div className="animate-pulse">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-1 mb-2">
                      <div className="bg-zinc-700 h-6 w-40 rounded"></div>
                      <div className="bg-zinc-700 h-4 w-8 rounded"></div>
                    </div>
                    <div className="bg-zinc-700 h-4 w-24 rounded"></div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="bg-zinc-700 h-8 w-8 rounded"></div>
                    <div className="bg-zinc-700 h-8 w-8 rounded"></div>
                    <div className="bg-zinc-700 h-8 w-8 rounded"></div>
                  </div>
                </div>
                <div className="bg-zinc-700 h-4 w-3/4 rounded"></div>
              </div>
            </Card>
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
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-xl font-semibold text-white">Division Management</h2>
          <p className="text-sm text-zinc-400 mt-1">Manage, edit, and create divisions</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
            <Layers className="w-4 h-4 mr-2 text-zinc-400" />
            {divisions.length} division{divisions.length !== 1 ? 's' : ''}
          </span>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Division
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Status Messages */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {divisions.length > 0 ? (
          <div className="space-y-4">
            {divisions.map((division) => {
              const isExpanded = expandedDivisions[division.id];
              const isLoadingDetails = loadingDetails[division.id];
              const members = divisionMembers[division.id] || [];
              const airports = divisionAirports[division.id] || [];

              return (
                <Card
                  key={division.id}
                  className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xl font-semibold text-white">{division.name}</h4>
                            <span className="text-sm text-zinc-500">#{division.id}</span>
                          </div>
                          <p className="text-zinc-400 text-sm mt-1">
                            {formatDate(division.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => toggleDivisionExpansion(division.id)}
                            variant="outline"
                            className="p-2"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            onClick={() => navigate(`/divisions/${division.id}/manage`)}
                            variant="outline"
                            className="p-2 text-blue-400 hover:bg-blue-500/10"
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => setEditingDivision(division)}
                            variant="outline"
                            className="p-2 text-amber-400 hover:bg-amber-500/10"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={() => setDeletingDivision(division)}
                            variant="outline"
                            className="p-2 text-red-400 hover:bg-red-500/10"
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
                                    {members.map((member) => (
                                      <div
                                        key={member.id}
                                        className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
                                      >
                                        <div>
                                          <p className="text-white font-medium">
                                            {member.display_name}
                                          </p>
                                          {member.vatsim_id &&
                                            String(member.display_name) !==
                                              String(member.vatsim_id) && (
                                              <p className="text-zinc-400 text-sm font-mono">
                                                {member.vatsim_id}
                                              </p>
                                            )}
                                          <p className="text-zinc-400 text-sm">
                                            {member.role
                                              .split('_')
                                              .map(
                                                (word) =>
                                                  word.charAt(0).toUpperCase() + word.slice(1)
                                              )
                                              .join(' ')}
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
                                    {airports.map((airport) => (
                                      <div
                                        key={airport.id}
                                        className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
                                      >
                                        <div>
                                          <p className="text-white font-medium">{airport.icao}</p>
                                          <div className="flex items-center space-x-2">
                                            <span className="text-zinc-400 text-sm">
                                              Status:{' '}
                                              {airport.status.charAt(0).toUpperCase() +
                                                airport.status.slice(1)}
                                            </span>
                                            <div className="relative">
                                              <div
                                                className={`w-2 h-2 rounded-full ${getStatusColor(airport.status)} transition-colors duration-300 shadow-lg`}
                                              ></div>
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
          <Card className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center">
            <TowerControl className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
            <h4 className="text-lg font-semibold text-white mb-2">No divisions found</h4>
            <p className="text-zinc-400 mb-4">Create your first division to get started</p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Division
            </Button>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deletingDivision}
        onClose={cancelDelete}
        icon={AlertOctagon}
        iconColor="red"
        title="Delete Division"
        description="This action cannot be undone. All associated data including managed points, requested airports, division members, will be permanently deleted."
        isLoading={isDeletingDivision}
        closeOnBackdrop={!isDeletingDivision}
        closeOnEscape={!isDeletingDivision}
        onSubmit={() => handleDeleteDivision(deletingDivision?.id)}
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
            label: 'Delete Division',
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
          <p className="text-zinc-200">You are about to delete the division:</p>
          <div className="mt-2">
            <div className="flex items-center space-x-2 text-red-200">
              <Building2 className="w-4 h-4" />
              <span>{deletingDivision?.name}</span>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Edit Division Modal */}
      <Dialog
        open={!!editingDivision}
        onClose={cancelEdit}
        icon={Edit}
        iconColor="orange"
        title="Edit Division Name"
        isLoading={isEditingDivision}
        closeOnBackdrop={!isEditingDivision}
        closeOnEscape={!isEditingDivision}
        onSubmit={() => handleEditDivision(editingDivision?.id, newDivisionName.trim())}
        fields={[
          {
            type: 'text',
            label: 'New Division Name:',
            placeholder: 'Enter new division name',
            value: newDivisionName,
            onChange: setNewDivisionName,
          },
        ]}
        buttons={[
          {
            label: 'Rename Division',
            type: 'submit',
            variant: 'primary',
            icon: Edit,
            loadingLabel: 'Updating...',
            disabled: !newDivisionName.trim() || newDivisionName.trim() === editingDivision?.name,
          },
          {
            label: 'Cancel',
            variant: 'outline',
            onClick: cancelEdit,
          },
        ]}
      >
        <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg mb-4">
          <p className="text-zinc-200">You are about to edit the division name for:</p>
          <div className="mt-2">
            <div className="flex items-center space-x-2 text-orange-200">
              <Building2 className="w-4 h-4" />
              <span>{editingDivision?.name}</span>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Create Division Modal */}
      <Dialog
        open={showCreateDialog}
        onClose={cancelCreate}
        icon={Plus}
        iconColor="blue"
        title="Create Division"
        isLoading={isCreatingDivision}
        closeOnBackdrop={!isCreatingDivision}
        closeOnEscape={!isCreatingDivision}
        onSubmit={handleCreateDivision}
        fields={[
          {
            type: 'text',
            label: 'Division Name',
            placeholder: 'e.g. VATxxx',
            value: createDivisionName,
            onChange: setCreateDivisionName,
            autoFocus: true,
          },
          {
            type: 'text',
            label: 'Nav Head CID',
            placeholder: 'e.g. 1234567',
            value: createDivisionHeadCid,
            onChange: setCreateDivisionHeadCid,
            helperText: 'This person will be assigned as the Nav Head of the Division',
          },
        ]}
        buttons={[
          {
            label: 'Create Division',
            type: 'submit',
            variant: 'primary',
            icon: Plus,
            loadingLabel: 'Creating...',
            disabled: !createDivisionName.trim() || !createDivisionHeadCid.trim(),
          },
          {
            label: 'Cancel',
            variant: 'outline',
            onClick: cancelCreate,
          },
        ]}
      />

      {/* Toast Notifications */}
      <Toast
        show={toast.show}
        title={toast.title}
        description={toast.description}
        variant={toast.variant}
        onClose={() => setToast({ ...toast, show: false })}
      />
    </div>
  );
};

export default DivisionManagement;
