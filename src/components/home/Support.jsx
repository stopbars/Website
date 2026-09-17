import { Download } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../shared/Button';

/* oxlint-disable react-doctor/no-fetch-in-effect -- This one-shot installer request owns its AbortController and mirrors the hero download availability check. */
export const Support = () => {
  const downloadInfoRef = useRef(null);
  const [downloadAvailable, setDownloadAvailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const fetchInstaller = async () => {
      try {
        const response = await fetch('https://v2.stopbars.com/releases/latest?product=Installer', {
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        downloadInfoRef.current = await response.json();
        setDownloadAvailable(Boolean(downloadInfoRef.current?.downloadUrl));
      } catch (error) {
        if (error.name === 'AbortError') return;
        setDownloadAvailable(false);
      }
    };

    fetchInstaller();
    return () => controller.abort();
  }, []);

  const downloadInstaller = () => {
    const downloadUrl = downloadInfoRef.current?.downloadUrl;
    if (!downloadUrl) return;

    try {
      navigator.sendBeacon('https://v2.stopbars.com/download?product=Installer', '');
    } catch {
      // Download tracking must never prevent the installer download.
    }

    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="deferred-section home-section" id="support">
      <div className="home-shell">
        <div className="home-download-panel home-panel mx-auto max-w-5xl overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-16">
          <h2 className="home-section-title">Ready to use BARS?</h2>
          <p className="home-section-copy mx-auto max-w-xl text-zinc-300 sm:text-lg">
            Download BARS for Microsoft Flight Simulator and X-Plane.
          </p>
          <Button
            variant="primary"
            className="mt-8 min-h-12 px-8 text-base"
            disabled={!downloadAvailable}
            onClick={downloadInstaller}
            aria-label="Download BARS"
          >
            <Download className="size-4" aria-hidden="true" />
            {downloadAvailable ? 'Download BARS' : 'Download unavailable'}
          </Button>
        </div>
      </div>
    </section>
  );
};
