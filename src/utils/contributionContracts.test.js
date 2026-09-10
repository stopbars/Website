import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contributionProofError,
  contributionSourceFileName,
  contributionSubmissionError,
  contributionSubmissionProof,
  isFsDataXml,
  publicationError,
  publishedBarsArtifactDescriptor,
  submittedArtifactDescriptor,
} from './contributionContracts.js';

test('preserves the tested contribution proof from navigation state', () => {
  assert.deepEqual(
    contributionSubmissionProof({
      generationToken: ' token ',
      generationHash: ' hash ',
      simulator: 'xplane',
    }),
    { generationToken: 'token', generationHash: 'hash', testedSimulator: 'xplane' }
  );
});

test('requires a complete proof and the tested simulator', () => {
  assert.match(contributionProofError({}, 'xplane'), /Return to Test/);
  assert.match(
    contributionProofError(
      { generationToken: 'token', generationHash: 'hash', testedSimulator: 'xplane' },
      'msfs2024'
    ),
    /simulator changed/
  );
  assert.equal(
    contributionProofError(
      { generationToken: 'token', generationHash: 'hash', testedSimulator: 'xplane' },
      'xplane'
    ),
    ''
  );
});

test('turns expired and mismatched proof failures into recovery instructions', () => {
  assert.match(
    contributionSubmissionError(410, 'Generation expired'),
    /prepare the same draft again/
  );
  assert.match(contributionSubmissionError(409, 'Draft hash mismatch'), /current draft again/);
});

test('approval requires explicit publication confirmation', () => {
  assert.equal(
    publicationError({
      publication: {
        artifactIdentity: 'identity',
        generationId: 'generation',
        removal: { key: 'removal', etag: 'one' },
        bars: { key: 'bars', etag: 'two' },
      },
    }),
    ''
  );
  assert.match(publicationError({ status: 'approved' }), /did not confirm/);
  assert.equal(
    publicationError({ publication: { status: 'failed', error: 'R2 upload failed' } }),
    'R2 upload failed'
  );
});

test('builds a download URL only from the stable Core artifact key', () => {
  assert.deepEqual(
    publishedBarsArtifactDescriptor({ id: 'abc', barsArtifactKey: 'Maps/stable map.xml' }),
    {
      key: 'Maps/stable map.xml',
      fileName: 'stable map.xml',
      contentType: 'application/xml',
      downloadUrl: 'https://v2.stopbars.com/cdn/files/Maps/stable%20map.xml',
    }
  );
  assert.equal(publishedBarsArtifactDescriptor({ id: 'abc' }), null);
});

test('uses Core artifact descriptors without rebuilding a package slug', () => {
  assert.deepEqual(
    submittedArtifactDescriptor({
      id: 'abc',
      submittedArtifact: {
        type: 'submitted',
        fileName: 'stable-source.xml',
        contentType: 'text/xml',
        downloadUrl: 'https://example.invalid/stable-source.xml',
      },
    }),
    {
      fileName: 'stable-source.xml',
      contentType: 'text/xml',
      downloadUrl: 'https://example.invalid/stable-source.xml',
    }
  );
  assert.equal(
    submittedArtifactDescriptor({ id: 'abc', packageName: 'Foo/Bar' }).fileName,
    'contribution-abc.xml'
  );
});

test('distinguishes editable FSData XML from published runtime maps', () => {
  assert.equal(isFsDataXml('<?xml version="1.0"?><FSData version="9.0"></FSData>'), true);
  assert.equal(isFsDataXml('<?xml version="1.0"?><BarsLights></BarsLights>'), false);
});

test('builds a clean editable contribution filename', () => {
  assert.equal(
    contributionSourceFileName({
      airportIcao: 'yssy',
      packageName: 'FlyTampa / Sydney',
      simulator: 'MSFS2024',
    }),
    'YSSY-FlyTampa-Sydney-msfs2024.xml'
  );
});
