/* oxlint-disable react-doctor/js-combine-iterations -- Worker normalization and projection remain separate for deterministic source diagnostics. */

import { extractXPlaneAirportData } from '../draft-generator/extractor/xplane-apt.js';
import { detectScenerySimulator } from '../draft-generator/local-package.js';
import { buildReferenceScene } from './reference-scene.js';
import { buildMsfsRemovalContext } from './msfs-removal.js';
import { resolveXPlaneReferenceTextures } from './xplane-texture-resolution.js';

self.addEventListener('message', async (event) => {
  const message = event.data;
  if (message?.type === 'resolve-xplane-textures') {
    try {
      const result = await resolveXPlaneReferenceTextures(message.scene, message.entries);
      self.postMessage({ type: 'textures-complete', id: message.id, result });
    } catch (error) {
      self.postMessage({
        type: 'error',
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  if (message?.type !== 'extract-reference') return;
  try {
    const result = await extractReferenceScene(message);
    const transferables = renderBundleTransferables(result.renderBundle);
    self.postMessage({ type: 'complete', id: message.id, result }, transferables);
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

async function extractReferenceScene(message) {
  const simulator = detectScenerySimulator(message.entries);
  postStage(message.id, 'Indexing scenery files', 10);
  let data;
  if (simulator === 'xplane') {
    data = await extractXPlaneAirportData({
      entries: message.entries,
      icao: message.icao,
      packageName: message.packageName,
      airportPosition: message.airportPosition,
      onProgress: ({ fraction }) =>
        postStage(message.id, 'Decoding X-Plane airport geometry', 20 + Math.round(fraction * 60)),
    });
  } else {
    postStage(message.id, 'Decoding MSFS airport geometry', 35);
    const hasBgl = message.entries.some((entry) => /\.bgl$/i.test(entry.path));
    if (hasBgl) {
      const [msfsSource, extracted] = await Promise.all([
        decodeMsfsSource(message.entries, ({ fraction, stage }) =>
          postStage(message.id, stage || 'Decoding MSFS scenery', 35 + Math.round(fraction * 50))
        ),
        extractMsfsLightData(message.entries, message.icao),
      ]);
      data = {
        ...extracted,
        referenceFeatures: [
          ...(extracted.referenceFeatures || []),
          ...msfsSource.referenceFeatures,
        ],
        runways: msfsSource.runways,
        referenceDiagnostics: msfsSource.diagnostics,
        meta: {
          ...extracted.meta,
          warnings: msfsSource.diagnostics.unresolvedTextures || [],
        },
        renderBundle: msfsSource.renderBundle,
      };
    } else {
      const [{ extractAirportLightData }, { scanInput }, { mountFiles, unmountFiles }] =
        await Promise.all([
          import('../draft-generator/extractor/extract.js'),
          import('../draft-generator/extractor/scanner.js'),
          import('../draft-generator/shims/virtual-fs.js'),
        ]);
      const input = mountFiles(message.entries);
      try {
        const scan = await scanInput(input);
        data = await extractAirportLightData({
          input: scan.input,
          icao: message.icao,
          filesScanned: scan.filesScanned,
          xmlFiles: scan.xmlFiles,
          bglFiles: [],
          unsupportedFiles: scan.unsupportedFiles,
          sizes: { library: 3, vfx: 3, simprop: 8, lightrow: 2 },
          buildRemovals: false,
        });
      } finally {
        unmountFiles();
      }
      data.renderBundle = { version: 1, groups: [], textures: [], diagnostics: {} };
    }
  }
  postStage(message.id, 'Preparing editor reference layers', 90);
  const scene = buildReferenceScene(data, simulator);
  return {
    simulator,
    scene,
    renderBundle: data.renderBundle || null,
    removalContext: simulator === 'msfs' ? buildMsfsRemovalContext(data) : null,
    sourceSummary: {
      filesScanned: message.entries.length,
      features: scene.features.length,
      aptDatFilesParsed: data.meta?.aptDatFilesParsed ?? 0,
      dsfFilesDecoded: data.meta?.dsfFilesDecoded ?? 0,
      bglFilesParsed: data.meta?.bglFilesParsed ?? 0,
      xmlFilesParsed: data.meta?.xmlFilesParsed ?? 0,
      warnings: data.meta?.warnings ?? [],
    },
  };
}

async function extractMsfsLightData(entries, icao) {
  const [{ extractAirportLightData }, { scanInput }, { mountFiles, unmountFiles }] =
    await Promise.all([
      import('../draft-generator/extractor/extract.js'),
      import('../draft-generator/extractor/scanner.js'),
      import('../draft-generator/shims/virtual-fs.js'),
    ]);
  const input = mountFiles(entries);
  try {
    const scan = await scanInput(input);
    return await extractAirportLightData({
      input: scan.input,
      icao,
      filesScanned: scan.filesScanned,
      xmlFiles: scan.xmlFiles,
      bglFiles: scan.bglFiles,
      unsupportedFiles: scan.unsupportedFiles,
      sizes: { library: 3, vfx: 3, simprop: 8, lightrow: 2 },
      buildRemovals: false,
    });
  } finally {
    unmountFiles();
  }
}

function postStage(id, stage, progress) {
  self.postMessage({ type: 'stage', id, stage, progress });
}

function decodeMsfsSource(entries, onStage) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../msfs-renderer/msfs-render.worker.js', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event) => {
      if (event.data?.type === 'stage') onStage(event.data);
      if (event.data?.type === 'complete') {
        worker.terminate();
        resolve(event.data.result);
      }
      if (event.data?.type === 'error') {
        worker.terminate();
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'MSFS renderer worker failed.'));
    };
    worker.postMessage({ type: 'decode', id: 1, entries });
  });
}

function renderBundleTransferables(bundle) {
  return (bundle?.groups || [])
    .map((group) => group.vertices?.buffer)
    .filter((buffer, index, buffers) => buffer && buffers.indexOf(buffer) === index);
}
