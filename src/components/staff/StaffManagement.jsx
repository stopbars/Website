import { useEffect, useState, useCallback } from 'react';
import { getVatsimToken } from '../../utils/cookieUtils';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import {
  AlertTriangle,
  Loader,
  Trash2,
  UserPlus,
  Lock,
  ChevronDown,
  UserCheck,
} from 'lucide-react';

// Staff roles allowed by backend enum StaffRole
const ROLE_OPTIONS = [
  { value: 'LEAD_DEVELOPER', label: 'Lead Developer' },
  { value: 'PRODUCT_MANAGER', label: 'Product Manager' },
];

// Helper: ensure we only keep an array (ignore object from POST single response)
function ensureArray(raw) {
  return Array.isArray(raw) ? raw : [];
}

/**
 * StaffManagement Component
 * Features:
 * - List staff members (GET /staff/manage)
 * - Add/update staff member (POST /staff/manage { vatsimId, role })
 * - Remove staff member (DELETE /staff/manage/:vatsimId)
 * All endpoints require header: X-Vatsim-Token: <token>
 */
export default function StaffManagement() {
  const token = getVatsimToken();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({ vatsimId: '', role: 'PRODUCT_MANAGER' });
  const [submitting, setSubmitting] = useState(false);
  const [, setRefreshing] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const apiBase = 'https://v2.stopbars.com';

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const fetchStaff = useCallback(async () => {
    if (!token) return;
    try {
      setRefreshing(true);
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
      setError(e.message || 'Error fetching staff');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vatsimId.trim()) {
      setError('VATSIM CID is required');
      return;
    }
    setSubmitting(true);
    clearMessages();
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
      // We ignore the single-object response and just re-fetch canonical list
      await res.json().catch(() => ({}));
      setSuccess('Staff member saved successfully');
      setForm({ vatsimId: '', role: form.role });
      await fetchStaff();
    } catch (e) {
      setError(e.message || 'Failed to save staff');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (vatsimId) => {
    if (!window.confirm(`Remove staff member ${vatsimId}?`)) return;
    clearMessages();
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
        setSuccess('Staff member removed');
        fetchStaff();
      } else {
        setError('Remove unsuccessful');
      }
    } catch (e) {
      setError(e.message || 'Failed to remove staff');
    }
  };

  // Render custom role dropdown
  const renderRoleDropdown = (currentRole, setRole, isOpen, setIsOpen) => {
    const currentOption = ROLE_OPTIONS.find((opt) => opt.value === currentRole);

    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="flex items-center justify-between w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white transition-all duration-200 hover:border-zinc-600"
        >
          <span className="transition-colors duration-200">
            {currentOption?.label || currentRole}
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
            {ROLE_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRole(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 ${
                  currentRole === option.value
                    ? 'bg-zinc-700 text-blue-400'
                    : 'text-white hover:text-zinc-100'
                }`}
                style={{
                  animationDelay: `${index * 25}ms`,
                  animationFillMode: 'both',
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-bold text-white">Staff Management</h2>
          <p className="text-zinc-400 text-sm mt-1">Manage staff roles and permissions</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-sm font-medium">
            {staff.length} Staff Member{staff.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="space-y-6">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-400">
            <UserCheck className="w-5 h-5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Add / Update Form */}
        <Card className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-400" /> Add Staff Member
          </h3>
          <form onSubmit={handleSubmit} className="grid md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-400 mb-2">VATSIM CID</label>
              <input
                type="text"
                name="vatsimId"
                value={form.vatsimId}
                onChange={handleInputChange}
                placeholder="e.g., 1234567"
                className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-zinc-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Role</label>
              {renderRoleDropdown(
                form.role,
                (role) => setForm((f) => ({ ...f, role })),
                showRoleDropdown,
                setShowRoleDropdown
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                Save
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

        {/* Staff List */}
        <Card className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" /> Current Staff
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
                  {staff.map((member, idx) => (
                    <tr
                      key={member.vatsim_id || member.vatsimId || member.user_id || idx}
                      className="hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-zinc-300">
                        {member.vatsim_id || member.vatsimId || '—'}
                      </td>
                      <td className="py-3 px-4 text-white">
                        {member.name || member.full_name || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center rounded-full bg-blue-500/20 text-blue-400 px-3 py-1 text-xs font-medium">
                          {member.role || member.staff_role || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {(member.vatsim_id || member.vatsimId) && (
                          <button
                            onClick={() => handleDelete(member.vatsim_id || member.vatsimId)}
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 transition-all"
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
    </div>
  );
}
