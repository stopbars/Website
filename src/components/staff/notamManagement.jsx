import { useState, useEffect } from 'react';
import { MessageSquareWarning, AlertTriangle, Info, Loader, Plus, Edit, X, ChevronDown, Eye, FileText, Tag, Send, HardDriveDownload, CheckCircle2, Copy, Check } from 'lucide-react';
import { Button } from '../shared/Button';
import { getVatsimToken } from '../../utils/cookieUtils';
import DOMPurify from 'dompurify';

// Function to parse markdown-style links in NOTAM content (same as Navbar)
const parseNotamLinks = (content) => {
  if (!content) return '';
  
  // RegExp to match markdown style links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  
  // Replace all instances of markdown links with HTML links
  // Add target="_blank" and rel="noopener noreferrer" for security
  const sanitizedContent = content.replace(
    linkRegex, 
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline hover:brightness-125 transition-all">$1</a>'
  );
  return DOMPurify.sanitize(sanitizedContent);
};

const NotamManagement = () => {
  const [notamData, setNotamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editType, setEditType] = useState('warning');
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState('warning');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showNewTypeDropdown, setShowNewTypeDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasEditChanges, setHasEditChanges] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchNotam = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('https://v2.stopbars.com/notam');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch NOTAM: ${response.status}`);
        }
        
        const data = await response.json();
        setNotamData(data);
        // Set edit content and type when data is loaded
        if (data?.notam) {
          setEditContent(data.notam);
          setEditType(data.type || 'warning');
        }
      } catch (err) {
        console.error('Error fetching NOTAM:', err);
        setError(err.message || 'Failed to fetch NOTAM data');
      } finally {
        setLoading(false);
      }
    };

    fetchNotam();
  }, []);

  // Track changes when editing
  useEffect(() => {
    if (isEditing && notamData?.notam) {
      const hasContentChanged = editContent !== notamData.notam;
      const hasTypeChanged = editType !== (notamData.type || 'warning');
      setHasEditChanges(hasContentChanged || hasTypeChanged);
    } else {
      setHasEditChanges(false);
    }
  }, [editContent, editType, isEditing, notamData]);

  // Copy NOTAM markdown content to clipboard
  const copyNotamToClipboard = async () => {
    if (!notamData?.notam) return;
    
    try {
      await navigator.clipboard.writeText(notamData.notam);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy NOTAM to clipboard:', err);
    }
  };

  const getNotamTypeStyles = (type) => {
    switch (type) {
      case "warning":
        return {
          bg: "bg-amber-500/10",
          border: "border-amber-500/20",
          text: "text-amber-400",
          icon: AlertTriangle,
          circle: "bg-amber-400"
        };
      case "info":
        return {
          bg: "bg-blue-500/10",
          border: "border-blue-500/20",
          text: "text-blue-400",
          icon: Info,
          circle: "bg-blue-400"
        };
      case "discord":
        return {
          bg: "bg-indigo-500/10",
          border: "border-indigo-500/20",
          text: "text-indigo-300",
          icon: MessageSquareWarning,
          circle: "bg-indigo-300"
        };
      case "success":
        return {
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/20",
          text: "text-emerald-400",
          icon: MessageSquareWarning,
          circle: "bg-emerald-400"
        };
      case "error":
        return {
          bg: "bg-red-500/10",
          border: "border-red-500/20",
          text: "text-red-400",
          icon: AlertTriangle,
          circle: "bg-red-400"
        };
      default:
        return {
          bg: "bg-zinc-700/20",
          border: "border-zinc-600/30",
          text: "text-zinc-300",
          icon: MessageSquareWarning,
          circle: "bg-zinc-400"
        };
    }
  };

  // Get all available NOTAM types (excluding default)
  const getNotamTypes = () => {
    return ['warning', 'info', 'discord', 'success', 'error'];
  };

  // Handle starting edit mode
  const handleStartEdit = () => {
    setIsEditing(true);
    setIsAdding(false);
    setHasEditChanges(false);
  };

  // Handle starting add mode
  const handleStartAdd = () => {
    setIsAdding(true);
    setIsEditing(false);
    setNewContent('');
    setNewType('warning');
  };

  // Handle canceling edit/add
  const handleCancel = () => {
    setIsEditing(false);
    setIsAdding(false);
    setShowTypeDropdown(false);
    setShowNewTypeDropdown(false);
    setHasEditChanges(false);
    // Reset edit content to original
    if (notamData?.notam) {
      setEditContent(notamData.notam);
      setEditType(notamData.type || 'warning');
    }
  };

  // Handle saving with backend API
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      
      // Get the VATSIM token from localStorage
      const token = getVatsimToken();
      if (!token) {
        throw new Error('Authentication token not found. Please log in again.');
      }
      
      // Determine content and type based on mode
      const content = isAdding ? newContent.trim() : editContent.trim();
      const type = isAdding ? newType : editType;
      
      // Validate content
      if (!content) {
        throw new Error('NOTAM content cannot be empty.');
      }
      
      // Make API request
      const response = await fetch('https://v2.stopbars.com/notam', {
        method: 'PUT',
        headers: { 
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: content,
          type: type
        })
      });
      
      if (!response.ok) {
        // Handle different error types
        if (response.status === 401) {
          throw new Error('Authentication failed. Please log in again.');
        } else if (response.status === 403) {
          throw new Error('You do not have permission to manage NOTAMs.');
        } else if (response.status === 400) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Invalid NOTAM data provided.');
        } else {
          throw new Error(`Failed to save NOTAM: ${response.status}`);
        }
      }
      
      // Update localStorage cache with new NOTAM data for immediate navbar update
      try {
        const currentTime = new Date().getTime();
        localStorage.setItem('notam-content', content);
        localStorage.setItem('notam-type', type);
        localStorage.setItem('notam-last-fetch', currentTime.toString());
      } catch (storageErr) {
        console.error('Failed to update localStorage cache:', storageErr);
        // Don't throw error - this is not critical for the save operation
      }
      
      // Update local state with new data
      const updatedNotamData = {
        notam: content,
        type: type
      };
      setNotamData(updatedNotamData);
      
      // Reset form states
      setIsEditing(false);
      setIsAdding(false);
      setShowTypeDropdown(false);
      setShowNewTypeDropdown(false);
      
      // Reset form content
      setNewContent('');
      setNewType('warning');
      
      // Update edit content for future edits
      setEditContent(content);
      setEditType(type);
      
      // Show success message
      setSaveSuccess(true);
      
    } catch (err) {
      console.error('Error saving NOTAM:', err);
      setError(err.message || 'Failed to save NOTAM');
    } finally {
      setSaving(false);
    }
  };

  // Render type tag
  const renderTypeTag = (type) => {
    const styles = getNotamTypeStyles(type);
    return (
      <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${styles.bg} ${styles.border} ${styles.text} border`}>
        <div className={`w-2 h-2 rounded-full mr-2 ${styles.text.replace('text-', 'bg-')}`}></div>
        {type || 'default'}
      </div>
    );
  };

  // Render type dropdown
  const renderTypeDropdown = (currentType, setType, isOpen, setIsOpen) => {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-750"
        >
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full transition-colors duration-200 ${getNotamTypeStyles(currentType).circle}`}></div>
            <span className="capitalize transition-colors duration-200">{currentType}</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
            {getNotamTypes().map((type, index) => (
              <button
                key={type}
                onClick={() => {
                  setType(type);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 flex items-center space-x-2 ${
                  currentType === type ? 'bg-zinc-700 text-blue-400' : 'text-white hover:text-zinc-100'
                }`}
                style={{
                  animationDelay: `${index * 25}ms`,
                  animationFillMode: 'both'
                }}
              >
                <div className={`w-3 h-3 rounded-full transition-all duration-200 ${getNotamTypeStyles(type).circle}`}></div>
                <span className="capitalize transition-colors duration-150">{type}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <MessageSquareWarning className="w-6 h-6 text-zinc-400" />
          <h2 className="text-xl font-semibold">NOTAM Management</h2>
        </div>
        <div className="flex items-center space-x-3">
          {!isEditing && !isAdding && (
            <>
              <Button
                onClick={handleStartAdd}
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Plus className="w-4 h-4 mr-2" />
                New NOTAM
              </Button>
              {notamData?.notam && (
                <Button
                  onClick={handleStartEdit}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Current
                </Button>
              )}
            </>
          )}
          {(isEditing || isAdding) && (
            <div className="flex items-center space-x-2">
              <Button
                onClick={handleSave}
                variant="outline"
                className={`border-zinc-700 text-zinc-300 hover:bg-zinc-800 ${
                  (isAdding && newContent.trim().length < 5) || (isEditing && !hasEditChanges) || saving
                    ? 'opacity-50 cursor-not-allowed hover:!bg-transparent' 
                    : ''
                }`}
                disabled={(isAdding && newContent.trim().length < 5) || (isEditing && !hasEditChanges) || saving}
              >
                {saving ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : isAdding ? (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Publish
                  </>
                ) : (
                  <>
                    <HardDriveDownload className="w-4 h-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
              <Button
                onClick={handleCancel}
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Success Message */}
      {saveSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start space-x-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-emerald-400 font-medium">NOTAM Updated Successfully</p>
            <p className="text-emerald-300/80 text-sm mt-1">
              The endpoint may take a short time to update. Users will see changes after 1 hour when their cache expires and the navbar fetches from the API. Your NOTAM in the navbar will be updated, but NOTAM Management will show outdated data until the endpoint updates.
            </p>
          </div>
          <button
            onClick={() => setSaveSuccess(false)}
            className="text-emerald-400/60 hover:text-emerald-400 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add New NOTAM Section */}
      {isAdding && (
        <div className="space-y-6 p-6 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-white">Add New NOTAM</h3>
          </div>
          
          <div className="space-y-6">
            {/* Content Section */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                <FileText className="w-4 h-4" />
                <span>Content</span>
              </label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="w-full h-24 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-600 resize-none text-white placeholder-zinc-500"
              />
            </div>
            
            {/* Type Section */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                <Tag className="w-4 h-4" />
                <span>Type</span>
              </label>
              {renderTypeDropdown(newType, setNewType, showNewTypeDropdown, setShowNewTypeDropdown)}
            </div>
            
            {/* Preview Section */}
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <Eye className="w-4 h-4 text-zinc-400" />
                <label className="text-sm font-medium text-zinc-300">Preview</label>
              </div>
              <div className="h-24 border border-zinc-700 rounded-lg overflow-hidden">
                {newContent ? (
                  <div className={`p-4 h-full ${getNotamTypeStyles(newType).bg} ${getNotamTypeStyles(newType).border} border`}>
                    <div 
                      className={`${getNotamTypeStyles(newType).text} font-medium text-sm overflow-auto`}
                      dangerouslySetInnerHTML={{ __html: parseNotamLinks(newContent) }}
                    />
                  </div>
                ) : (
                  <div className="p-4 h-full bg-zinc-800/50 flex items-center justify-center">
                    <p className="text-zinc-500 text-sm">Preview will appear here...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Existing NOTAM Section */}
      {isEditing && notamData?.notam && (
        <div className="space-y-6 p-6 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="mb-4">
            <h3 className="text-lg font-medium text-white">Edit Current NOTAM</h3>
          </div>
          
          <div className="space-y-6">
            {/* Content Section */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                <FileText className="w-4 h-4" />
                <span>Content</span>
              </label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-24 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-600 resize-none text-white"
              />
            </div>
            
            {/* Type Section */}
            <div>
              <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                <Tag className="w-4 h-4" />
                <span>Type</span>
              </label>
              {renderTypeDropdown(editType, setEditType, showTypeDropdown, setShowTypeDropdown)}
            </div>
            
            {/* Preview Section */}
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <Eye className="w-4 h-4 text-zinc-400" />
                <label className="text-sm font-medium text-zinc-300">Preview</label>
              </div>
              <div className="h-24 border border-zinc-700 rounded-lg overflow-hidden">
                <div className={`p-4 h-full ${getNotamTypeStyles(editType).bg} ${getNotamTypeStyles(editType).border} border`}>
                  <div 
                    className={`${getNotamTypeStyles(editType).text} font-medium text-sm overflow-auto`}
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parseNotamLinks(editContent)) }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current NOTAM Display */}
      {!isEditing && !isAdding && (
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-medium text-zinc-300">Current NOTAM:</h3>
            {notamData?.notam && renderTypeTag(notamData.type)}
          </div>
          
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-zinc-400" />
              <span className="ml-2 text-zinc-400">Loading NOTAM...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-400">{error}</p>
            </div>
          ) : notamData?.notam ? (
            <div className="space-y-4">
              <div 
                className={`p-4 rounded-lg border ${getNotamTypeStyles(notamData.type).bg} ${getNotamTypeStyles(notamData.type).border} relative`}
              >
                <button
                  onClick={copyNotamToClipboard}
                  className="absolute top-3 right-3 p-1.5 text-zinc-400 hover:text-white transition-colors rounded cursor-pointer"
                  title="Copy NOTAM to clipboard"
                >
                  {copied ? (
                    <Check className="w-4.5 h-4.5 text-green-400" />
                  ) : (
                    <Copy className="w-4.5 h-4.5" />
                  )}
                </button>
                <div 
                  className={`${getNotamTypeStyles(notamData.type).text} font-medium pr-8`}
                  dangerouslySetInnerHTML={{ __html: parseNotamLinks(notamData.notam) }}
                />
              </div>
            </div>
          ) : (
            <div className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Info className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                <p className="text-zinc-400">No NOTAM currently active</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotamManagement;
