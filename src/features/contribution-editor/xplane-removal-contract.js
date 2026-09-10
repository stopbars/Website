const HASH = /^[a-f0-9]{64}$/;
const TILE = /^Earth nav data\/[+-]\d{2}[+-]\d{3}\/[+-]\d{2}[+-]\d{3}\.dsf$/;

export function dsfSelector(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || !['dsf-string', 'dsf-object'].includes(value.kind)) return null;
  if (
    (value.start !== undefined && value.start !== 0) ||
    (value.end !== undefined && value.end !== 1)
  )
    return null;
  const { kind, source, sha256, definition, command, pool, filter, index } = value;
  if (
    !TILE.test(source) ||
    !HASH.test(sha256) ||
    typeof definition !== 'string' ||
    definition.length > 512 ||
    /[<>"&]/.test(definition) ||
    [...definition].some((character) => character.charCodeAt(0) < 32) ||
    !definition.endsWith(kind === 'dsf-string' ? '.str' : '.obj') ||
    ![command, pool, filter, index].every(Number.isInteger) ||
    command < 12 ||
    command > 0x7fffffff ||
    pool < 0 ||
    pool > 65535 ||
    filter < -1 ||
    filter > 0x7fffffff ||
    index < 0 ||
    index > 65535
  )
    return null;
  return { kind, source, sha256, definition, command, pool, filter, index, start: 0, end: 1 };
}

export function dsfSelectorKey(value) {
  const selector = dsfSelector(value);
  return selector
    ? `${selector.kind}:${selector.source}:${selector.sha256}:${selector.command}:${selector.pool}:${selector.filter}:${selector.index}`
    : '';
}

export function xplaneSelectorXml(selector) {
  if (selector.kind?.startsWith('dsf-')) {
    const valid = dsfSelector(selector);
    if (!valid || selector.start !== 0 || selector.end !== 1)
      throw new Error('Invalid DSF removal. Select a complete source string or placement.');
    return `\t\t<Dsf kind="${valid.kind}" source="${valid.source}" sha256="${valid.sha256}" definition="${valid.definition}" command="${valid.command}" pool="${valid.pool}" filter="${valid.filter}" index="${valid.index}"/>`;
  }
  return `\t\t<Light feature="${selector.feature}" code="${selector.code}" run="${selector.run}" start="${selector.start.toFixed(6)}" end="${selector.end.toFixed(6)}"/>`;
}
