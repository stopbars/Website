/**
 * Rounds download numbers to the nearest 100 or 1000 for better readability
 * @param {number} num - The number to round
 * @returns {number} - The rounded number
 */
export const roundDownloadCount = (num) => {
  if (typeof num !== 'number' || num < 0) {
    return 0;
  }

  // Round to nearest 100 for numbers less than 1000
  if (num < 1000) {
    return Math.floor(num / 100) * 100;
  }

  // Round to nearest 1000 for numbers 1000 and above
  return Math.floor(num / 1000) * 1000;
};
