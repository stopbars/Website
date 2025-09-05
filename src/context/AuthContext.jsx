import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { getVatsimToken, removeVatsimToken } from '../utils/cookieUtils';
import { AuthContext } from './AuthContextBase';

const apiUrl = 'https://v2.stopbars.com'; // Update this in dev as needed
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export function AuthProvider({ children }) {
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
    window.location.href = '/';
  }, []);
  
  // Check if cached user data is still valid
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
  
  // Load user from cache
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
  // Banned cache helpers
  const isBannedCacheValid = () => {
    const cached = sessionStorage.getItem('bannedInfo');
    if (!cached) return false;
    try {
      const { timestamp, banned } = JSON.parse(cached);
      // If the ban has an explicit expiry, treat cache as invalid once expired
      if (banned?.expires_at) {
        const expMs = Date.parse(banned.expires_at);
        if (!Number.isNaN(expMs) && Date.now() >= expMs) {
          return false;
        }
      }
      return Date.now() - timestamp < CACHE_DURATION;
    } catch (e) {
      console.error('Error parsing banned cache:', e);
      return false;
    }
  };
  const loadBannedFromCache = () => {
    const cached = sessionStorage.getItem('bannedInfo');
    if (!cached) return null;
    try {
      const { banned } = JSON.parse(cached);
      return banned;
    } catch (e) {
      console.error('Error loading banned cache:', e);
      return null;
    }
  };
  const saveBannedToCache = (banned) => {
    try {
      sessionStorage.setItem('bannedInfo', JSON.stringify({ banned, timestamp: Date.now() }));
    } catch (e) {
      console.error('Error saving banned cache:', e);
    }
  };
  const clearBannedCache = () => {
    try {
      sessionStorage.removeItem('bannedInfo');
    } catch (e) {
      console.warn('Failed clearing banned cache', e);
    }
  };
  
  // Save user to cache
  const saveUserToCache = (userData) => {
    try {
      sessionStorage.setItem('userData', JSON.stringify({
        user: userData,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error saving user to cache:', error);
    }
  };
  
  const fetchUserData = useCallback(async (token, forceRefresh = false, options = {}) => {
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

    // Always fetch account to confirm current status (ban can be lifted or added)
    try {
      const accountResponse = await fetch(`${apiUrl}/auth/account`, {
        headers: { 'X-Vatsim-Token': token }
      });
      if (!accountResponse.ok) {
        // If forbidden, check if it's a banned response
        if (accountResponse.status === 403) {
          let bannedPayload = null;
          try { bannedPayload = await accountResponse.json(); } catch { console.warn('Failed to parse banned payload'); }
          if (bannedPayload?.banned) {
            const ban = {
              banned: true,
              reason: bannedPayload.reason || 'You are banned from BARS.',
              expires_at: bannedPayload.expires_at ?? null
            };
            setBannedInfo(ban);
            saveBannedToCache(ban);
            sessionStorage.removeItem('userData');
            setUser(null);
            if (!silent) setLoading(false);
            return { status: 'banned', info: ban };
          }
        }
        throw new Error('Failed to fetch account');
      }
      const accountData = await accountResponse.json();

      if (accountData?.banned) {
        const ban = {
          banned: true,
          reason: accountData.reason || 'You are banned from BARS.',
          expires_at: accountData.expires_at ?? null
        };
        setBannedInfo(ban);
        saveBannedToCache(ban);
        // Clear any cached user data
        sessionStorage.removeItem('userData');
        setUser(null);
        if (!silent) setLoading(false);
        return { status: 'banned', info: ban };
      }

      // Not banned anymore: clear any stale banned cache
      clearBannedCache();
      setBannedInfo(null);

      // Fetch staff + division in parallel
      const [staffResponse, divisionResponse] = await Promise.all([
        fetch(`${apiUrl}/auth/is-staff`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${apiUrl}/divisions/user`, {
          headers: { 'X-Vatsim-Token': token }
        })
      ]);
      if (!staffResponse.ok || !divisionResponse.ok) {
        throw new Error('Failed to fetch user data');
      }
      const staffData = await staffResponse.json();
      const divisionData = await divisionResponse.json();

      // Convert division data into roles
      const divisionRoles = (Array.isArray(divisionData) ? divisionData : []).reduce((acc, { role }) => ({
        ...acc,
        [role]: 1
      }), {});

      const userData = {
        ...accountData,
        roles: {
          ...(staffData?.role ? { [staffData.role]: 1 } : {}),
          ...divisionRoles
        }
      };

      // Update state and cache
      setUser(userData);
      saveUserToCache(userData);
      if (!silent) setLoading(false);
      return { status: 'ok' };
    } catch (error) {
      console.error('Fetch error:', error);
      if (!silent) setLoading(false);
      logout(); // Call the new logout function
      throw error;
    }
  }, [logout]);
  const initiateVatsimAuth = (RedirectPage) => {
    // Store the redirect page in localStorage before redirecting
    if (RedirectPage) {
      localStorage.setItem('authRedirectPage', RedirectPage);
    }

    const params = new URLSearchParams({
      client_id: import.meta.env.VITE_VATSIM_CLIENT_ID,
      redirect_uri: `${apiUrl}/auth/vatsim/callback`,
      response_type: 'code',
      scope: 'vatsim_details email full_name'
    });
    window.location.href = `https://auth.vatsim.net/oauth/authorize?${params}`;
  };
  
  
  // Function to force refresh user data
  const refreshUserData = useCallback(async (options = {}) => {
    const token = getVatsimToken();
    if (token) {
      return fetchUserData(token, true, options); // Force refresh from API
    }
    return false;
  }, [fetchUserData]);
  
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
        fetchUserData(token);
        return;
      }
      // Otherwise, try cached user then fetch if needed
      const cachedUser = loadUserFromCache();
      if (cachedUser && isCacheValid()) {
        setUser(cachedUser);
        setLoading(false);
      } else {
        fetchUserData(token);
      }
    } else {
      setLoading(false);
    }
  }, [fetchUserData]);
  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      logout, 
      initiateVatsimAuth, 
      fetchUserData,
      refreshUserData,
      setUser,
      bannedInfo,
      setBannedInfo
    }}>
      {children}
    </AuthContext.Provider>
  );
}
AuthProvider.propTypes = {
  children: PropTypes.node.isRequired
};