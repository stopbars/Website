import { promises as fs } from "node:fs";
import path from "node:path";

const UNSUPPORTED_EXTENSIONS = new Set([".cgl", ".spb", ".wasm"]);

export async function scanInput(inputPath) {
  const resolvedInput = path.resolve(inputPath);
  const stats = await fs.stat(resolvedInput);
  const allFiles = [];
  const unsupportedFiles = [];

  if (stats.isFile()) {
    allFiles.push(resolvedInput);
  } else if (stats.isDirectory()) {
    await collectFiles(resolvedInput, allFiles);
  } else {
    throw new Error(`Input path is neither a file nor a folder: ${inputPath}`);
  }

  const xmlFiles = [];
  const bglFiles = [];
  for (const file of allFiles) {
    const extension = path.extname(file).toLowerCase();
    if (extension === ".xml") {
      xmlFiles.push(file);
    } else if (extension === ".bgl") {
      bglFiles.push(file);
    } else if (UNSUPPORTED_EXTENSIONS.has(extension)) {
      unsupportedFiles.push(file);
    }
  }

  return {
    input: resolvedInput,
    filesScanned: allFiles.length,
    xmlFiles,
    bglFiles,
    unsupportedFiles
  };
}

async function collectFiles(folder, files) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
}
