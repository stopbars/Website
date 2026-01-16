import { useState } from 'react';
import { Button } from '../shared/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../shared/Card';
import { getVatsimToken } from '../../utils/cookieUtils';
import {
  Upload,
  Package,
  Check,
  X,
  AlertTriangle,
  Info,
  FileArchive,
  RefreshCw,
} from 'lucide-react';

/**
 * PackagesManagement
 * Staff-only tool to upload installer data packages.
 * CURRENT BACKEND (as of initial implementation) supports only type enum: [models, removals]
 *   - bars-models-2024.zip  (type = models)
 *   - bars-removals.zip     (type = removals)
 * We now also need to support bars-models-2020.zip. This REQUIRES a backend update adding a new
 *  enum value (e.g. models2020) OR an additional field (e.g. version) so that we can select which
 *  models key to overwrite. Until the backend is extended, selecting the 2020 option will attempt
 *  to POST with a tentative type value (`models2020`). If the backend hasn't been updated it will
 *  respond 400 (invalid type) and the UI will surface that error.
 *
 * Endpoint: POST https://v2.stopbars.com/staff/bars-packages/upload
 * Headers:  X-Vatsim-Token
 * multipart/form-data fields:
 *   file: .zip archive
 *   type: one of (models, removals, models2020*)  *pending backend support
 */
// Maximum allowed upload size (frontend enforcement). Backend may still allow larger,
// but UI restricts to 100MB per user request.
const MAX_BYTES = 100 * 1024 * 1024;

const readableSize = (bytes) => {
  if (!bytes && bytes !== 0) return '—';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
};

const PACKAGE_TYPES = [
  {
    id: 'models',
    label: 'Models 2024',
    filename: 'bars-models-2024.zip',
    description: 'MSFS 2024 models package.',
  },
  {
    id: 'models-2020',
    label: 'Models 2020',
    filename: 'bars-models-2020.zip',
    description: 'MSFS 2020 models package.',
  },
  {
    id: 'removals',
    label: 'Removals',
    filename: 'bars-removals.zip',
    description: 'Removals list to override other scenery.',
  },
];

