import { useEffect, useMemo, useState } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { getVatsimToken } from '../../utils/cookieUtils';
import { formatLocalDateTime } from '../../utils/dateUtils';
import { AlertTriangle, Ban as BanIcon, Check, Loader, Lock, Trash2, UserX, FileText, X } from 'lucide-react';

const API_BASE = 'https://v2.stopbars.com';

export default function BansManagement() {
  const token = getVatsimToken();
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [viewingReason, setViewingReason] = useState(null); // { targetId, reason }

  // New ban form
  const [vatsimId, setVatsimId] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAtLocal, setExpiresAtLocal] = useState(''); // datetime-local string

  const headers = useMemo(() => ({
    'X-Vatsim-Token': token || '',
  }), [token]);

  const fetchBans = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/bans`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
      setBans(Array.isArray(data?.bans) ? data.bans : []);
    } catch (e) {
      setError(e.message || 'Failed to load bans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setError('Authentication required.');
      return;
    }
    fetchBans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-dismiss success after ~4 seconds
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  const handleCreateBan = async () => {
    setError(null);
    setSuccess(null);
    if (!vatsimId.trim()) {
      setError('VATSIM CID is required');
      return;
    }
    const body = {
      vatsimId: vatsimId.trim(),
      reason: reason.trim() || null,
      expiresAt: expiresAtLocal ? new Date(expiresAtLocal).toISOString() : null,
    };
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/bans`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
      setSuccess('Ban created/updated successfully');
      setVatsimId('');
      setReason('');
      setExpiresAtLocal('');
      await fetchBans();
    } catch (e) {
      setError(e.message || 'Failed to create ban');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBan = async (targetId) => {
    if (!targetId) return;
    const confirmed = window.confirm(`Remove ban for ${targetId}?`);
    if (!confirmed) return;
    setError(null);
    setSuccess(null);
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/bans/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `${res.status} ${res.statusText}`);
      }
      setSuccess('Ban removed');
      await fetchBans();
    } catch (e) {
      setError(e.message || 'Failed to remove ban');
    } finally {
      setLoading(false);
    }
  };

  // No explicit refresh button; list updates after actions

  const renderBanRow = (b, i) => {
    // Try to map common fields gracefully
    const targetId = b.vatsimId || b.vatsim_id || b.userId || b.targetId || b.id || 'Unknown';
    const createdAt = b.createdAt || b.created_at || b.created || null;
    const createdBy = b.createdBy || b.issued_by || b.staffId || b.by || null;
    const expiresAt = b.expiresAt || b.expires_at || null;
    const isActive = typeof b.active === 'boolean' ? b.active : (expiresAt ? new Date(expiresAt) > new Date() : true);
    const reasonText = b.reason || '';
    return (
      <tr key={`${targetId}-${i}`} className="border-b border-zinc-800 hover:bg-zinc-800/40">
        <td className="px-2 py-2 text-[15px] font-mono text-zinc-300">{targetId}</td>
        <td className="px-2 py-2 text-[15px] text-zinc-400">{createdBy || <span className="text-zinc-600">—</span>}</td>
        <td className="px-2 py-2 text-[15px]">{createdAt ? formatLocalDateTime(createdAt, true) : <span className="text-zinc-600">—</span>}</td>
        <td className="px-2 py-2 text-[15px]">{expiresAt ? formatLocalDateTime(expiresAt, true) : <span className="text-zinc-600">No expiry</span>}</td>
        <td className="px-2 py-2 text-[15px]">
          <span className={`px-2 py-0.5 rounded text-xs ${isActive ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewingReason({ targetId: String(targetId), reason: reasonText })}
              className="p-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:text-blue-200 transition"
              title="Ban Reason"
            >
              <FileText className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => handleRemoveBan(String(targetId))}
              className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 transition"
              title="Remove"
            >
              <Trash2 className="w-[18px] h-[18px]" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="container mx-auto px-4 pt-2 pb-4 max-w-4xl">
      {/* Header to match StaffManagement */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h1 className="text-2xl font-bold mb-4 md:mb-0">Bans Management</h1>
      </div>

      <div className="space-y-7">

      {(error || success) && (
        <div className={`p-3 rounded border text-sm flex items-center gap-2 ${error ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
          {error ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          <span>{error || success}</span>
        </div>
      )}

      <Card className="p-5">
        <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2"><BanIcon className="w-4 h-4" /> Create / Update Ban</h3>
        <div className="grid md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs uppercase tracking-wide text-zinc-400 mb-1">VATSIM CID</label>
            <input
              type="text"
              value={vatsimId}
              onChange={(e) => setVatsimId(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="e.g., 1234567"
              className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              inputMode="numeric"
            />
          </div>
          <div className="md:col-span-6">
            <label className="block text-xs text-zinc-400 mb-1">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-zinc-400 mb-1">Expires At</label>
            <input
              type="datetime-local"
              value={expiresAtLocal}
              onChange={(e) => setExpiresAtLocal(e.target.value)}
              className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <Button onClick={handleCreateBan} disabled={loading || !vatsimId} className="flex items-center justify-center gap-2 text-sm px-2 py-1.5">
            {loading ? <Loader className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />} Save
          </Button>
          <Button type="button" variant="secondary" onClick={() => { setVatsimId(''); setReason(''); setExpiresAtLocal(''); }} disabled={loading} className="px-2 py-1.5 text-sm">
            Reset
          </Button>
        </div>
      </Card>

      <Card className="p-5">
  <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2"><UserX className="w-4 h-4" /> Existing Bans</h3>
        <div className="overflow-x-auto -mx-2">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-400 border-b border-zinc-700/50">
                <th className="py-2 px-2 font-medium">VATSIM CID</th>
                <th className="py-2 px-2 font-medium">Moderator</th>
                <th className="py-2 px-2 font-medium">Created</th>
                <th className="py-2 px-2 font-medium">Expires</th>
                <th className="py-2 px-2 font-medium">Status</th>
                <th className="py-2 px-2 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-3 py-6 text-center text-zinc-400">
                    <Loader className="w-5 h-5 animate-spin inline-block mr-2 mt-3" />
                  </td>
                </tr>
              ) : bans.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-3 py-6 text-center text-zinc-500">No bans found.</td>
                </tr>
              ) : (
                bans.map(renderBanRow)
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {viewingReason && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <FileText className="w-6 h-6 text-blue-400" />
                <h3 className="text-xl font-semibold">Ban Reason</h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setViewingReason(null)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-zinc-800/50 rounded p-4 text-zinc-200">
              {viewingReason?.reason?.trim() ? viewingReason.reason : 'No reason provided'}
            </div>
          </div>
        </div>
      )}
  </div>
  </div>
  );
}
