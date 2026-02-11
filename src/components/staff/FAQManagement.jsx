import { useState, useEffect } from 'react';
import { Dialog } from '../shared/Dialog';
import { Toast } from '../shared/Toast';
import {
  HelpCircle,
  RefreshCw,
  Plus,
  Edit2,
  Save,
  X,
  Trash2,
  AlertOctagon,
  FileQuestion,
  MessageSquare,
  Send,
  Loader,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { getVatsimToken } from '../../utils/cookieUtils';

const FAQManagement = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingFaq, setEditingFaq] = useState(null);
  const [deletingFaq, setDeletingFaq] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    question: '',
    answer: '',
  });
  const [isAdding, setIsAdding] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newFaq, setNewFaq] = useState({
    question: '',
    answer: '',
  });
  const [originalEditForm, setOriginalEditForm] = useState({
    question: '',
    answer: '',
  });
  const [recentlyMovedFaq, setRecentlyMovedFaq] = useState(null);
  const [moveDirection, setMoveDirection] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    title: '',
    description: '',
    variant: 'default',
  });

  useEffect(() => {
    fetchFAQs();
  }, []);

  const fetchFAQs = async () => {
    try {
      setLoading(true);

      const response = await fetch('https://v2.stopbars.com/faqs');

      if (!response.ok) {
        throw new Error(`Failed to fetch FAQs: ${response.status}`);
      }

      const data = await response.json();
      // Extract FAQs array from response and sort by order_position
      const faqsArray = data.faqs || [];
      const sortedFaqs = faqsArray.sort(
        (a, b) => (a.order_position || 0) - (b.order_position || 0)
      );
      setFaqs(sortedFaqs);
    } catch (err) {
      console.error('Error fetching FAQs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFaq = async () => {
    setIsPublishing(true);
    try {
      const token = getVatsimToken();
      const response = await fetch('https://v2.stopbars.com/staff/faqs', {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newFaq,
          order_position: faqs.length + 1, // Add at the end
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add FAQ');
      }

      const data = await response.json();
      setFaqs([...faqs, data]);
      setToastConfig({
        title: 'Success',
        description: 'FAQ published successfully',
        variant: 'success',
      });
      setShowToast(true);
      setIsAdding(false);
      setNewFaq({ question: '', answer: '' });
    } catch (err) {
      setToastConfig({ title: 'Error', description: err.message, variant: 'destructive' });
      setShowToast(true);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUpdateFaq = async (faqId) => {
    setIsSaving(true);
    try {
      const token = getVatsimToken();
      const response = await fetch(`https://v2.stopbars.com/staff/faqs/${faqId}`, {
        method: 'PUT',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update FAQ');
      }

      const data = await response.json();
      setFaqs(faqs.map((faq) => (faq.id === faqId ? { ...faq, ...data } : faq)));

      setToastConfig({
        title: 'Success',
        description: 'FAQ updated successfully',
        variant: 'success',
      });
      setShowToast(true);
      setEditingFaq(null);
      setEditForm({ question: '', answer: '' });
    } catch (err) {
      setToastConfig({ title: 'Error', description: err.message, variant: 'destructive' });
      setShowToast(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFaq = async (faqId) => {
    setIsDeleting(true);
    try {
      const token = getVatsimToken();
      const response = await fetch(`https://v2.stopbars.com/staff/faqs/${faqId}`, {
        method: 'DELETE',
        headers: {
          'X-Vatsim-Token': token,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete FAQ');
      }

      setFaqs(faqs.filter((faq) => faq.id !== faqId));
      setToastConfig({
        title: 'Success',
        description: 'FAQ deleted successfully',
        variant: 'success',
      });
      setShowToast(true);
      setDeletingFaq(null);
    } catch (err) {
      setToastConfig({ title: 'Error', description: err.message, variant: 'destructive' });
      setShowToast(true);
    } finally {
      setIsDeleting(false);
    }
  };

  // Move FAQ up in order
  const handleMoveFaqUp = async (faq, currentIndex) => {
    if (currentIndex === 0) return; // Already at top

    try {
      // Set visual feedback immediately with original FAQ id
      const originalId = faq.id;
      setRecentlyMovedFaq(originalId);
      setMoveDirection('up');

      const newFaqs = [...faqs];
      const targetFaq = newFaqs[currentIndex - 1];

      // Swap positions
      newFaqs[currentIndex] = targetFaq;
      newFaqs[currentIndex - 1] = faq;

      // Update local state optimistically
      setFaqs(newFaqs);

      // Prepare updates array for bulk reorder API
      const updates = newFaqs.map((f, index) => ({
        id: f.id,
        order_position: index + 1,
      }));

      // Send bulk reorder request to server
      const token = getVatsimToken();
      const response = await fetch('https://v2.stopbars.com/staff/faqs/reorder', {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update FAQ order');
      }

      // Update FAQs with new order positions but keep original IDs for tracking
      const updatedFaqs = newFaqs.map((f, index) => ({
        ...f,
        order_position: index + 1,
      }));
      setFaqs(updatedFaqs);

      // Clear visual feedback after delay
      setTimeout(() => {
        setRecentlyMovedFaq(null);
        setMoveDirection(null);
      }, 2000);
    } catch (err) {
      setToastConfig({ title: 'Error', description: err.message, variant: 'destructive' });
      setShowToast(true);
      // Revert to original order
      fetchFAQs();
      // Clear visual feedback on error too
      setRecentlyMovedFaq(null);
      setMoveDirection(null);
    }
  };

  // Move FAQ down in order
  const handleMoveFaqDown = async (faq, currentIndex) => {
    if (currentIndex === faqs.length - 1) return; // Already at bottom

    try {
      // Set visual feedback immediately with original FAQ id
      const originalId = faq.id;
      setRecentlyMovedFaq(originalId);
      setMoveDirection('down');

      const newFaqs = [...faqs];
      const targetFaq = newFaqs[currentIndex + 1];

      // Swap positions
      newFaqs[currentIndex] = targetFaq;
      newFaqs[currentIndex + 1] = faq;

      // Update local state optimistically
      setFaqs(newFaqs);

      // Prepare updates array for bulk reorder API
      const updates = newFaqs.map((f, index) => ({
        id: f.id,
        order_position: index + 1,
      }));

      // Send bulk reorder request to server
      const token = getVatsimToken();
      const response = await fetch('https://v2.stopbars.com/staff/faqs/reorder', {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update FAQ order');
      }

      // Update FAQs with new order positions but keep original IDs for tracking
      const updatedFaqs = newFaqs.map((f, index) => ({
        ...f,
        order_position: index + 1,
      }));
      setFaqs(updatedFaqs);

      // Clear visual feedback after delay
      setTimeout(() => {
        setRecentlyMovedFaq(null);
        setMoveDirection(null);
      }, 2000);
    } catch (err) {
      setToastConfig({ title: 'Error', description: err.message, variant: 'destructive' });
      setShowToast(true);
      // Revert to original order
      fetchFAQs();
      // Clear visual feedback on error too
      setRecentlyMovedFaq(null);
      setMoveDirection(null);
    }
  };

  // Check if there are changes in edit mode
  const hasEditChanges = () => {
    if (!editingFaq) return false;
    return (
      editForm.question !== originalEditForm.question || editForm.answer !== originalEditForm.answer
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">FAQ Management</h2>
          <p className="text-sm text-zinc-400 mt-1">Manage frequently asked questions</p>
        </div>
        <div className="flex items-center gap-3">
          {faqs.length > 0 && (
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
              <HelpCircle className="w-4 h-4 mr-2 text-zinc-400" />
              {faqs.length} FAQs
            </span>
          )}
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add FAQ
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Toast Notifications */}
        <Toast
          title={toastConfig.title}
          description={toastConfig.description}
          variant={toastConfig.variant}
          show={showToast}
          onClose={() => setShowToast(false)}
          duration={5000}
        />

        {/* Add FAQ Form */}
        {isAdding && (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Plus className="w-4 h-4 text-blue-400" />
              </div>
              <h3 className="font-medium text-white">Add New FAQ</h3>
            </div>

            <div className="space-y-5">
              {/* Question */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
                  <FileQuestion className="w-4 h-4 text-zinc-400" />
                  Question
                </label>
                <input
                  type="text"
                  value={newFaq.question}
                  onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                  placeholder="Enter the FAQ question..."
                />
              </div>

              {/* Answer */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
                  <MessageSquare className="w-4 h-4 text-zinc-400" />
                  Answer
                </label>
                <textarea
                  value={newFaq.answer}
                  onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                  className="w-full h-32 px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                  placeholder="Enter the FAQ answer..."
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleAddFaq}
                  disabled={!newFaq.question.trim() || !newFaq.answer.trim() || isPublishing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm"
                >
                  {isPublishing ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Publish
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewFaq({ question: '', answer: '' });
                  }}
                  disabled={isPublishing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-all text-sm"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FAQs List */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : faqs.length === 0 ? (
          <div className="p-12 bg-zinc-800/30 border border-zinc-700/30 border-dashed rounded-xl text-center">
            <HelpCircle className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-300 mb-2">No FAQs Found</h3>
            <p className="text-zinc-500 text-sm max-w-sm mx-auto">
              Get started by creating your first FAQ to help users find answers to common questions.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={faq.id}
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700/50 transition-all"
              >
                {editingFaq === faq.id ? (
                  // Edit Mode
                  <div className="space-y-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <Edit2 className="w-4 h-4 text-amber-400" />
                      </div>
                      <h3 className="font-medium text-white">Edit FAQ</h3>
                    </div>

                    {/* Question */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
                        <FileQuestion className="w-4 h-4 text-zinc-400" />
                        Question
                      </label>
                      <input
                        type="text"
                        value={editForm.question}
                        onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                      />
                    </div>

                    {/* Answer */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
                        <MessageSquare className="w-4 h-4 text-zinc-400" />
                        Answer
                      </label>
                      <textarea
                        value={editForm.answer}
                        onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                        className="w-full h-32 px-4 py-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => handleUpdateFaq(faq.id)}
                        disabled={
                          !editForm.question.trim() ||
                          !editForm.answer.trim() ||
                          !hasEditChanges() ||
                          isSaving
                        }
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm"
                      >
                        {isSaving ? (
                          <>
                            <Loader className="w-4 h-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            Save
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingFaq(null);
                          setEditForm({ question: '', answer: '' });
                          setOriginalEditForm({ question: '', answer: '' });
                        }}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300 transition-all text-sm"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {faqs.length > 1 && (
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-xs font-mono px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 transition-colors ${recentlyMovedFaq === faq.id ? 'text-emerald-400 border-emerald-500/30' : 'text-zinc-500'}`}
                            >
                              #{index + 1}
                            </span>
                            <div className="flex flex-col gap-0.5">
                              <button
                                onClick={() => handleMoveFaqUp(faq, index)}
                                disabled={index === 0}
                                className={`p-1 rounded-md ${index === 0 ? 'text-zinc-700 cursor-not-allowed' : recentlyMovedFaq === faq.id && moveDirection === 'up' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'} transition-colors`}
                                title="Move up"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleMoveFaqDown(faq, index)}
                                disabled={index === faqs.length - 1}
                                className={`p-1 rounded-md ${index === faqs.length - 1 ? 'text-zinc-700 cursor-not-allowed' : recentlyMovedFaq === faq.id && moveDirection === 'down' ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'} transition-colors`}
                                title="Move down"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                        <h3 className="font-medium text-white leading-relaxed">{faq.question}</h3>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            setEditingFaq(faq.id);
                            setEditForm({ question: faq.question, answer: faq.answer });
                            setOriginalEditForm({ question: faq.question, answer: faq.answer });
                          }}
                          className="p-2 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                          title="Edit FAQ"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeletingFaq(faq)}
                          className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete FAQ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-wrap pl-0">
                      {faq.answer}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <Dialog
          open={!!deletingFaq}
          onClose={() => setDeletingFaq(null)}
          icon={AlertOctagon}
          iconColor="red"
          title="Delete FAQ"
          description="This action cannot be undone. The FAQ will be permanently removed."
          isLoading={isDeleting}
          closeOnBackdrop={!isDeleting}
          closeOnEscape={!isDeleting}
          buttons={[
            {
              label: 'Delete FAQ',
              variant: 'destructive',
              icon: Trash2,
              loadingLabel: 'Deleting...',
              onClick: () => handleDeleteFaq(deletingFaq?.id),
              disabled: isDeleting,
            },
            {
              label: 'Cancel',
              variant: 'outline',
              onClick: () => setDeletingFaq(null),
            },
          ]}
        >
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
            <p className="text-zinc-200 mb-3">You are about to delete the FAQ for:</p>
            <div className="space-y-3">
              <div className="flex items-start space-x-2 text-red-200">
                <FileQuestion className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-sm leading-relaxed">{deletingFaq?.question}</p>
              </div>
              <div className="flex items-start space-x-2 text-red-200">
                <MessageSquare className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-sm leading-relaxed">{deletingFaq?.answer}</p>
              </div>
            </div>
          </div>
        </Dialog>
      </div>
    </div>
  );
};

export default FAQManagement;
