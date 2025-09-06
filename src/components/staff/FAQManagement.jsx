import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { 
  HelpCircle,
  AlertTriangle,
  Check,
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
  ChevronDown
} from 'lucide-react';
import { getVatsimToken } from '../../utils/cookieUtils';

const DeleteFAQModal = ({ faq, onConfirm, onCancel, isDeleting }) => {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-zinc-900 p-6 rounded-lg max-w-md w-full mx-4 border border-zinc-800">
        <div className="flex items-center space-x-3 mb-6">
          <AlertOctagon className="w-6 h-6 text-red-500" />
          <h3 className="text-xl font-bold text-red-500">Delete FAQ</h3>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-zinc-200 mb-3">
              You are about to delete the FAQ for:
            </p>
            <div className="space-y-3">
              <div className="flex items-start space-x-2 text-red-200">
                <FileQuestion className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm leading-relaxed">{faq.question}</p>
              </div>
              <div className="flex items-start space-x-2 text-red-200">
                <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm leading-relaxed">{faq.answer}</p>
              </div>
            </div>
          </div>

          <div className="flex space-x-3 pt-2">
            <Button
              onClick={onConfirm}
              className="!bg-red-500 hover:!bg-red-600 text-white"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete FAQ
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

DeleteFAQModal.propTypes = {
  faq: PropTypes.shape({
    question: PropTypes.string.isRequired,
    answer: PropTypes.string.isRequired,
  }).isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  isDeleting: PropTypes.bool.isRequired
};

const FAQManagement = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingFaq, setEditingFaq] = useState(null);
  const [deletingFaq, setDeletingFaq] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editForm, setEditForm] = useState({
    question: '',
    answer: ''
  });
  const [isAdding, setIsAdding] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newFaq, setNewFaq] = useState({
    question: '',
    answer: ''
  });
  const [originalEditForm, setOriginalEditForm] = useState({
    question: '',
    answer: ''
  });
  const [recentlyMovedFaq, setRecentlyMovedFaq] = useState(null);
  const [moveDirection, setMoveDirection] = useState(null);

  useEffect(() => {
    fetchFAQs();
  }, []);

  const fetchFAQs = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await fetch('https://v2.stopbars.com/faqs');

      if (!response.ok) {
        throw new Error(`Failed to fetch FAQs: ${response.status}`);
      }

      const data = await response.json();
      // Extract FAQs array from response and sort by order_position
      const faqsArray = data.faqs || [];
      const sortedFaqs = faqsArray.sort((a, b) => (a.order_position || 0) - (b.order_position || 0));
      setFaqs(sortedFaqs);
    } catch (err) {
      setError('Failed to load FAQs. Please try again.');
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...newFaq,
          order_position: faqs.length + 1 // Add at the end
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add FAQ');
      }

      const data = await response.json();
      setFaqs([...faqs, data]);
      setSuccess('FAQ published successfully');
      setIsAdding(false);
      setNewFaq({ question: '', answer: '' });
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
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
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editForm)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update FAQ');
      }

      const data = await response.json();
      setFaqs(faqs.map(faq => 
        faq.id === faqId ? { ...faq, ...data } : faq
      ));
      
      setSuccess('FAQ updated successfully');
      setEditingFaq(null);
      setEditForm({ question: '', answer: '' });
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
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
          'X-Vatsim-Token': token
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete FAQ');
      }

      setFaqs(faqs.filter(faq => faq.id !== faqId));
      setSuccess('FAQ deleted successfully');
      setDeletingFaq(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
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
        order_position: index + 1
      }));

      // Send bulk reorder request to server
      const token = getVatsimToken();
      const response = await fetch('https://v2.stopbars.com/staff/faqs/reorder', {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update FAQ order');
      }

      // Update FAQs with new order positions but keep original IDs for tracking
      const updatedFaqs = newFaqs.map((f, index) => ({
        ...f,
        order_position: index + 1
      }));
      setFaqs(updatedFaqs);

      // Clear visual feedback after delay
      setTimeout(() => {
        setRecentlyMovedFaq(null);
        setMoveDirection(null);
      }, 2000);
      
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
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
        order_position: index + 1
      }));

      // Send bulk reorder request to server
      const token = getVatsimToken();
      const response = await fetch('https://v2.stopbars.com/staff/faqs/reorder', {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update FAQ order');
      }

      // Update FAQs with new order positions but keep original IDs for tracking
      const updatedFaqs = newFaqs.map((f, index) => ({
        ...f,
        order_position: index + 1
      }));
      setFaqs(updatedFaqs);

      // Clear visual feedback after delay
      setTimeout(() => {
        setRecentlyMovedFaq(null);
        setMoveDirection(null);
      }, 2000);
      
    } catch (err) {
      setError(err.message);
      setTimeout(() => setError(''), 5000);
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
    return editForm.question !== originalEditForm.question || 
           editForm.answer !== originalEditForm.answer;
  };

  return (
    <div className="container mx-auto px-4 pt-2 pb-4 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h1 className="text-2xl font-bold mb-4 md:mb-0">FAQ Management</h1>
        <div className="flex items-center space-x-3">
          <Button
            onClick={() => setIsAdding(true)}
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add FAQ
          </Button>
        </div>
      </div>

      <div className="space-y-6">

      {/* Status Messages */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start space-x-3">
          <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-emerald-400 font-medium">{success}</p>
          </div>
        </div>
      )}

      {/* Add FAQ Form */}
      {isAdding && (
        <div className="space-y-6 p-6 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-white">Add New FAQ</h3>
          </div>
          
          <div className="space-y-6">
            {/* Question Section */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                <FileQuestion className="w-4 h-4" />
                <span>Question</span>
              </label>
              <input
                type="text"
                value={newFaq.question}
                onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-600 text-white placeholder-zinc-500"
                placeholder="Enter the FAQ question..."
              />
            </div>
            
            {/* Answer Section */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                <MessageSquare className="w-4 h-4" />
                <span>Answer</span>
              </label>
              <textarea
                value={newFaq.answer}
                onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                className="w-full h-32 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-600 resize-none text-white placeholder-zinc-500"
                placeholder="Enter the FAQ answer..."
              />
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <Button
                onClick={handleAddFaq}
                variant="outline"
                className={`border-zinc-700 text-zinc-300 hover:bg-zinc-800 ${
                  !newFaq.question.trim() || !newFaq.answer.trim() || isPublishing
                    ? 'opacity-50 cursor-not-allowed hover:!bg-transparent' 
                    : ''
                }`}
                disabled={!newFaq.question.trim() || !newFaq.answer.trim() || isPublishing}
              >
                {isPublishing ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Publish
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAdding(false);
                  setNewFaq({ question: '', answer: '' });
                }}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                disabled={isPublishing}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* FAQs List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      ) : faqs.length === 0 ? (
        <div className="p-12 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-center">
          <HelpCircle className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-zinc-300 mb-2">No FAQs Found</h3>
          <p className="text-zinc-500 mb-6">
            Get started by creating your first FAQ to help users find answers to common questions.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <Card 
              key={faq.id} 
              className="p-6 transition-all duration-200"
            >
              {editingFaq === faq.id ? (
                // Edit Mode
                <div className="space-y-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium text-white">Edit FAQ</h3>
                  </div>
                  
                  <div className="space-y-6">
                    {/* Question Section */}
                    <div>
                      <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                        <FileQuestion className="w-4 h-4" />
                        <span>Question</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.question}
                        onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-600 text-white"
                      />
                    </div>
                    
                    {/* Answer Section */}
                    <div>
                      <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                        <MessageSquare className="w-4 h-4" />
                        <span>Answer</span>
                      </label>
                      <textarea
                        value={editForm.answer}
                        onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                        className="w-full h-32 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-600 resize-none text-white"
                      />
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center space-x-3 pt-2">
                      <Button 
                        variant="outline"
                        onClick={() => handleUpdateFaq(faq.id)}
                        disabled={!editForm.question.trim() || !editForm.answer.trim() || !hasEditChanges() || isSaving}
                        className={`border-zinc-700 text-zinc-300 hover:bg-zinc-800 ${
                          !editForm.question.trim() || !editForm.answer.trim() || !hasEditChanges() || isSaving
                            ? 'opacity-50 cursor-not-allowed hover:!bg-zinc-800 hover:!border-zinc-700' 
                            : ''
                        }`}
                      >
                        {isSaving ? (
                          <>
                            <Loader className="w-4 h-4 animate-spin mr-2" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" /> Save
                          </>
                        )}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setEditingFaq(null);
                          setEditForm({ question: '', answer: '' });
                          setOriginalEditForm({ question: '', answer: '' });
                        }}
                        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        disabled={isSaving}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                // View Mode
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4 flex-1">
                      {faqs.length > 1 && (
                        <div className="flex items-center space-x-2">
                          <span className={`text-sm font-mono transition-colors ${
                            recentlyMovedFaq === faq.id 
                              ? 'text-green-400' 
                              : 'text-zinc-400'
                          }`}>#{index + 1}</span>
                          <div className="flex flex-col space-y-1">
                            <button
                              onClick={() => handleMoveFaqUp(faq, index)}
                              disabled={index === 0}
                              className={`p-1 rounded ${
                                index === 0 
                                  ? 'text-zinc-600 cursor-not-allowed' 
                                  : recentlyMovedFaq === faq.id && moveDirection === 'up'
                                    ? 'text-green-400'
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                              } transition-colors`}
                              title="Move up"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleMoveFaqDown(faq, index)}
                              disabled={index === faqs.length - 1}
                              className={`p-1 rounded ${
                                index === faqs.length - 1 
                                  ? 'text-zinc-600 cursor-not-allowed' 
                                  : recentlyMovedFaq === faq.id && moveDirection === 'down'
                                    ? 'text-green-400'
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                              } transition-colors`}
                              title="Move down"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      <h3 className="font-medium text-zinc-100">{faq.question}</h3>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingFaq(faq.id);
                          setEditForm({
                            question: faq.question,
                            answer: faq.answer
                          });
                          setOriginalEditForm({
                            question: faq.question,
                            answer: faq.answer
                          });
                        }}
                        className="px-2 py-2"
                        title="Edit FAQ"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setDeletingFaq(faq)}
                        className="px-2 py-2 text-red-500 border-red-500/20 hover:bg-red-500/10"
                        title="Delete FAQ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-zinc-400 whitespace-pre-wrap leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingFaq && (
        <DeleteFAQModal
          faq={deletingFaq}
          onConfirm={() => handleDeleteFaq(deletingFaq.id)}
          onCancel={() => setDeletingFaq(null)}
          isDeleting={isDeleting}
        />
      )}
    </div>
    </div>
  );
};

export default FAQManagement;
