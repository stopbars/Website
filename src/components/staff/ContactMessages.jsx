import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { getVatsimToken } from '../../utils/cookieUtils';
import { Dialog } from '../shared/Dialog';
import {
  AlertTriangle,
  Loader,
  Trash2,
  Mail,
  CheckCircle2,
  MessageSquare,
  XCircle,
  AlertOctagon,
  ExternalLink,
} from 'lucide-react';

// Allowed statuses per spec
const STATUSES = ['pending', 'handling', 'handled'];

// Badge component for status
const StatusBadge = ({ status }) => {
  let cls = '';
  let text = status;
  switch (status) {
    case 'pending':
      cls = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      break;
    case 'handling':
      cls = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      break;
    case 'handled':
      cls = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      break;
    default:
      cls = 'bg-zinc-600/20 text-zinc-400 border-zinc-600/30';
      text = 'unknown';
  }
  // Capitalize first letter only
  const displayText = text.charAt(0).toUpperCase() + text.slice(1);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border tracking-wide ${cls}`}
    >
      {displayText}
    </span>
  );
};

StatusBadge.propTypes = {
  status: PropTypes.string,
};

export default function ContactMessages() {
  const token = getVatsimToken();
  const apiBase = 'https://v2.stopbars.com';

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [deletingMessage, setDeletingMessage] = useState(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);

  const clearBanners = () => {
    setError(null);
    setSuccess(null);
  };

  const fetchMessages = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/contact`, { headers: { 'X-Vatsim-Token': token } });
      if (!res.ok) {
        if (res.status === 401) throw new Error('Unauthorized: please re-login');
        if (res.status === 403) throw new Error('Forbidden: Product Manager role required');
        throw new Error('Failed to load contact messages');
      }
      const raw = await res.json();
      // API returns { messages: [...] }
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.messages) ? raw.messages : [];
      // Normalize field names to what component expects
      const normalized = list.map((m) => ({
        ...m,
        subject: m.subject || m.topic || m.title || '(No subject)',
        createdAt: m.createdAt || m.created_at || m.created || m.submittedAt || m.timestamp,
      }));
      normalized.sort((a, b) => {
        const tA = new Date(a.createdAt || 0).getTime();
        const tB = new Date(b.createdAt || 0).getTime();
        return tB - tA;
      });
      setMessages(normalized);
    } catch (e) {
      setError(e.message || 'Error fetching messages');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Auto-dismiss success messages after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const filteredMessages = messages; // Direct list (already newest first)

  const selectedMessage = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId]
  );

  const updateStatus = async (id, newStatus) => {
    if (!STATUSES.includes(newStatus)) return;
    clearBanners();
    setUpdatingStatusId(id);
    try {
      const res = await fetch(`${apiBase}/contact/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Vatsim-Token': token },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error('Message not found');
        if (res.status === 400) throw new Error('Invalid status');
        if (res.status === 401) throw new Error('Unauthorized');
        if (res.status === 403) throw new Error('Forbidden');
        throw new Error('Failed to update status');
      }
      const body = await res.json().catch(() => null);
      // Some APIs may return { message: {...} } or updated object directly
      const updatedObj = body && body.message ? body.message : body;
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...(updatedObj || {}), status: newStatus } : m))
      );
      setSuccess('Status updated');
    } catch (e) {
      setError(e.message || 'Failed to update status');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const deleteMessage = async (id) => {
    clearBanners();
    setIsDeletingMessage(true);
    try {
      const res = await fetch(`${apiBase}/contact/${id}`, {
        method: 'DELETE',
        headers: { 'X-Vatsim-Token': token },
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error('Message not found');
        if (res.status === 401) throw new Error('Unauthorized');
        if (res.status === 403) throw new Error('Forbidden');
        throw new Error('Failed to delete message');
      }
      // 204 No Content expected
      setMessages((prev) => prev.filter((m) => m.id !== id));
      if (selectedId === id) setSelectedId(null);
      setSuccess('Message deleted successfully');
      setDeletingMessage(null);
    } catch (e) {
      setError(e.message || 'Failed to delete message');
    } finally {
      setIsDeletingMessage(false);
    }
  };

  const cancelDelete = () => {
    setDeletingMessage(null);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Contact Messages</h2>
          <p className="text-sm text-zinc-400 mt-1">View and respond to user messages</p>
        </div>
        <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
          <MessageSquare className="w-4 h-4 mr-2 text-zinc-400" />
          {messages.length} messages
        </span>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}

      {/* Message Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* List */}
        <div className="col-span-12 lg:col-span-5 space-y-3 max-h-[600px] overflow-y-auto pr-1">
          {filteredMessages.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-zinc-700/50 rounded-xl bg-zinc-800/20">
              <Mail className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">No messages found</p>
            </div>
          ) : (
            filteredMessages.map((msg) => {
              const created = new Date(
                msg.createdAt || msg.created || msg.submittedAt || msg.timestamp || Date.now()
              );
              return (
                <div
                  key={msg.id}
                  onClick={() => setSelectedId(msg.id)}
                  className={`p-4 bg-zinc-900/50 border rounded-xl cursor-pointer transition-all duration-200 ${
                    selectedId === msg.id
                      ? 'border-blue-500/50 bg-blue-500/5 shadow-lg shadow-blue-500/5'
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
                        <p className="font-medium text-sm text-white truncate">
                          {msg.subject || '(No subject)'}
                        </p>
                      </div>
                      <p className="text-xs text-zinc-400 truncate mb-1.5">
                        {msg.email || msg.from || 'Unknown sender'}
                      </p>
                      <p className="text-xs text-zinc-500 line-clamp-2 mb-3">
                        {msg.message || msg.body || ''}
                      </p>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={msg.status || 'pending'} />
                        <span className="text-xs text-zinc-500">
                          {created.toLocaleDateString()}{' '}
                          {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {/* Detail */}
        <div className="col-span-12 lg:col-span-7">
          {selectedMessage ? (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {selectedMessage.subject || 'No subject'}
                  </h3>
                  {selectedMessage.email && (
                    <p className="text-sm text-zinc-300 truncate">
                      {selectedMessage.name || selectedMessage.fullName || selectedMessage.email}
                    </p>
                  )}
                  <p className="text-xs text-zinc-500 mt-1">
                    Received {new Date(selectedMessage.createdAt || Date.now()).toLocaleString()}
                  </p>
                </div>
                <StatusBadge status={selectedMessage.status || 'pending'} />
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {STATUSES.filter((s) => s !== (selectedMessage.status || 'pending')).map((s) => (
                  <button
                    key={s}
                    disabled={updatingStatusId === selectedMessage.id}
                    onClick={() => updateStatus(selectedMessage.id, s)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 disabled:opacity-50 transition-all"
                  >
                    {updatingStatusId === selectedMessage.id ? (
                      <Loader className="w-3 h-3 animate-spin" />
                    ) : null}
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                <button
                  onClick={() => {
                    if (selectedMessage.email) {
                      navigator.clipboard.writeText(selectedMessage.email).catch(() => {});
                      window.open('https://mail.stopbars.com', '_blank', 'noopener');
                      setSuccess('Email copied & ZoHo opened');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                >
                  <ExternalLink className="w-3 h-3" />
                  Reply
                </button>
                <button
                  onClick={() => setDeletingMessage(selectedMessage)}
                  disabled={isDeletingMessage}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>

              {/* Message Content */}
              <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-lg p-4 max-h-[360px] overflow-y-auto">
                <p className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">
                  {selectedMessage.message || selectedMessage.body || '(No message content)'}
                </p>
              </div>

              {(selectedMessage.error || selectedMessage.failedReason) && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-xs text-red-400">
                    {selectedMessage.error || selectedMessage.failedReason}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 flex items-center justify-center min-h-[300px]">
              <div className="text-center">
                <Mail className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">Select a message to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deletingMessage}
        onClose={cancelDelete}
        icon={AlertOctagon}
        iconColor="red"
        title="Delete Message"
        description="This action cannot be undone. The message will be permanently removed from the database, all associated data will be lost."
        isLoading={isDeletingMessage}
        closeOnBackdrop={!isDeletingMessage}
        closeOnEscape={!isDeletingMessage}
        buttons={[
          {
            label: 'Delete Message',
            variant: 'destructive',
            icon: Trash2,
            loadingLabel: 'Deleting...',
            onClick: () => deleteMessage(deletingMessage?.id),
            disabled: isDeletingMessage,
          },
          {
            label: 'Cancel',
            variant: 'outline',
            onClick: cancelDelete,
          },
        ]}
      >
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
          <p className="text-zinc-200 mb-3">You are about to delete this message:</p>
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-red-200">
              <Mail className="w-4 h-4 shrink-0" />
              <span className="text-sm truncate">{deletingMessage?.email || 'Unknown sender'}</span>
            </div>
            <div className="flex items-start space-x-2 text-red-200">
              <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-sm leading-relaxed">
                {deletingMessage?.subject || '(No subject)'}
              </span>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
