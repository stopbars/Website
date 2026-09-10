const EXPIRED_PROOF_PATTERN = /\b(expir(?:ed|y)|generation[^.]*not found|test[^.]*not found)\b/i;
const MISMATCHED_PROOF_PATTERN = /\b(mismatch|does not match|changed|hash|different draft)\b/i;

export function contributionSubmissionProof(state) {
  return {
    generationToken: typeof state?.generationToken === 'string' ? state.generationToken.trim() : '',
    generationHash: typeof state?.generationHash === 'string' ? state.generationHash.trim() : '',
    testedSimulator: typeof state?.simulator === 'string' ? state.simulator : '',
  };
}

export function contributionProofError(proof, simulator) {
  if (!proof.generationToken || !proof.generationHash) {
    return 'Your tested draft proof is missing. Return to Test, prepare the draft again, then continue to Submit.';
  }
  if (proof.testedSimulator && proof.testedSimulator !== simulator) {
    return 'The simulator changed after testing. Return to Test and prepare this draft for the selected simulator again.';
  }
  return '';
}

export function contributionSubmissionError(status, message) {
  const detail = String(message ?? '').trim();
  if (status === 410 || EXPIRED_PROOF_PATTERN.test(detail)) {
    return 'Your test has expired. Return to Test, prepare the same draft again, then resubmit it.';
  }
  if (status === 409 || MISMATCHED_PROOF_PATTERN.test(detail)) {
    return 'The submitted draft no longer matches the tested version. Return to Test and prepare the current draft again.';
  }
  return detail || 'Failed to submit contribution';
}

export function publicationError(decision) {
  const publication = decision?.publication ?? decision?.publicationResult;
  const publishedPairConfirmed =
    Boolean(publication?.artifactIdentity) &&
    Boolean(publication?.generationId) &&
    Boolean(publication?.removal?.key) &&
    Boolean(publication?.removal?.etag) &&
    Boolean(publication?.bars?.key) &&
    Boolean(publication?.bars?.etag);
  if (publishedPairConfirmed) return '';

  return (
    publication?.error ??
    decision?.publicationError ??
    'Core did not confirm that both publication artifacts were published. The contribution remains open for review; retry approval after Core is healthy.'
  );
}

export function publishedBarsArtifactDescriptor(contribution) {
  const key =
    typeof contribution?.barsArtifactKey === 'string'
      ? contribution.barsArtifactKey.trim().replace(/^\/+/, '')
      : '';
  if (!key) return null;

  return {
    key,
    fileName: key.split('/').at(-1) || `contribution-${contribution.id ?? 'download'}.xml`,
    contentType: 'application/xml',
    downloadUrl: `https://v2.stopbars.com/cdn/files/${key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')}`,
  };
}

export function submittedArtifactDescriptor(contribution) {
  const candidates = [
    contribution?.submittedArtifact,
    contribution?.submittedXmlArtifact,
    contribution?.artifacts?.submitted,
    ...(Array.isArray(contribution?.artifacts) ? contribution.artifacts : []),
  ].filter(Boolean);
  const descriptor =
    candidates.find((candidate) =>
      ['submitted', 'source', 'contribution'].includes(
        String(candidate.type ?? candidate.kind ?? '')
      )
    ) ?? candidates[0];

  return {
    fileName:
      typeof descriptor?.fileName === 'string' && descriptor.fileName.trim()
        ? descriptor.fileName.trim()
        : `contribution-${contribution?.id ?? 'download'}.xml`,
    contentType:
      typeof descriptor?.contentType === 'string' && descriptor.contentType.trim()
        ? descriptor.contentType.trim()
        : 'application/xml',
    downloadUrl:
      typeof descriptor?.downloadUrl === 'string' && descriptor.downloadUrl.trim()
        ? descriptor.downloadUrl.trim()
        : '',
  };
}

export function isFsDataXml(xml) {
  const source = String(xml ?? '').replace(/^\uFEFF/, '');
  return /<FSData\b/i.test(source);
}

export function contributionSourceFileName(contribution) {
  const airport = cleanFileNamePart(contribution?.airportIcao, 'airport').toUpperCase();
  const packageName = cleanFileNamePart(contribution?.packageName, 'package');
  const simulator = cleanFileNamePart(contribution?.simulator, 'simulator').toLowerCase();
  return `${airport}-${packageName}-${simulator}.xml`;
}

function cleanFileNamePart(value, fallback) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}
