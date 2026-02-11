import { useState } from 'react';
import PropTypes from 'prop-types';
import { getVatsimToken } from '../../utils/cookieUtils';
import { Toast } from '../shared/Toast';
import { Loader2, Trash2, Eraser, Bomb } from 'lucide-react';

const API_BASE = 'https://v2.stopbars.com';

// Known namespaces (from backend)
const KNOWN_NAMESPACES = [
  'airports',
  'points',
  'divisions',
  'auth',
  'state',
  'health',
  'installer',
  'github',
  'faq',
];

export default function CacheManagement() {
  const [key, setKey] = useState('');
  const [namespace, setNamespace] = useState('');
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    title: '',
    description: '',
    variant: 'default',
  });

  const token = getVatsimToken();

  const handlePurgeKey = async () => {
    if (!key || !namespace) {
      setToastConfig({
        title: 'Error',
        description: 'Please enter both a cache key and a namespace.',
        variant: 'destructive',
      });
      setShowToast(true);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/purge-cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vatsim-Token': token || '',
        },
        body: JSON.stringify({ key, namespace }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `${response.status} ${response.statusText}`);
      }
      setToastConfig({
        title: 'Success',
        description: `Purged key "${key}" in namespace "${namespace}".`,
        variant: 'success',
      });
      setShowToast(true);
      setKey('');
    } catch (e) {
      setToastConfig({
        title: 'Error',
        description: e.message || 'Failed to purge key',
        variant: 'destructive',
      });
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeNamespace = async () => {
    if (!namespace) {
      setToastConfig({
        title: 'Error',
        description: 'Please enter a namespace to purge.',
        variant: 'destructive',
      });
      setShowToast(true);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/purge-cache-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vatsim-Token': token || '',
        },
        body: JSON.stringify({ namespace }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `${response.status} ${response.statusText}`);
      }
      setToastConfig({
        title: 'Success',
        description: `Bumped namespace "${namespace}"`,
        variant: 'success',
      });
      setShowToast(true);
    } catch (e) {
      setToastConfig({
        title: 'Error',
        description: e.message || 'Failed to purge namespace',
        variant: 'destructive',
      });
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeAll = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/purge-cache-all`, {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token || '',
        },
        // No body -> purge all namespaces
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `${response.status} ${response.statusText}`);
      }
      setToastConfig({
        title: 'Success',
        description: 'Bumped all known namespaces',
        variant: 'success',
      });
      setShowToast(true);
    } catch (e) {
      setToastConfig({
        title: 'Error',
        description: e.message || 'Failed to purge all namespaces',
        variant: 'destructive',
      });
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  const Badge = ({ children, onClick }) => (
    <button
      onClick={onClick}
      className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 transition-all border border-zinc-700/50 hover:border-zinc-600"
      type="button"
    >
      {children}
    </button>
  );
  Badge.propTypes = {
    children: PropTypes.node,
    onClick: PropTypes.func,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Cache Management</h2>
          <p className="text-sm text-zinc-400 mt-1">Purge cache keys and namespaces</p>
        </div>
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

      {/* Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Purge Cache Key */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Trash2 className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">Purge Cache Key</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Delete a specific cache entry by key</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
                Key
              </label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g. /airports?icao=YSSY"
                className="w-full px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
                Namespace
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="e.g. airports"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                />
                <button
                  onClick={() => setNamespace('')}
                  className="px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-all text-sm"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {KNOWN_NAMESPACES.map((ns) => (
                  <Badge key={ns} onClick={() => setNamespace(ns)}>
                    {ns}
                  </Badge>
                ))}
              </div>
            </div>
            <button
              onClick={handlePurgeKey}
              disabled={loading || !key || !namespace}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Purge Key
            </button>
          </div>
        </div>

        {/* Purge Namespace */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Eraser className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">Purge Namespace</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Invalidate all entries in a namespace</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-400 mb-2">
                Namespace
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="e.g. points"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                />
                <button
                  onClick={handlePurgeNamespace}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eraser className="w-4 h-4" />
                  )}
                  Purge
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {KNOWN_NAMESPACES.map((ns) => (
                  <Badge key={ns} onClick={() => setNamespace(ns)}>
                    {ns}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Purge ALL */}
      <div className="bg-zinc-900/50 border border-red-500/20 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <Bomb className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h3 className="font-medium text-white">Purge ALL Namespaces</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Bump versions for all known namespaces. Use with care.
              </p>
            </div>
          </div>
          <button
            onClick={handlePurgeAll}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bomb className="w-4 h-4" />}
            Purge ALL
          </button>
        </div>
      </div>
    </div>
  );
}
