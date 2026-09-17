import { useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { getVatsimToken } from '../../utils/cookieUtils';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { Dialog } from '../shared/Dialog';
import { Toast } from '../shared/Toast';
import { Dropdown } from '../shared/Dropdown';
import { PageLoading } from '../shared/PageLoading';
import { Loader, Trash2, UserPlus, UserCheck, Users, AlertOctagon } from 'lucide-react';

// Staff roles allowed by backend enum StaffRole
const ROLE_OPTIONS = [
  { value: 'LEAD_DEVELOPER', label: 'Lead Developer' },
  { value: 'PRODUCT_MANAGER', label: 'Product Manager' },
];

// Helper: ensure we only keep an array (ignore object from POST single response)
function ensureArray(raw) {
  return Array.isArray(raw) ? raw : [];
}

function StaffMemberForm({ onSubmit, onValidationError }) {
  const [form, setForm] = useState({ vatsimId: '', role: 'PRODUCT_MANAGER' });
  const [submitting, setSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const openConfirmation = (event) => {
    event.preventDefault();
    if (!form.vatsimId.trim()) {
      onValidationError('VATSIM CID is required');
      return;
    }
    setIsConfirmOpen(true);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const succeeded = await onSubmit({ vatsimId: form.vatsimId.trim(), role: form.role });
      setIsConfirmOpen(false);
      if (succeeded) setForm((current) => ({ vatsimId: '', role: current.role }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Card className="p-6 hover:border-zinc-600/50 transition-[background-color,border-color,color,box-shadow,filter,opacity,transform] duration-[var(--duration-quick)]">
        <h3 className="text-base font-medium text-white mb-4 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-zinc-400" />
          Add Staff Member
        </h3>
        <form onSubmit={openConfirmation} className="grid md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label
              htmlFor="staff-vatsim-id"
              className="block text-sm font-medium text-zinc-400 mb-2"
            >
              VATSIM CID
            </label>
            <input
              id="staff-vatsim-id"
              type="text"
              value={form.vatsimId}
              onChange={(event) =>
                setForm((current) => ({ ...current, vatsimId: event.target.value }))
              }
              placeholder="e.g., 1234567"
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-zinc-500 transition-[background-color,border-color,color,box-shadow,filter,opacity,transform]"
            />
          </div>
          <div>
            <div className="block text-sm font-medium text-zinc-400 mb-2">Role</div>
            <Dropdown
              options={ROLE_OPTIONS}
              value={form.role}
              onChange={(role) => setForm((current) => ({ ...current, role }))}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              Add
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setForm({ vatsimId: '', role: 'PRODUCT_MANAGER' })}
              disabled={submitting}
            >
              Reset
            </Button>
          </div>
        </form>
      </Card>

      <Dialog
        open={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        icon={UserPlus}
        iconColor="blue"
        title="Add Staff Member"
        description="Grant staff access and permissions to the specified VATSIM user."
        isLoading={submitting}
        closeOnBackdrop={!submitting}
        closeOnEscape={!submitting}
        buttons={[
          {
            label: submitting ? 'Adding...' : 'Add Staff Member',
            variant: 'primary',
            icon: submitting ? Loader : UserPlus,
            disabled: submitting,
            onClick: submit,
            className: submitting ? '[&>svg]:animate-spin' : '',
          },
          {
            label: 'Cancel',
            variant: 'outline',
            onClick: () => setIsConfirmOpen(false),
            disabled: submitting,
          },
        ]}
      >
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-4">
          <p className="text-zinc-200 mb-2">You are about to add:</p>
          <div className="space-y-1">
            <p className="text-blue-200 font-medium">{form.vatsimId}</p>
            <p className="text-blue-200">
              {ROLE_OPTIONS.find((role) => role.value === form.role)?.label || form.role}
            </p>
          </div>
        </div>
      </Dialog>
    </>
  );
}

StaffMemberForm.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  onValidationError: PropTypes.func.isRequired,
};

/**
 * StaffManagement Component
 * Features:
 * - List staff members (GET /staff/manage)
 * - Add/update staff member (POST /staff/manage { vatsimId, role })
 * - Remove staff member (DELETE /staff/manage/:vatsimId)
 * All endpoints require header: X-Vatsim-Token: <token>
 */
// oxlint-disable-next-line react-doctor/no-giant-component, react-doctor/prefer-useReducer -- The staff table and role dialog are a cohesive CRUD workflow with independent request, form, and modal state.
export default function StaffManagement() {
  const token = getVatsimToken();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [removingMember, setRemovingMember] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Toast states
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const apiBase = 'https://v2.stopbars.com';

  const fetchStaff = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/staff/manage`, {
        headers: { 'X-Vatsim-Token': token },
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error('Forbidden: Lead Developer access required');
        if (res.status === 401) throw new Error('Unauthorized: Please re-login');
        throw new Error('Failed to load staff list');
      }
      const data = await res.json();
      setStaff(ensureArray(data.staff));
    } catch (e) {
      setErrorMessage(e.message || 'Error fetching staff');
      setShowErrorToast(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleSubmit = async (form) => {
    try {
      const res = await fetch(`${apiBase}/staff/manage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vatsim-Token': token,
        },
        body: JSON.stringify({ vatsimId: form.vatsimId.trim(), role: form.role }),
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error('Forbidden: Lead Developer access required');
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add/update staff');
      }
      await res.json().catch(() => ({}));
      setSuccessMessage('Staff member added successfully');
      setShowSuccessToast(true);
      await fetchStaff();
      return true;
    } catch (e) {
      setErrorMessage(e.message || 'Failed to save staff');
      setShowErrorToast(true);
      return false;
    }
  };

  const handleValidationError = (message) => {
    setErrorMessage(message);
    setShowErrorToast(true);
  };

  const handleDelete = async () => {
    if (!removingMember) return;
    setIsRemoving(true);
    const vatsimId = removingMember.vatsim_id || removingMember.vatsimId;
    try {
      const res = await fetch(`${apiBase}/staff/manage/${vatsimId}`, {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': token },
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error('Forbidden');
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to remove staff');
      }
      const data = await res.json();
      if (data.success) {
        setSuccessMessage('Staff member removed successfully');
        setShowSuccessToast(true);
        setRemovingMember(null);
        fetchStaff();
      } else {
        throw new Error('Remove unsuccessful');
      }
    } catch (e) {
      setErrorMessage(e.message || 'Failed to remove staff');
      setShowErrorToast(true);
      setRemovingMember(null);
    } finally {
      setIsRemoving(false);
    }
  };

  const cancelRemove = () => {
    setRemovingMember(null);
  };

  if (loading) {
    return <PageLoading label="Loading staff members…" variant="tool-list" />;
  }

  return (
    <>
      {/* Toast Notifications - rendered outside main container to prevent layout shifts */}
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

      <div className="staff-tool space-y-6">
        {/* Header */}
        <div className="staff-tool-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Staff Management</h2>
            <p className="text-sm text-zinc-400 mt-1">Manage staff roles and permissions</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
              <Users className="w-4 h-4 mr-2 text-zinc-400" />
              {staff.length} staff member{staff.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="space-y-6">
          {/* Draft fields and confirmation state are local to avoid rerendering the staff table. */}
          <StaffMemberForm onSubmit={handleSubmit} onValidationError={handleValidationError} />

          {/* Staff List */}
          <Card className="p-6 hover:border-zinc-600/50 transition-[background-color,border-color,color,box-shadow,filter,opacity,transform] duration-[var(--duration-quick)]">
            <h3 className="text-base font-medium text-white mb-4 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-zinc-400" />
              Current Staff
            </h3>
            {staff.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                <UserCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No staff members found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-medium text-zinc-400 uppercase tracking-wider border-b border-zinc-800">
                      <th className="py-3 px-4">VATSIM CID</th>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4 w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {staff.map((member) => (
                      <tr
                        key={
                          member.vatsim_id ||
                          member.vatsimId ||
                          member.user_id ||
                          member.email ||
                          member.name
                        }
                        className="hover:bg-zinc-800/50 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-zinc-300">
                          {member.vatsim_id || member.vatsimId || '—'}
                        </td>
                        <td className="py-3 px-4 text-white">
                          {member.name || member.full_name || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center rounded-full bg-zinc-700/60 text-zinc-300 px-3 py-1 text-xs font-medium">
                            {member.role || member.staff_role || 'UNKNOWN'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {(member.vatsim_id || member.vatsimId) && (
                            <button
                              type="button"
                              onClick={() => setRemovingMember(member)}
                              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 transition-[background-color,border-color,color,box-shadow,filter,opacity,transform]"
                              title="Remove staff member"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Remove Staff Dialog */}
        <Dialog
          open={!!removingMember}
          onClose={cancelRemove}
          icon={AlertOctagon}
          iconColor="red"
          title="Remove Staff Member"
          description="Revoke staff access and permissions from the specified user."
          isLoading={isRemoving}
          closeOnBackdrop={!isRemoving}
          closeOnEscape={!isRemoving}
          buttons={[
            {
              label: isRemoving ? 'Removing...' : 'Remove Staff Member',
              variant: 'destructive',
              icon: isRemoving ? Loader : Trash2,
              disabled: isRemoving,
              onClick: handleDelete,
              className: isRemoving ? '[&>svg]:animate-spin' : '',
            },
            {
              label: 'Cancel',
              variant: 'outline',
              onClick: cancelRemove,
              disabled: isRemoving,
            },
          ]}
        >
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
            <p className="text-zinc-200 mb-2">You are about to remove:</p>
            <div className="space-y-1">
              <p className="text-red-200 font-medium">
                {removingMember?.name || removingMember?.full_name || '—'}
              </p>
              <p className="text-red-200">
                {removingMember?.role || removingMember?.staff_role || '—'}
              </p>
            </div>
          </div>
        </Dialog>
      </div>
    </>
  );
}
