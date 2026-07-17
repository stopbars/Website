export function createHash(algorithm) {
  if (String(algorithm).toLowerCase() !== "sha1") {
    throw new Error(`Unsupported browser hash: ${algorithm}`);
  }
  let value = "";
  return {
    update(chunk) {
      value += String(chunk);
      return this;
    },
    digest(encoding) {
      if (encoding !== "hex") throw new Error(`Unsupported browser digest: ${encoding}`);
      return sha1(value);
    }
  };
}

// Compact synchronous SHA-1 keeps stable extractor IDs identical in Node and browsers.
function sha1(value) {
  const bytes = new TextEncoder().encode(value);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 80; index += 1) {
      const word = words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16];
      words[index] = (word << 1) | (word >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let index = 0; index < 80; index += 1) {
      const f = index < 20 ? (b & c) | (~b & d)
        : index < 40 ? b ^ c ^ d
          : index < 60 ? (b & c) | (b & d) | (c & d)
            : b ^ c ^ d;
      const k = index < 20 ? 0x5a827999 : index < 40 ? 0x6ed9eba1 : index < 60 ? 0x8f1bbcdc : 0xca62c1d6;
      const rotated = (a << 5) | (a >>> 27);
      const next = (rotated + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = next;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].map((word) => word.toString(16).padStart(8, "0")).join("");
}
