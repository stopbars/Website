import { useEffect, useState, useRef } from 'react';
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
  const cardRef = useRef(null);
  const [cardTransform, setCardTransform] = useState('');
  const [cardGlow, setCardGlow] = useState({ x: 50, y: 50 });

  useEffect(() => {
    let mounted = true;
    const url = 'https://v2.stopbars.com/releases/latest?product=Installer';

    (async () => {
      try {
        const res = await fetch(url);
        if (res.status === 404) {
          if (mounted) setDownloadUnavailable(true);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (mounted) setDownloadInfo(json);
      } catch (err) {
        console.error('Failed to fetch latest installer release:', err);
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
              if (downloadUnavailable) return;
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
            className="h-14 px-10 text-base md:text-lg gap-2 bg-zinc-800! text-zinc-200! border! border-zinc-700! hover:bg-zinc-700!"
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
                  className={`px-5 py-2.5 rounded-full text-sm md:text-base border transition-colors duration-300 cursor-pointer ${
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

          <div
            ref={cardRef}
            className="mt-10 h-96 md:h-128 relative overflow-hidden rounded-3xl border border-zinc-800 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900 transition-transform duration-200 ease-out cursor-pointer"
            style={{
              transform: cardTransform,
              transformStyle: 'preserve-3d',
              perspective: '1000px',
            }}
            onMouseMove={(e) => {
              const card = cardRef.current;
              if (!card) return;
              const rect = card.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              const cx = rect.width / 2;
              const cy = rect.height / 2;

              const nx = (x - cx) / cx;
              const ny = (y - cy) / cy;

              const dist = Math.sqrt(nx * nx + ny * ny);
              const falloff = Math.max(0, 1 - dist * 0.6);

              const rx = ny * -4 * falloff;
              const ry = nx * 4 * falloff;
              setCardTransform(
                `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.01, 1.01, 1.01)`
              );
              setCardGlow({ x: (x / rect.width) * 100, y: (y / rect.height) * 100 });
            }}
            onMouseLeave={() => {
              setCardTransform('perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)');
              setCardGlow({ x: 50, y: 50 });
            }}
          >
            <div
              className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{
                background: `radial-gradient(circle at ${cardGlow.x}% ${cardGlow.y}%, rgba(255,255,255,0.15) 0%, transparent 50%)`,
              }}
            />
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
