import { useEffect, useRef } from 'react';
import { Layout } from '../components/layout/Layout';

const About = () => {
  const sectionRefs = useRef([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0');
            entry.target.classList.remove('opacity-0', 'translate-y-10');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -80px 0px' }
    );

    sectionRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const setSectionRef = (index) => (el) => {
    sectionRefs.current[index] = el;
  };

  return (
    <Layout>
      <section className="pt-38 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <div
            ref={setSectionRef(0)}
            className="space-y-6 pb-12 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <span className="inline-block px-3 py-1.5 text-xs font-medium uppercase tracking-widest text-emerald-400 bg-emerald-950/50 border border-emerald-800/40 rounded-md">
              About
            </span>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">What is BARS?</h1>
            <p className="text-base md:text-lg text-zinc-400 leading-relaxed">
              BARS is an advanced airport lighting simulation platform that synchronizes real-time
              airport lighting states between controllers and pilots on VATSIM. It brings stopbars,
              follow the greens, runway lead‑on/off lights and gate lead‑in lighting to life while
              adapting to default and third‑party scenery seamlessly, without a restart. BARS
              supports Microsoft Flight Simulator 2020 and 2024, and is designed to remain
              lightweight for smooth simulator performance.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              The project is fully open source and community driven. All our finances are completely
              public - donations, expenses, and transactions - ensuring your support is used
              responsibly. BARS uses an open contribution system that lets the community create
              scenery contributions using division data, expanding global support. Each object gets
              a unique BARS ID with metadata, and contributors simply name their scenery polygons
              after those IDs. The system then generates the correct lighting behavior
              automatically.
            </p>
          </div>

          <div
            ref={setSectionRef(1)}
            className="pt-10 pb-12 border-t border-zinc-900 space-y-4 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <h2 className="text-2xl md:text-3xl font-semibold">Why it exists</h2>
            <p className="text-zinc-400 leading-relaxed">
              BARS exists because there was a clear gap in advanced lighting for flight simulation.
              Real‑time, ATC controlled lighting synced to pilots on VATSIM simply didn’t exist, and
              was assumed to be impossible. BARS was built to bring that realism to life and to make
              ground operations feel as immersive and realistic as the real world.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              It adds a new level of realism where you can depart an airport and experience the same
              stopbars, follow the greens, and other lighting systems found in the real world, all
              virtually. It also introduces a practical safety layer similar to what exists at real
              airports, bringing the same safety benefits found through using various different
              lights.
            </p>
          </div>

          <div
            ref={setSectionRef(2)}
            className="pt-10 pb-12 border-t border-zinc-900 space-y-4 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <h2 className="text-2xl md:text-3xl font-semibold">Where it started</h2>
            <p className="text-zinc-400 leading-relaxed">
              For years, the idea of controllers managing airport lighting directly into pilots
              simulators through online networks like VATSIM was imagined. Decades ago, previous
              attempts aimed to achieve this, allowing controllers to toggle stopbars on and off
              when issuing clearances. Over time, this idea continued to be discussed on and off,
              but was always dismissed due to how vast and technical such a project would be.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              Development began in late 2024 after the idea of vatSys plugin to manage stopbars came
              up inside the community. The earliest prototype was a simple controller only plugin
              that showed stopbar state changes only inside the client, displayed through a simple
              ground window. That quickly led to experiments with SimConnect, object placement, and
              the first visible in-sim lighting renders.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              On January 11, 2025, the first public demo shipped in Australia, allowing pilots to
              run a pilot client and see lighting state changes in real time. Interest grew rapidly
              and the project expanded to more airports, improved backend services, and introduced
              an EuroScope plugin to broaden controller support.
            </p>
          </div>

          <div
            ref={setSectionRef(3)}
            className="pt-10 pb-12 border-t border-zinc-900 space-y-6 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <h2 className="text-2xl md:text-3xl font-semibold">Who made BARS</h2>
            <div className="space-y-4 text-zinc-400">
              <div>
                <p className="text-sm font-semibold text-white">Edward M</p>
                <p className="text-sm">Cofounder, Lead Developer — edward@stopbars.com</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Charlie H</p>
                <p className="text-sm">Cofounder, Product Manager — charlie@stopbars.com</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">19wintersp</p>
                <p className="text-sm">EuroScope Plugin Manager — contact via Discord</p>
              </div>
            </div>
          </div>

          <div
            ref={setSectionRef(4)}
            className="pt-10 pb-12 border-t border-zinc-900 space-y-4 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <h2 className="text-2xl md:text-3xl font-semibold">What’s planned</h2>
            <p className="text-zinc-400 leading-relaxed">
              We are continuing our mission to deliver an advanced airport lighting platform that is
              free, realistic, open source, and accessible. Our focus is on maintaining and
              upgrading the existing platform for future growth, stability, and financial
              sustainability to keep BARS running for years to come.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              Planned improvements include expanded lighting systems, deeper simulator and scenery
              support, and improved optimization while staying lightweight for smooth simulator
              performance. Along the way, users get to explore and gain a deeper understanding of
              the various real-world airport lighting systems that power BARS.
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default About;
