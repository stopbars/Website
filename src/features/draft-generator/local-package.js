const READABLE_EXTENSIONS = new Set(['.xml', '.bgl']);

export function selectionFromInput(fileList) {
  const files = [...(fileList ?? [])];
  if (files.length === 0) return null;

  const firstPath = files[0].webkitRelativePath || files[0].name;
  const rootName = firstPath.split('/')[0] || 'Airport package';
  return selectionFromFiles(files, rootName);
}

export async function selectionFromDrop(dataTransfer) {
  const items = [...(dataTransfer?.items ?? [])].filter((item) => item.kind === 'file');
  if (items.length === 0) return null;

  if (items.some((item) => typeof item.getAsFileSystemHandle === 'function')) {
    try {
      const handles = [];
      for (const item of items) {
        // oxlint-disable-next-line react-doctor/async-await-in-loop -- Preserve browser-provided drop order and per-item fallback behavior.
        const handle = await item.getAsFileSystemHandle?.();
        if (handle) handles.push(handle);
      }
      if (handles.length > 0) return selectionFromModernHandles(handles);
    } catch {
      // Fall through to the widely supported webkit entry API.
    }
  }

  // oxlint-disable-next-line react-doctor/js-flatmap-filter -- Browser drops contain few items and explicit rejection documents unsupported legacy entries.
  const legacyEntries = items.map((item) => item.webkitGetAsEntry?.()).filter(Boolean);
  if (legacyEntries.length > 0) return selectionFromLegacyEntries(legacyEntries);

  return selectionFromFiles([...(dataTransfer?.files ?? [])], 'Dropped package');
}

function selectionFromFiles(files, rootName) {
  return {
    name: rootName,
    entries: files.map((file) => {
      const fullPath = file.webkitRelativePath || file.name;
      const path = fullPath.startsWith(`${rootName}/`)
        ? fullPath.slice(rootName.length + 1)
        : fullPath;
      return entryForFile(path, file);
    }),
  };
}

async function selectionFromModernHandles(handles) {
  const entries = [];
  const singleDirectory = handles.length === 1 && handles[0].kind === 'directory';

  for (const handle of handles) {
    if (handle.kind === 'directory') {
      await collectDirectory(handle, singleDirectory ? '' : handle.name, entries);
    } else {
      const file = await handle.getFile();
      entries.push(entryForFile(handle.name, file));
    }
  }

  return {
    name: singleDirectory ? handles[0].name : 'Dropped package',
    entries,
  };
}

async function collectDirectory(directory, prefix, entries) {
  for await (const [name, handle] of directory.entries()) {
    const relativePath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      await collectDirectory(handle, relativePath, entries);
    } else {
      const file = await handle.getFile();
      entries.push(entryForFile(relativePath, file));
    }
  }
}

async function selectionFromLegacyEntries(rootEntries) {
  const entries = [];
  const singleDirectory = rootEntries.length === 1 && rootEntries[0].isDirectory;

  for (const entry of rootEntries) {
    if (entry.isDirectory) {
      // oxlint-disable-next-line react-doctor/async-await-in-loop -- Legacy FileSystemEntry traversal is ordered and mutates the shared entries accumulator.
      await collectLegacyDirectory(entry, singleDirectory ? '' : entry.name, entries);
    } else {
      await collectLegacyFile(entry, entry.name, entries);
    }
  }

  return {
    name: singleDirectory ? rootEntries[0].name : 'Dropped package',
    entries,
  };
}

async function collectLegacyDirectory(directoryEntry, prefix, entries) {
  const children = await readAllLegacyEntries(directoryEntry.createReader());
  for (const child of children) {
    const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
    // oxlint-disable-next-line react-doctor/async-await-in-loop -- Recursive traversal appends to a shared ordered accumulator.
    if (child.isDirectory) await collectLegacyDirectory(child, relativePath, entries);
    else await collectLegacyFile(child, relativePath, entries);
  }
}

async function collectLegacyFile(fileEntry, relativePath, entries) {
  const file = await new Promise((resolve, reject) => fileEntry.file(resolve, reject));
  entries.push(entryForFile(relativePath, file));
}

async function readAllLegacyEntries(reader) {
  const entries = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

function entryForFile(path, file) {
  const readable = READABLE_EXTENSIONS.has(fileExtension(path));
  return {
    path,
    ...(readable ? { file } : {}),
    size: file.size,
    lastModified: file.lastModified,
  };
}

function fileExtension(value) {
  const name = String(value).split('/').at(-1) || '';
  const index = name.lastIndexOf('.');
  return index <= 0 ? '' : name.slice(index).toLowerCase();
}
