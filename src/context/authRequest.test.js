import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AuthRequestError,
  createAuthenticatedUserLoader,
  shouldInvalidateToken,
} from './authRequest.js';

const response = (status, data = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

test('deduplicates concurrent auth hydration requests for the same token', async () => {
  const calls = [];
  const loader = createAuthenticatedUserLoader({
    inFlightRequests: new Map(),
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith('/auth/account')) {
        await Promise.resolve();
        return response(200, { id: 1234567, name: 'Test User' });
      }
      if (url.endsWith('/auth/is-staff')) return response(200, { role: 'staff' });
      return response(200, [{ role: 'contributor' }]);
    },
  });

  const [first, second] = await Promise.all([loader('same-token'), loader('same-token')]);

  assert.deepEqual(first, second);
  assert.equal(calls.filter((url) => url.endsWith('/auth/account')).length, 1);
  assert.equal(calls.filter((url) => url.endsWith('/auth/is-staff')).length, 1);
  assert.equal(calls.filter((url) => url.endsWith('/divisions/user')).length, 1);
  assert.deepEqual(first.user.roles, { staff: 1, contributor: 1 });
});

test('does not classify transient account or role failures as invalid tokens', async () => {
  const accountUnavailable = createAuthenticatedUserLoader({
    inFlightRequests: new Map(),
    fetchImpl: async () => response(503),
  });
  const roleUnavailable = createAuthenticatedUserLoader({
    inFlightRequests: new Map(),
    fetchImpl: async (url) =>
      url.endsWith('/auth/account')
        ? response(200, { id: 1234567 })
        : response(url.endsWith('/auth/is-staff') ? 503 : 200),
  });

  await assert.rejects(accountUnavailable('token'), (error) => {
    assert.equal(error instanceof AuthRequestError, true);
    assert.equal(error.invalidToken, false);
    return true;
  });
  await assert.rejects(roleUnavailable('token'), (error) => {
    assert.equal(error instanceof AuthRequestError, true);
    assert.equal(error.invalidToken, false);
    return true;
  });
});

test('invalidates only the currently stored token after an explicit account 401', async () => {
  const loader = createAuthenticatedUserLoader({
    inFlightRequests: new Map(),
    fetchImpl: async () => response(401),
  });

  await assert.rejects(loader('rejected-token'), (error) => {
    assert.equal(error.invalidToken, true);
    assert.equal(shouldInvalidateToken(error, 'rejected-token', 'rejected-token'), true);
    assert.equal(shouldInvalidateToken(error, 'rejected-token', 'newer-token'), false);
    return true;
  });
});
