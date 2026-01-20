import { useEffect, useRef } from 'react';

export const Features = () => {
  const featureRefs = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0');
            entry.target.classList.remove('opacity-0', 'translate-y-12');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -80px 0px' }
    );

    featureRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const setFeatureRef = (index) => (el) => {
    featureRefs.current[index] = el;
  };

  return (
    <section className="py-16" id="features">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-20 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Core Features</h2>
          <p className="text-zinc-400 text-lg">
            BARS brings professional-grade airport lighting simulation to your flight simulator,
            completely free and in real time with VATSIM.
          </p>
        </div>

        {/* Zigzag Features */}
        <div className="space-y-40 mb-32 max-w-5xl mx-auto">
          <div
            ref={setFeatureRef(0)}
            className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 opacity-0 translate-y-12 transition-all duration-1000 ease-out"
          >
            <div className="flex-1 space-y-4">
              <h3 className="text-2xl md:text-3xl text-left font-bold">
                Realistic Stopbar Simulation
              </h3>
              <p className="text-zinc-400 text-base leading-relaxed">
                True-to-life stopbar lighting that mirrors real-world airports. Red illuminated
                stopbars at runway holding points activate and deactivate as controllers issue
                clearances.
              </p>
            </div>
            <div className="flex-1 w-full">
              <div className="relative aspect-4/3 rounded-2xl overflow-hidden border border-zinc-800 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg md:text-xl font-medium text-zinc-300">
                    Stopbar Simulation Preview
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={setFeatureRef(1)}
            className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-16 opacity-0 translate-y-12 transition-all duration-1000 ease-out"
          >
            <div className="flex-1 space-y-4">
              <h3 className="text-2xl md:text-3xl font-bold">Follow The Greens Technology</h3>
              <p className="text-zinc-400 text-base leading-relaxed">
                Navigate complex airports realistically by following the green centerline lights,
                guiding you the entire way just like the real-world system used at major airports.
              </p>
            </div>
            <div className="flex-1 w-full">
              <div className="relative aspect-4/3 rounded-2xl overflow-hidden border border-zinc-800 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg md:text-xl font-medium text-zinc-300">
                    Follow The Greens Preview
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={setFeatureRef(2)}
            className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 opacity-0 translate-y-12 transition-all duration-1000 ease-out"
          >
            <div className="flex-1 space-y-4">
              <h3 className="text-2xl md:text-3xl font-bold">Lead-On Light Systems</h3>
              <p className="text-zinc-400 text-base leading-relaxed">
                Realistic lead-on lighting that guides you onto the runway after stopbars, modeled
                with accurate light colors and positioning.
              </p>
            </div>
            <div className="flex-1 w-full">
              <div className="relative aspect-4/3 rounded-2xl overflow-hidden border border-zinc-800 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg md:text-xl font-medium text-zinc-300">
                    Lead-On Lights Preview
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={setFeatureRef(3)}
            className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-16 opacity-0 translate-y-12 transition-all duration-1000 ease-out"
          >
            <div className="flex-1 space-y-4">
              <h3 className="text-2xl md:text-3xl font-bold">VATSIM Integration</h3>
              <p className="text-zinc-400 text-base leading-relaxed">
                Seamlessly connects with VATSIM for real-time lighting updates. Controllers manage
                lights within your simulator in real time.
              </p>
            </div>
            <div className="flex-1 w-full">
              <div className="relative aspect-4/3 rounded-2xl overflow-hidden border border-zinc-800 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg md:text-xl font-medium text-zinc-300">
                    VATSIM Integration Preview
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={setFeatureRef(4)}
            className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16 opacity-0 translate-y-12 transition-all duration-1000 ease-out"
          >
            <div className="flex-1 space-y-4">
              <h3 className="text-2xl md:text-3xl font-bold">Multi-Simulator Support</h3>
              <p className="text-zinc-400 text-base leading-relaxed">
                Compatible with Microsoft Flight Simulator 2020 and 2024. Designed to remain
                lightweight for smooth performance, without impacting your frames.
              </p>
            </div>
            <div className="flex-1 w-full">
              <div className="relative aspect-4/3 rounded-2xl overflow-hidden border border-zinc-800 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg md:text-xl font-medium text-zinc-300">
                    Multi-Simulator Preview
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            ref={setFeatureRef(5)}
            className="flex flex-col lg:flex-row-reverse items-center gap-12 lg:gap-16 opacity-0 translate-y-12 transition-all duration-1000 ease-out"
          >
            <div className="flex-1 space-y-4">
              <h3 className="text-2xl md:text-3xl font-bold">Global Airport Coverage</h3>
              <p className="text-zinc-400 text-base leading-relaxed">
                Extensive library of supported airports worldwide with support through community
                contributions, seamlessly integrated with both default and major third-party
                scenery.
              </p>
            </div>
            <div className="flex-1 w-full">
              <div className="relative aspect-4/3 rounded-2xl overflow-hidden border border-zinc-800 bg-linear-to-br from-zinc-900 via-zinc-800 to-zinc-900">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg md:text-xl font-medium text-zinc-300">
                    Global Coverage Preview
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
