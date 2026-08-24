import { useState, useCallback } from 'react';
import { Button } from '../shared/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../shared/Card';
import { Toast } from '../shared/Toast';
import { getVatsimToken } from '../../utils/cookieUtils';
import { Upload, Package, Check, X, Info, FileArchive, RefreshCw } from 'lucide-react';

/** Staff-only tool to upload packages consumed by the Installer. */
// Maximum allowed upload size (frontend enforcement). Backend may still allow larger,
// but UI restricts to 100MB per user request.
const MAX_BYTES = 100 * 1024 * 1024;
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

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
    id: 'xplane-bridge',
    label: 'X-Plane Bridge',
    filename: 'BARSXPlaneBridge.zip',
    description: 'Native X-Plane plugin and model resources.',
    versioned: true,
  },
];

/* oxlint-disable react-doctor/prefer-tag-over-role -- The composite drop zone contains nested action buttons and a file input, so it cannot validly become a native button. */
// oxlint-disable-next-line react-doctor/no-giant-component, react-doctor/prefer-useReducer -- Package selection, drag state, request status, and feedback are independent within one upload workflow.
const PackagesManagement = () => {
  const [selectedType, setSelectedType] = useState('models');
  const [bridgeVersion, setBridgeVersion] = useState('');
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState({
    show: false,
    title: '',
    description: '',
    variant: 'default',
  });
  const [success, setSuccess] = useState(null); // {type,key,size,sha256,url,etag}
  const [uploading, setUploading] = useState(false);
  const [showMeta, setShowMeta] = useState(false);

  const reset = () => {
    setFile(null);
    setToast((t) => ({ ...t, show: false }));
  };

  const validate = useCallback((f) => {
    if (!f) return 'File required';
    const lower = f.name.toLowerCase();
    if (!lower.endsWith('.zip')) return 'File must be a .zip archive (.zip)';
    if (f.size > MAX_BYTES) return 'File exceeds 100MB max size';
    return '';
  }, []);

  const onFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const v = validate(f);
    if (v) {
      setToast({ show: true, title: 'Invalid file', description: v, variant: 'destructive' });
      return;
    }
    setFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const v = validate(f);
    if (v) {
      setToast({ show: true, title: 'Invalid file', description: v, variant: 'destructive' });
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (uploading) return;
    const v = validate(file);
    if (v) {
      setToast({ show: true, title: 'Invalid file', description: v, variant: 'destructive' });
      return;
    }
    const normalizedBridgeVersion = bridgeVersion.trim();
    if (selectedType === 'xplane-bridge' && !SEMVER_REGEX.test(normalizedBridgeVersion)) {
      setToast({
        show: true,
        title: 'Invalid version',
        description: 'Enter a semantic version such as 1.0.3.',
        variant: 'destructive',
      });
      return;
    }
    setToast((t) => ({ ...t, show: false }));
    setSuccess(null);
    try {
      setUploading(true);
      const token = getVatsimToken();
      if (!token) {
        setToast({
          show: true,
          title: 'Not authenticated',
          description: 'Missing auth token. Please log in again.',
          variant: 'destructive',
        });
        setUploading(false);
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', selectedType);
      if (selectedType === 'xplane-bridge') formData.append('version', normalizedBridgeVersion);
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
      // Show toast notification
      setToast({
        show: true,
        title: 'Package uploaded',
        description: 'The package has been uploaded successfully.',
        variant: 'success',
      });
      // Auto-clear file after success to avoid accidental reupload
      setFile(null);
      setShowMeta(true);
      setTimeout(() => setSuccess(null), 15000); // fade success after 15s
    } catch (err) {
      setToast({
        show: true,
        title: 'Upload failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="staff-tool space-y-6">
      <div className="staff-tool-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
            Upload packages consumed by the Installer. A SHA-256 hash is computed server-side and
            stored as metadata. Access is restricted to the{' '}
            <span className="text-zinc-300 font-medium">Lead Developer</span> role.
          </p>
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex gap-2 items-start">
            <Info className="w-4 h-4 mt-0.5" />
            Model packages replace their fixed object. Bridge packages are retained by version, and
            the latest pointer advances only after the archive upload succeeds.
          </div>
        </CardHeader>
        <CardContent>
          {/* Package Type Selector */}
          <div className="flex flex-wrap gap-2 mb-6">
            {PACKAGE_TYPES.map((pt) => {
              const active = selectedType === pt.id;
              return (
                <button
                  type="button"
                  key={pt.id}
                  onClick={() => {
                    setSelectedType(pt.id);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-[background-color,border-color,color,box-shadow,filter,opacity,transform] ${active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700/70'}`}
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

          {selectedType === 'xplane-bridge' && (
            <div className="mb-6 max-w-xs">
              <label
                htmlFor="xplane-bridge-version"
                className="mb-2 block text-sm font-medium text-zinc-200"
              >
                Bridge version
              </label>
              <input
                id="xplane-bridge-version"
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="1.0.3"
                value={bridgeVersion}
                onChange={(event) => setBridgeVersion(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-blue-500"
              />
              <p className="mt-2 text-xs text-zinc-500">
                Semantic version used for the immutable package path and Installer verification.
              </p>
            </div>
          )}

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
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                document.getElementById('bars-package-input').click();
              }
            }}
            role="button"
            tabIndex={0}
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
              aria-label="Package ZIP file"
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={onFileChange}
            />
          </div>

          {success && (
            <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 relative">
              <div className="flex items-start gap-3">
                <Check className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">
                    {PACKAGE_TYPES.find((packageType) => packageType.id === success.type)?.label ||
                      success.type}{' '}
                    package uploaded successfully
                  </p>
                  <p className="text-emerald-300/80 text-[12px] mt-1">
                    SHA-256 hash computed and stored. Cached CDN copies may take a few minutes to
                    refresh.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss upload success message"
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
                  {success.version && (
                    <div>
                      <span className="text-emerald-400/60">Version:</span> {success.version}
                    </div>
                  )}
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
                type="button"
                onClick={() => setShowMeta(!showMeta)}
                className="mt-3 text-xs underline decoration-dotted text-emerald-300/80 hover:text-emerald-200"
              >
                {showMeta ? 'Hide details' : 'Show details'}
              </button>
            </div>
          )}

          <div className="mt-10 text-[11px] text-zinc-500 leading-relaxed border-t border-zinc-800 pt-4">
            <p>
              <strong>Notes:</strong> Model uploads replace the object under their fixed key. Bridge
              versions cannot be overwritten; publish a new version to correct a release. The
              frontend does not compute hashes—the server response is authoritative.
            </p>
          </div>
        </CardContent>
      </Card>

      <Toast
        show={toast.show}
        title={toast.title}
        description={toast.description}
        variant={toast.variant}
        onClose={() => setToast((t) => ({ ...t, show: false }))}
      />
    </div>
  );
};
/* oxlint-enable react-doctor/prefer-tag-over-role */

export default PackagesManagement;
