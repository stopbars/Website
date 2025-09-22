/**
 * Token storage utilities (localStorage only). Cookies were removed to avoid
 * cross-site leakage and simplify the security model.
 */

const TOKEN_KEY = 'vatsimToken';

/**
 * Persist the VATSIM token (localStorage only)
 * @param {string} token
 */
export const setVatsimToken = (token) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {
    // Fails silently (e.g. private mode / quota exceeded)
    console.error('Failed to persist VATSIM token to localStorage', e);
  }
};

/**
 * Retrieve the VATSIM token
 * @returns {string|null}
 */
export const getVatsimToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    console.error('Failed to read VATSIM token from localStorage', e);
    return null;
  }
};

/**
 * Remove the VATSIM token
 */
export const removeVatsimToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (e) {
    console.error('Failed to remove VATSIM token from localStorage', e);
  }
};
