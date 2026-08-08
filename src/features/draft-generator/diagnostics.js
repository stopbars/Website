export const DRAFT_DIAGNOSTIC_SCHEMA = 'bars-draft-generator-diagnostic/v1';

export function buildGenerationDiagnostic({
  request,
  entries,
  fileScan,
  data,
  matching,
  output,
  timings,
  environment = {},
}) {
  return {
    schema: DRAFT_DIAGNOSTIC_SCHEMA,
    purpose:
      'Complete development trace for reproducing and improving automatic BARS draft matching.',
    generatedAt: new Date().toISOString(),
    environment: {
      mode: 'development',
      ...environment,
    },
    request: {
      icao: request.icao,
      altitudeMeters: request.altitude,
      packageName: request.packageName,
      simulator: data.meta?.simulator ?? 'msfs',
      divisionObjects: request.divisionPoints,
    },
    package: {
      manifest: packageManifest(entries),
      scan: {
        input: fileScan.input,
        filesScanned: fileScan.filesScanned,
        bglFiles: fileScan.bglFiles,
        xmlFiles: fileScan.xmlFiles,
        aptFiles: fileScan.aptFiles,
        dsfFiles: fileScan.dsfFiles,
        unsupportedFiles: fileScan.unsupportedFiles,
      },
    },
    timingsMilliseconds: timings,
    summary: generationSummary(data, matching, output),
    extraction: data,
    matching,
    generation: {
      replacements: output.replacements,
      removalApproved: output.removalApproved,
      placementOnlyMatches: output.placementOnlyMatches,
      removalWarnings: output.removalWarnings,
      removals: output.removals,
      safetyRejections: output.safetyRejections,
      duplicateDivisionLeadOns: output.duplicateDivisionLeadOns,
      duplicateSimulatorLeadOns: output.duplicateSimulatorLeadOns,
      draftXml: output.xml,
      draftPreviewGeojson: output.geojson,
      simulatorDebugGeojson: output.simulatorGeojson,
    },
  };
}

export function diagnosticJsonBlob(diagnostic) {
  return new Blob([JSON.stringify(diagnostic)], {
    type: 'application/json',
  });
}

function packageManifest(entries) {
  return (entries ?? []).map((entry) => ({
    path: entry.path,
    sizeBytes: entry.size,
    lastModifiedUnixMilliseconds: entry.lastModified,
    readableByGenerator: Boolean(entry.file),
    browserFileName: entry.file?.name,
    browserMimeType: entry.file?.type || undefined,
  }));
}

function generationSummary(data, matching, output) {
  const divisionObjectIds = new Set([
    ...matching.matches.map((match) => String(match.division.id)),
    ...matching.unmatched.map((item) => String(item.division?.id ?? '')),
  ]);
  return {
    divisionObjects: divisionObjectIds.size,
    matchedDivisionObjects: new Set(matching.matches.map((match) => String(match.division.id)))
      .size,
    sourceMatches: matching.matches.length,
    unmatchedDivisionObjects: matching.unmatched.length,
    extractedInstances: data.instances?.length ?? 0,
    extractedLightRows: data.lightRows?.length ?? 0,
    runways: data.runways?.length ?? 0,
    mustKeepZones: data.mustKeepZones?.length ?? 0,
    replacementObjects: output.replacements?.length ?? 0,
    removalPolygons: output.removals?.length ?? 0,
    removalWarnings: output.removalWarnings?.length ?? 0,
    safetyRejections: output.safetyRejections?.length ?? 0,
    compatibleRowCandidateEvaluations:
      matching.diagnostics?.compatibleRowCandidateEvaluations?.length ?? 0,
    totalCompatibleRowCandidateEvaluations:
      matching.diagnostics?.compatibleRowCandidateSummary?.totalEvaluations ??
      matching.diagnostics?.compatibleRowCandidateEvaluations?.length ??
      0,
    omittedCompatibleRowCandidateEvaluations:
      matching.diagnostics?.compatibleRowCandidateSummary?.omittedEvaluations ?? 0,
    instanceCandidateEvaluations: matching.diagnostics?.instanceCandidateEvaluations?.length ?? 0,
    eligibleRowCandidateEdges: matching.diagnostics?.pipeline?.eligibleEdges?.length ?? 0,
    allocatedRowCandidateEdges: matching.diagnostics?.pipeline?.allocatedEdges?.length ?? 0,
    acceptedInstanceEdges: matching.diagnostics?.pipeline?.acceptedInstanceEdges?.length ?? 0,
  };
}