const PackagesManagement = () => {
  const [selectedType, setSelectedType] = useState('models');
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null); // {type,key,size,sha256,url,etag}
  const [uploading, setUploading] = useState(false);
  const [showMeta, setShowMeta] = useState(false);

  const reset = () => {
    setFile(null);
    setError('');
    setUploading(false);
  };

  const validate = (f) => {
    if (!f) return 'File required';
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.zip')) return 'File must be a .zip archive (.zip)';
    if (f.size > MAX_BYTES) return 'File exceeds 100MB max size';
    return '';
  };

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const v = validate(f);
    if (v) {
      setError(v);
      return;
    }
    setFile(f);
    setError('');
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const v = validate(f);
    if (v) {
      setError(v);
      return;
    }
    setFile(f);
    setError('');
  };

  const handleUpload = async () => {
    if (uploading) return;
    const v = validate(file);
    if (v) {
      setError(v);
      return;
    }
    setError('');
    setSuccess(null);
    try {
      setUploading(true);
      const token = getVatsimToken();
      if (!token) {
        setError('Missing auth token');
        setUploading(false);
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', selectedType);
      const res = await fetch('https://v2.stopbars.com/staff/bars-packages/upload', {
        method: 'POST',
        headers: { 'X-Vatsim-Token': token },
        body: formData,
      });
      if (!res.ok) {
        let msg = 'Upload failed';
        try {
          const data = await res.json();
          if (data.error) msg = data.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const data = await res.json();
      setSuccess(data.package || null);
      // Auto-clear file after success to avoid accidental reupload
      setFile(null);
      setShowMeta(true);
      setTimeout(() => setSuccess(null), 15000); // fade success after 15s
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h2 className="text-xl font-semibold text-white">Packages Management</h2>
          <p className="text-sm text-zinc-400 mt-1">Upload installer data packages</p>
        </div>
      </div>

      <Card className="bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <Package className="w-5 h-5 text-blue-400" /> BARS Packages
          </CardTitle>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Upload installer data packages. Each upload overwrites the existing object in storage. A
            SHA-256 hash is computed server-side and stored as metadata. Access is restricted to the{' '}
            <span className="text-zinc-300 font-medium">Lead Developer</span> role.
          </p>
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex gap-2 items-start">
            <Info className="w-4 h-4 mt-0.5" />
            Ensure you select the correct package type before uploading—the backend stores to a
            fixed key; prior version is permanently replaced.
          </div>
        </CardHeader>
        <CardContent>
          {/* Package Type Selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            {PACKAGE_TYPES.map((pt) => {
              const active = selectedType === pt.id;
              return (
                <button
                  key={pt.id}
                  onClick={() => {
                    setSelectedType(pt.id);
                    setError('');
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700/70'}`}
                >
                  {' '}
                  {pt.label}
                </button>
              );
            })}
          </div>
          <div className="mb-6 text-xs text-zinc-400">
            {PACKAGE_TYPES.find((p) => p.id === selectedType)?.description} Expected filename:{' '}
            <code className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700 text-[11px]">
              {PACKAGE_TYPES.find((p) => p.id === selectedType)?.filename}
            </code>
          </div>

          {/* Upload Zone */}
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
            onClick={() => document.getElementById('bars-package-input').click()}
            role="button"
            aria-label="Upload package ZIP via click or drag and drop"
          >
            {file ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-emerald-500/15 rounded-full flex items-center justify-center">
                  <Check className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-zinc-100">{file.name}</p>
                  <p className="text-xs text-zinc-400">
                    {readableSize(file.size)} / 100MB • Click to change
                  </p>
                </div>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpload();
                    }}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload {selectedType}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      reset();
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
                  <FileArchive className="w-7 h-7 text-zinc-400" />
                </div>
                <p className="font-medium text-zinc-200">
                  {dragActive ? 'Drop to upload' : 'Click to select or drag & drop'}
                </p>
                <p className="text-xs text-zinc-400">Provide {selectedType} ZIP (max 100MB)</p>
              </div>
            )}
            <input
              id="bars-package-input"
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={onFileChange}
            />
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError('')} className="text-red-400/70 hover:text-red-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {success && (
            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 relative">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">
                    {success.type === 'models'
                      ? 'Models 2024'
                      : success.type === 'models2020'
                        ? 'Models 2020'
                        : 'Removals'}{' '}
                    package uploaded successfully
                  </p>
                  <p className="text-emerald-300/80 text-[12px] mt-1">
                    SHA-256 hash computed and stored. Cached CDN copies may take a few minutes to
                    refresh.
                  </p>
                </div>
                <button
                  onClick={() => setSuccess(null)}
                  className="text-emerald-400/60 hover:text-emerald-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {showMeta && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[11px] font-mono text-emerald-300/90">
                  <div>
                    <span className="text-emerald-400/60">Key:</span> {success.key}
                  </div>
                  <div>
                    <span className="text-emerald-400/60">Size:</span> {readableSize(success.size)}
                  </div>
                  <div className="col-span-1 sm:col-span-2 break-all">
                    <span className="text-emerald-400/60">SHA256:</span> {success.sha256}
                  </div>
                  {success.etag && (
                    <div>
                      <span className="text-emerald-400/60">ETag:</span> {success.etag}
                    </div>
                  )}
                  {success.url && (
                    <div className="col-span-1 sm:col-span-2 truncate">
                      <span className="text-emerald-400/60">URL:</span>{' '}
                      <a
                        href={success.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-emerald-200"
                      >
                        {success.url}
                      </a>
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => setShowMeta(!showMeta)}
                className="mt-3 text-xs underline decoration-dotted text-emerald-300/80 hover:text-emerald-200"
              >
                {showMeta ? 'Hide details' : 'Show details'}
              </button>
            </div>
          )}

          <div className="mt-10 text-[11px] text-zinc-500 leading-relaxed border-t border-zinc-800 pt-4">
            <p>
              <strong>Notes:</strong> Uploading replaces the previous object under its fixed key.
              The frontend does not compute hashes—trust the server response. If you accidentally
              upload the wrong file, re-upload the correct one immediately; the previous one is no
              longer retained.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PackagesManagement;
