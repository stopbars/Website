import {
  createTextureEntryIndex,
  findTextureEntry,
} from '../contribution-editor/texture-assets.js';

export function reconnectMsfsRenderBundleFiles(bundle, entries) {
  if (!bundle?.textures?.length || !entries?.length) return bundle;
  const entryIndex = createTextureEntryIndex(entries);
  let changed = false;
  const textures = bundle.textures.map((descriptor) => {
    if (descriptor.image) return descriptor;
    const entry = descriptor.path ? findTextureEntry(entryIndex, descriptor.path) : null;
    const matchingEntry = entry ?? findMatchingMsfsTextureEntry(entries, descriptor.file);
    const file = matchingEntry?.file || matchingEntry;
    if (!file || file === descriptor.file) return descriptor;
    changed = true;
    return { ...descriptor, file };
  });
  return changed ? { ...bundle, textures } : bundle;
}

export function findMatchingMsfsTextureEntry(entries, textureFile) {
  const exactEntry = (entries ?? []).find((entry) => (entry.file || entry) === textureFile);
  if (exactEntry) return exactEntry;
  const name = String(textureFile?.name || '').toLowerCase();
  const size = Number(textureFile?.size);
  if (!name) return null;
  return (entries ?? []).find((entry) => {
    const file = entry.file || entry;
    return (
      String(file?.name || '').toLowerCase() === name &&
      (!Number.isFinite(size) || Number(file?.size) === size)
    );
  });
}
