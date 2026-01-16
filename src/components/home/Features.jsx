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
            completely free and deeply integrated with VATSIM.
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
                True-to-life stopbar lighting that mirrors real-world airport operations. Red
                illuminated bars at runway holding points provide pilots with clear visual guidance
                during taxi.
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
                Navigate complex airport layouts with confidence. Green centerline lights illuminate
                your assigned taxi route in real-time, guiding you from gate to runway and back.
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
                Enhanced guidance during low visibility operations. Sequential flashing lights
                create a visual pathway along your taxi route, reducing the risk of runway
                incursions.
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
                Seamlessly connects with VATSIM for real-time ATC coordination. Receive stopbar
                commands and taxi clearances directly from controllers for authentic online flying.
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
                Compatible with Microsoft Flight Simulator and other major platforms. One solution
                that works across your favorite simulators with consistent performance.
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
                Extensive library of airports worldwide with accurate lighting configurations.
                Community-driven contributions continuously expand coverage to new destinations.
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
