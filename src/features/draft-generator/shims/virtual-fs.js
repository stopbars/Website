import { Buffer } from "node:buffer";
import path from "./path.js";

const files = new Map();
const directories = new Map();
const outputs = new Map();

export function mountFiles(entries, root = "/package") {
  unmountFiles();
  ensureDirectory(path.resolve(root));

  for (const entry of entries) {
    const relativePath = String(entry.path ?? entry.file?.name ?? "")
      .replaceAll("\\", "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .join("/");
    if (!relativePath) continue;
    const fullPath = path.resolve(root, relativePath);
    files.set(fullPath, {
      file: entry.file,
      size: entry.file?.size ?? entry.size ?? 0,
      lastModified: entry.file?.lastModified ?? entry.lastModified ?? 0
    });
    addToDirectory(fullPath);
  }
  return path.resolve(root);
}

export function unmountFiles() {
  files.clear();
  directories.clear();
  outputs.clear();
}

function addToDirectory(filePath) {
  const parts = filePath.split("/").filter(Boolean);
  let current = "/";
  for (let index = 0; index < parts.length - 1; index += 1) {
    const parent = current;
    current = path.join(current, parts[index]);
    ensureDirectory(parent).set(parts[index], "directory");
    ensureDirectory(current);
  }
  ensureDirectory(current).set(parts.at(-1), "file");
}

function ensureDirectory(directoryPath) {
  const normalized = path.resolve(directoryPath);
  if (!directories.has(normalized)) directories.set(normalized, new Map());
  return directories.get(normalized);
}

function dirent(name, kind) {
  return {
    name,
    isFile: () => kind === "file",
    isDirectory: () => kind === "directory",
    isSymbolicLink: () => false
  };
}

export const promises = {
  async stat(value) {
    const resolved = path.resolve(value);
    const file = files.get(resolved);
    if (file) {
      return {
        size: file.size,
        mtimeMs: file.lastModified,
        isFile: () => true,
        isDirectory: () => false
      };
    }
    if (directories.has(resolved)) {
      return { size: 0, mtimeMs: 0, isFile: () => false, isDirectory: () => true };
    }
    throw fileError("ENOENT", value);
  },

  async readdir(value, options = {}) {
    const resolved = path.resolve(value);
    const entries = directories.get(resolved);
    if (!entries) throw fileError("ENOENT", value);
    const sorted = [...entries].sort(([left], [right]) => left.localeCompare(right));
    return options?.withFileTypes ? sorted.map(([name, kind]) => dirent(name, kind)) : sorted.map(([name]) => name);
  },

  async readFile(value, encoding) {
    const resolved = path.resolve(value);
    if (outputs.has(resolved)) {
      const output = outputs.get(resolved);
      return encoding ? output.toString(encoding) : output;
    }
    const record = files.get(resolved);
    if (!record?.file) throw fileError("ENOENT", value);
    if (encoding) return record.file.text();
    return Buffer.from(await record.file.arrayBuffer());
  },

  async writeFile(value, data) {
    outputs.set(path.resolve(value), Buffer.from(data));
  },

  async mkdir(value) {
    ensureDirectory(value);
  }
};

export function createReadStream(value, options = {}) {
  const resolved = path.resolve(value);
  const highWaterMark = options.highWaterMark ?? 64 * 1024;
  return {
    async *[Symbol.asyncIterator]() {
      const record = files.get(resolved);
      if (!record?.file) throw fileError("ENOENT", value);
      for (let offset = 0; offset < record.file.size; offset += highWaterMark) {
        const chunk = record.file.slice(offset, Math.min(offset + highWaterMark, record.file.size));
        yield Buffer.from(await chunk.arrayBuffer());
      }
    }
  };
}

function fileError(code, value) {
  const error = new Error(`${code}: no such file or directory, '${value}'`);
  error.code = code;
  return error;
}
