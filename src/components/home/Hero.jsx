import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '../shared/Button';

export const Hero = () => {
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [downloadAvailable, setDownloadAvailable] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let mounted = true;
    const url = 'https://v2.stopbars.com/releases/latest?product=Installer';

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          if (mounted) setDownloadAvailable(false);
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (mounted) {
          setDownloadInfo(json);
          setDownloadAvailable(true);
        }
      } catch (err) {
        console.error('Failed to fetch latest installer release:', err);
        if (mounted) setDownloadAvailable(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section
      className="relative flex items-center justify-center min-h-[80vh] px-6 pt-44 md:pt-60 pb-28"
      aria-labelledby="hero-heading"
    >
      <div className="max-w-5xl mx-auto text-center space-y-10">
        <h1 id="hero-heading" className="text-5xl md:text-7xl font-bold tracking-tight">
          <span
            className={`block transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
            style={{ transitionDelay: '0ms' }}
          >
            Advanced Airport
          </span>
          <span
            className={`block transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
            style={{ transitionDelay: '80ms' }}
          >
            Lighting Simulation
          </span>
        </h1>
        <p
          className={`text-base md:text-lg text-zinc-400 leading-relaxed transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
          style={{ transitionDelay: '180ms' }}
        >
          BARS revolutionizes your VATSIM experience with completely free realistic airport lighting
          simulation. Fully compatible with Microsoft Flight Simulator 2020, and 2024, seamlessly
          integrated with both default and major third-party sceneries.
        </p>
        <div
          className={`flex flex-col sm:flex-row gap-4 justify-center transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
          style={{ transitionDelay: '280ms' }}
        >
          <Button
            variant="primary"
            className={`h-14 px-10 text-base md:text-lg gap-2 transition-all duration-200 ${
              downloadAvailable
                ? 'hover:scale-[1.02] hover:brightness-110'
                : 'opacity-50 cursor-not-allowed'
            }`}
            disabled={!downloadAvailable}
            onClick={async () => {
              const trackingUrl = 'https://v2.stopbars.com/download?product=Installer';
              const downloadUrl = downloadInfo?.downloadUrl;

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
                window.location.href = downloadUrl;
              }
            }}
            aria-label="Download BARS"
          >
            Download
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            className="h-14 px-10 text-base md:text-lg gap-2 bg-zinc-800! text-zinc-200! border! border-zinc-700! hover:bg-zinc-700! transition-colors duration-200"
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
          className={`max-w-5xl mx-auto mt-16 transition-all duration-500 ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
          style={{ transitionDelay: '380ms' }}
        >
          <div className="h-96 md:h-128 relative overflow-hidden rounded-3xl border border-zinc-800 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900">
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

export default Hero;
