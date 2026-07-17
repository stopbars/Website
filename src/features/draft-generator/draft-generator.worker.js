import { extractAirportLightData } from './extractor/extract.js';
import { scanInput } from './extractor/scanner.js';
import { mountFiles, unmountFiles } from './shims/virtual-fs.js';
import { matchDivisionObjects } from './matching.js';
import { buildDraftOutput } from './draft-output.js';

const DEFAULT_SIZES = {
  library: 3,
  vfx: 3,
  simprop: 8,
  lightrow: 2,
};

self.addEventListener('message', async (event) => {
  const message = event.data;
  if (message?.type !== 'generate') return;

  try {
    const result = await generateDraft(message);
    self.postMessage({ type: 'complete', id: message.id, result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      id: message.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
});

async function generateDraft(message) {
  const startedAt = performance.now();
  postStage(message.id, 'Indexing selected package', 8);
  const input = mountFiles(message.entries);

  try {
    const fileScan = await scanInput(input);
    if (fileScan.bglFiles.length === 0 && fileScan.xmlFiles.length === 0) {
      throw new Error('No BGL or XML scenery files were found in the selected folder.');
    }

    postStage(message.id, 'Reading BGL data and detecting simulator lights', 28);
    const data = await extractAirportLightData({
      input: fileScan.input,
      icao: message.icao,
      filesScanned: fileScan.filesScanned,
      xmlFiles: fileScan.xmlFiles,
      bglFiles: fileScan.bglFiles,
      unsupportedFiles: fileScan.unsupportedFiles,
      sizes: DEFAULT_SIZES,
      buildRemovals: false,
    });

    postStage(message.id, 'Aligning division objects to simulator geometry', 70);
    const matching = matchDivisionObjects(
      message.divisionPoints,
      data.lightRows,
      data.instances,
      data.topologyRows
    );

    postStage(message.id, 'Building selective, protected removal areas', 84);
    const output = buildDraftOutput(data, matching, {
      icao: message.icao,
      altitude: message.altitude,
      onProgress: ({ pass, maxPasses, remaining }) => {
        postStage(
          message.id,
          `Checking protected lighting · pass ${pass} · ${remaining} candidates`,
          84 + Math.round(((pass - 1) / maxPasses) * 10)
        );
      },
    });

    postStage(message.id, 'Preparing draft and map preview', 95);
    const xmlBlob = new Blob([output.xml], { type: 'application/xml' });
    const geojsonBlob = new Blob([JSON.stringify(output.geojson)], {
      type: 'application/geo+json',
    });
    const simulatorGeojsonBlob = new Blob([JSON.stringify(output.simulatorGeojson)], {
      type: 'application/geo+json',
    });
    const manualReview = output.unmatched.map((item) => ({
      id: String(item.division?.id ?? ''),
      name: item.division?.name || String(item.division?.id || 'Unmatched object'),
      type: item.division?.type || 'unknown',
      reason: item.reason,
    }));
    const removalReview = output.removalWarnings.map((item) => ({
      id: String(item.division?.id ?? ''),
      name: item.division?.name || String(item.division?.id || 'Matched object'),
      type: item.division?.type || 'unknown',
      reason: item.reason,
    }));

    return {
      xmlBlob,
      geojsonBlob,
      simulatorGeojsonBlob,
      bounds: featureBounds(output.geojson.features),
      matchedCount: new Set(output.matched.map((match) => String(match.division.id))).size,
      manualCount: manualReview.length,
      manualReview,
      removalReview,
      duplicateDivisionLeadOns: output.duplicateDivisionLeadOns.length,
      duplicateSimulatorLeadOns: output.duplicateSimulatorLeadOns.length,
      elapsedSeconds: round((performance.now() - startedAt) / 1000, 1),
      sourceSummary: {
        filesScanned: fileScan.filesScanned,
        bglFilesParsed: data.meta.bglFilesParsed,
        xmlFilesParsed: data.meta.xmlFilesParsed,
      },
    };
  } finally {
    unmountFiles();
  }
}

function postStage(id, stage, progress) {
  self.postMessage({ type: 'stage', id, stage, progress });
}

function featureBounds(features) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const feature of features) {
    visitCoordinates(feature.geometry?.coordinates, (lon, lat) => {
      bounds[0] = Math.min(bounds[0], lon);
      bounds[1] = Math.min(bounds[1], lat);
      bounds[2] = Math.max(bounds[2], lon);
      bounds[3] = Math.max(bounds[3], lat);
    });
  }
  return bounds.every(Number.isFinite) ? bounds : undefined;
}

function visitCoordinates(value, callback) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    callback(value[0], value[1]);
    return;
  }
  for (const child of value) visitCoordinates(child, callback);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
