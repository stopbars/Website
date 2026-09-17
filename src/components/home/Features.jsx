import { useRef, useState } from 'react';
import { ImageLightbox } from './ImageLightbox';
import { useRevealGroup } from '../../hooks/useRevealGroup';
import { ComingSoonMedia } from './ComingSoonMedia';
import { OptimizedImage } from '../shared/OptimizedImage';

const WIDE_IMAGE_SIZES =
  '(min-width: 1024px) 827px, (min-width: 640px) calc(100vw - 48px), max(calc(100vw - 48px), 507px)';
const NARROW_IMAGE_SIZES =
  '(min-width: 1024px) 414px, (min-width: 640px) max(calc((100vw - 48px) / 2), 404px), max(calc(100vw - 48px), 365px)';

const FEATURES = [
  {
    title: 'Stopbars',
    image: '/stopbar.png',
    sizes: WIDE_IMAGE_SIZES,
    imageAlt: 'Qantas aircraft approaching illuminated red stopbar lights at dusk',
    className: 'sm:col-span-2 lg:col-span-8 lg:min-h-[31rem]',
  },
  {
    title: 'MSFS and X-Plane',
    image: '/xp-msfs.png',
    imageAlt: 'Airfield lighting in Microsoft Flight Simulator and X-Plane at dusk',
    className: 'sm:col-span-1 lg:col-span-4 lg:min-h-[31rem]',
  },
  {
    title: 'Lead On/Off',
    image: '/lead-on-off.png',
    imageAlt: 'Green lead-on lights extending from a runway holding point at dusk',
    className: 'sm:col-span-1 lg:col-span-4',
  },
  {
    title: 'Uni/Bi Directional Lighting',
    image: '/uni-bi-lighting.png',
    imageAlt: 'Directional red airfield lights beside taxiway markings',
    className: 'sm:col-span-1 lg:col-span-4',
  },
  {
    title: 'Custom 3D Models',
    image: '/custom-3d-models.png',
    imageAlt: 'Inset and elevated red airfield light 3D models',
    className: 'sm:col-span-1 lg:col-span-4',
  },
  {
    title: 'Follow The Greens',
    image: '/follow-the-greens.png',
    sizes: WIDE_IMAGE_SIZES,
    imageAlt: 'Aircraft following green taxiway lights at dusk',
    className: 'sm:col-span-2 lg:col-span-8 lg:min-h-[31rem]',
  },
  {
    title: 'Default & Third-party Scenery',
    image: '/default-third-party-scenery.png',
    imageAlt: 'YSCB scenery listings for Default and Impulse Simulations across X-Plane and MSFS',
    className: 'sm:col-span-1 lg:col-span-4 lg:min-h-[31rem]',
  },
];

export const Features = () => {
  const sectionRef = useRef(null);
  const [selectedFeature, setSelectedFeature] = useState(null);
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
              {feature.image ? (
                <OptimizedImage
                  src={feature.image}
                  alt={feature.imageAlt}
                  sizes={feature.sizes ?? NARROW_IMAGE_SIZES}
                  loading="lazy"
                  decoding="async"
                  className="feature-media pointer-events-none absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <ComingSoonMedia className="feature-media pointer-events-none absolute inset-0" />
              )}

              <div className="feature-title-halo absolute bottom-0 left-0 z-10 p-6 sm:p-7">
                <h3 className="relative z-10 text-lg font-semibold tracking-tight text-white sm:text-xl">
                  {feature.title}
                </h3>
              </div>
              {feature.image && (
                <button
                  type="button"
                  className="absolute inset-0 z-20 cursor-zoom-in rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-blue-400"
                  aria-label={`View ${feature.title} image`}
                  aria-haspopup="dialog"
                  onClick={() => setSelectedFeature(feature)}
                />
              )}
            </article>
          ))}
        </div>
      </div>
      {selectedFeature && (
        <ImageLightbox feature={selectedFeature} onClose={() => setSelectedFeature(null)} />
      )}
    </section>
  );
};
