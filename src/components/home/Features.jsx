import { Film } from 'lucide-react';
import { useRef } from 'react';
import { useRevealGroup } from '../../hooks/useRevealGroup';

const FEATURES = [
  {
    title: 'Realistic controlled airport lighting',
    className: 'sm:col-span-2 lg:col-span-8 lg:min-h-[31rem]',
  },
  {
    title: 'Follow the Greens',
    className: 'sm:col-span-1 lg:col-span-4 lg:min-h-[31rem]',
  },
  {
    title: 'Live VATSIM control',
    className: 'sm:col-span-1 lg:col-span-4',
  },
  {
    title: 'MSFS and X-Plane',
    className: 'sm:col-span-1 lg:col-span-4',
  },
  {
    title: 'Default and add-on scenery',
    className: 'sm:col-span-1 lg:col-span-4',
  },
];

export const Features = () => {
  const sectionRef = useRef(null);
  useRevealGroup(sectionRef);

  return (
    <section ref={sectionRef} className="home-section" id="features">
      <div className="home-shell">
        <div className="home-section-header mx-auto max-w-2xl text-center">
          <h2 className="home-section-title">Core features</h2>
        </div>

        <div
          data-reveal
          className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-12"
        >
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className={`group relative isolate min-h-[19rem] overflow-hidden bg-zinc-900 sm:min-h-[21rem] ${feature.className}`}
            >
              <div
                className="feature-media pointer-events-none absolute inset-0"
                aria-hidden="true"
              >
                <div className="absolute inset-0 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900 transition-transform duration-[var(--duration-slow)] ease-[var(--ease-smooth-out)] group-hover:scale-[1.015]" />
                <div className="feature-media-grid absolute inset-0 opacity-30" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-zinc-950/25 backdrop-blur-sm">
                    <Film className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <span className="text-xs font-medium tracking-wide text-zinc-300">
                    Media coming soon
                  </span>
                </div>
                <div className="absolute inset-0 bg-linear-to-t from-zinc-950/55 via-transparent to-white/[0.025]" />
              </div>

              <div className="feature-title-halo absolute bottom-0 left-0 z-10 p-6 sm:p-7">
                <h3 className="relative z-10 text-lg font-semibold tracking-tight text-white sm:text-xl">
                  {feature.title}
                </h3>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
