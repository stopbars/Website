import { useState, useEffect, useRef } from 'react';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';
import { getVatsimToken } from '../../utils/cookieUtils';
import { 
  Upload, Image as ImageIcon, FileUp, RefreshCw, Check, AlertTriangle, History, Edit3, X, Info, Plus, Edit, Loader,
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
  { value: 'EuroScope-Plugin', label: 'EuroScope Plugin' }
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB per spec
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
  const changelogSectionRef = useRef(null);

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

  // Validation helpers
  const validateUpload = () => {
  if (!version.trim()) return 'Version is required';
  if (!SEMVER_REGEX.test(version.trim())) return 'Version must follow semantic versioning (e.g. 1.2.3, 2.0.0-beta.1)';
    if (!file) return 'Release ZIP file is required';
    if (file) {
      if (file.type !== 'application/zip' && !file.name.toLowerCase().endsWith('.zip')) {
        return 'Release file must be a .zip';
      }
      if (file.size > MAX_ZIP_BYTES) {
        return 'ZIP exceeds 90MB limit';
      }
    }
    if (image) {
      const isValidType = ['image/png', 'image/jpeg'].includes(image.type) || /\.(png|jpe?g)$/i.test(image.name);
      if (!isValidType) return 'Image must be PNG or JPG';
      if (image.size > MAX_IMAGE_BYTES) return 'Image exceeds 2MB limit';
    }
    return '';
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) setFile(selected);
  };

  const handleImageChange = (e) => {
    const selected = e.target.files[0];
    if (selected) setImage(selected);
  };

  const resetUploadForm = () => {
    setProduct('Pilot-Client');
    setVersion('');
    setChangelog('');
    setFile(null);
    setImage(null);
    setUploadError('');
    setUploadSuccess('');
  };

  const resetUpdateForm = () => {
    setEditReleaseId('');
    setNewChangelog('');
    setUpdateError('');
    setUpdateSuccess('');
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
      formData.append('file', pendingUploadData.file);
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
    resetUploadForm();
  };

  const handleStartUpdate = () => {
    setIsUpdating(true);
    setIsAdding(false);
    resetUpdateForm();
  };

  const handleCancel = () => {
    setIsAdding(false);
    setIsUpdating(false);
    resetUploadForm();
    resetUpdateForm();
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
                className={`border-zinc-700 text-zinc-300 hover:bg-zinc-800 ${
                  (isAdding && (!version.trim() || !file)) || (isUpdating && (!editReleaseId.trim() || !newChangelog.trim())) || uploading || updating
                    ? 'opacity-50 cursor-not-allowed hover:!bg-transparent' 
                    : ''
                }`}
                disabled={(isAdding && (!version.trim() || !file)) || (isUpdating && (!editReleaseId.trim() || !newChangelog.trim())) || uploading || updating}
              >
                {uploading || updating ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    {isAdding ? 'Publishing...' : 'Updating...'}
                  </>
                ) : isAdding ? (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Publish Release
                  </>
                ) : (
                  <>
                    <Edit3 className="w-4 h-4 mr-2" />
                    Edit Changelog
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
                  <label className="block text-sm font-medium mb-2 text-zinc-300">Product</label>
                  <select
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    {PRODUCT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-zinc-300">Version</label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="e.g. 2.0.1"
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-zinc-300">Changelog</label>
                <textarea
                  value={changelog}
                  onChange={(e) => setChangelog(e.target.value)}
                  rows={6}
                  placeholder="List key changes, features, fixes..."
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 resize-y"
                />
                <div className="flex justify-between mt-1 text-xs text-zinc-500">
                  <span>{changelog.length} chars</span>
                  <span className="text-zinc-600">Preview auto-updates below</span>
                </div>
                {changelog.trim() && (
                  <div className="mt-3 border border-zinc-700 bg-zinc-900/60 rounded-lg p-4 max-w-none text-sm overflow-x-auto">
                    <article className="markdown-preview prose-invert prose-sm max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(changelog) }} />
                    </article>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-2 text-zinc-300">Release ZIP File</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="file"
                      accept=".zip,application/zip"
                      onChange={handleFileChange}
                      className="hidden"
                      id="release-zip-input"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('release-zip-input').click()}
                      className="w-full justify-start"
                    >
                      <FileUp className="w-4 h-4 mr-2" />
                      {file ? file.name : 'Select ZIP file'}
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">Required. Must be a .zip archive.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-zinc-300">Promo Image (PNG/JPG)</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleImageChange}
                      className="hidden"
                      id="release-image-input"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('release-image-input').click()}
                      className="w-full justify-start"
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      {image ? image.name : 'Select optional image'}
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">Optional. PNG or JPG up to 2MB.</p>
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
              <h3 className="text-lg font-medium text-white">Update Edit Changelog</h3>
            </div>
            
            <form onSubmit={submitChangelogUpdate} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium mb-2 text-zinc-300">Release ID</label>
                  <input
                    type="text"
                    value={editReleaseId}
                    onChange={(e) => setEditReleaseId(e.target.value)}
                    placeholder="e.g. 42"
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2 text-zinc-300">New Changelog</label>
                  <textarea
                    value={newChangelog}
                    onChange={(e) => setNewChangelog(e.target.value)}
                    rows={4}
                    placeholder="Enter updated changelog text..."
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 resize-y"
                  />
                  <div className="flex justify-between mt-1 text-xs text-zinc-500">
                    <span>{newChangelog.length} / 20000</span>
                    <span>Required</span>
                  </div>
                  {newChangelog.trim() && (
                    <div className="mt-3 border border-zinc-700 bg-zinc-900/60 rounded-lg p-4 max-w-none text-sm overflow-x-auto">
                      <article className="markdown-preview prose-invert prose-sm max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(newChangelog) }} />
                      </article>
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

              <div className="p-3 bg-zinc-800/60 border border-zinc-700 rounded-lg text-xs text-zinc-400 flex space-x-2">
                <Info className="w-4 h-4 flex-shrink-0 text-zinc-500" />
                <p>
                  Select a release from the table below to pre-fill its ID and current changelog. Update only the changelog text—other fields require a new release upload.
                </p>
              </div>
            </form>
          </div>
        )}

        {/* Existing Releases Section */}
        {!isAdding && !isUpdating && (
          <div>
            <div className="flex items-center mb-4 space-x-3">
              <History className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-medium text-zinc-300">Existing Releases</h3>
            </div>
            <Card className="p-6 bg-zinc-900/40 border-zinc-800 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <label className="text-sm text-zinc-400">Filter Product:</label>
                  <select
                    value={productFilter}
                    onChange={(e) => setProductFilter(e.target.value)}
                    className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                  >
                    <option value="">All</option>
                    {PRODUCT_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <Button variant="outline" onClick={() => fetchReleases(productFilter)} disabled={releasesLoading}>
                  {releasesLoading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Refreshing...</> : <><RefreshCw className="w-4 h-4 mr-2" />Refresh</>}
                </Button>
              </div>

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
                            <Button size="sm" variant="outline" onClick={() => {
                              handleSelectRelease(rel);
                              handleStartUpdate();
                            }}>
                              Edit Changelog
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-zinc-500">Showing up to 50 results. Apply a filter for narrower view.</p>
            </Card>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-semibold mb-1">Confirm Release Publication</h3>
                <p className="text-sm text-zinc-400">Releases cannot be deleted once created. Please review all details carefully before confirming.</p>
              </div>
            </div>
            <div className="space-y-3 text-sm bg-zinc-800/40 p-4 rounded-lg border border-zinc-700/50">
              <div className="flex justify-between"><span className="text-zinc-400">Product:</span><span className="font-medium">{product}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Version:</span><span className="font-medium">{version || '—'}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">ZIP File:</span><span className="font-medium truncate max-w-[240px]" title={file?.name}>{file?.name}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">ZIP Size:</span><span className="font-medium">{file ? (file.size / (1024*1024)).toFixed(2) + ' MB' : '—'}</span></div>
              <div className="flex justify-between"><span className="text-zinc-400">Promo Image:</span><span className="font-medium truncate max-w-[240px]" title={image?.name}>{image ? image.name : '(none)'}</span></div>
              {image && <div className="flex justify-between"><span className="text-zinc-400">Image Size:</span><span className="font-medium">{(image.size / 1024).toFixed(1)} KB</span></div>}
              <div>
                <p className="text-zinc-400 mb-1">Changelog Preview:</p>
                <div className="max-h-40 overflow-y-auto border border-zinc-700 rounded p-2 bg-zinc-900/60 text-xs">
                  <article className="markdown-preview prose-invert prose-xs max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(changelog || '*No changelog provided*') }} />
                  </article>
                </div>
              </div>
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] leading-relaxed">
                Double-check you selected the correct build (ZIP) and optional image. Mistakes require publishing a new release; this one will remain immutable.
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
                {uploading ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Publishing...</> : <><Upload className="w-4 h-4 mr-2" />Confirm Publish</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReleaseManagement;
