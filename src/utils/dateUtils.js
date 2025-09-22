/**
 * Enhanced date formatting utility that properly respects user's system locale
 * and formats dates according to regional preferences, overriding browser defaults
 */

/**
 * Maps locale prefixes to their expected date format patterns
 * This ensures dates appear correctly regardless of browser quirks
 */
const LOCALE_FORMAT_MAP = {
  'en-US': { day: '2-digit', month: '2-digit', year: 'numeric', order: 'MDY' }, // MM/DD/YYYY
  'en-GB': { day: '2-digit', month: '2-digit', year: 'numeric', order: 'DMY' }, // DD/MM/YYYY
  'en-AU': { day: '2-digit', month: '2-digit', year: 'numeric', order: 'DMY' }, // DD/MM/YYYY
  'en-CA': { day: '2-digit', month: '2-digit', year: 'numeric', order: 'DMY' }, // DD/MM/YYYY
  'en-NZ': { day: '2-digit', month: '2-digit', year: 'numeric', order: 'DMY' }, // DD/MM/YYYY
  'en-IE': { day: '2-digit', month: '2-digit', year: 'numeric', order: 'DMY' }, // DD/MM/YYYY
  'en-ZA': { day: '2-digit', month: '2-digit', year: 'numeric', order: 'DMY' }, // DD/MM/YYYY
  de: { day: '2-digit', month: '2-digit', year: 'numeric', order: 'DMY' }, // DD.MM.YYYY
  fr: { day: '2-digit', month: '2-digit', year: 'numeric', order: 'DMY' }, // DD/MM/YYYY
  es: { day: '2-digit', month: '2-digit', year: 'numeric', order: 'DMY' }, // DD/MM/YYYY
  it: { day: '2-digit', month: '2-digit', year: 'numeric', order: 'DMY' }, // DD/MM/YYYY
  ja: { year: 'numeric', month: '2-digit', day: '2-digit', order: 'YMD' }, // YYYY/MM/DD
  zh: { year: 'numeric', month: '2-digit', day: '2-digit', order: 'YMD' }, // YYYY/MM/DD
  ko: { year: 'numeric', month: '2-digit', day: '2-digit', order: 'YMD' }, // YYYY/MM/DD
};

/**
 * Get user's browser locale
 * @returns {string} Detected locale or default
 */
const getDetectedLocale = () => {
  return navigator.language || navigator.userLanguage || 'en-US';
};

/**
 * Get appropriate format config based on user's locale
 * @returns {Object} Format configuration
 */
const getLocaleConfig = () => {
  const locale = getDetectedLocale();

  // First try full locale match
  if (LOCALE_FORMAT_MAP[locale]) {
    return LOCALE_FORMAT_MAP[locale];
  }

  // Then try language prefix match (e.g., 'en-something-else' would match 'en-GB')
  const prefix = locale.split('-')[0];

  if (prefix === 'en') {
    // Default English format is UK/AU style except for US
    return locale.includes('US') ? LOCALE_FORMAT_MAP['en-US'] : LOCALE_FORMAT_MAP['en-GB'];
  }

  // Try to match just the language code
  if (LOCALE_FORMAT_MAP[prefix]) {
    return LOCALE_FORMAT_MAP[prefix];
  }

  // Default to UK/Commonwealth format if we can't determine
  return LOCALE_FORMAT_MAP['en-GB'];
};

/**
 * Format date parts based on locale preferences and order
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
export const formatDateAccordingToLocale = (date) => {
  if (!date) return 'N/A';

  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return 'Invalid date';

    const config = getLocaleConfig();
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear();

    // Format based on detected order
    switch (config.order) {
      case 'DMY':
        return `${day}/${month}/${year}`;
      case 'MDY':
        return `${month}/${day}/${year}`;
      case 'YMD':
        return `${year}/${month}/${day}`;
      default:
        return `${day}/${month}/${year}`; // Default to DMY
    }
  } catch (err) {
    console.error('Error formatting date:', err);
    return 'Date error';
  }
};

/**
 * Format a date according to user's locale in numeric format
 * This override should work regardless of browser quirks
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
export const formatLocalDateNumeric = (date) => {
  if (!date) return 'N/A';

  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) return 'Invalid date';

    // Use our custom formatter that overrides browser behavior
    return formatDateAccordingToLocale(dateObj);
  } catch (err) {
    console.error('Error formatting date:', err);
    return 'Date error';
  }
};

/**
 * Format a date and time according to user's locale
 * @param {string|Date} dateTime - Date and time to format
 * @param {boolean} includeSeconds - Whether to include seconds in the time
 * @returns {string} Formatted date and time string
 */
export const formatLocalDateTime = (dateTime, includeSeconds = false) => {
  if (!dateTime) return 'N/A';

  try {
    const dateObj = dateTime instanceof Date ? dateTime : new Date(dateTime);
    if (isNaN(dateObj.getTime())) return 'Invalid date';

    // Get date part using existing function
    const datePart = formatDateAccordingToLocale(dateObj);

    // Determine time format based on locale
    const locale = getDetectedLocale();

    // Locales that typically use 12-hour clock
    const twelveHourLocales = ['en-US', 'en-CA', 'en-AU', 'en-NZ'];
    const use24Hour = !twelveHourLocales.some((l) => locale.startsWith(l));

    let hours = dateObj.getHours();
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    const seconds = dateObj.getSeconds().toString().padStart(2, '0');
    let ampm = '';

    // Handle 12-hour clock format
    if (!use24Hour) {
      ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours === 0 ? 12 : hours; // Convert 0 to 12 for 12-hour format
    }

    // Format hours with leading zero for 24-hour format
    const formattedHours = use24Hour ? hours.toString().padStart(2, '0') : hours.toString();

    // Build time string
    let timePart = `${formattedHours}:${minutes}`;
    if (includeSeconds) {
      timePart += `:${seconds}`;
    }
    if (!use24Hour) {
      timePart += ` ${ampm}`;
    }

    return `${datePart} ${timePart}`;
  } catch (err) {
    console.error('Error formatting date and time:', err);
    return 'Date/time error';
  }
};

/**
 * Get diagnostic information about user's date formatting
 * @returns {Object} Date formatting diagnostic info
 */
export const getDateDiagnostics = () => {
  // Test date: April 9, 2025
  const testDate = new Date(2025, 3, 9);
  const locale = getDetectedLocale();
  const config = getLocaleConfig();

  return {
    detectedLocale: locale,
    selectedConfig: config,
    dateFormats: {
      formatLocalDateNumeric: formatLocalDateNumeric(testDate),
      browserDefault: testDate.toLocaleDateString(),
      intlDefault: new Intl.DateTimeFormat().format(testDate),
      usStyle: new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(testDate),
      ukStyle: new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(testDate),
    },
  };
};
