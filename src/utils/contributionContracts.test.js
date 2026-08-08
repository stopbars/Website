import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contributionProofError,
  contributionSubmissionError,
  contributionSubmissionProof,
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
