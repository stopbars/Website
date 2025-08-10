import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../layout/Layout';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { Plus, UserX, TowerControl, Users, MapPin, AlertOctagon, Loader } from 'lucide-react';
import { Alert } from '../shared/Alert';
import { getVatsimToken } from '../../utils/cookieUtils';

const DivisionManagement = () => {
  const { id: divisionId } = useParams();
  const navigate = useNavigate();
  const [division, setDivision] = useState(null);
  const [members, setMembers] = useState([]);
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
          headers: { 'X-Vatsim-Token': token }
        });
        if (accountResponse.ok) {
          const accountData = await accountResponse.json();
          setCurrentUserId(accountData.vatsim_id);
        }
        // Fetch division details
        const divisionResponse = await fetch(`https://v2.stopbars.com/divisions/${divisionId}`, {
          headers: { 'X-Vatsim-Token': token }
        });
        if (!divisionResponse.ok) throw new Error('Failed to fetch division');
        const divisionData = await divisionResponse.json();
        setDivision(divisionData);
        // Fetch members
        const membersResponse = await fetch(`https://v2.stopbars.com/divisions/${divisionId}/members`, {
          headers: { 'X-Vatsim-Token': token }
        });
        if (!membersResponse.ok) throw new Error('Failed to fetch members');
        const membersData = await membersResponse.json();
        setMembers(membersData);
        // Fetch airports
        const airportsResponse = await fetch(`https://v2.stopbars.com/divisions/${divisionId}/airports`, {
          headers: { 'X-Vatsim-Token': token }
        });
        if (!airportsResponse.ok) throw new Error('Failed to fetch airports');
        const airportsData = await airportsResponse.json();
        setAirports(airportsData);
      } catch (err) {
        setError(err.message);
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          vatsimId: newMemberCid,
          role: newMemberRole
        })
      });

      if (!response.ok) throw new Error('Failed to add member');

      const newMember = await response.json();
      setMembers([...members, newMember]);
      setNewMemberCid('');
      setShowAddMember(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    setRemovingMember(true);
    try {
      const response = await fetch(`https://v2.stopbars.com/divisions/${divisionId}/members/${memberId}`, {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': token }
      });

      if (!response.ok) throw new Error('Failed to remove member');

      setMembers(members.filter(m => m.vatsim_id !== memberId));
      setShowRemoveConfirm(false);
      setMemberToRemove(null);
    } catch (err) {
      setError(err.message);
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
      const validateResponse = await fetch(`https://v2.stopbars.com/airports?icao=${newAirportIcao.toUpperCase()}`, {
        headers: { 'X-Vatsim-Token': token }
      });

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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ icao: newAirportIcao.toUpperCase() })
      });

      if (!response.ok) throw new Error('Failed to request airport');

      const newAirport = await response.json();
      setAirports([...airports, newAirport]);
      setNewAirportIcao('');
      setShowAddAirport(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingAirport(false);
    }
  };

  if (loading) return (
    <Layout>
      <div className="pt-40 pb-20">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold text-white mb-8">Loading...</h1>
        </div>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="pt-40 pb-20">
        <div className="container mx-auto px-4">
          {error && (
            <Alert variant="destructive" className="mb-8" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white">{division?.name}</h1>
            <p className="text-zinc-400">Division Management</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Members Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Members
                </h2>
                <Button onClick={() => setShowAddMember(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Member
                </Button>
              </div>

              <Card>
                <div className="p-4">
                  {showAddMember && (
                    <form onSubmit={handleAddMember} className="mb-4 p-4 border border-zinc-800 rounded-lg">
                      <div className="mb-4">
                        <label className="block text-zinc-400 mb-2">VATSIM CID</label>
                        <input
                          type="text"
                          value={newMemberCid}
                          onChange={(e) => setNewMemberCid(e.target.value)}
                          className="w-full bg-zinc-900 text-white rounded-lg px-4 py-2 border border-zinc-800"
                          required
                        />
                      </div>
                      <div className="mb-4">
                        <label className="block text-zinc-400 mb-2">Role</label>
                        <select
                          value={newMemberRole}
                          onChange={(e) => setNewMemberRole(e.target.value)}
                          className="w-full bg-zinc-900 text-white rounded-lg px-4 py-2 border border-zinc-800"
                        >
                          <option value="nav_member">Nav Member</option>
                          <option value="nav_head">Nav Head</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          type="submit" 
                          disabled={addingMember}
                          className="active:scale-95 transition-transform duration-75"
                        >
                          {addingMember && <Loader className="w-4 h-4 animate-spin mr-2" />}
                          Add Member
                        </Button>
                        <Button type="button" onClick={() => setShowAddMember(false)} variant="secondary">
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-4">
                    {members.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-4 border border-zinc-800 rounded-lg">
                        <div>
                          <p className="text-white">{member.display_name}</p>
                          <p className="text-zinc-400 text-sm">Role: {member.role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>
                        </div>
                        <Button
                          onClick={() => confirmRemoveMember(member)}
                          className={`bg-red-600 hover:bg-red-700 hover:text-white active:scale-95 transition-transform duration-75${currentUserId === member.vatsim_id ? ' opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
                          disabled={currentUserId === member.vatsim_id}
                          title={currentUserId === member.vatsim_id ? 'You cannot remove yourself from the division.' : undefined}
                        >
                          <UserX className="w-4 h-4 mr-2" />
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            {/* Airports Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <TowerControl className="w-5 h-5" />
                  Airports
                </h2>
                <div className="flex gap-2">
                  <Button onClick={() => setShowAddAirport(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Request Airport
                  </Button>
                </div>
              </div>

              <Card>
                <div className="p-4">
                  {showAddAirport && (
                    <form onSubmit={handleAddAirport} className="mb-4 p-4 border border-zinc-800 rounded-lg">
                      <div className="mb-4">
                        <label className="block text-zinc-400 mb-2">Airport ICAO</label>
                        <input
                          type="text"
                          value={newAirportIcao}
                          onChange={(e) => setNewAirportIcao(e.target.value.toUpperCase())}
                          className="w-full bg-zinc-900 text-white rounded-lg px-4 py-2 border border-zinc-800"
                          maxLength={4}
                          pattern="[A-Za-z]{4}"
                          required
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          type="submit" 
                          disabled={addingAirport}
                          className="active:scale-95 transition-transform duration-75"
                        >
                          {addingAirport && <Loader className="w-4 h-4 animate-spin mr-2" />}
                          Request Airport
                        </Button>
                        <Button type="button" onClick={() => setShowAddAirport(false)} variant="secondary">
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-4">
                    {airports.map(airport => (
                      <div key={airport.id} className="p-4 border border-zinc-800 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white">{airport.icao}</p>
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
                            <p className="text-zinc-400 text-sm">
                              Requested by: {airport.requested_by}
                            </p>
                          </div>
                          <div className="flex space-x-2">
                            {airport.status === 'approved' && (
                              <Button
                                onClick={() => navigate(`/divisions/${divisionId}/airports/${airport.icao}`)}
                                variant="secondary"
                                className="text-emerald-500 hover:text-emerald-400"
                              >
                                <MapPin className="w-4 h-4 mr-2" />
                                Manage Points
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Remove Member Confirmation Modal */}
      {showRemoveConfirm && memberToRemove && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
            <div className="flex items-center space-x-3 mb-6">
              <AlertOctagon className="w-6 h-6 text-red-500" />
              <h3 className="text-xl font-bold text-red-500">Confirm Member Removal</h3>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-zinc-200 mb-3">
                  You are about to remove the following member:
                </p>
                <div className="flex items-start space-x-3">
                  <UserX className="w-4 h-4 mt-1 text-red-400" />
                  <div className="flex-1">
                    <span className="font-medium text-red-200 block">{memberToRemove.vatsim_id}</span>
                    <div className="text-sm text-red-200/80 space-y-1 mt-1">
                      <p>Role: {memberToRemove.role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</p>
                      <p>Division: {division?.name}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-zinc-300">
                This action cannot be undone. The user will immediately lose all access to the division and must be manually added at a later date if needed.
              </p>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={cancelRemoveMember}
                disabled={removingMember}
              >
                Cancel
              </Button>
              <Button
                className="!bg-red-500 hover:!bg-red-600 text-white active:scale-95 transition-transform duration-75"
                onClick={() => handleRemoveMember(memberToRemove.vatsim_id)}
                disabled={removingMember}
              >
                {removingMember ? (
                  <Loader className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <UserX className="w-4 h-4 mr-2" />
                )}
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default DivisionManagement;