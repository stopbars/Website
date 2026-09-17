import { ArrowUpRight, MapPinned, PenLine, ToggleRight, UserPlus } from 'lucide-react';
import { useRef } from 'react';
import { useRevealGroup } from '../../hooks/useRevealGroup';
import { OptimizedImage } from '../shared/OptimizedImage';

const DIVISION_FEATURES = [
  { title: 'Add members', icon: UserPlus },
  { title: 'Manage airports', icon: MapPinned },
  { title: 'Create data', icon: PenLine },
  { title: 'Enable contributions', icon: ToggleRight },
];

export const DivisionData = () => {
  const sectionRef = useRef(null);
  useRevealGroup(sectionRef);

  return (
    <section
      ref={sectionRef}
      className="deferred-section home-section mt-24 sm:mt-32"
      id="division-data"
    >
      <div className="home-shell">
        <div data-reveal className="home-panel grid overflow-hidden lg:grid-cols-[0.95fr_1.05fr]">
          <div className="flex flex-col px-6 py-8 sm:p-10 lg:p-12">
            <h2 className="home-section-title">Division Data</h2>
            <p className="home-section-copy">
              Divisions have full control over BARS object data for airports in their jurisdiction.
              Manage your airports&apos; lighting directly in BARS, keep facility data accurate, and
              use community scenery contributions to extend compatibility.
            </p>

            <ul className="my-9 grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 lg:my-10">
              {DIVISION_FEATURES.map(({ title, icon: Icon }) => (
                <li key={title} className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-zinc-800 text-zinc-200">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className="text-sm font-medium text-zinc-100">{title}</span>
                </li>
              ))}
            </ul>

            <a
              href="https://docs.stopbars.com/divisions"
              className="mt-auto inline-flex min-h-11 w-fit items-center gap-2 rounded-md text-sm font-medium text-zinc-200 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-4 focus-visible:ring-offset-zinc-900"
            >
              Explore division docs
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          <div className="min-w-0 px-6 pb-6 sm:px-10 sm:pb-10 lg:flex lg:items-center lg:py-10 lg:pl-0 lg:pr-10">
            <OptimizedImage
              src="/division-data.png"
              sizes="(min-width: 1280px) 608px, (min-width: 1024px) 50vw, calc(100vw - 96px)"
              alt="Airport lighting data with green taxiway routes and red stopbars over a satellite map"
              width={762}
              height={489}
              loading="lazy"
              decoding="async"
              className="h-auto w-full rounded-xl border border-white/10"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
