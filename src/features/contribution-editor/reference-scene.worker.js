import { extractAirportLightData } from '../draft-generator/extractor/extract.js';
import { extractXPlaneAirportData } from '../draft-generator/extractor/xplane-apt.js';
import { scanInput } from '../draft-generator/extractor/scanner.js';
import { detectScenerySimulator } from '../draft-generator/local-package.js';
import { mountFiles, unmountFiles } from '../draft-generator/shims/virtual-fs.js';
import { buildReferenceScene } from './reference-scene.js';
import { resolveXPlaneReferenceTextures } from './xplane-texture-resolution.js';

const DEFAULT_SIZES = { library: 3, vfx: 3, simprop: 8, lightrow: 2 };

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
    self.postMessage({ type: 'complete', id: message.id, result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    unmountFiles();
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
    const input = mountFiles(message.entries);
    const scan = await scanInput(input);
    if (scan.bglFiles.length === 0 && scan.xmlFiles.length === 0) {
      throw new Error('No BGL or XML scenery files were found in the selected folder.');
    }
    postStage(message.id, 'Decoding MSFS airport geometry', 35);
    data = await extractAirportLightData({
      input: scan.input,
      icao: message.icao,
      filesScanned: scan.filesScanned,
      xmlFiles: scan.xmlFiles,
      bglFiles: scan.bglFiles,
      unsupportedFiles: scan.unsupportedFiles,
      sizes: DEFAULT_SIZES,
      buildRemovals: false,
    });
  }
  postStage(message.id, 'Preparing editor reference layers', 90);
  const scene = buildReferenceScene(data, simulator);
  return {
    simulator,
    scene,
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

function postStage(id, stage, progress) {
  self.postMessage({ type: 'stage', id, stage, progress });
}
