/**
 * Cookie utilities for handling cross-domain cookies across stopbars.com domains
 */

/**
 * Set a cookie that can be accessed across all stopbars.com subdomains
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {number} days - Cookie expiry in days (default: 30)
 */
export const setCrossDomainCookie = (name, value, days = 30) => {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = `expires=${date.toUTCString()}`;
  
  // Always try to set for .stopbars.com domain - will fail silently on localhost but that's fine :)
  let cookieString = `${name}=${value}; ${expires}; domain=.stopbars.com; path=/; samesite=lax`;
  
  // Add secure flag if we're on HTTPS
  if (window.location.protocol === 'https:') {
    cookieString += `; secure`;
  }
  
  document.cookie = cookieString;
};

/**
 * Get a cookie value by name
 * @param {string} name - Cookie name
 * @returns {string|null} Cookie value or null if not found
 */
export const getCookie = (name) => {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
};

/**
 * Delete a cookie by setting it to expire
 * @param {string} name - Cookie name
 */
export const deleteCookie = (name) => {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; domain=.stopbars.com; path=/;`;
};

/**
 * Set the VATSIM token in both localStorage and cross-domain cookie
 * @param {string} token - VATSIM token
 */
export const setVatsimToken = (token) => {
  localStorage.setItem('vatsimToken', token);
  setCrossDomainCookie('vatsimToken', token, 30);
};

/**
 * Get the VATSIM token from localStorage or cookie (localStorage takes priority)
 * @returns {string|null} VATSIM token or null if not found
 */
export const getVatsimToken = () => {
  // Try localStorage first for backward compatibility
  let token = localStorage.getItem('vatsimToken');
  if (token) return token;
  
  // Fallback to cookie
  token = getCookie('vatsimToken');
  if (token) {
    // If found in cookie but not localStorage, sync them
    localStorage.setItem('vatsimToken', token);
    return token;
  }
  
  return null;
};

/**
 * Remove the VATSIM token from both localStorage and cookie
 */
export const removeVatsimToken = () => {
  localStorage.removeItem('vatsimToken');
  deleteCookie('vatsimToken');
};