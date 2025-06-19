import { useState, useEffect } from 'react';
import { Card } from './Card';

/**
 * Component that displays date formatting information based on current browser settings
 */
export function DateFormatTester() {
  const [browserInfo, setBrowserInfo] = useState({
    locale: 'Checking...',
    formats: {}
  });
  
  // Test date - April 9, 2025
  const testDate = new Date(2025, 3, 9);
  
  useEffect(() => {
    // Get browser locale information
    const locale = navigator.language || 'unknown';
    
    // Test different date format options
    const formats = {
      default: testDate.toLocaleDateString(),
      usFormat: testDate.toLocaleDateString('en-US'),
      ukFormat: testDate.toLocaleDateString('en-GB'),
      auFormat: testDate.toLocaleDateString('en-AU'),
      
      // Numeric formats
      numeric: new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(testDate),
      
      // Named month format
      longMonth: new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(testDate)
    };
    
    setBrowserInfo({
      locale,
      formats
    });
  }, []);
  
  return (
    <Card className="p-6 bg-blue-500/10 border border-blue-500/20 mb-6">
      <h2 className="text-lg font-semibold mb-4">Date Format Diagnostic Tool</h2>
      
      <div className="space-y-4 text-sm">
        <div className="mb-2">
          <span className="font-medium text-blue-400">Browser Detected Locale:</span> {browserInfo.locale}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-zinc-900/50 rounded border border-zinc-800">
            <p className="font-medium mb-1 text-blue-400">Your Browser&apos;s Default Format:</p>
            <p className="text-white">{browserInfo.formats.default}</p>
          </div>
          
          <div className="p-3 bg-zinc-900/50 rounded border border-zinc-800">
            <p className="font-medium mb-1 text-blue-400">Your Browser&apos;s Numeric Format:</p>
            <p className="text-white">{browserInfo.formats.numeric}</p>
          </div>
          
          <div className="p-3 bg-zinc-900/50 rounded border border-zinc-800">
            <p className="font-medium mb-1 text-blue-400">US Format (MM/DD/YYYY):</p>
            <p className="text-white">{browserInfo.formats.usFormat}</p>
          </div>
          
          <div className="p-3 bg-zinc-900/50 rounded border border-zinc-800">
            <p className="font-medium mb-1 text-blue-400">UK/AU Format (DD/MM/YYYY):</p>
            <p className="text-white">{browserInfo.formats.ukFormat}</p>
          </div>
        </div>
        
        <p className="text-xs text-zinc-400 mt-2">
          This shows how dates are formatted in your browser. If your browser&apos;s default format doesn&apos;t match your OS region settings, 
          there might be a browser setting overriding your system locale.
        </p>
      </div>
    </Card>
  );
}
