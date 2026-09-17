const SIGNATURE = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
const MAX_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_DSF_BYTES = 256 * 1024 * 1024;

export async function decodeXPlaneDsfBytes(buffer, createDecoder) {
  const bytes = new Uint8Array(buffer);
  if (!SIGNATURE.every((value, index) => bytes[index] === value)) return buffer;
  if (bytes.length > MAX_COMPRESSED_BYTES) throw new Error('Compressed DSF exceeds 64 MB.');
  const lines = [];
  const factory =
    createDecoder ?? (await import('./xplane-dsf-compression-runtime.js')).createDsfDecoder;
  const decoder = await factory({ print: (line) => lines.push(line), printErr: () => {} });
  decoder.FS.writeFile('/source.7z', bytes);
  if (decoder.callMain(['l', '-slt', '/source.7z']) !== 0)
    throw new Error('Cannot read compressed DSF archive.');
  const sizes = lines
    .filter((line) => /^Size = \d+$/.test(line))
    .map((line) => Number(line.slice(7)));
  if (sizes.length !== 1 || sizes[0] < 28 || sizes[0] > MAX_DSF_BYTES)
    throw new Error('A compressed DSF must contain one file no larger than 256 MB.');
  decoder.FS.mkdir('/decoded');
  if (decoder.callMain(['e', '-y', '-o/decoded', '/source.7z']) !== 0)
    throw new Error('Cannot decompress DSF.');
  const names = decoder.FS.readdir('/decoded').filter((name) => name !== '.' && name !== '..');
  if (names.length !== 1) throw new Error('Compressed DSF contains multiple files.');
  const result = decoder.FS.readFile(`/decoded/${names[0]}`);
  if (result.length !== sizes[0] || new TextDecoder().decode(result.subarray(0, 8)) !== 'XPLNEDSF')
    throw new Error('Archive does not contain a valid DSF.');
  return result.slice().buffer;
}
