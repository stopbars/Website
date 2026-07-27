import { extractAirportLightData } from './extractor/extract.js';
import { scanInput } from './extractor/scanner.js';
import { mountFiles, unmountFiles } from './shims/virtual-fs.js';
import { matchDivisionObjects } from './matching.js';
import { buildDraftOutput } from './draft-output.js';
import { buildGenerationDiagnostic, diagnosticJsonBlob } from './diagnostics.js';
import { validateAirportUpload } from './airport-upload-validation.js';

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
  const timings = {};
  const includeDiagnostics = import.meta.env.DEV && message.includeDiagnostics === true;
  postStage(message.id, 'Indexing selected package', 8);
  const input = mountFiles(message.entries);

  try {
    const scanStartedAt = performance.now();
    const fileScan = await scanInput(input);
    timings.packageScan = round(performance.now() - scanStartedAt, 3);
    if (fileScan.bglFiles.length === 0 && fileScan.xmlFiles.length === 0) {
      throw new Error('No BGL or XML scenery files were found in the selected folder.');
    }

    postStage(message.id, 'Reading BGL data and detecting simulator lights', 28);
    const extractionStartedAt = performance.now();
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
    timings.extraction = round(performance.now() - extractionStartedAt, 3);

    postStage(message.id, 'Verifying selected airport', 64);
    const validationStartedAt = performance.now();
    const airportValidation = validateAirportUpload({
      icao: message.icao,
      airportPosition: message.airportPosition,
      divisionPoints: message.divisionPoints,
      data,
    });
    data.meta.airportValidation = airportValidation;
    timings.airportValidation = round(performance.now() - validationStartedAt, 3);

    postStage(message.id, 'Aligning division objects to simulator geometry', 70);
    const matchingStartedAt = performance.now();
    const matching = matchDivisionObjects(message.divisionPoints, data.lightRows, data.instances, {
      includeDiagnostics,
      runways: data.runways,
    });
    timings.matching = round(performance.now() - matchingStartedAt, 3);

    postStage(message.id, 'Building selective, protected removal areas', 84);
    const outputStartedAt = performance.now();
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
    timings.output = round(performance.now() - outputStartedAt, 3);

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
    timings.beforeDiagnostic = round(performance.now() - startedAt, 3);
    const diagnosticBlob = includeDiagnostics
      ? diagnosticJsonBlob(
          buildGenerationDiagnostic({
            request: message,
            entries: message.entries,
            fileScan,
            data,
            matching,
            output,
            timings,
            environment: {
              userAgent: self.navigator?.userAgent,
              workerLocation: self.location?.href,
            },
          })
        )
      : null;

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
      ...(diagnosticBlob ? { diagnosticBlob } : {}),
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
