import { useEffect, useMemo, useState } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { getVatsimToken } from '../../utils/cookieUtils';
import { formatLocalDateTime } from '../../utils/dateUtils';
import { AlertTriangle, Ban as BanIcon, Check, Loader, PlusCircle, RefreshCw, Trash2, UserX } from 'lucide-react';

const API_BASE = 'https://v2.stopbars.com';

export default function BansManagement() {
  const token = getVatsimToken();
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await fetchBans();
    setTimeout(() => setRefreshing(false), 300);
  };

  const renderBanRow = (b, i) => {
    // Try to map common fields gracefully
    const targetId = b.vatsimId || b.vatsim_id || b.userId || b.targetId || b.id || 'Unknown';
    const createdAt = b.createdAt || b.created_at || b.created || null;
    const createdBy = b.createdBy || b.issued_by || b.staffId || b.by || null;
    const expiresAt = b.expiresAt || b.expires_at || null;
    const isActive = typeof b.active === 'boolean' ? b.active : (expiresAt ? new Date(expiresAt) > new Date() : true);
    const reasonText = b.reason || '';
    return (
      <tr key={`${targetId}-${i}`} className="border-b border-zinc-800">
        <td className="px-3 py-2 text-sm font-mono">{targetId}</td>
        <td className="px-3 py-2 text-sm text-zinc-300">{reasonText || <span className="text-zinc-500">—</span>}</td>
        <td className="px-3 py-2 text-sm text-zinc-400">{createdBy || <span className="text-zinc-600">—</span>}</td>
        <td className="px-3 py-2 text-sm">{createdAt ? formatLocalDateTime(createdAt, true) : <span className="text-zinc-600">—</span>}</td>
        <td className="px-3 py-2 text-sm">{expiresAt ? formatLocalDateTime(expiresAt, true) : <span className="text-zinc-600">No expiry</span>}</td>
        <td className="px-3 py-2 text-sm">
          <span className={`px-2 py-0.5 rounded text-xs ${isActive ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'}`}>
            {isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td className="px-3 py-2 text-right">
          <Button
            onClick={() => handleRemoveBan(String(targetId))}
            variant="outline"
            className="inline-flex items-center gap-2 text-red-500 border-red-500/20 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4" /> Remove
          </Button>
        </td>
      </tr>
    );
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h2 className="text-2xl font-bold inline-flex items-center gap-2"><BanIcon className="w-6 h-6" /> Bans Management</h2>
          <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs font-medium">{bans.length} bans</span>
        </div>
        <Button onClick={handleRefresh} variant="outline" className="inline-flex items-center gap-2" disabled={refreshing || loading}>
          {refreshing ? <Loader className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
        </Button>
      </div>
      <p className="text-zinc-400 -mt-3">Lead Developer only. Create, list, and remove user bans.</p>

      {(error || success) && (
        <div className={`p-4 rounded-lg border flex items-center space-x-3 ${error ? 'bg-red-500/10 border-red-500/20' : 'bg-emerald-500/10 border-emerald-500/20'}`}>
          {error ? (
            <AlertTriangle className="w-5 h-5 text-red-500" />
          ) : (
            <Check className="w-5 h-5 text-emerald-500" />
          )}
          <p className={error ? 'text-red-500' : 'text-emerald-500'}>{error || success}</p>
        </div>
      )}

      <Card className="p-4 space-y-4">
        <h3 className="font-medium">Create / Update Ban</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">VATSIM CID</label>
            <input
              type="text"
              value={vatsimId}
              onChange={(e) => setVatsimId(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 1234567"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              inputMode="numeric"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for the ban"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Expires At (optional)</label>
            <input
              type="datetime-local"
              value={expiresAtLocal}
              onChange={(e) => setExpiresAtLocal(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <Button onClick={handleCreateBan} disabled={loading || !vatsimId} className="inline-flex items-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
            Save Ban
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-2">
          <UserX className="w-4 h-4 text-zinc-300" />
          <h3 className="font-medium">Existing Bans</h3>
          <span className="text-xs text-zinc-500">({bans.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="text-xs uppercase tracking-wide text-zinc-400 bg-zinc-900/50 border-b border-zinc-800">
              <tr>
                <th className="px-3 py-2">VATSIM CID</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">By</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Expires</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-3 py-6 text-center text-zinc-400">
                    <Loader className="w-5 h-5 animate-spin inline-block mr-2" /> Loading bans…
                  </td>
                </tr>
              ) : bans.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-3 py-6 text-center text-zinc-500">No bans found.</td>
                </tr>
              ) : (
                bans.map(renderBanRow)
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
