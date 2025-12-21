import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../layout/Layout';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Dialog } from '../shared/Dialog';
import { Dropdown } from '../shared/Dropdown';
import { Toast } from '../shared/Toast';
import {
  Plus,
  UserX,
  TowerControl,
  Users,
  Settings,
  AlertOctagon,
  Loader,
  User,
  Shield,
} from 'lucide-react';
import { getVatsimToken } from '../../utils/cookieUtils';

const DivisionManagement = () => {
  const { id: divisionId } = useParams();
  const navigate = useNavigate();
  const [division, setDivision] = useState(null);
  const [members, setMembers] = useState([]);
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddAirport, setShowAddAirport] = useState(false);
  const [newMemberCid, setNewMemberCid] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('nav_member');
  const [newAirportIcao, setNewAirportIcao] = useState('');
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [addingMember, setAddingMember] = useState(false);
  const [addingAirport, setAddingAirport] = useState(false);
  const [removingMember, setRemovingMember] = useState(false);
  const token = getVatsimToken();
  const [currentUserId, setCurrentUserId] = useState(null);

  // Toast state
  const [showToast, setShowToast] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    variant: 'success',
    title: '',
    description: '',
  });

  // Helper function to get status color
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch current user account info (only once)
        const accountResponse = await fetch('https://v2.stopbars.com/auth/account', {
          headers: { 'X-Vatsim-Token': token },
        });
        if (accountResponse.ok) {
          const accountData = await accountResponse.json();
          setCurrentUserId(accountData.vatsim_id);
        }
        // Fetch division details
        const divisionResponse = await fetch(`https://v2.stopbars.com/divisions/${divisionId}`, {
          headers: { 'X-Vatsim-Token': token },
        });
        if (!divisionResponse.ok) throw new Error('Failed to fetch division');
        const divisionData = await divisionResponse.json();
        setDivision(divisionData);
        // Fetch members
        const membersResponse = await fetch(
          `https://v2.stopbars.com/divisions/${divisionId}/members`,
          {
            headers: { 'X-Vatsim-Token': token },
          }
        );
        if (!membersResponse.ok) throw new Error('Failed to fetch members');
        const membersData = await membersResponse.json();
        setMembers(membersData);
        // Fetch airports
        const airportsResponse = await fetch(
          `https://v2.stopbars.com/divisions/${divisionId}/airports`,
          {
            headers: { 'X-Vatsim-Token': token },
          }
        );
        if (!airportsResponse.ok) throw new Error('Failed to fetch airports');
        const airportsData = await airportsResponse.json();
        setAirports(airportsData);
      } catch (err) {
        setToastConfig({
          variant: 'destructive',
          title: 'Error',
          description: err.message || 'Failed to load division data.',
        });
        setShowToast(true);
      } finally {
        setLoading(false);
      }
    };
    if (token && divisionId) fetchData();
  }, [token, divisionId]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    setAddingMember(true);
    try {
      const response = await fetch(`https://v2.stopbars.com/divisions/${divisionId}/members`, {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vatsimId: newMemberCid,
          role: newMemberRole,
        }),
      });

      if (!response.ok) throw new Error('Failed to add member');

      const newMember = await response.json();
      setMembers([...members, newMember]);
      const addedCid = newMemberCid;
      setNewMemberCid('');
      setNewMemberRole('nav_member');
      setShowAddMember(false);
      setToastConfig({
        variant: 'success',
        title: `${addedCid} Added`,
        description: 'The member has been added to the division.',
      });
      setShowToast(true);
    } catch (err) {
      setShowAddMember(false);
      setNewMemberCid('');
      setNewMemberRole('nav_member');
      setToastConfig({
        variant: 'destructive',
        title: 'Failed to Add Member',
        description: err.message || 'An error occurred while adding the member.',
      });
      setShowToast(true);
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    setRemovingMember(true);
    try {
      const response = await fetch(
        `https://v2.stopbars.com/divisions/${divisionId}/members/${memberId}`,
        {
          method: 'DELETE',
          headers: { 'X-Vatsim-Token': token },
        }
      );

      if (!response.ok) throw new Error('Failed to remove member');

      setMembers(members.filter((m) => m.vatsim_id !== memberId));
      setShowRemoveConfirm(false);
      setMemberToRemove(null);
      setToastConfig({
        variant: 'success',
        title: `${memberId} Removed`,
        description: 'The member has been removed from the division.',
      });
      setShowToast(true);
    } catch (err) {
      setShowRemoveConfirm(false);
      setMemberToRemove(null);
      setToastConfig({
        variant: 'destructive',
        title: 'Failed to Remove Member',
        description: err.message || 'An error occurred while removing the member.',
      });
      setShowToast(true);
    } finally {
      setRemovingMember(false);
    }
  };

  const confirmRemoveMember = (member) => {
    setMemberToRemove(member);
    setShowRemoveConfirm(true);
  };

  const cancelRemoveMember = () => {
    setShowRemoveConfirm(false);
    setMemberToRemove(null);
    setRemovingMember(false);
  };

  const handleAddAirport = async (e) => {
    e.preventDefault();
    setAddingAirport(true);
    try {
      // First validate the airport exists
      const validateResponse = await fetch(
        `https://v2.stopbars.com/airports?icao=${newAirportIcao.toUpperCase()}`,
        {
          headers: { 'X-Vatsim-Token': token },
        }
      );

      if (!validateResponse.ok) {
        if (validateResponse.status === 404) {
          throw new Error('Airport not found');
        }
        throw new Error('Failed to validate airport');
      }

      // Then request to add it to the division
      const response = await fetch(`https://v2.stopbars.com/divisions/${divisionId}/airports`, {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ icao: newAirportIcao.toUpperCase() }),
      });

      if (!response.ok) throw new Error('Failed to request airport');

      const newAirport = await response.json();
      setAirports([...airports, newAirport]);
      const requestedIcao = newAirportIcao.toUpperCase();
      setNewAirportIcao('');
      setShowAddAirport(false);
      setToastConfig({
        variant: 'success',
        title: `${requestedIcao} Requested`,
        description: 'The airport request has been submitted.',
      });
      setShowToast(true);
    } catch (err) {
      setShowAddAirport(false);
      setNewAirportIcao('');
      setToastConfig({
        variant: 'destructive',
        title: 'Failed to Request Airport',
        description: err.message || 'An error occurred while requesting the airport.',
      });
      setShowToast(true);
    } finally {
      setAddingAirport(false);
    }
  };

  if (loading)
    return (
      <Layout>
        <div className="pt-40 pb-20 min-h-screen flex items-center justify-center">
          <Loader className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      </Layout>
    );

  return (
    <Layout>
      <div className="pt-40 pb-20">
        <div className="container mx-auto px-4 max-w-6xl">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">{division?.name}</h1>
            <p className="text-sm text-zinc-400 mt-1">Division Management</p>
          </div>

          <div className="space-y-6">
            {/* Members Section */}
            <Card className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-zinc-400" />
                  <h2 className="text-lg font-semibold text-white">Members</h2>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-400">
                    {members.length}
                  </span>
                </div>
                <Button onClick={() => setShowAddMember(true)} className="shrink-0">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Member
                </Button>
              </div>

              {/* Members Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {members.length === 0 ? (
                  <div className="col-span-full p-8 text-center border border-dashed border-zinc-700/50 rounded-xl bg-zinc-800/20">
                    <User className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-400 text-sm">No members found</p>
                  </div>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.id}
                      className="p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg hover:border-zinc-600/50 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-zinc-400" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium text-white truncate">
                              {member.display_name}
                            </h3>
                            {member.vatsim_id &&
                              String(member.display_name) !== String(member.vatsim_id) && (
                                <p className="text-xs text-zinc-500 font-mono">
                                  {member.vatsim_id}
                                </p>
                              )}
                          </div>
                        </div>
                        <button
                          onClick={() => confirmRemoveMember(member)}
                          className={`p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors ${
                            currentUserId === member.vatsim_id
                              ? 'opacity-50 cursor-not-allowed pointer-events-none'
                              : ''
                          }`}
                          disabled={currentUserId === member.vatsim_id}
                          title={
                            currentUserId === member.vatsim_id
                              ? 'You cannot remove yourself'
                              : 'Remove member'
                          }
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="mt-3 pt-3 border-t border-zinc-700/50">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            member.role === 'nav_head'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          {member.role
                            .split('_')
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(' ')}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Airports Section */}
            <Card className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <TowerControl className="w-5 h-5 text-zinc-400" />
                  <h2 className="text-lg font-semibold text-white">Airports</h2>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-400">
                    {airports.length}
                  </span>
                </div>
                <Button onClick={() => setShowAddAirport(true)} className="shrink-0">
                  <Plus className="w-4 h-4 mr-2" />
                  Request Airport
                </Button>
              </div>

              {/* Airports Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {airports.length === 0 ? (
                  <div className="col-span-full p-8 text-center border border-dashed border-zinc-700/50 rounded-xl bg-zinc-800/20">
                    <TowerControl className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-400 text-sm">No airports found</p>
                  </div>
                ) : (
                  airports
                    .sort((a, b) => a.icao.localeCompare(b.icao))
                    .map((airport) => (
                      <div
                        key={airport.id}
                        className="p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-lg hover:border-zinc-600/50 transition-all duration-200"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-medium text-white text-lg">{airport.icao}</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Requested by: {airport.requested_by}
                            </p>
                          </div>
                          {airport.status === 'approved' && (
                            <button
                              onClick={() =>
                                navigate(`/divisions/${divisionId}/airports/${airport.icao}`)
                              }
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                              title="Manage Airport"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="mt-3 pt-3 border-t border-zinc-700/50 flex items-center gap-2">
                          <div className="relative">
                            <div
                              className={`w-2 h-2 rounded-full ${getStatusColor(airport.status)}`}
                            ></div>
                            <div
                              className={`absolute inset-0 w-2 h-2 rounded-full ${getStatusColor(airport.status)} animate-pulse opacity-50`}
                              style={{ animationDuration: '3s' }}
                            ></div>
                          </div>
                          <span className="text-sm text-zinc-400">
                            {airport.status.charAt(0).toUpperCase() + airport.status.slice(1)}
                          </span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Add Member Dialog */}
      <Dialog
        open={showAddMember}
        onClose={() => {
          setShowAddMember(false);
          setNewMemberCid('');
          setNewMemberRole('nav_member');
        }}
        icon={Users}
        iconColor="blue"
        title="Add Member"
        closeOnBackdrop={!addingMember}
        closeOnEscape={!addingMember}
        isLoading={addingMember}
        maxWidth="md"
      >
        <form onSubmit={handleAddMember} className="space-y-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">VATSIM CID</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d*"
                value={newMemberCid}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setNewMemberCid(digits);
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const paste = (e.clipboardData || window.clipboardData).getData('text') || '';
                  const digits = paste.replace(/\D/g, '');
                  if (digits) setNewMemberCid((prev) => (prev + digits).replace(/\D/g, ''));
                }}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                placeholder="Enter CID"
                autoFocus
                required
                disabled={addingMember}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Role</label>
              <Dropdown
                options={[
                  { value: 'nav_member', label: 'Nav Member' },
                  { value: 'nav_head', label: 'Nav Head' },
                ]}
                value={newMemberRole}
                onChange={(value) => setNewMemberRole(value)}
                disabled={addingMember}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2 justify-end">
            <Button type="submit" disabled={addingMember || !newMemberCid}>
              {addingMember ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Member
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowAddMember(false);
                setNewMemberCid('');
                setNewMemberRole('nav_member');
              }}
              disabled={addingMember}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Request Airport Dialog */}
      <Dialog
        open={showAddAirport}
        onClose={() => {
          setShowAddAirport(false);
          setNewAirportIcao('');
        }}
        icon={TowerControl}
        iconColor="blue"
        title="Request Airport"
        closeOnBackdrop={!addingAirport}
        closeOnEscape={!addingAirport}
        isLoading={addingAirport}
        maxWidth="sm"
      >
        <form onSubmit={handleAddAirport} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Airport ICAO</label>
            <input
              type="text"
              value={newAirportIcao}
              onChange={(e) => setNewAirportIcao(e.target.value.toUpperCase())}
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all uppercase"
              maxLength={4}
              pattern="[A-Za-z]{4}"
              autoFocus
              required
              disabled={addingAirport}
            />
            <p className="mt-2 text-xs text-zinc-500">
              Enter the 4-letter ICAO code for the airport.
            </p>
          </div>
          <div className="flex gap-3 pt-2 justify-end">
            <Button type="submit" disabled={addingAirport || newAirportIcao.length !== 4}>
              {addingAirport ? (
                <>
                  <Loader className="w-4 h-4 mr-2 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Request Airport
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowAddAirport(false);
                setNewAirportIcao('');
              }}
              disabled={addingAirport}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog
        open={showRemoveConfirm && !!memberToRemove}
        onClose={cancelRemoveMember}
        icon={AlertOctagon}
        iconColor="red"
        title="Remove Member"
        description="This action cannot be undone. The user will immediately lose all access to the division and must be manually added at a later date if needed."
        closeOnBackdrop={!removingMember}
        closeOnEscape={!removingMember}
        isLoading={removingMember}
        maxWidth="md"
        buttons={[
          {
            label: 'Remove',
            variant: 'destructive',
            icon: UserX,
            loadingLabel: 'Removing...',
            requiresValidation: true,
            onClick: () => handleRemoveMember(memberToRemove?.vatsim_id),
          },
          {
            label: 'Cancel',
            variant: 'outline',
            onClick: cancelRemoveMember,
          },
        ]}
      />

      <Toast
        show={showToast}
        title={toastConfig.title}
        description={toastConfig.description}
        variant={toastConfig.variant}
        onClose={() => setShowToast(false)}
      />
    </Layout>
  );
};

export default DivisionManagement;
