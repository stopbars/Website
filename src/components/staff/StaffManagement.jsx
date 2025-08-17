import { useEffect, useState, useCallback } from 'react';
import { getVatsimToken } from '../../utils/cookieUtils';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { AlertTriangle, Loader, ShieldPlus, Trash2, UserPlus, Lock, ChevronDown, UserCheck } from 'lucide-react';

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
  const [refreshing, setRefreshing] = useState(false);
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
        headers: { 'X-Vatsim-Token': token }
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

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
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
          'X-Vatsim-Token': token
        },
        body: JSON.stringify({ vatsimId: form.vatsimId.trim(), role: form.role })
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
        headers: { 'X-Vatsim-Token': token }
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
    const currentOption = ROLE_OPTIONS.find(opt => opt.value === currentRole);
    
    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="flex items-center justify-between w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-750 text-sm"
        >
          <span className="transition-colors duration-200">{currentOption?.label || currentRole}</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
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
                className={`w-full px-3 py-2 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 text-sm ${
                  currentRole === option.value ? 'bg-zinc-700 text-blue-400' : 'text-white hover:text-zinc-100'
                }`}
                style={{
                  animationDelay: `${index * 25}ms`,
                  animationFillMode: 'both'
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
    <div className="container mx-auto px-4 pt-2 pb-4 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h1 className="text-2xl font-bold mb-4 md:mb-0">Staff Management</h1>
      </div>

      <div className="space-y-7">

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-sm text-emerald-400">
          {success}
        </div>
      )}

      {/* Add / Update Form */}
      <Card className="p-5">
        <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2"><UserPlus className="w-4 h-4" /> Add Staff</h3>
        <form onSubmit={handleSubmit} className="grid md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs uppercase tracking-wide text-zinc-400 mb-1">VATSIM CID</label>
            <input
              type="text"
              name="vatsimId"
              value={form.vatsimId}
              onChange={handleInputChange}
              placeholder="e.g., 1234567"
              className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-zinc-400 mb-1">Role</label>
            {renderRoleDropdown(form.role, (role) => setForm(f => ({ ...f, role })), showRoleDropdown, setShowRoleDropdown)}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting} className="flex-1 flex items-center justify-center gap-2 text-sm px-2 py-1.5">
              {submitting ? <Loader className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />} Save
            </Button>
            <Button type="button" variant="secondary" onClick={() => setForm({ vatsimId: '', role: 'PRODUCT_MANAGER' })} disabled={submitting} className="px-2 py-1.5 text-sm">
              Reset
            </Button>
          </div>
        </form>
      </Card>

      {/* Staff List */}
      <Card className="p-5">
        <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2"><UserCheck className="w-4 h-4" /> Current Staff</h3>
        {staff.length === 0 ? (
          <p className="text-sm text-zinc-500">No staff members found.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-700/50">
                  <th className="py-2 px-2 font-medium">VATSIM CID</th>
                  <th className="py-2 px-2 font-medium">Name</th>
                  <th className="py-2 px-2 font-medium">Role</th>
                  <th className="py-2 px-2 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member, idx) => (
                  <tr key={member.vatsim_id || member.vatsimId || member.user_id || idx} className="border-b border-zinc-800/50 hover:bg-zinc-800/40">
                    <td className="py-2 px-2 font-mono text-zinc-300">{member.vatsim_id || member.vatsimId || '—'}</td>
                    <td className="py-2 px-2">{member.name || member.full_name || '—'}</td>
                    <td className="py-2 px-2">
                      <span className="inline-flex items-center rounded bg-blue-500/10 text-blue-300 border border-blue-500/30 px-2 py-0.5 text-[11px] font-medium tracking-wide">
                        {member.role || member.staff_role || 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="py-2 px-2">
                      {(member.vatsim_id || member.vatsimId) && (
                        <button
                          onClick={() => handleDelete(member.vatsim_id || member.vatsimId)}
                          className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 transition"
                          title="Remove"
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
