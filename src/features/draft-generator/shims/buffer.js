const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder("utf-8");

// The extractor only needs this small, binary-read-focused subset of Node Buffer.
// Keeping it local avoids shipping the general-purpose Buffer polyfill in the worker.
export class Buffer extends Uint8Array {
  static from(value, encoding) {
    if (typeof value === "string") {
      if (encoding && !["ascii", "utf8", "utf-8"].includes(encoding.toLowerCase())) {
        throw new Error(`Unsupported browser Buffer encoding: ${encoding}`);
      }
      return new Buffer(UTF8_ENCODER.encode(value));
    }
    if (value instanceof ArrayBuffer) return new Buffer(value);
    if (ArrayBuffer.isView(value)) {
      return new Buffer(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    if (Array.isArray(value)) return new Buffer(value);
    throw new TypeError("Unsupported browser Buffer input");
  }

  static alloc(size) {
    return new Buffer(size);
  }

  static concat(values, totalLength = values.reduce((sum, value) => sum + value.length, 0)) {
    const result = new Buffer(totalLength);
    let offset = 0;
    for (const value of values) {
      const remaining = totalLength - offset;
      if (remaining <= 0) break;
      result.set(value.subarray(0, remaining), offset);
      offset += Math.min(value.length, remaining);
    }
    return result;
  }

  toString(encoding = "utf8", start = 0, end = this.length) {
    const bytes = this.subarray(start, end);
    const normalized = encoding.toLowerCase();
    if (normalized === "hex") {
      return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    if (!["ascii", "utf8", "utf-8"].includes(normalized)) {
      throw new Error(`Unsupported browser Buffer encoding: ${encoding}`);
    }
    return UTF8_DECODER.decode(bytes);
  }

  indexOf(value, byteOffset = 0) {
    if (typeof value === "number") return super.indexOf(value, byteOffset);
    const needle = typeof value === "string" ? Buffer.from(value) : value;
    if (!needle?.length) return Math.min(Math.max(byteOffset, 0), this.length);
    const start = Math.max(byteOffset < 0 ? this.length + byteOffset : byteOffset, 0);
    const lastStart = this.length - needle.length;
    let offset = start;
    while ((offset = super.indexOf(needle[0], offset)) !== -1 && offset <= lastStart) {
      let matches = true;
      for (let index = 1; index < needle.length; index += 1) {
        if (this[offset + index] !== needle[index]) {
          matches = false;
          break;
        }
      }
      if (matches) return offset;
      offset += 1;
    }
    return -1;
  }

  readUInt8(offset) { return this[offset]; }
  readUInt16LE(offset) { return this[offset] | (this[offset + 1] << 8); }
  readInt16LE(offset) {
    const value = this.readUInt16LE(offset);
    return value & 0x8000 ? value - 0x1_0000 : value;
  }
  readUInt32LE(offset) {
    return (this[offset] |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)) >>> 0;
  }
  readInt32LE(offset) { return this.readUInt32LE(offset) | 0; }
  readFloatLE(offset) { return this.view(offset, 4).getFloat32(0, true); }

  view(offset, length) {
    return new DataView(this.buffer, this.byteOffset + offset, length);
  }
}
