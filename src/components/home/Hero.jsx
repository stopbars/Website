import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '../shared/Button';

const previewOptions = [
  'Stopbars',
  'Follow The Greens',
  'Lead On Lights',
  'EuroScope Plugin',
  'vatSys Plugin',
];

export const Hero = () => {
  const [selectedPreview, setSelectedPreview] = useState(previewOptions[0]);
  const [downloadInfo, setDownloadInfo] = useState(null);
  const [downloadLoading, setDownloadLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const url = 'https://v2.stopbars.com/releases/latest?product=Installer';

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (mounted) setDownloadInfo(json);
      } catch (err) {
        console.error('Failed to fetch latest installer release:', err);
      } finally {
        if (mounted) setDownloadLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section
      className="relative flex items-center justify-center min-h-[80vh] px-6 pt-48 pb-28"
      aria-labelledby="hero-heading"
    >
      <div className="max-w-5xl mx-auto text-center space-y-10">
        <h1 id="hero-heading" className="text-5xl md:text-7xl font-bold tracking-tight">
          <span className="block">Advanced Airport</span>
          <span className="block">Lighting Simulation</span>
        </h1>
        <p className="text-base md:text-lg text-zinc-400 leading-relaxed">
          BARS revolutionizes your VATSIM experience with completely free realistic airport lighting
          simulation. Fully compatible with Microsoft Flight Simulator 2020, and 2024, seamlessly
          integrated with both default and major third-party sceneries.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            variant="primary"
            className="h-14 px-10 text-base md:text-lg gap-2"
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
            aria-label={
              downloadLoading
                ? 'Download (loading latest release)'
                : downloadInfo
                  ? `Download installer version ${downloadInfo.version}`
                  : 'Download'
            }
          >
            {downloadLoading
              ? 'Download'
              : downloadInfo
                ? `Download v${downloadInfo.version}`
                : 'Download'}
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            className="h-14 px-10 text-base md:text-lg gap-2 !bg-zinc-800 !text-zinc-200 !border !border-zinc-700 hover:!bg-zinc-700"
            onClick={() =>
              window.open('https://docs.stopbars.com/', '_blank', 'noopener,noreferrer')
            }
            aria-label="Open BARS documentation in a new tab"
          >
            Documentation
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="max-w-5xl mx-auto mt-24">
          <div className="flex flex-wrap justify-center gap-3 mt-10">
            {previewOptions.map((option) => {
              const isSelected = option === selectedPreview;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelectedPreview(option)}
                  className={`px-5 py-2.5 rounded-full text-sm md:text-base border transition-colors duration-300 ${
                    isSelected
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-900/60 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
                  }`}
                  aria-pressed={isSelected}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <div className="mt-10 h-96 md:h-[32rem] relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg md:text-2xl font-medium text-zinc-200">
                {selectedPreview} Placeholder
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
