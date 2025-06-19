import { useEffect, useState } from 'react';
import { getDetectedLocale, formatLocalDateNumeric, formatAustralianDate } from '../../utils/dateUtils';

/**
 * A debug component to show locale information and date formatting
 */
export const DateDebug = () => {
  const [detectedLocale, setDetectedLocale] = useState('Detecting...');
  const testDate = new Date('2025-04-09');

  useEffect(() => {
    // Get the browser's detected locale
    setDetectedLocale(getDetectedLocale());
  }, []);

  return (
    <div className="p-4 my-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm">
      <h3 className="font-medium mb-2">Date Debugging Info</h3>
      <div className="space-y-1 text-zinc-300">
        <p><span className="text-yellow-400">Browser detected locale:</span> {detectedLocale}</p>
        <p>
          <span className="text-yellow-400">Browser&apos;s format (numeric):</span> {formatLocalDateNumeric(testDate)}
        </p>
        <p>
          <span className="text-yellow-400">Australian format (forced):</span> {formatAustralianDate(testDate)}
        </p>
        <p className="text-xs mt-2 text-zinc-500">
          If the two date formats above don&apos;t match, your browser is not detecting Australian locale.
          You can use the Account page and choose to always use Australian format.
        </p>
      </div>
    </div>
  );
};
