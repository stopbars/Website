import { useState, createContext, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';

export const AuthContext = createContext(null);
const apiUrl = 'https://v2.stopbars.com'; // Update this in dev as needed
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
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
  
  const fetchUserData = async (token, forceRefresh = false) => {
    // Check if we can use cached data
    if (!forceRefresh && isCacheValid()) {
      const cachedUser = loadUserFromCache();
      if (cachedUser) {
        setUser(cachedUser);
        setLoading(false);
        return true;
      }
    }
    
    // If no valid cache or force refresh, fetch from API
    try {
      const [accountResponse, staffResponse, divisionResponse] = await Promise.all([
        fetch(`${apiUrl}/auth/account`, {
          headers: {'X-Vatsim-Token': token}
        }),
        fetch(`${apiUrl}/auth/is-staff`, {
          headers: {'Authorization': `Bearer ${token}`}
        }),
        fetch(`${apiUrl}/divisions/user`, {
          headers: {'X-Vatsim-Token': token}
        })
      ]);
      
      if (!accountResponse.ok || !staffResponse.ok || !divisionResponse.ok) {
        throw new Error('Failed to fetch user data');
      }

      const accountData = await accountResponse.json();
      const staffData = await staffResponse.json();
      const divisionData = await divisionResponse.json();

      // Convert division data into roles
      const divisionRoles = divisionData.reduce((acc, { role }) => ({
        ...acc,
        [role]: 1
      }), {});

      const userData = {
        ...accountData,
        roles: {
          ...(staffData.role ? { [staffData.role]: 1 } : {}),
          ...divisionRoles
        }
      };
      
      // Update state and cache
      setUser(userData);
      saveUserToCache(userData);
      setLoading(false);
      return true;
    } catch (error) {
      console.error('Fetch error:', error);
      setLoading(false);
      logout();
      throw error;
    }
  };
  const initiateVatsimAuth = (RedirectPage) => {
    // Store the redirect page in localStorage before redirecting
    if (RedirectPage) {
      localStorage.setItem('authRedirectPage', RedirectPage);
    }

    const params = new URLSearchParams({
      client_id: import.meta.env.VITE_VATSIM_CLIENT_ID,
      redirect_uri: `${apiUrl}/auth/vatsim/callback`,
      response_type: 'code',
      scope: 'vatsim_details email'
    });
    window.location.href = `https://auth.vatsim.net/oauth/authorize?${params}`;
  };
  const logout = () => {
    localStorage.removeItem('vatsimToken');
    sessionStorage.removeItem('userData'); // Clear user data cache on logout
    setUser(null);
    window.location.href = '/';
  };
  
  // Function to force refresh user data
  const refreshUserData = async () => {
    const token = localStorage.getItem('vatsimToken');
    if (token) {
      return fetchUserData(token, true); // Force refresh from API
    }
    return false;
  };
  
  useEffect(() => {
    const token = localStorage.getItem('vatsimToken');
    if (token) {
      // Try to load from cache first, then fetch if needed
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
  }, []);
  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      logout, 
      initiateVatsimAuth, 
      fetchUserData,
      refreshUserData,
      setUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
   };

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired
};