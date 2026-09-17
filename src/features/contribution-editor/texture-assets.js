export function createTextureEntryIndex(entries = []) {
  const byPath = new Map();
  const byName = new Map();
  for (const entry of entries) {
    if (!entry?.file) continue;
    const path = normalizeTexturePath(entry.path);
    if (!path) continue;
    byPath.set(path, entry);
    const name = path.split('/').at(-1);
    const matches = byName.get(name) ?? [];
    matches.push({ entry, path });
    byName.set(name, matches);
  }
  return { byPath, byName };
}

export function findTextureEntry(index, requestedPath) {
  const path = normalizeTexturePath(requestedPath);
  if (!path) return null;
  const exact = index?.byPath?.get(path);
  if (exact) return exact;

  const name = path.split('/').at(-1);
  const alternateName = alternateTextureName(name);
  const candidates = [
    ...(index?.byName?.get(name) ?? []),
    ...(alternateName ? index?.byName?.get(alternateName) ?? [] : []),
  ];
  let best = null;
  let bestScore = 0;
  let ambiguous = false;
  for (const candidate of candidates) {
    const segments = commonTrailingSegments(textureStemPath(path), textureStemPath(candidate.path));
    const candidateLength = candidate.path.split('/').length;
    const requestedLength = path.split('/').length;
    if (segments !== Math.min(candidateLength, requestedLength)) continue;
    const score = segments + (candidate.path.endsWith(`/${name}`) || candidate.path === name ? 0.25 : 0);
    if (score > bestScore) {
      best = candidate.entry;
      bestScore = score;
      ambiguous = false;
    } else if (score === bestScore) {
      ambiguous = true;
    }
  }
  return ambiguous ? null : best;
}

export function normalizeTexturePath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.?\/+/, '')
    .replace(/\/+/g, '/')
    .toLowerCase();
}

function commonTrailingSegments(left, right) {
  const leftSegments = left.split('/');
  const rightSegments = right.split('/');
  let count = 0;
  while (
    count < leftSegments.length &&
    count < rightSegments.length &&
    leftSegments[leftSegments.length - 1 - count] ===
      rightSegments[rightSegments.length - 1 - count]
  ) {
    count += 1;
  }
  return count;
}

function alternateTextureName(name) {
  if (/\.png$/i.test(name)) return name.replace(/\.png$/i, '.dds');
  if (/\.dds$/i.test(name)) return name.replace(/\.dds$/i, '.png');
  return '';
}

function textureStemPath(path) {
  return path.replace(/\.(?:dds|png)$/i, '');
}
