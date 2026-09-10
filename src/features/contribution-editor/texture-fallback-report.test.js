import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextureFallbackReport } from './texture-fallback-report.js';

test('creates a compact texture fallback report from a selected source object', () => {
  const report = createTextureFallbackReport({
    airportIcao: 'egkk',
    simulator: 'msfs',
    expectedAppearance: 'A worn yellow taxiway centreline',
    clickedCoordinate: [-0.19, 51.15],
    renderedLayerId: 'reference-painted-lines',
    feature: {
      id: 'surface-493',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-0.2, 51.1],
          [-0.18, 51.2],
        ],
      },
      properties: {
        title: 'Taxiway paint',
        textureAssetPath: 'MaterialLibs/paint.dds',
        fallbackReason: 'unresolved-material',
        fallbackRenderMode: 'geometry-only',
        fallbackEvidenceBasis: 'missing-source-alpha',
        fallbackAreaSquareMeters: 42.5,
        triangleCount: 12,
        priority: 3,
        groundMerging: false,
        materialColoration: '{"red":0,"green":0,"blue":0,"alpha":0}',
        hugeDiagnosticObject: { omitted: true },
        unrelatedValue: 'omitted',
      },
    },
    textureStatus: { phase: 'ready', loaded: 12, failed: 1, privateCounter: 99 },
  });

  assert.equal(report.airportIcao, 'EGKK');
  assert.equal(report.expectedAppearance, 'A worn yellow taxiway centreline');
  assert.deepEqual(report.selectedObject.bounds, [-0.2, 51.1, -0.18, 51.2]);
  assert.equal(report.selectedObject.coordinateCount, 2);
  assert.equal(report.selectedObject.componentCount, 1);
  assert.ok(report.selectedObject.boundsSizeMeters.area > 0);
  assert.ok(report.selectedObject.pathLengthMeters > 0);
  assert.deepEqual(report.sourceProperties, {
    fallbackAreaSquareMeters: 42.5,
    fallbackEvidenceBasis: 'missing-source-alpha',
    fallbackReason: 'unresolved-material',
    fallbackRenderMode: 'geometry-only',
    groundMerging: false,
    materialColoration: { red: 0, green: 0, blue: 0, alpha: 0 },
    priority: 3,
    textureAssetPath: 'MaterialLibs/paint.dds',
    title: 'Taxiway paint',
    triangleCount: 12,
  });
  assert.deepEqual(report.fallbackEvaluation, {
    renderMode: 'geometry-only',
    basis: 'missing-source-alpha',
    metrics: { areaSquareMeters: 42.5, reason: 'unresolved-material' },
  });
  assert.equal(report.renderer.failed, 1);
  assert.equal('privateCounter' in report.renderer, false);
});
