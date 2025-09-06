import { useState, useEffect } from 'react';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { getVatsimToken } from '../../utils/cookieUtils';
import { 
  Upload, Image as ImageIcon, RefreshCw, Check, AlertTriangle, History, X, Plus, Edit, Loader,
  Package, Hash, FileText, Eye, ChevronDown, Send, HardDriveDownload, ALargeSmall, Info,
} from 'lucide-react';
import { marked } from 'marked';
// Configure marked to treat single line breaks as <br> and enable GitHub-flavored markdown.
marked.setOptions({
  breaks: true, // so a single newline becomes a line break
  gfm: true
});
import DOMPurify from 'dompurify';

const PRODUCT_OPTIONS = [
  { value: 'Pilot-Client', label: 'Pilot Client' },
  { value: 'vatSys-Plugin', label: 'vatSys Plugin' },
  { value: 'EuroScope-Plugin', label: 'EuroScope Plugin' },
  { value: 'Installer', label: 'Installer (.exe)' },
  { value: 'SimConnect.NET', label: 'SimConnect.NET (NuGet)' }
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB per spec
const MAX_ZIP_BYTES = 90 * 1024 * 1024; // 90MB
// Semantic versioning regex: major.minor.patch with optional pre-release and build metadata
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const ReleaseManagement = () => {
  // Mode state
  const [isAdding, setIsAdding] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Upload form state
  const [product, setProduct] = useState('Pilot-Client');
  const [version, setVersion] = useState('');
  const [changelog, setChangelog] = useState('');
  const [file, setFile] = useState(null);
  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  // Changelog edit state
  const [editReleaseId, setEditReleaseId] = useState('');
  const [newChangelog, setNewChangelog] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  // Releases list state
  const [releases, setReleases] = useState([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [releasesError, setReleasesError] = useState('');
  const [productFilter, setProductFilter] = useState('');
  // Preview is auto-shown when there is changelog content; no manual toggle anymore
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingUploadData, setPendingUploadData] = useState(null);
  // Custom dropdown state
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  // Drag and drop state
  const [isDragActiveFile, setIsDragActiveFile] = useState(false);
  const [isDragActiveImage, setIsDragActiveImage] = useState(false);
  const [dragErrorFile, setDragErrorFile] = useState('');
  const [dragErrorImage, setDragErrorImage] = useState('');
  // Separate cache of all releases (unfiltered) for version hint accuracy
  const [allReleases, setAllReleases] = useState([]);

  const fetchReleases = async (selectedProduct = '') => {
    setReleasesLoading(true);
    setReleasesError('');
    try {
      const url = new URL('https://v2.stopbars.com/releases');
      if (selectedProduct) url.searchParams.set('product', selectedProduct);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to fetch releases');
      const data = await res.json();
      // Assume data.releases or array; fallback to data
      const list = Array.isArray(data) ? data : (data.releases || data.items || []);
      setReleases(list);
    } catch (e) {
      setReleasesError(e.message);
    } finally {
      setReleasesLoading(false);
    }
  };

  useEffect(() => { fetchReleases(productFilter); }, [productFilter]);

  // Fetch all releases once for hinting current version irrespective of UI filters
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const res = await fetch('https://v2.stopbars.com/releases');
        if (!res.ok) throw new Error('Failed to fetch releases for hint');
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.releases || data.items || []);
        setAllReleases(list);
      } catch (e) {
        // Keep failure silent in UI; optional console for debugging
        console.error('Release hint fetch failed:', e);
      }
    };
    fetchAll();
  }, []);

  // Determine latest version for a product from allReleases
  const getLatestVersionForProduct = (prod) => {
    if (!prod || !Array.isArray(allReleases) || allReleases.length === 0) return null;
    const list = allReleases.filter(r => r && r.product === prod);
    if (list.length === 0) return null;
    // Prefer created_at ordering if available
    const withDate = list.filter(r => r.created_at);
    if (withDate.length) {
      const latestByDate = withDate.sort((a, b) => {
        const ta = new Date(a.created_at).getTime() || 0;
        const tb = new Date(b.created_at).getTime() || 0;
        return tb - ta;
      })[0];
      return latestByDate?.version || null;
    }
    // Fallback: naive semver compare
    const parse = (v) => {
      const s = (v || '').toString().trim().replace(/^v/i, '');
      const m = s.match(SEMVER_REGEX);
      if (!m) return { M: -1, m: -1, p: -1, pre: '' };
      return { M: parseInt(m[1], 10), m: parseInt(m[2], 10), p: parseInt(m[3], 10), pre: m[4] || '' };
    };
    const cmp = (va, vb) => {
      const a = parse(va), b = parse(vb);
      if (a.M !== b.M) return a.M - b.M;
      if (a.m !== b.m) return a.m - b.m;
      if (a.p !== b.p) return a.p - b.p;
      // If both have pre-release, lex compare; absence of pre means higher precedence
      if (!!a.pre && !!b.pre) return a.pre.localeCompare(b.pre);
      if (!!a.pre && !b.pre) return -1;
      if (!a.pre && !!b.pre) return 1;
      return 0;
    };
    const sorted = [...list].sort((a, b) => cmp(a.version, b.version)).reverse();
    return sorted[0]?.version || null;
  };

  // Validation helpers
  const validateUpload = () => {
    const trimmedVersion = version.trim();
    if (!trimmedVersion) return 'Version is required';
    if (!SEMVER_REGEX.test(trimmedVersion)) return 'Version must follow semantic versioning (e.g. 1.2.3, 2.0.0-beta.1)';

    const isSimConnect = product === 'SimConnect.NET';
    const isInstaller = product === 'Installer';

    if (isSimConnect) {
      // External product: must NOT have a file
      if (file) return 'SimConnect.NET releases do not accept a file upload';
    } else {
      if (!file) return isInstaller ? 'Installer .exe file is required' : 'Release ZIP file is required';
      if (file) {
        const lower = file.name.toLowerCase();
        if (isInstaller) {
          if (!lower.endsWith('.exe')) return 'Installer product must be a .exe file';
        } else {
          if (file.type !== 'application/zip' && !lower.endsWith('.zip')) return 'Release file must be a .zip';
        }
        if (file.size > MAX_ZIP_BYTES) return `${isInstaller ? 'File' : 'ZIP'} exceeds 90MB limit`;
      }
    }

    if (image) {
      const isValidType = ['image/png', 'image/jpeg'].includes(image.type) || /\.(png|jpe?g)$/i.test(image.name);
      if (!isValidType) return 'Image must be PNG or JPG';
      if (image.size > MAX_IMAGE_BYTES) return 'Image exceeds 5MB limit';
    }
    return '';
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (product === 'SimConnect.NET') {
      // Should not allow file selection
      setUploadError('SimConnect.NET releases do not accept file uploads');
      e.target.value = '';
      setFile(null);
      return;
    }
    const lower = selected.name.toLowerCase();
    if (product === 'Installer') {
      if (!lower.endsWith('.exe')) { setUploadError('Installer product must be a .exe file'); return; }
    } else {
      if (selected.type !== 'application/zip' && !lower.endsWith('.zip')) { setUploadError('Release file must be a .zip'); return; }
    }
    if (selected.size > MAX_ZIP_BYTES) { setUploadError('File exceeds 90MB limit'); return; }
    setFile(selected);
    setUploadError('');
  };

  const handleImageChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setImage(selected);
      setUploadError(''); // Clear validation errors when changing image
    }
  };

  // Drag and drop handlers for release file
  const handleFileDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActiveFile) setIsDragActiveFile(true);
  };

  const handleFileDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragActiveFile(false);
      setDragErrorFile('');
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveFile(false);
    const droppedFile = e.dataTransfer.files && e.dataTransfer.files[0];
    
    if (droppedFile) {
      const lower = droppedFile.name.toLowerCase();
      if (product === 'SimConnect.NET') {
        setDragErrorFile('No file upload required for SimConnect.NET');
        setTimeout(() => setDragErrorFile(''), 3000);
        return;
      }
      if (product === 'Installer') {
        if (!lower.endsWith('.exe')) {
          setDragErrorFile('Please upload a .exe file for Installer');
          setTimeout(() => setDragErrorFile(''), 3000);
          return;
        }
      } else {
        if (droppedFile.type !== 'application/zip' && !lower.endsWith('.zip')) {
          setDragErrorFile('Please upload a .zip file');
          setTimeout(() => setDragErrorFile(''), 3000);
          return;
        }
      }
      if (droppedFile.size > MAX_ZIP_BYTES) {
        setDragErrorFile('File exceeds 90MB limit');
        setTimeout(() => setDragErrorFile(''), 3000);
        return;
      }
      setDragErrorFile('');
      setFile(droppedFile);
      setUploadError('');
    }
  };

  // Drag and drop handlers for image
  const handleImageDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActiveImage) setIsDragActiveImage(true);
  };

  const handleImageDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragActiveImage(false);
      setDragErrorImage('');
    }
  };

  const handleImageDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveImage(false);
    const droppedFile = e.dataTransfer.files && e.dataTransfer.files[0];
    
    if (droppedFile) {
      // Validate file type
      const isValidType = ['image/png', 'image/jpeg'].includes(droppedFile.type) || /\.(png|jpe?g)$/i.test(droppedFile.name);
      if (!isValidType) {
        setDragErrorImage('Please upload a PNG or JPG file');
        setTimeout(() => setDragErrorImage(''), 3000);
        return;
      }
      
      // Validate file size
      if (droppedFile.size > MAX_IMAGE_BYTES) {
        setDragErrorImage('File exceeds 5MB limit');
        setTimeout(() => setDragErrorImage(''), 3000);
        return;
      }
      
      setDragErrorImage('');
      setImage(droppedFile);
      setUploadError(''); // Clear validation errors when changing image
    }
  };

  const resetUploadForm = () => {
    setProduct('Pilot-Client'); // default remains Pilot Client
    setVersion('');
    setChangelog('');
    setFile(null);
    setImage(null);
    setUploadError('');
    // Don't clear success message here - let it show for 4 seconds
    setShowProductDropdown(false);
    setShowFilterDropdown(false);
    setIsDragActiveFile(false);
    setIsDragActiveImage(false);
    setDragErrorFile('');
    setDragErrorImage('');
  };

  const resetUpdateForm = () => {
    setEditReleaseId('');
    setNewChangelog('');
    setUpdateError('');
    // Don't clear success message here - let it show for 4 seconds
  };

  const renderMarkdown = (md) => {
    try {
      // Preprocess custom underline syntaxes before passing to marked.
      // Supports:
      // __text__ => underline
      // __*text*__ => underline + italic
      // __**text**__ => underline + bold
      // __***text***__ => underline + bold + italic
      // Order matters to avoid nested double-processing.
      const preprocess = (raw) => {
        if (!raw) return '';
        let out = raw;
        // Underlined Bold Italic (triple asterisks)
        out = out.replace(/__\*{3}([\s\S]+?)\*{3}__/g, '<u><strong><em>$1</em></strong></u>');
        // Underlined Bold
        out = out.replace(/__\*{2}([\s\S]+?)\*{2}__/g, '<u><strong>$1</strong></u>');
        // Underlined Italic
        out = out.replace(/__\*{1}([\s\S]+?)\*{1}__/g, '<u><em>$1</em></u>');
        // Plain underline (ensure not already handled by excluding asterisk right after __ or before __)
        // Use lookarounds to skip patterns starting/ending with * which were handled above.
        out = out.replace(/__(?!\*)([\s\S]*?)(?<!\*)__/g, '<u>$1</u>');
        return out;
      };
      const preprocessed = preprocess(md);
      const html = marked.parse(preprocessed || '');
      return DOMPurify.sanitize(html);
    } catch {
      return '<p class="text-red-400 text-sm">Failed to render markdown.</p>';
    }
  };

  const openConfirm = () => {
    setUploadError(''); // Clear any previous errors first
    const validation = validateUpload();
    if (validation) {
      setUploadError(validation);
      return;
    }
    setPendingUploadData({ product, version: version.trim(), changelog: changelog.trim(), file, image });
    setConfirmOpen(true);
  };

  const executeUpload = async () => {
    if (!pendingUploadData) return;
    setUploadError('');
    setUploadSuccess('');
    setConfirmOpen(false);
    try {
      setUploading(true);
      const token = getVatsimToken();
      const formData = new FormData();
  formData.append('product', pendingUploadData.product);
  formData.append('version', pendingUploadData.version);
  if (pendingUploadData.changelog) formData.append('changelog', pendingUploadData.changelog);
  // Only append file if present (SimConnect.NET should not send a file field)
  if (pendingUploadData.file) formData.append('file', pendingUploadData.file);
      if (pendingUploadData.image) formData.append('image', pendingUploadData.image);
      const response = await fetch('https://v2.stopbars.com/releases/upload', {
        method: 'POST',
        headers: { 'X-Vatsim-Token': token },
        body: formData
      });
      if (!response.ok) {
        let message = 'Failed to create release';
  try { const data = await response.json(); if (data.error) message = data.error; } catch { /* ignore json parse */ }
        throw new Error(message);
      }
      setUploadSuccess('Release created successfully');
      resetUploadForm();
      setIsAdding(false);
      fetchReleases(productFilter); // Refresh the releases list
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      setPendingUploadData(null);
      setTimeout(() => setUploadSuccess(''), 4000);
    }
  };

  // Mode handling functions
  const handleStartAdd = () => {
    setIsAdding(true);
    setIsUpdating(false);
    setShowProductDropdown(false);
    setShowFilterDropdown(false);
    resetUploadForm();
    setUploadSuccess(''); // Clear any previous success message
  };

  const handleStartUpdate = () => {
    setIsUpdating(true);
    setIsAdding(false);
    resetUpdateForm();
    setUpdateSuccess(''); // Clear any previous success message
  };

  const handleCancel = () => {
    setIsAdding(false);
    setIsUpdating(false);
    setShowProductDropdown(false);
    setShowFilterDropdown(false);
    resetUploadForm();
    resetUpdateForm();
    setUpdateSuccess(''); // Clear success message when canceling
    setUploadSuccess(''); // Clear upload success message when canceling
  };

  // submitUpload replaced by confirmation modal flow

  const submitChangelogUpdate = async (e) => {
    e.preventDefault();
    setUpdateError('');
    setUpdateSuccess('');

    if (!editReleaseId.trim()) {
      setUpdateError('Release ID is required');
      return;
    }
    if (!newChangelog.trim()) {
      setUpdateError('Changelog content is required');
      return;
    }
    if (newChangelog.length > 20000) {
      setUpdateError('Changelog exceeds 20,000 character limit');
      return;
    }

    try {
      setUpdating(true);
      const token = getVatsimToken();
      const response = await fetch(`https://v2.stopbars.com/releases/${editReleaseId}/changelog`, {
        method: 'PUT',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ changelog: newChangelog })
      });

      if (!response.ok) {
        let message = 'Failed to edit changelog';
  try { const data = await response.json(); if (data.error) message = data.error; } catch { /* ignore json parse */ }
        throw new Error(message);
      }

      setUpdateSuccess('Changelog updated successfully');
      fetchReleases(productFilter); // Refresh the releases list
      resetUpdateForm();
    } catch (err) {
      setUpdateError(err.message);
    } finally {
      setUpdating(false);
      setTimeout(() => { setUpdateSuccess(''); }, 4000);
    }
  };

  const handleSelectRelease = (rel) => {
    setEditReleaseId(rel.id?.toString() || '');
    setNewChangelog(rel.changelog || '');
  };

  // Render custom product dropdown
  const renderProductDropdown = (currentProduct, setProduct, isOpen, setIsOpen) => {
    const currentOption = PRODUCT_OPTIONS.find(opt => opt.value === currentProduct);
    
    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="flex items-center justify-between w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-750"
        >
          <span className="transition-colors duration-200">{currentOption?.label || currentProduct}</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
            {PRODUCT_OPTIONS.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setProduct(option.value);
                  if (option.value === 'SimConnect.NET') {
                    // Clear any previously selected file; external product should not send a file
                    setFile(null);
                  }
                  setIsOpen(false);
                  setUploadError(''); // Clear any validation errors when changing product
                }}
                className={`w-full px-4 py-2 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 ${
                  currentProduct === option.value ? 'bg-zinc-700 text-blue-400' : 'text-white hover:text-zinc-100'
                }`}
                style={{
                  animationDelay: `${index * 25}ms`,
                  animationFillMode: 'both'
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render custom filter dropdown for existing releases
  const renderFilterDropdown = (currentFilter, setFilter, isOpen, setIsOpen) => {
    const filterOptions = [
      { value: '', label: 'All Products' },
      ...PRODUCT_OPTIONS
    ];
    const currentOption = filterOptions.find(opt => opt.value === currentFilter);
    
    return (
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="flex items-center justify-between w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-750 text-sm min-w-[180px]"
        >
          <span className="transition-colors duration-200">{currentOption?.label || 'All Products'}</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
            {filterOptions.map((option, index) => (
              <button
                key={option.value}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFilter(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 text-sm ${
                  currentFilter === option.value ? 'bg-zinc-700 text-blue-400' : 'text-white hover:text-zinc-100'
                }`}
                style={{
                  animationDelay: `${index * 25}ms`,
                  animationFillMode: 'both'
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 pt-2 pb-4 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h1 className="text-2xl font-bold mb-4 md:mb-0">Release Management</h1>
        <div className="flex items-center space-x-3">
          {!isAdding && !isUpdating && (
            <>
              <Button
                onClick={handleStartAdd}
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Release
              </Button>
              <Button
                onClick={handleStartUpdate}
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Changelog
              </Button>
            </>
          )}
          {(isAdding || isUpdating) && (
            <div className="flex items-center space-x-2">
              <Button
                onClick={isAdding ? () => openConfirm() : submitChangelogUpdate}
                variant="outline"
                className={`border-zinc-700 text-zinc-300 hover:bg-zinc-800 ${(() => {
                  const needsFile = product !== 'SimConnect.NET';
                  return (isAdding && (!version.trim() || (needsFile && !file))) || (isUpdating && (!editReleaseId.trim() || !newChangelog.trim())) || uploading || updating
                    ? 'opacity-50 cursor-not-allowed hover:!bg-transparent' : '';
                })()}`}
                disabled={(() => {
                  const needsFile = product !== 'SimConnect.NET';
                  return (isAdding && (!version.trim() || (needsFile && !file))) || (isUpdating && (!editReleaseId.trim() || !newChangelog.trim())) || uploading || updating;
                })()}
              >
                {uploading || updating ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    {isAdding ? 'Publishing...' : 'Saving...'}
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
                disabled={uploading || updating}
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Success Messages */}
        {uploadSuccess && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start space-x-3">
            <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-emerald-400 font-medium">Release Published Successfully</p>
              <p className="text-emerald-300/80 text-sm mt-1">
                The new release has been published and is now available for download.
              </p>
            </div>
            <button
              onClick={() => setUploadSuccess('')}
              className="text-emerald-400/60 hover:text-emerald-400 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {updateSuccess && (
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-start space-x-3">
            <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-emerald-400 font-medium">Changelog Updated Successfully</p>
              <p className="text-emerald-300/80 text-sm mt-1">
                The release changelog has been updated.
              </p>
            </div>
            <button
              onClick={() => setUpdateSuccess('')}
              className="text-emerald-400/60 hover:text-emerald-400 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Add New Release Section */}
        {isAdding && (
          <div className="space-y-6 p-6 bg-zinc-900/50 border border-zinc-800 rounded-lg">
            <div className="mb-4">
              <h3 className="text-lg font-medium text-white">Create New Release</h3>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); openConfirm(); }} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                    <Package className="w-4 h-4" />
                    <span>Product</span>
                  </label>
                  {renderProductDropdown(product, setProduct, showProductDropdown, setShowProductDropdown)}
                </div>
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                    <Hash className="w-4 h-4" />
                    <span>Version</span>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                    <span>
                      Current published: {(() => {
                        const lv = getLatestVersionForProduct(product);
                        if (!lv) return 'no releases yet';
                        return `v${lv.replace(/^v/i, '')}`;
                      })()}
                    </span>
                  </div>
                  </label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => {
                      setVersion(e.target.value);
                      setUploadError(''); // Clear validation errors when changing version
                    }}
                    placeholder="2.0.1"
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                  <FileText className="w-4 h-4" />
                  <span>Changelog</span>
                </label>
                <textarea
                  value={changelog}
                  onChange={(e) => setChangelog(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 resize-y"
                />
                <div className="flex justify-between mt-1 text-xs text-zinc-500">
                  <span>{changelog.length} / 20000 </span>
                </div>
              </div>

              {/* Preview Section */}
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <Eye className="w-4 h-4 text-zinc-400" />
                  <label className="text-sm font-medium text-zinc-300">Preview</label>
                </div>
                <div className="min-h-24 border border-zinc-700 rounded-lg overflow-hidden">
                  {changelog.trim() ? (
                    <div className="p-4 bg-zinc-900/60">
                      <article className="markdown-preview prose-invert prose-sm max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(changelog) }} />
                      </article>
                    </div>
                  ) : (
                    <div className="p-4 bg-zinc-800/50 flex items-center justify-center min-h-24">
                      <p className="text-zinc-500 text-sm">Preview will appear here...</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {product !== 'SimConnect.NET' ? (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-zinc-300">
                      {product === 'Installer' ? 'Installer File' : 'Release File'}<span className="text-red-400 ml-1">*</span>
                    </label>
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                        dragErrorFile ? 'border-red-400 bg-red-500/10' :
                        isDragActiveFile ? 'border-blue-400 bg-blue-500/10' :
                        file ? 'border-emerald-500/50 bg-emerald-500/5' :
                        'border-zinc-600 bg-zinc-800/50 hover:bg-zinc-800/80'
                      }`}
                      onClick={() => document.getElementById('release-file-input').click()}
                      onDragOver={handleFileDragOver}
                      onDragLeave={handleFileDragLeave}
                      onDrop={handleFileDrop}
                      role="button"
                      aria-label="Upload release file via click or drag and drop"
                    >
                      {dragErrorFile ? (
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-3">
                            <X className="w-6 h-6 text-red-500" />
                          </div>
                          <p className="font-medium mb-1 text-red-400">{dragErrorFile}</p>
                          <p className="text-sm text-zinc-400">Please try again with a valid file</p>
                        </div>
                      ) : file ? (
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                            <Check className="w-6 h-6 text-emerald-500" />
                          </div>
                          <p className="font-medium mb-1">{file.name}</p>
                          <p className="text-sm text-zinc-400">{(file.size / (1024*1024)).toFixed(2)} MB / 90 MB  •  Click to change</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-zinc-700/50 rounded-full flex items-center justify-center mb-3">
                            <Upload className="w-6 h-6 text-zinc-400" />
                          </div>
                          <p className="font-medium mb-1">{isDragActiveFile ? 'Drop to upload file' : 'Click to upload or drag and drop'}</p>
                          <p className="text-sm text-zinc-400">{product === 'Installer' ? '.exe required, max 90MB' : '.zip required, max 90MB'}</p>
                        </div>
                      )}
                      <input
                        type="file"
                        accept={product === 'Installer' ? '.exe' : '.zip,application/zip'}
                        onChange={handleFileChange}
                        className="hidden"
                        id="release-file-input"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-zinc-300">{product === 'Installer' ? 'Installer File' : 'Release File'}<span className="text-red-400 ml-1">*</span></label>
                    <div className="border-2 rounded-lg p-6 text-center transition-colors border-zinc-600 bg-zinc-800/50 text-sm min-h-[140px] flex flex-col items-center justify-center max-w-[420px] mx-auto">
                      <div className="flex items-center gap-2 text-amber-400 mb-2">
                        <Info className="w-6 h-6" />
                        <span className="font-medium">SimConnect.NET (External)</span>
                      </div>
                      <p className="text-zinc-300 leading-relaxed mb-2">No file upload required. The version you publish will link users directly to the matching NuGet package on publication.</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2 text-zinc-300">Promo Image</label>
                  <div 
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      dragErrorImage ? 'border-red-400 bg-red-500/10' : 
                      isDragActiveImage ? 'border-blue-400 bg-blue-500/10' : 
                      image ? 'border-emerald-500/50 bg-emerald-500/5' : 
                      'border-zinc-600 bg-zinc-800/50 hover:bg-zinc-800/80'
                    }`}
                    onClick={() => document.getElementById('release-image-input').click()}
                    onDragOver={handleImageDragOver}
                    onDragLeave={handleImageDragLeave}
                    onDrop={handleImageDrop}
                    role="button"
                    aria-label="Upload promo image via click or drag and drop"
                  >
                    {dragErrorImage ? (
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-3">
                          <X className="w-6 h-6 text-red-500" />
                        </div>
                        <p className="font-medium mb-1 text-red-400">{dragErrorImage}</p>
                        <p className="text-sm text-zinc-400">
                          Please try again with a valid file
                        </p>
                      </div>
                    ) : image ? (
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                          <Check className="w-6 h-6 text-emerald-500" />
                        </div>
                        <p className="font-medium mb-1">{image.name}</p>
                        <p className="text-sm text-zinc-400">
                          {(image.size / (1024*1024)).toFixed(2)} MB / 5 MB  •  Click to change
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 bg-zinc-700/50 rounded-full flex items-center justify-center mb-3">
                          <ImageIcon className="w-6 h-6 text-zinc-400" />
                        </div>
                        <p className="font-medium mb-1">
                          {isDragActiveImage ? 'Drop to upload promo image' : 'Click to upload or drag and drop'}
                        </p>
                        <p className="text-sm text-zinc-400">
                          PNG or JPG, max 5MB file size
                        </p>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleImageChange}
                      className="hidden"
                      id="release-image-input"
                    />
                  </div>
                </div>
              </div>

              {uploadError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}
            </form>
          </div>
        )}

        {/* Edit Changelog Section */}
        {isUpdating && (
          <div className="space-y-6 p-6 bg-zinc-900/50 border border-zinc-800 rounded-lg">
            <div className="mb-4">
              <h3 className="text-lg font-medium text-white">Edit Changelog</h3>
            </div>
            <form onSubmit={submitChangelogUpdate} className="space-y-6">
              {/* Release ID */}
              <div>
                <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                  <Hash className="w-4 h-4" />
                  <span>Release ID</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={editReleaseId}
                    onChange={(e) => setEditReleaseId(e.target.value)}
                    placeholder="e.g. 42"
                    className="w-full pr-14 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!editReleaseId.trim()) { setUpdateError('Enter an ID to autofill'); return; }
                      const match = releases.find(r => r.id?.toString() === editReleaseId.trim());
                      if (match) {
                        setNewChangelog(match.changelog || '');
                        setUpdateError('');
                      } else {
                        setUpdateError('Release not found in current list (adjust filter)');
                      }
                    }}
                    className="absolute inset-y-0 right-2 flex items-center justify-center px-2 text-zinc-400 hover:text-white transition-colors"
                    title="Autofill changelog from this Release ID"
                    aria-label="Autofill changelog"
                  >
                    <ALargeSmall className="w-5 h-5" />
                  </button>
                </div>
              </div>
              {/* Content */}
              <div>
                <label className="flex items-center space-x-2 text-sm font-medium mb-2 text-zinc-300">
                  <FileText className="w-4 h-4" />
                  <span>Content</span>
                </label>
                <textarea
                  value={newChangelog}
                  onChange={(e) => setNewChangelog(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-600 resize-none text-white"
                />
                <div className="flex justify-between mt-1 text-xs text-zinc-500">
                  <span>{newChangelog.length} / 20000</span>
                </div>
              </div>
              {/* Preview */}
              <div>
                <div className="flex items-center space-x-2 mb-2">
                  <Eye className="w-4 h-4 text-zinc-400" />
                  <label className="text-sm font-medium text-zinc-300">Preview</label>
                </div>
                <div className="h-48 border border-zinc-700 rounded-lg overflow-hidden">
                  {newChangelog.trim() ? (
                    <div className="p-4 h-full bg-zinc-900/60 overflow-auto">
                      <article className="markdown-preview prose-invert prose-sm max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(newChangelog) }} />
                      </article>
                    </div>
                  ) : (
                    <div className="p-4 h-full bg-zinc-800/50 flex items-center justify-center">
                      <p className="text-zinc-500 text-sm">Preview will appear here...</p>
                    </div>
                  )}
                </div>
              </div>

              {updateError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>{updateError}</span>
                </div>
              )}
            </form>
          </div>
        )}

        {/* Existing Releases Section */}
        {!isAdding && !isUpdating && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-medium text-zinc-300">Existing Releases</h3>
              </div>
              <div className="flex items-center space-x-3">
                {renderFilterDropdown(productFilter, setProductFilter, showFilterDropdown, setShowFilterDropdown)}
              </div>
            </div>
            <Card className="p-6 bg-zinc-900/40 border-zinc-800 space-y-4">

              {releasesError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400 flex items-start space-x-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>{releasesError}</span>
                </div>
              )}

              <div className="overflow-x-auto -mx-2">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-zinc-400 border-b border-zinc-800">
                      <th className="py-2 px-2 font-medium">ID</th>
                      <th className="py-2 px-2 font-medium">Product</th>
                      <th className="py-2 px-2 font-medium">Version</th>
                      <th className="py-2 px-2 font-medium">Uploaded</th>
                      <th className="py-2 px-2 font-medium">Changelog</th>
                      <th className="py-2 px-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releasesLoading ? (
                      <tr><td colSpan={6} className="py-8 text-center text-zinc-500">Loading...</td></tr>
                    ) : releases.length === 0 ? (
                      <tr><td colSpan={6} className="py-8 text-center text-zinc-500">No releases found.</td></tr>
                    ) : (
                      releases.slice(0, 50).map(rel => (
                        <tr key={rel.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40">
                          <td className="py-2 px-2 text-zinc-300">{rel.id}</td>
                          <td className="py-2 px-2 text-zinc-300">{rel.product}</td>
                          <td className="py-2 px-2 text-zinc-300">{rel.version}</td>
                          <td className="py-2 px-2 text-zinc-400 whitespace-nowrap">{rel.created_at ? new Date(rel.created_at).toLocaleDateString() : '-'}</td>
                          <td className="py-2 px-2 text-zinc-400 truncate max-w-[180px]">{rel.changelog ? rel.changelog.slice(0, 60) : <span className="italic text-zinc-600">(none)</span>}</td>
                          <td className="py-2 px-2">
                            <button
                              onClick={() => { handleStartUpdate(); handleSelectRelease(rel); }}
                              className="p-1.5 rounded bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 hover:text-blue-200 transition w-8 h-8 flex items-center justify-center"
                              title="Edit changelog"
                              aria-label={`Edit changelog for release ${rel.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-zinc-500">Showing up to 50 results, apply a filter for narrower view.</p>
            </Card>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold mb-1">Confirm Release Publication</h3>
              </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left side - Release Details */}
              <div className="space-y-3 text-sm bg-zinc-800/40 p-4 rounded-lg border border-zinc-700/50 flex flex-col justify-center">
                <div className="flex items-center space-x-2 mb-3">
                  <Package className="w-4 h-4 text-zinc-400" />
                  <h4 className="font-medium text-zinc-200">Release Details</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-zinc-400">Product:</span><span className="font-medium">{product}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Version:</span><span className="font-medium">{version || '—'}</span></div>
                  {product === 'SimConnect.NET' ? (
                    <div className="flex justify-between"><span className="text-zinc-400">File:</span><span className="font-medium">External (NuGet)</span></div>
                  ) : (
                    <>
                      <div className="flex justify-between"><span className="text-zinc-400">{product === 'Installer' ? 'Installer File:' : 'ZIP File:'}</span><span className="font-medium truncate max-w-[200px]" title={file?.name}>{file?.name}</span></div>
                      <div className="flex justify-between"><span className="text-zinc-400">{product === 'Installer' ? 'File Size:' : 'ZIP Size:'}</span><span className="font-medium">{file ? (file.size / (1024*1024)).toFixed(2) + ' MB' : '—'}</span></div>
                    </>
                  )}
                  <div className="flex justify-between"><span className="text-zinc-400">Promo Image:</span><span className="font-medium truncate max-w-[200px]" title={image?.name}>{image ? image.name : '(none)'}</span></div>
                  {image && <div className="flex justify-between"><span className="text-zinc-400">Image Size:</span><span className="font-medium">{(image.size / (1024*1024)).toFixed(2)} MB</span></div>}
                </div>
                <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs leading-relaxed mt-4 mb-2">
                  Releases cannot be deleted once created. Please review all details carefully before confirming. Double-check you selected the correct build file ({product === 'Installer' ? '.exe' : product === 'SimConnect.NET' ? 'external NuGet version' : '.zip'}) and optional image. Mistakes require publishing a new release; this one will remain immutable.
                </div>
              </div>

              {/* Right side - Changelog Preview */}
              <div className="space-y-3 text-sm bg-zinc-800/40 p-4 rounded-lg border border-zinc-700/50">
                <div className="flex items-center space-x-2 mb-3">
                  <Eye className="w-4 h-4 text-zinc-400" />
                  <h4 className="font-medium text-zinc-200">Changelog Preview</h4>
                </div>
                <div className="max-h-64 overflow-y-auto border border-zinc-700 rounded p-3 bg-zinc-900/60 text-xs">
                  <article className="markdown-preview prose-invert prose-xs max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(changelog || '*No changelog provided*') }} />
                  </article>
                </div>
              </div>
            </div>

            {uploadError && (
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">{uploadError}</div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setConfirmOpen(false); setPendingUploadData(null); }} disabled={uploading}>
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
              <Button onClick={executeUpload} disabled={uploading} className="bg-amber-600 hover:bg-amber-500">
                {uploading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Publishing...</> : <><Send className="w-4 h-4 mr-2" />Publish</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReleaseManagement;
