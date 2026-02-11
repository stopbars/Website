import { useEffect, useMemo, useState } from 'react';
import { Button } from '../shared/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../shared/Card';
import { Toast } from '../shared/Toast';
import { getVatsimToken } from '../../utils/cookieUtils';
import { FileUp, Trash2, Globe, Link as LinkIcon, RefreshCw, Check, Info, X } from 'lucide-react';

const MAX_BYTES = 1_000_000; // 1MB per backend

const readableSize = (bytes) => {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const parseFilenameFromUrl = (url) => {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
};

const VatSysProfiles = () => {
  const [profiles, setProfiles] = useState([]); // {icao,name,url}
  const [loading, setLoading] = useState(false);

  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastConfig, setToastConfig] = useState({
    title: '',
    description: '',
    variant: 'default',
  });

  const token = useMemo(() => getVatsimToken(), []);

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`https://v2.stopbars.com/vatsys/profiles`);
      if (!res.ok) throw new Error(`Failed to fetch profiles (${res.status})`);
      const data = await res.json();
      setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
    } catch (e) {
      setToastConfig({
        title: 'Error',
        description: e.message || 'Failed to load profiles',
        variant: 'destructive',
      });
      setShowToast(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const v = validateFile(f);
    if (v) {
      setToastConfig({ title: 'Error', description: v, variant: 'destructive' });
      setShowToast(true);
      return;
    }
    setFile(f);
  };

  const validateFile = (f) => {
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.xml')) return 'File must be an .xml file';
    if (f.size > MAX_BYTES) return 'File too large (1MB max)';
    return '';
  };

  const doUpload = async () => {
    if (uploading) return;
    if (!token) {
      setToastConfig({
        title: 'Error',
        description: 'Missing staff token',
        variant: 'destructive',
      });
      setShowToast(true);
      return;
    }
    if (!file) {
      setToastConfig({ title: 'Error', description: 'Select a file', variant: 'destructive' });
      setShowToast(true);
      return;
    }
    const v = validateFile(file);
    if (v) {
      setToastConfig({ title: 'Error', description: v, variant: 'destructive' });
      setShowToast(true);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (note) form.append('note', note);
      const res = await fetch('https://v2.stopbars.com/vatsys/profiles/upload', {
        method: 'POST',
        headers: { 'X-Vatsim-Token': token },
        body: form,
      });
      if (!res.ok) {
        let msg = 'Upload failed';
        let data = null;
        try {
          data = await res.json();
        } catch (err) {
          console.error('Failed to parse JSON response in doUpload:', err);
          data = null;
        }
        if (data?.error) msg = data.error;
        throw new Error(msg);
      }
      await res.json();
      setToastConfig({
        title: 'Success',
        description: 'Profile uploaded successfully',
        variant: 'success',
      });
      setShowToast(true);
      // Optimistically refresh list
      fetchProfiles();
      setFile(null);
      setNote('');
    } catch (e) {
      setToastConfig({
        title: 'Error',
        description: e.message || 'Upload failed',
        variant: 'destructive',
      });
      setShowToast(true);
    } finally {
      setUploading(false);
    }
  };

  const doDelete = async (profile) => {
    if (!token) {
      setToastConfig({
        title: 'Error',
        description: 'Missing staff token',
        variant: 'destructive',
      });
      setShowToast(true);
      return;
    }
    const filename = profile.name || parseFilenameFromUrl(profile.url);
    if (!filename) {
      setToastConfig({
        title: 'Error',
        description: 'Could not derive filename for delete',
        variant: 'destructive',
      });
      setShowToast(true);
      return;
    }
    if (!confirm(`Delete profile "${filename}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(
        `https://v2.stopbars.com/vatsys/profiles/${encodeURIComponent(filename)}`,
        {
          method: 'DELETE',
          headers: { 'X-Vatsim-Token': token },
        }
      );
      if (!res.ok) {
        let msg = 'Delete failed';
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (data?.error) msg = data.error;
        throw new Error(msg);
      }
      setToastConfig({ title: 'Success', description: `Deleted ${filename}`, variant: 'success' });
      setShowToast(true);
      setProfiles((prev) =>
        prev.filter((p) => (p.name || parseFilenameFromUrl(p.url)) !== filename)
      );
    } catch (e) {
      setToastConfig({
        title: 'Error',
        description: e.message || 'Delete failed',
        variant: 'destructive',
      });
      setShowToast(true);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const v = validateFile(f);
    if (v) {
      setToastConfig({ title: 'Error', description: v, variant: 'destructive' });
      setShowToast(true);
      return;
    }
    setFile(f);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h2 className="text-xl font-semibold text-white">vatSys Profiles</h2>
          <p className="text-sm text-zinc-400 mt-1">Upload and manage vatSys profile XMLs</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-sm font-medium">
            {profiles.length} Profile{profiles.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <Card className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <FileUp className="w-5 h-5 text-blue-400" /> Upload Profile
          </CardTitle>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Filenames determine identity; uploading the same name replaces the existing profile.
          </p>
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex gap-2 items-start">
            <Info className="w-4 h-4 mt-0.5" />
            Maximum file size 1MB. Accepts .xml only.
          </div>
        </CardHeader>
        <CardContent>
          {/* Upload Section (matches style with PackagesManagement) */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors relative ${dragActive ? 'border-blue-400 bg-blue-500/10' : file ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-zinc-600 bg-zinc-800/40 hover:bg-zinc-800/70'}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!dragActive) setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.currentTarget === e.target) setDragActive(false);
            }}
            onDrop={onDrop}
            onClick={() => document.getElementById('vatsys-xml-input')?.click()}
            role="button"
            aria-label="Upload vatSys XML via click or drag and drop"
          >
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-emerald-500/15 rounded-full flex items-center justify-center">
                  <Check className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-zinc-100">{file.name}</p>
                  <p className="text-xs text-zinc-400">
                    {readableSize(file.size)} / 1MB • Click to change
                  </p>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      doUpload();
                    }}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <FileUp className="w-4 h-4 mr-2" />
                        Upload XML
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                  >
                    {' '}
                    <X className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-zinc-700/40 rounded-full flex items-center justify-center">
                  <FileUp className="w-7 h-7 text-zinc-400" />
                </div>
                <p className="font-medium text-zinc-200">
                  {dragActive ? 'Drop to upload' : 'Click to select or drag & drop'}
                </p>
                <p className="text-xs text-zinc-400">Provide .xml (max 1MB)</p>
              </div>
            )}
            <input
              id="vatsys-xml-input"
              type="file"
              accept=".xml,text/xml,application/xml"
              className="hidden"
              onChange={onFileChange}
            />
          </div>

          <div className="mt-3">
            <label className="block text-xs text-zinc-400 mb-1">Optional note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Short note (e.g., updated stopbar X)"
              className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* List Section */}
          <div className="mt-8 flex items-center justify-between">
            <h4 className="text-sm text-zinc-300 font-medium">
              Existing Profiles{' '}
              <span className="text-zinc-500 font-normal">({profiles.length})</span>
            </h4>
            <Button
              variant="outline"
              onClick={() => {
                if (refreshing) return;
                setRefreshing(true);
                fetchProfiles().finally(() => setRefreshing(false));
              }}
              className="whitespace-nowrap"
            >
              {refreshing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Refreshing
                </>
              ) : (
                <>
                  {' '}
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </>
              )}
            </Button>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-zinc-800">
            <div className="grid grid-cols-12 bg-zinc-900/60 px-4 py-2 text-xs text-zinc-400">
              <div className="col-span-2">ICAO</div>
              <div className="col-span-6">Name</div>
              <div className="col-span-4 text-right">Actions</div>
            </div>
            <div className="divide-y divide-zinc-800">
              {loading ? (
                <div className="p-6 text-sm text-zinc-400">Loading…</div>
              ) : profiles.length === 0 ? (
                <div className="p-6 text-sm text-zinc-400">No profiles found</div>
              ) : (
                profiles.map((p, idx) => (
                  <div
                    key={(p.icao || 'profile') + idx}
                    className="grid grid-cols-12 items-center px-4 py-3 text-sm"
                  >
                    <div className="col-span-2 font-mono text-zinc-200">{p.icao || '—'}</div>
                    <div className="col-span-6 text-zinc-300 truncate">
                      {p.name || parseFilenameFromUrl(p.url)}
                    </div>
                    <div className="col-span-4 flex items-center justify-end gap-2">
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 flex items-center gap-1"
                        title="Open URL"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        Open
                      </a>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(p.url);
                          setToastConfig({ title: 'Copied', description: 'URL copied', variant: 'success' });
                          setShowToast(true);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 flex items-center gap-1"
                        title="Copy URL"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        Copy
                      </button>
                      <Button
                        variant="destructive"
                        className="px-3! py-1.5! text-xs"
                        onClick={() => doDelete(p)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toast Notifications */}
      <Toast
        title={toastConfig.title}
        description={toastConfig.description}
        variant={toastConfig.variant}
        show={showToast}
        onClose={() => setShowToast(false)}
        duration={5000}
      />
    </div>
  );
};

export default VatSysProfiles;
