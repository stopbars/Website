import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Mail, 
  Trash2, 
  RefreshCw, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  ChevronDown,
  ExternalLink,
  Inbox,
  Eye,
  EyeOff,
  Copy,
  X,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { getVatsimToken } from '../../utils/cookieUtils';

const ContactMessages = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(null);
  const [viewingMessage, setViewingMessage] = useState(null);
  const [deletingMessage, setDeletingMessage] = useState(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);
  const [showIpAddresses, setShowIpAddresses] = useState({});
  const [copySuccess, setCopySuccess] = useState(false);
  const dropdownRef = useRef(null);

  const token = getVatsimToken();

  const statusOptions = [
    { value: 'pending', label: 'Pending', color: 'bg-zinc-500' },
    { value: 'handling', label: 'Handling', color: 'bg-orange-500' },
    { value: 'handled', label: 'Handled', color: 'bg-emerald-500' }
  ];

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowStatusDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    fetchMessages();
  }, []);

  const clearMessages = () => {
    setError('');
    setSuccess('');
  };

  const fetchMessages = async () => {
    try {
      clearMessages();
      setLoading(true);

      const response = await fetch('https://v2.stopbars.com/contact', {
        headers: {
          'X-Vatsim-Token': token
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch contact messages');
      }

      const data = await response.json();
      // Handle both direct array and wrapped object responses
      const messagesArray = data.messages || data;
      setMessages(Array.isArray(messagesArray) ? messagesArray : []);
    } catch (err) {
      setError(err.message || 'Failed to load contact messages');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  };

  const updateMessageStatus = async (messageId, newStatus) => {
    try {
      clearMessages();
      setUpdatingStatus(messageId);

      const response = await fetch(`https://v2.stopbars.com/contact/${messageId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Vatsim-Token': token
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error('Failed to update message status');
      }

      // Update local state
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? { ...msg, status: newStatus } : msg
      ));

      setSuccess('Message status updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update message status');
    } finally {
      setUpdatingStatus(null);
      setShowStatusDropdown(null);
    }
  };

  const deleteMessage = async (messageId) => {
    try {
      clearMessages();
      setIsDeletingMessage(true);

      const response = await fetch(`https://v2.stopbars.com/contact/${messageId}`, {
        method: 'DELETE',
        headers: {
          'X-Vatsim-Token': token
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete message');
      }

      // Remove from local state
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      setSuccess('Message deleted successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to delete message');
    } finally {
      setIsDeletingMessage(false);
      setDeletingMessage(null);
    }
  };

  const getStatusConfig = (status) => {
    return statusOptions.find(option => option.value === status) || statusOptions[0];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatIpAddress = (ip, messageId) => {
    if (!ip) return '•'.repeat(13);
    const shouldShow = showIpAddresses[messageId];
    if (shouldShow) return ip;
    const maxDots = Math.min(ip.length, 13);
    return '•'.repeat(maxDots);
  };

  const toggleIpVisibility = (messageId) => {
    setShowIpAddresses(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const copyEmailAndOpenZoho = async (email) => {
    try {
      await navigator.clipboard.writeText(email);
      window.open('https://mail.zoho.com.au/zm/#compose', '_blank');
    } catch (err) {
      console.error('Failed to copy email:', err);
      window.open('https://mail.zoho.com.au/zm/#compose', '_blank');
    }
  };

  const ViewMessageModal = ({ message, onClose }) => {
    const [messageCopySuccess, setMessageCopySuccess] = useState(false);
    
    const copyMessage = async () => {
      try {
        await navigator.clipboard.writeText(message.message);
        setMessageCopySuccess(true);
        setTimeout(() => setMessageCopySuccess(false), 2000);
      } catch (err) {
        console.error('Failed to copy message:', err);
      }
    };

    if (!message) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-zinc-900 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden border border-zinc-800">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-zinc-800">
            <h3 className="text-xl font-bold text-white">View Entire Message</h3>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white transition-colors p-2 hover:bg-zinc-800 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-zinc-400">From:</span>
                  <p className="text-white font-medium">{message.email}</p>
                </div>
                <div>
                  <span className="text-zinc-400">Topic:</span>
                  <p className="text-white font-medium">{message.topic}</p>
                </div>
                <div>
                  <span className="text-zinc-400">IP Address:</span>
                  <div className="flex items-center space-x-2">
                    <p className="text-white font-mono text-sm">
                      {formatIpAddress(message.ip_address, message.id)}
                    </p>
                    <button
                      onClick={() => toggleIpVisibility(message.id)}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors"
                      title={showIpAddresses[message.id] ? "Hide IP" : "Show IP"}
                    >
                      {showIpAddresses[message.id] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-zinc-400">Date:</span>
                  <p className="text-white">{formatDate(message.created_at)}</p>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-400 text-sm">Message:</span>
                  <button
                    onClick={copyMessage}
                    className={`p-2 rounded-lg transition-colors ${
                      messageCopySuccess 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {messageCopySuccess ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                  <p className="text-white whitespace-pre-wrap leading-relaxed">{message.message}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const DeleteConfirmationModal = ({ message, onCancel, onConfirm, isDeleting }) => {
    if (!message) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full border border-zinc-800">
          <div className="flex items-center space-x-3 mb-6">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            <h3 className="text-xl font-bold text-red-500">Delete Contact Message</h3>
          </div>
          
          <div className="space-y-4">
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-zinc-200">
                You are about to permanently delete this message:
              </p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center space-x-2 text-red-200">
                  <Mail className="w-4 h-4" />
                  <span className="text-sm">{message.email}</span>
                </div>
                <div className="flex items-center space-x-2 text-red-200">
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-sm">{message.topic}</span>
                </div>
              </div>
            </div>

            <p className="text-zinc-300 text-sm">
              This action cannot be undone. The message will be permanently removed from the database, all associated data will be lost.
            </p>

            <div className="flex space-x-3 pt-4">
              <Button
                onClick={onConfirm}
                disabled={isDeleting}
                className="!bg-red-500 hover:!bg-red-600 text-white"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </>
                )}
              </Button>
              <Button
                onClick={onCancel}
                variant="outline"
                disabled={isDeleting}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStatusDropdown = (message) => {
    const currentStatus = getStatusConfig(message.status);
    const isOpen = showStatusDropdown === message.id;

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setShowStatusDropdown(isOpen ? null : message.id)}
          disabled={updatingStatus === message.id}
          className="flex items-center space-x-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-750 hover:border-zinc-600 transition-all duration-200 text-sm"
        >
          {updatingStatus === message.id ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <div className={`w-3 h-3 rounded-full ${currentStatus.color}`}></div>
          )}
          <span className="text-white capitalize">{currentStatus.label}</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute z-[100] right-0 mt-1 w-40 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
            {statusOptions.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateMessageStatus(message.id, option.value)}
                className={`w-full px-3 py-2 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 flex items-center space-x-2 text-sm ${
                  message.status === option.value ? 'bg-zinc-700' : ''
                }`}
                style={{
                  animationDelay: `${index * 25}ms`,
                  animationFillMode: 'both'
                }}
              >
                <div className={`w-3 h-3 rounded-full ${option.color}`}></div>
                <span className="text-white">{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 pt-2 pb-4 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
        <h1 className="text-2xl font-bold mb-4 md:mb-0">Contact Messages</h1>
        <Button
          onClick={handleRefresh}
          disabled={refreshing}
          variant="outline"
          className="flex items-center space-x-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      <div className="space-y-7">
        {/* Success/Error Messages */}
        {success && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-sm text-emerald-400">
            {success}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded flex items-center gap-2 text-sm text-red-400">
            <AlertTriangle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Messages List */}
        {messages.length === 0 ? (
          <div className="text-center py-20">
            <div className="flex flex-col items-center space-y-4">
              <div className="w-20 h-20 bg-zinc-800 rounded-full flex items-center justify-center">
                <Inbox className="w-8 h-8 text-zinc-500" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-zinc-300 mb-2">No New Messages</h3>
                <p className="text-zinc-500">Check back later for new contact submissions</p>
              </div>
            </div>
          </div>
        ) : (
          <Card className="p-5">
            <h3 className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2"><Mail className="w-4 h-4" /> Current Inbox</h3>
            <div className="overflow-x-auto -mx-2">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-400 border-b border-zinc-700/50">
                    <th className="py-2 px-2 font-medium">Email</th>
                    <th className="py-2 px-2 font-medium">Message</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                    <th className="py-2 px-2 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((message) => (
                    <tr key={message.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40">
                      <td className="py-2 px-2 text-zinc-300">{message.email}</td>
                      <td className="py-2 px-2">
                        <Button
                          onClick={() => setViewingMessage(message)}
                          variant="outline"
                          className="text-xs px-2 py-1 h-auto"
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                      </td>
                      <td className="py-2 px-2">
                        {renderStatusDropdown(message)}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center space-x-2">
                          {/* Email Copy + Zoho Button */}
                          <button
                            onClick={() => copyEmailAndOpenZoho(message.email)}
                            className="p-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:text-blue-200 transition"
                            title="Copy email and open mail.stopbars.com"
                          >
                            <Mail className="w-4 h-4" />
                          </button>

                          {/* Delete Button */}
                          <button
                            onClick={() => setDeletingMessage(message)}
                            className="p-1.5 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 transition"
                            title="Delete message"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Modals */}
      {viewingMessage && (
        <ViewMessageModal 
          message={viewingMessage} 
          onClose={() => setViewingMessage(null)} 
        />
      )}

      {deletingMessage && (
        <DeleteConfirmationModal
          message={deletingMessage}
          onCancel={() => setDeletingMessage(null)}
          onConfirm={() => deleteMessage(deletingMessage.id)}
          isDeleting={isDeletingMessage}
        />
      )}
    </div>
  );
};

export default ContactMessages;