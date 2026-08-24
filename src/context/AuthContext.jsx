import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { getVatsimToken, removeVatsimToken } from '../utils/cookieUtils';
import { AuthContext } from './AuthContextBase';
import { fetchAuthenticatedUser, shouldInvalidateToken } from './authRequest';

const apiUrl = 'https://v2.stopbars.com'; // Update this in dev as needed
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

/* oxlint-disable react-doctor/js-cache-storage react-doctor/client-localstorage-no-version -- Cache reads occur in mutually exclusive helper paths, and retaining the established keys preserves active authenticated sessions. */

const isCacheValid = () => {
  const cachedData = sessionStorage.getItem('userData');
  if (!cachedData) return false;
  try {
    const { timestamp } = JSON.parse(cachedData);
    return Date.now() - timestamp < CACHE_DURATION;
  } catch (error) {
    console.error('Error parsing cached user data:', error);
    return false;
  }
};

const loadUserFromCache = () => {
  const cachedData = sessionStorage.getItem('userData');
  if (!cachedData) return null;
  try {
    const { user } = JSON.parse(cachedData);
    return user;
  } catch (error) {
    console.error('Error loading user from cache:', error);
    return null;
  }
};

const isBannedCacheValid = () => {
  const cached = sessionStorage.getItem('bannedInfo');
  if (!cached) return false;
  try {
    const { timestamp, banned } = JSON.parse(cached);
    if (banned?.expires_at) {
      const expMs = Date.parse(banned.expires_at);
      if (!Number.isNaN(expMs) && Date.now() >= expMs) return false;
    }
    return Date.now() - timestamp < CACHE_DURATION;
  } catch (error) {
    console.error('Error parsing banned cache:', error);
    return false;
  }
};

const loadBannedFromCache = () => {
  const cached = sessionStorage.getItem('bannedInfo');
  if (!cached) return null;
  try {
    const { banned } = JSON.parse(cached);
    return banned;
  } catch (error) {
    console.error('Error loading banned cache:', error);
    return null;
  }
};

const saveBannedToCache = (banned) => {
  try {
    sessionStorage.setItem('bannedInfo', JSON.stringify({ banned, timestamp: Date.now() }));
  } catch (error) {
    console.error('Error saving banned cache:', error);
  }
};

const clearBannedCache = () => {
  try {
    sessionStorage.removeItem('bannedInfo');
  } catch (error) {
    console.warn('Failed clearing banned cache', error);
  }
};

const saveUserToCache = (userData) => {
  try {
    sessionStorage.setItem('userData', JSON.stringify({ user: userData, timestamp: Date.now() }));
  } catch (error) {
    console.error('Error saving user to cache:', error);
  }
};

const initiateVatsimAuth = (redirectPage) => {
  if (redirectPage) localStorage.setItem('authRedirectPage', redirectPage);
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_VATSIM_CLIENT_ID,
    redirect_uri: `${apiUrl}/auth/vatsim/callback`,
    response_type: 'code',
    scope: 'vatsim_details email full_name',
  });
  window.location.assign(`https://auth.vatsim.net/oauth/authorize?${params}`);
};

/* oxlint-disable react-doctor/js-cache-storage react-doctor/client-localstorage-no-version react-doctor/no-cascading-set-state react-doctor/no-loading-flag-reset-outside-finally -- Cache and request branches all explicitly settle loading while preserving existing authenticated sessions. */
export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bannedInfo, setBannedInfo] = useState(null); // { banned: true, reason, expires_at }

  // Logout first (stable) so callbacks can depend on it
  const logout = useCallback(() => {
    removeVatsimToken();
    sessionStorage.removeItem('userData'); // Clear user data cache on logout
    clearBannedCache();
    setUser(null);
    setBannedInfo(null);
    navigate('/', { replace: true });
  }, [navigate]);

  const fetchUserData = useCallback(
    async (token, forceRefresh = false, options = {}) => {
      const { silent = false } = options;
      // Ensure routes wait for fresh validation to avoid stale banned redirects unless silent
      if (!silent) setLoading(true);
      // If we have a cached ban, show it to avoid flicker, but DO NOT return early; revalidate with the API.
      if (!forceRefresh && isBannedCacheValid()) {
        const cachedBan = loadBannedFromCache();
        if (cachedBan?.banned) {
          setBannedInfo(cachedBan);
          setUser(null);
        }
      } else if (!forceRefresh && isCacheValid()) {
        // Otherwise prefer cached user (we'll skip fetch below)
        const cachedUser = loadUserFromCache();
        if (cachedUser) {
          setUser(cachedUser);
          if (!silent) setLoading(false);
          return { status: 'ok' };
        }
      }

      try {
        const result = await fetchAuthenticatedUser(token);
        if (result.status === 'banned') {
          setBannedInfo(result.info);
          saveBannedToCache(result.info);
          sessionStorage.removeItem('userData');
          setUser(null);
          if (!silent) setLoading(false);
          return result;
        }

        clearBannedCache();
        setBannedInfo(null);
        setUser(result.user);
        saveUserToCache(result.user);
        if (!silent) setLoading(false);
        return result;
      } catch (error) {
        console.error('Fetch error:', error);
        const cachedUser = loadUserFromCache();
        if (cachedUser) setUser(cachedUser);
        if (!silent) setLoading(false);
        if (shouldInvalidateToken(error, token, getVatsimToken())) {
          logout();
        }
        throw error;
      }
    },
    [logout]
  );
  // Function to force refresh user data
  const refreshUserData = useCallback(
    async (options = {}) => {
      const token = getVatsimToken();
      if (token) {
        return fetchUserData(token, true, options); // Force refresh from API
      }
      return false;
    },
    [fetchUserData]
  );

  useEffect(() => {
    const token = getVatsimToken();
    if (token) {
      // If we have a cached ban, show it but revalidate immediately
      if (isBannedCacheValid()) {
        const cachedBan = loadBannedFromCache();
        if (cachedBan?.banned) {
          setBannedInfo(cachedBan);
          setUser(null);
        }
        void fetchUserData(token).catch(() => {});
        return;
      }
      // Otherwise, try cached user then fetch if needed
      const cachedUser = loadUserFromCache();
      if (cachedUser && isCacheValid()) {
        setUser(cachedUser);
        setLoading(false);
      } else {
        void fetchUserData(token).catch(() => {});
      }
    } else {
      setLoading(false);
    }
  }, [fetchUserData]);
  const contextValue = useMemo(
    () => ({
      user,
      loading,
      logout,
      initiateVatsimAuth,
      fetchUserData,
      refreshUserData,
      setUser,
      bannedInfo,
      setBannedInfo,
    }),
    [user, loading, logout, fetchUserData, refreshUserData, bannedInfo]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
