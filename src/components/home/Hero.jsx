import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '../shared/Button';

/* oxlint-disable react-doctor/no-fetch-in-effect -- The one-shot installer request owns AbortController cleanup and is isolated to the hero. */
export const Hero = () => {
  const downloadInfoRef = useRef(null);
  const [downloadAvailable, setDownloadAvailable] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const url = 'https://v2.stopbars.com/releases/latest?product=Installer';

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          setDownloadAvailable(false);
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        downloadInfoRef.current = json;
        setDownloadAvailable(true);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch latest installer release:', err);
        setDownloadAvailable(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <section
      className="relative flex min-h-[80vh] items-center justify-center px-6 pb-16 pt-44 sm:pb-20 md:pt-56"
      aria-labelledby="hero-heading"
    >
      <div className="mx-auto w-full max-w-5xl text-center">
        <h1
          id="hero-heading"
          className="text-balance text-5xl font-bold tracking-tight md:text-7xl"
        >
          <span
            className={`block transition-[filter,opacity,transform] duration-[var(--duration-very-slow)] ease-[var(--ease-in-out)] ${visible ? 'translate-y-0 blur-0 opacity-100' : 'translate-y-[var(--distance-medium)] blur-[var(--blur-medium)] opacity-0'}`}
            style={{ transitionDelay: '0ms' }}
          >
            Advanced Airport
          </span>
          <span
            className={`block transition-[filter,opacity,transform] duration-[var(--duration-very-slow)] ease-[var(--ease-in-out)] ${visible ? 'translate-y-0 blur-0 opacity-100' : 'translate-y-[var(--distance-medium)] blur-[var(--blur-medium)] opacity-0'}`}
            style={{ transitionDelay: '40ms' }}
          >
            Lighting Simulation
          </span>
        </h1>
        <p
          className={`mx-auto mt-6 max-w-3xl text-pretty text-base leading-relaxed text-zinc-400 transition-[filter,opacity,transform] duration-[var(--duration-very-slow)] ease-[var(--ease-in-out)] md:text-lg ${visible ? 'translate-y-0 blur-0 opacity-100' : 'translate-y-[var(--distance-medium)] blur-[var(--blur-medium)] opacity-0'}`}
          style={{ transitionDelay: '80ms' }}
        >
          BARS revolutionizes your VATSIM experience with completely free realistic airport lighting
          simulation. Compatible with Microsoft Flight Simulator 2020 and 2024, and X-Plane 12,
          across default and major third-party sceneries.
        </p>
        <div
          className={`mt-8 flex flex-col justify-center gap-3 transition-[filter,opacity,transform] duration-[var(--duration-very-slow)] ease-[var(--ease-in-out)] sm:flex-row ${visible ? 'translate-y-0 blur-0 opacity-100' : 'translate-y-[var(--distance-medium)] blur-[var(--blur-medium)] opacity-0'}`}
          style={{ transitionDelay: '120ms' }}
        >
          <Button
            variant="primary"
            className={`h-14 px-10 text-base md:text-lg gap-2 transition-[filter,transform,opacity] duration-[var(--duration-quick)] ${
              downloadAvailable
                ? 'hover:scale-[1.02] hover:brightness-110'
                : 'opacity-50 cursor-not-allowed'
            }`}
            disabled={!downloadAvailable}
            onClick={async () => {
              const trackingUrl = 'https://v2.stopbars.com/download?product=Installer';
              const downloadUrl = downloadInfoRef.current?.downloadUrl;

              try {
                if (navigator && typeof navigator.sendBeacon === 'function') {
                  try {
                    navigator.sendBeacon(trackingUrl, '');
                  } catch {
                    await fetch(trackingUrl, { method: 'POST', keepalive: true });
                  }
                } else {
                  await fetch(trackingUrl, { method: 'POST', keepalive: true });
                }
              } catch {
                console.warn('Download tracking failed');
              }
              try {
                window.open(downloadUrl, '_blank', 'noopener,noreferrer');
              } catch {
                window.location.assign(downloadUrl);
              }
            }}
            aria-label="Download BARS"
          >
            Download
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            className="h-14 gap-2 border! border-zinc-700! bg-zinc-800! px-10 text-base text-zinc-200! transition-colors duration-[var(--duration-quick)] hover:bg-zinc-700! md:text-lg"
            onClick={() =>
              window.open('https://docs.stopbars.com/', '_blank', 'noopener,noreferrer')
            }
            aria-label="Open BARS documentation in a new tab"
          >
            Documentation
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Button>
        </div>

        <div
          className={`mx-auto mt-14 max-w-5xl transition-[filter,opacity,transform] duration-[var(--duration-very-slow)] ease-[var(--ease-in-out)] ${visible ? 'translate-y-0 blur-0 opacity-100' : 'translate-y-[var(--distance-medium)] blur-[var(--blur-medium)] opacity-0'}`}
          style={{ transitionDelay: '160ms' }}
        >
          <div className="relative h-96 overflow-hidden rounded-3xl border border-zinc-800 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900 md:h-128">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg md:text-2xl font-medium text-zinc-200">
                Video Placeholder
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
