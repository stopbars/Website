import { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { getVatsimToken } from '../../utils/cookieUtils';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
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
		<span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border tracking-wide ${cls}`}>
			{displayText}
		</span>
	);
};

StatusBadge.propTypes = {
	status: PropTypes.string
};

const DeleteConfirmationModal = ({ message, onCancel, onConfirmDelete, isDeleting }) => {
	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
			<div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
				<div className="flex items-center space-x-3 mb-6">
					<AlertOctagon className="w-6 h-6 text-red-500" />
					<h3 className="text-xl font-bold text-red-500">Delete Message</h3>
				</div>
				
				<div className="space-y-4">
					<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
						<p className="text-zinc-200 mb-3">
							You are about to delete this message:
						</p>
						<div className="space-y-2">
							<div className="flex items-center space-x-2 text-red-200">
								<Mail className="w-4 h-4 flex-shrink-0" />
								<span className="text-sm truncate">{message.email || 'Unknown sender'}</span>
							</div>
							<div className="flex items-start space-x-2 text-red-200">
								<MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
								<span className="text-sm leading-relaxed">{message.subject || '(No subject)'}</span>
							</div>
						</div>
					</div>

					<p className="text-zinc-300">
						This action cannot be undone. The message will be permanently removed from the database, all associated data will be lost.
					</p>

					<div className="flex space-x-3 pt-2">
						<Button
							onClick={onConfirmDelete}
							className="!bg-red-500 hover:!bg-red-600 text-white"
							disabled={isDeleting}
						>
							{isDeleting ? (
								<>
									<Loader className="w-4 h-4 mr-2 animate-spin" />
									Deleting...
								</>
							) : (
								<>
									<Trash2 className="w-4 h-4 mr-2" />
									Delete Message
								</>
							)}
						</Button>
						<Button
							variant="outline"
							onClick={onCancel}
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

DeleteConfirmationModal.propTypes = {
	message: PropTypes.shape({
		id: PropTypes.number.isRequired,
		email: PropTypes.string,
		subject: PropTypes.string
	}).isRequired,
	onCancel: PropTypes.func.isRequired,
	onConfirmDelete: PropTypes.func.isRequired,
	isDeleting: PropTypes.bool.isRequired
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

	const clearBanners = () => { setError(null); setSuccess(null); };

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
			const normalized = list.map(m => ({
				...m,
				subject: m.subject || m.topic || m.title || '(No subject)',
				createdAt: m.createdAt || m.created_at || m.created || m.submittedAt || m.timestamp
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

	useEffect(() => { fetchMessages(); }, [fetchMessages]);

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

	const selectedMessage = useMemo(() => messages.find(m => m.id === selectedId) || null, [messages, selectedId]);

	const updateStatus = async (id, newStatus) => {
		if (!STATUSES.includes(newStatus)) return;
		clearBanners();
		setUpdatingStatusId(id);
		try {
			const res = await fetch(`${apiBase}/contact/${id}/status`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', 'X-Vatsim-Token': token },
				body: JSON.stringify({ status: newStatus })
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
			setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...(updatedObj || {}), status: newStatus } : m)));
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
			const res = await fetch(`${apiBase}/contact/${id}`, { method: 'DELETE', headers: { 'X-Vatsim-Token': token } });
			if (!res.ok) {
				if (res.status === 404) throw new Error('Message not found');
				if (res.status === 401) throw new Error('Unauthorized');
				if (res.status === 403) throw new Error('Forbidden');
				throw new Error('Failed to delete message');
			}
			// 204 No Content expected
			setMessages(prev => prev.filter(m => m.id !== id));
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
		<div className="container mx-auto px-4 pt-2 pb-4 max-w-4xl">
			<div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
				<h1 className="text-2xl font-bold mb-4 md:mb-0">Contact Messages</h1>
				<div className="text-sm bg-zinc-500/20 text-zinc-400 px-3 py-1 rounded-full">
					{messages.length} Total Messages
				</div>
			</div>

			<div className="space-y-6 mt-2">

			{error && (
				<div className="p-3 bg-red-500/10 border border-red-500/30 rounded flex items-center gap-2 text-sm text-red-400">
					<AlertTriangle className="w-4 h-4" /> {error}
				</div>
			)}
			{success && (
				<div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded text-sm text-emerald-400 flex items-center gap-2">
					<CheckCircle2 className="w-4 h-4" /> {success}
				</div>
			)}

			{/* Controls removed per request */}

			<div className="grid grid-cols-12 gap-6">
				{/* List */}
				<div className="col-span-5 space-y-3 max-h-[600px] overflow-y-auto pr-1">
					{filteredMessages.length === 0 && (
						<Card className="p-6 text-sm text-zinc-400 text-center">No messages match current filters.</Card>
					)}
					{filteredMessages.map(msg => {
						const created = new Date(msg.createdAt || msg.created || msg.submittedAt || msg.timestamp || Date.now());
						return (
							<Card
								key={msg.id}
								onClick={() => setSelectedId(msg.id)}
								className={`p-4 cursor-pointer transition-all duration-200 ${selectedId === msg.id ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-700'} relative`}
							>
								<div className="flex justify-between gap-3">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 mb-1">
											<Mail className="w-4 h-4 text-zinc-400" />
											<p className="font-medium text-sm truncate">{msg.subject || '(No subject)'}</p>
										</div>
										<p className="text-xs text-zinc-400 truncate mb-1">{msg.email || msg.from || 'Unknown sender'}</p>
										<p className="text-xs text-zinc-500 line-clamp-2 mb-4">
											{msg.message || msg.body || ''}
										</p>
										<div className="flex items-center justify-between">
											<StatusBadge status={msg.status || 'pending'} />
											<span className="text-[11px] text-zinc-500">{created.toLocaleDateString()} {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
										</div>
									</div>
								</div>
							</Card>
						);
					})}
				</div>
				{/* Detail */}
				<div className="col-span-7">
					{selectedMessage ? (
						<Card className="p-6 space-y-5">
							{/* Header with subject & status */}
							<div className="flex items-start justify-between gap-4 w-full">
								<div className="min-w-0">
									<h3 className="text-xl font-semibold mb-2">
										{selectedMessage.subject || 'No subject'}
									</h3>
									{selectedMessage.email && (
										<p className="text-sm text-zinc-300 mb-1 truncate max-w-[420px]">{selectedMessage.name || selectedMessage.fullName || selectedMessage.email}</p>
									)}
									<p className="text-xs text-zinc-500">Received {new Date(selectedMessage.createdAt || Date.now()).toLocaleString()}</p>
								</div>
								<StatusBadge status={selectedMessage.status || 'pending'} />
							</div>

							{/* Action bar full width */}
							<div className="flex gap-2 items-center w-full">
								{STATUSES.filter(s => s !== (selectedMessage.status || 'pending')).map(s => (
									<Button
										key={s}
										size="xs"
										variant="outline"
										disabled={updatingStatusId === selectedMessage.id}
										onClick={() => updateStatus(selectedMessage.id, s)}
										className="text-xs whitespace-nowrap"
									>
										{updatingStatusId === selectedMessage.id ? (
											<Loader className="w-3 h-3 animate-spin" />
										) : s.charAt(0).toUpperCase() + s.slice(1)}
									</Button>
								))}
								<Button
									size="xs"
									variant="outline"
									onClick={() => {
										if (selectedMessage.email) {
											navigator.clipboard.writeText(selectedMessage.email).catch(() => {});
											window.open('https://mail.stopbars.com', '_blank', 'noopener');
											setSuccess('Email copied & ZoHo opened');
										}
									}}
									className="text-xs whitespace-nowrap border-zinc-700 text-zinc-300 hover:bg-zinc-800"
								>
									<ExternalLink className="w-3 h-3 mr-1" />
									Reply
								</Button>
								<Button
									size="xs"
									onClick={() => setDeletingMessage(selectedMessage)}
									disabled={isDeletingMessage}
									className="text-xs flex items-center gap-1 whitespace-nowrap !bg-red-500/10 hover:!bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 transition"
								>
									<Trash2 className="w-3 h-3" />
									Delete
								</Button>
							</div>

							<div className="border border-zinc-800 rounded-lg p-4 bg-zinc-900/60 max-h-[360px] overflow-y-auto">
								<p className="whitespace-pre-wrap text-sm leading-relaxed">{selectedMessage.message || selectedMessage.body || '(No message content)'}</p>
							</div>

							{(selectedMessage.error || selectedMessage.failedReason) && (
								<div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400 flex items-center gap-2">
									<XCircle className="w-4 h-4" /> {selectedMessage.error || selectedMessage.failedReason}
								</div>
							)}
						</Card>
					) : (
						<Card className="p-6 text-center text-sm text-zinc-400 flex items-center justify-center h-full min-h-[300px]">
							Select a message to view its details.
						</Card>
					)}
				</div>
			</div>

			{/* Delete Confirmation Modal */}
			{deletingMessage && (
				<DeleteConfirmationModal
					message={deletingMessage}
					onCancel={cancelDelete}
					onConfirmDelete={() => deleteMessage(deletingMessage.id)}
					isDeleting={isDeletingMessage}
				/>
			)}
		</div>
		</div>
	);
}
