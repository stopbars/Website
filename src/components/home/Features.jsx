import { useRef } from 'react';
import { useRevealGroup } from '../../hooks/useRevealGroup';
import { ComingSoonMedia } from './ComingSoonMedia';

const FEATURES = [
  {
    title: 'Stopbars',
    className: 'sm:col-span-2 lg:col-span-8 lg:min-h-[31rem]',
  },
  {
    title: 'Follow The Greens',
    className: 'sm:col-span-1 lg:col-span-4 lg:min-h-[31rem]',
  },
  {
    title: 'Lead On/Off',
    className: 'sm:col-span-1 lg:col-span-4',
  },
  {
    title: 'Uni/Bi Directional Lighting',
    className: 'sm:col-span-1 lg:col-span-4',
  },
  {
    title: 'Live VATSIM Integration',
    className: 'sm:col-span-1 lg:col-span-4',
  },
  {
    title: 'MSFS and X-Plane',
    className: 'sm:col-span-2 lg:col-span-8 lg:min-h-[31rem]',
  },
  {
    title: 'Default & Third-party Scenery',
    className: 'sm:col-span-1 lg:col-span-4 lg:min-h-[31rem]',
  },
];

export const Features = () => {
  const sectionRef = useRef(null);
  useRevealGroup(sectionRef);

  return (
    <section ref={sectionRef} className="home-section" id="features">
      <div className="home-shell">
        <div className="home-section-header mx-auto max-w-2xl text-center">
          <h2 className="home-section-title">Core Features</h2>
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
              <ComingSoonMedia className="feature-media pointer-events-none absolute inset-0 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-smooth-out)] group-hover:scale-[1.015]" />

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
