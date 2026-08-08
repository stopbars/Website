const API_URL = 'https://v2.stopbars.com';
const AUTH_REQUESTS_KEY = Symbol.for('bars.auth.in-flight-requests');
const sharedAuthRequests =
  globalThis[AUTH_REQUESTS_KEY] ?? (globalThis[AUTH_REQUESTS_KEY] = new Map());

export class AuthRequestError extends Error {
  constructor(message, { invalidToken = false } = {}) {
    super(message);
    this.name = 'AuthRequestError';
    this.invalidToken = invalidToken;
  }
}

export const shouldInvalidateToken = (error, requestedToken, currentToken) =>
  error?.invalidToken === true && requestedToken === currentToken;

export const createAuthenticatedUserLoader = ({
  fetchImpl = globalThis.fetch,
  apiUrl = API_URL,
  inFlightRequests = sharedAuthRequests,
} = {}) => {
  const requestAuthenticatedUser = async (token) => {
    const accountResponse = await fetchImpl(`${apiUrl}/auth/account`, {
      headers: { 'X-Vatsim-Token': token },
    });
    if (!accountResponse.ok) {
      if (accountResponse.status === 403) {
        let bannedPayload = null;
        try {
          bannedPayload = await accountResponse.json();
        } catch {
          console.warn('Failed to parse banned payload');
        }
        if (bannedPayload?.banned) {
          return {
            status: 'banned',
            info: {
              banned: true,
              reason: bannedPayload.reason || 'You are banned from BARS.',
              expires_at: bannedPayload.expires_at ?? null,
            },
          };
        }
      }
      throw new AuthRequestError('Failed to fetch account', {
        invalidToken: accountResponse.status === 401,
      });
    }

    const accountData = await accountResponse.json();
    if (accountData?.banned) {
      return {
        status: 'banned',
        info: {
          banned: true,
          reason: accountData.reason || 'You are banned from BARS.',
          expires_at: accountData.expires_at ?? null,
        },
      };
    }

    const [staffResponse, divisionResponse] = await Promise.all([
      fetchImpl(`${apiUrl}/auth/is-staff`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetchImpl(`${apiUrl}/divisions/user`, {
        headers: { 'X-Vatsim-Token': token },
      }),
    ]);
    if (!staffResponse.ok || !divisionResponse.ok) {
      throw new AuthRequestError('Failed to fetch user data');
    }

    const staffData = await staffResponse.json();
    const divisionData = await divisionResponse.json();
    const divisionRoles = (Array.isArray(divisionData) ? divisionData : []).reduce(
      (roles, { role }) => ({
        ...roles,
        [role]: 1,
      }),
      {}
    );

    return {
      status: 'ok',
      user: {
        ...accountData,
        roles: {
          ...(staffData?.role ? { [staffData.role]: 1 } : {}),
          ...divisionRoles,
        },
      },
    };
  };

  return (token) => {
    const existingRequest = inFlightRequests.get(token);
    if (existingRequest) return existingRequest;

    const request = requestAuthenticatedUser(token).finally(() => {
      if (inFlightRequests.get(token) === request) {
        inFlightRequests.delete(token);
      }
    });
    inFlightRequests.set(token, request);
    return request;
  };
};

export const fetchAuthenticatedUser = createAuthenticatedUserLoader();
