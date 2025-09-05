import { useState } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { getVatsimToken } from '../../utils/cookieUtils';
import { AlertTriangle, CheckCircle2, Loader2, Trash2, Eraser, Sparkles } from 'lucide-react';

const API_BASE = 'https://v2.stopbars.com';

// Known namespaces (from backend)
const KNOWN_NAMESPACES = ['airports', 'points', 'divisions', 'auth', 'state', 'health', 'installer', 'github', 'faq'];

export default function CacheManagement() {
  const [key, setKey] = useState('');
  const [namespace, setNamespace] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { type: 'success'|'error', message: string, details?: any }

  const token = getVatsimToken();

  const handlePurgeKey = async () => {
    if (!key || !namespace) {
      setResult({ type: 'error', message: 'Please enter both a cache key and a namespace.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(`${API_BASE}/purge-cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vatsim-Token': token || ''
        },
        body: JSON.stringify({ key, namespace })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `${response.status} ${response.statusText}`);
      }
      setResult({ type: 'success', message: `Purged key "${key}" in namespace "${namespace}".`, details: data });
      setKey('');
    } catch (e) {
      setResult({ type: 'error', message: e.message || 'Failed to purge key' });
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeNamespace = async () => {
    if (!namespace) {
      setResult({ type: 'error', message: 'Please enter a namespace to purge.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(`${API_BASE}/purge-cache-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Vatsim-Token': token || ''
        },
        body: JSON.stringify({ namespace })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `${response.status} ${response.statusText}`);
      }
      setResult({ type: 'success', message: `Bumped namespace "${namespace}"`, details: data });
    } catch (e) {
      setResult({ type: 'error', message: e.message || 'Failed to purge namespace' });
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeAll = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(`${API_BASE}/purge-cache-all`, {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token || ''
        }
        // No body -> purge all namespaces
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `${response.status} ${response.statusText}`);
      }
      setResult({ type: 'success', message: 'Bumped all known namespaces', details: data });
    } catch (e) {
      setResult({ type: 'error', message: e.message || 'Failed to purge all namespaces' });
    } finally {
      setLoading(false);
    }
  };

  const Badge = ({ children, onClick }) => (
    <button
      onClick={onClick}
      className="text-xs px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition border border-zinc-700"
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
      <div>
        <h2 className="text-xl font-semibold mb-1">Cache Management</h2>
        <p className="text-zinc-400">Lead developer tools for cache management.</p>
      </div>

      {result && (
        <div
          className={`p-3 rounded-lg border flex items-start space-x-3 ${
            result.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'
          }`}
        >
          {result.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
          )}
          <div className="flex-1">
            <p className={result.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
              {result.message}
            </p>
            {result.details && (
              <pre className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap break-all max-h-40 overflow-auto bg-black/20 p-2 rounded">
                {JSON.stringify(result.details, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4 space-y-4">
          <div>
            <h3 className="font-medium">Purge Cache Key</h3>
            <p className="text-sm text-zinc-400">Delete a specific cache entry by key within a required namespace.</p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Key</label>
              <input
                type="text"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g. /airports?icao=YSSY"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Namespace</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="e.g. airports"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <Button onClick={() => setNamespace('')} variant="secondary">
                  Clear
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {KNOWN_NAMESPACES.map((ns) => (
                  <Badge key={ns} onClick={() => setNamespace(ns)}>{ns}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Button onClick={handlePurgeKey} disabled={loading || !key || !namespace}>
                {loading ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Purging…</span>
                ) : (
                  <span className="inline-flex items-center gap-2"><Trash2 className="w-4 h-4" /> Purge Key</span>
                )}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-4 space-y-4">
          <div>
            <h3 className="font-medium">Purge Namespace</h3>
            <p className="text-sm text-zinc-400">Bump version for a namespace to invalidate all its entries.</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Namespace</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  placeholder="e.g. points"
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <Button onClick={handlePurgeNamespace} disabled={loading}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Purging…</span>
                  ) : (
                    <span className="inline-flex items-center gap-2"><Eraser className="w-4 h-4" /> Purge Namespace</span>
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {KNOWN_NAMESPACES.map((ns) => (
                  <Badge key={ns} onClick={() => setNamespace(ns)}>{ns}</Badge>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Purge ALL Namespaces</h3>
            <p className="text-sm text-zinc-400">Bump versions for all known namespaces. Use with care.</p>
          </div>
          <Button onClick={handlePurgeAll} disabled={loading} className="bg-red-600 hover:bg-red-500">
            {loading ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Purging…</span>
            ) : (
              <span className="inline-flex items-center gap-2"><Sparkles className="w-4 h-4" /> Purge ALL</span>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
