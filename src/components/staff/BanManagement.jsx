import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getVatsimToken } from '../../utils/cookieUtils';
import { formatLocalDateTime } from '../../utils/dateUtils';
import { Dialog } from '../shared/Dialog';
import { Toast } from '../shared/Toast';
import { AlertOctagon, Ban as BanIcon, Loader, Trash2, UserX, FileText } from 'lucide-react';

const API_BASE = 'https://v2.stopbars.com';

export default function BanManagement() {
  const token = getVatsimToken();
  const [searchParams, setSearchParams] = useSearchParams();
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewingReason, setViewingReason] = useState(null); // { targetId, reason }
  const [removingBan, setRemovingBan] = useState(null); // targetId to remove
  const [isRemovingBan, setIsRemovingBan] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    title: '',
    description: '',
    variant: 'default',
  });

  // New ban form
  const [vatsimId, setVatsimId] = useState('');
  const [reason, setReason] = useState('');
  const [expiresAtLocal, setExpiresAtLocal] = useState(''); // datetime-local string

  useEffect(() => {
    const urlVatsimId = searchParams.get('vatsimId');
    if (urlVatsimId) {
      setVatsimId(urlVatsimId);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          params.delete('vatsimId');
          return params;
        },
        { replace: true }
      );
    }
  }, [searchParams, setSearchParams]);

  const headers = useMemo(
    () => ({
      'X-Vatsim-Token': token || '',
    }),
    [token]
  );

  const fetchBans = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/bans`, { headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
      setBans(Array.isArray(data?.bans) ? data.bans : []);
    } catch (e) {
      console.error(e.message || 'Failed to load bans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    fetchBans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleCreateBan = async () => {
    if (!vatsimId.trim()) {
      setToastConfig({ title: 'Error', description: 'VATSIM CID is required', variant: 'destructive' });
      setShowToast(true);
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
      setToastConfig({
        title: 'Success',
        description: 'Ban created/updated successfully',
        variant: 'success',
      });
      setShowToast(true);
      setVatsimId('');
      setReason('');
      setExpiresAtLocal('');
      await fetchBans();
    } catch (e) {
      setToastConfig({
        title: 'Error',
        description: e.message || 'Failed to create ban',
        variant: 'destructive',
      });
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBan = async () => {
    if (!removingBan) return;
    try {
      setIsRemovingBan(true);
      const res = await fetch(`${API_BASE}/bans/${encodeURIComponent(removingBan)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `${res.status} ${res.statusText}`);
      }
      setToastConfig({ title: 'Success', description: 'Ban removed', variant: 'success' });
      setShowToast(true);
      setRemovingBan(null);
      await fetchBans();
    } catch (e) {
      setToastConfig({
        title: 'Error',
        description: e.message || 'Failed to remove ban',
        variant: 'destructive',
      });
      setShowToast(true);
    } finally {
      setIsRemovingBan(false);
    }
  };

  // No explicit refresh button; list updates after actions

  const renderBanRow = (b, i) => {
    // Try to map common fields gracefully
    const targetId = b.vatsimId || b.vatsim_id || b.userId || b.targetId || b.id || 'Unknown';
    const createdAt = b.createdAt || b.created_at || b.created || null;
    const createdBy = b.createdBy || b.issued_by || b.staffId || b.by || null;
    const expiresAt = b.expiresAt || b.expires_at || null;
    const isActive =
      typeof b.active === 'boolean'
        ? b.active
        : expiresAt
          ? new Date(expiresAt) > new Date()
          : true;
    const reasonText = b.reason || '';
    return (
      <tr key={`${targetId}-${i}`} className="hover:bg-zinc-800/30 transition-colors">
        <td className="px-4 py-3 font-mono text-zinc-300">{targetId}</td>
        <td className="px-4 py-3 text-zinc-400">
          {createdBy || <span className="text-zinc-600">—</span>}
        </td>
        <td className="px-4 py-3 text-zinc-400">
          {createdAt ? (
            formatLocalDateTime(createdAt, true)
          ) : (
            <span className="text-zinc-600">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-zinc-400">
          {expiresAt ? (
            formatLocalDateTime(expiresAt, true)
          ) : (
            <span className="text-zinc-500">Permanent</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
              isActive
                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}
          >
            {isActive ? 'Active' : 'Expired'}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setViewingReason({ targetId: String(targetId), reason: reasonText })}
              className="p-2 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
              title="View Reason"
            >
              <FileText className="w-4 h-4" />
            </button>
            <button
              onClick={() => setRemovingBan(String(targetId))}
              className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Remove Ban"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Ban Management</h2>
          <p className="text-sm text-zinc-400 mt-1">List, create, and manage user bans</p>
        </div>
        {bans.length > 0 && (
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
            <UserX className="w-4 h-4 mr-2 text-zinc-400" />
            {bans.length} active bans
          </span>
        )}
      </div>

      {/* Toast Notifications */}
      <Toast
        title={toastConfig.title}
        description={toastConfig.description}
        variant={toastConfig.variant}
        show={showToast}
        onClose={() => setShowToast(false)}
        duration={5000}
      />

      {/* Create / Update Ban */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <BanIcon className="w-4 h-4 text-red-400" />
          </div>
          <h3 className="font-medium text-white">Create / Update Ban</h3>
        </div>
        <div className="grid md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
              VATSIM CID
            </label>
            <input
              type="text"
              value={vatsimId}
              onChange={(e) => setVatsimId(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="e.g., 1234567"
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
              inputMode="numeric"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
              Reason
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ban reason (optional)"
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
              Expires At
            </label>
            <input
              type="datetime-local"
              value={expiresAtLocal}
              onChange={(e) => setExpiresAtLocal(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button
              onClick={handleCreateBan}
              disabled={loading || !vatsimId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm whitespace-nowrap"
            >
              Ban
            </button>
            <button
              type="button"
              onClick={() => {
                setVatsimId('');
                setReason('');
                setExpiresAtLocal('');
              }}
              disabled={loading}
              className="px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50 transition-all text-sm whitespace-nowrap"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Existing Bans */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700">
            <UserX className="w-4 h-4 text-zinc-400" />
          </div>
          <h3 className="font-medium text-white">Existing Bans</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500 border-b border-zinc-800">
                <th className="py-3 px-4">VATSIM CID</th>
                <th className="py-3 px-4">Moderator</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4">Expires</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center text-zinc-400">
                    <Loader className="w-5 h-5 animate-spin inline-block" />
                  </td>
                </tr>
              ) : bans.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-12 text-center text-zinc-500">
                    No bans found
                  </td>
                </tr>
              ) : (
                bans.map(renderBanRow)
              )}
            </tbody>
          </table>
        </div>
      </div>
      <Dialog
        open={!!viewingReason}
        onClose={() => setViewingReason(null)}
        icon={FileText}
        iconColor="blue"
        title="Ban Reason"
        maxWidth="md"
      >
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4">
          <p className="text-sm text-zinc-300 leading-relaxed">
            {viewingReason?.reason?.trim() ? viewingReason.reason : 'No reason provided'}
          </p>
        </div>
      </Dialog>

      <Dialog
        open={!!removingBan}
        onClose={() => setRemovingBan(null)}
        icon={AlertOctagon}
        iconColor="red"
        title="Remove Ban"
        description={`This action will remove the ban and allow ${removingBan} to access and use all BARS services again.`}
        isLoading={isRemovingBan}
        closeOnBackdrop={!isRemovingBan}
        closeOnEscape={!isRemovingBan}
        buttons={[
          {
            label: 'Remove Ban',
            variant: 'destructive',
            icon: Trash2,
            loadingLabel: 'Removing...',
            onClick: handleRemoveBan,
            disabled: isRemovingBan,
          },
          {
            label: 'Cancel',
            variant: 'outline',
            onClick: () => setRemovingBan(null),
          },
        ]}
      ></Dialog>
    </div>
  );
}
