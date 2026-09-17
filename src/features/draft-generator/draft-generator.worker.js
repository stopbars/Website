/* oxlint-disable react-doctor/js-combine-iterations -- Worker output keeps validation, diagnostics, and projection stages separate for deterministic reporting. */

import { extractAirportLightData } from './extractor/extract.js';
import { scanInput } from './extractor/scanner.js';
import { mountFiles, unmountFiles } from './shims/virtual-fs.js';
import { matchDivisionObjects } from './matching.js';
import { buildDraftOutput } from './draft-output.js';
import { buildGenerationDiagnostic, diagnosticJsonBlob } from './diagnostics.js';
import { validateAirportUpload } from './airport-upload-validation.js';
import { detectScenerySimulator } from './local-package.js';
import { extractXPlaneAirportData } from './extractor/xplane-apt.js';
import { buildReferenceScene } from '../contribution-editor/reference-scene.js';
import { buildMsfsRemovalContext } from '../contribution-editor/msfs-removal.js';

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
    const transferables = renderBundleTransferables(result.renderBundle);
    self.postMessage({ type: 'complete', id: message.id, result }, transferables);
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
  const simulator = detectScenerySimulator(message.entries);
  postStage(message.id, 'Indexing selected package', 8);
  const input = simulator === 'msfs' ? mountFiles(message.entries) : null;

  try {
    const scanStartedAt = performance.now();
    const fileScan =
      simulator === 'msfs'
        ? await scanInput(input)
        : {
            input: message.packageName || 'X-Plane scenery',
            filesScanned: message.entries.length,
            xmlFiles: [],
            bglFiles: [],
            aptFiles: message.entries
              .filter((entry) => /(^|\/)apt\.dat$/i.test(String(entry.path).replaceAll('\\', '/')))
              .map((entry) => entry.path),
            dsfFiles: message.entries
              .filter((entry) =>
                /(^|\/)[+-]\d{2}[+-]\d{3}\.dsf$/i.test(String(entry.path).replaceAll('\\', '/'))
              )
              .map((entry) => entry.path),
            unsupportedFiles: [],
          };
    timings.packageScan = round(performance.now() - scanStartedAt, 3);
    if (simulator === 'msfs' && fileScan.bglFiles.length === 0 && fileScan.xmlFiles.length === 0) {
      throw new Error('No BGL or XML scenery files were found in the selected folder.');
    }

    postStage(
      message.id,
      simulator === 'xplane'
        ? 'Reading X-Plane airport data, DSF lights, and markings'
        : 'Reading BGL data and detecting simulator lights',
      28
    );
    const extractionStartedAt = performance.now();
    const data =
      simulator === 'xplane'
        ? await extractXPlaneAirportData({
            entries: message.entries,
            icao: message.icao,
            packageName: message.packageName,
            airportPosition: message.airportPosition,
            onProgress: ({ fraction }) => {
              postStage(
                message.id,
                `Scanning X-Plane airport data · ${Math.round(fraction * 100)}%`,
                28 + Math.round(fraction * 30)
              );
            },
          })
        : await extractAirportLightData({
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

    postStage(
      message.id,
      simulator === 'xplane'
        ? 'Preparing X-Plane source selectors'
        : 'Building selective, protected removal areas',
      84
    );
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
    let renderBundle = null;
    let referenceData = data;
    if (simulator === 'msfs' && fileScan.bglFiles.length > 0) {
      postStage(message.id, 'Building MSFS editor reference scenery', 96);
      const msfsSource = await decodeMsfsSource(message.entries, ({ fraction, stage }) =>
        postStage(message.id, stage || 'Decoding MSFS scenery', 96 + Math.round(fraction * 3))
      );
      renderBundle = msfsSource.renderBundle;
      referenceData = {
        ...data,
        referenceFeatures: [...(data.referenceFeatures || []), ...msfsSource.referenceFeatures],
        runways: msfsSource.runways.length ? msfsSource.runways : data.runways,
        referenceDiagnostics: msfsSource.diagnostics,
      };
    } else if (simulator === 'msfs') {
      renderBundle = {
        version: 1,
        groups: [],
        textures: [],
        diagnostics: { warnings: ['No compiled BGL render groups were available.'] },
      };
    }
    const referenceScene = buildReferenceScene(referenceData, simulator);
    const referenceSceneBlob = new Blob([JSON.stringify(referenceScene)], {
      type: 'application/json',
    });
    const manualReview = output.unmatched.map((item) => ({
      id: String(item.division?.id ?? ''),
      name: item.division?.name || String(item.division?.id || 'Unmatched object'),
      type: item.division?.type || 'unknown',
      reason: item.reason,
    }));
    timings.beforeDiagnostic = round(performance.now() - startedAt, 3);
    let diagnosticBlob = null;
    let diagnosticError = '';
    if (includeDiagnostics) {
      try {
        diagnosticBlob = diagnosticJsonBlob(
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
        );
      } catch (error) {
        diagnosticError =
          error instanceof Error ? error.message : 'Development diagnostic serialization failed.';
        console.warn('Draft generated without the optional development diagnostic.', error);
      }
    }

    return {
      xmlBlob,
      geojsonBlob,
      simulatorGeojsonBlob,
      referenceSceneBlob,
      renderBundle,
      removalContext: simulator === 'msfs' ? buildMsfsRemovalContext(data) : null,
      simulator,
      bounds: featureBounds(output.geojson.features),
      matchedCount: new Set(output.matched.map((match) => String(match.division.id))).size,
      manualCount: manualReview.length,
      manualReview,
      duplicateDivisionLeadOns: output.duplicateDivisionLeadOns.length,
      duplicateSimulatorLeadOns: output.duplicateSimulatorLeadOns.length,
      elapsedSeconds: round((performance.now() - startedAt) / 1000, 1),
      sourceSummary: {
        simulator,
        filesScanned: fileScan.filesScanned,
        bglFilesParsed: data.meta.bglFilesParsed,
        xmlFilesParsed: data.meta.xmlFilesParsed,
        aptDatFilesParsed: data.meta.aptDatFilesParsed,
        aptDatSourceFile: data.meta.aptDatSourceFile,
        dsfFilesDecoded: data.meta.dsfFilesDecoded,
        dsfLightStringsDecoded: data.meta.dsfLightStringsDecoded,
        dsfPaintedLinesDecoded: data.meta.dsfPaintedLinesDecoded,
        dsfLightObjectsDecoded: data.meta.dsfLightObjectsDecoded,
        ...(diagnosticError ? { diagnosticError } : {}),
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
