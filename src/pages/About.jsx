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
      <section className="pt-32 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <div
            ref={setSectionRef(0)}
            className="space-y-6 pb-12 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              About
            </span>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">What is BARS?</h1>
            <p className="text-base md:text-lg text-zinc-400 leading-relaxed">
              BARS is a comprehensive airport lighting simulation platform that synchronizes
              real‑time airport lighting states between controllers and pilots on VATSIM. It brings
              stopbars, follow‑the‑greens, gate lead‑in lighting, and runway lead‑on/off lights to
              life while adapting to default and third‑party scenery without a restart.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              The lighting data itself is provided by VATSIM divisions. BARS uses an open
              contribution system that lets the community map those division‑defined objects into
              each simulator. Each object gets a unique BARS ID with metadata, and contributors
              simply name their scenery polygons after those IDs. The system then generates the
              correct lighting behavior automatically.
            </p>
          </div>

          <div
            ref={setSectionRef(1)}
            className="pt-10 pb-12 border-t border-zinc-900 space-y-4 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <h2 className="text-2xl md:text-3xl font-semibold">Why it exists</h2>
            <p className="text-zinc-400 leading-relaxed">
              BARS exists because there was a clear gap in controller‑driven lighting for flight
              simulation. Real‑time, ATC‑controlled lighting synced to pilots on VATSIM simply
              didn’t exist in a complete, end‑to‑end way. BARS was built to bring that realism to
              life and to make ground operations feel as immersive and procedural as the real world.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              It adds a new level of immersion when you can taxi from the gate on a live green
              route, stop at an illuminated holding point, and proceed only when cleared. It also
              introduces a practical safety layer to virtual operations by reinforcing correct
              stopbar and runway entry behavior.
            </p>
            <ul className="list-disc pl-5 text-zinc-400 space-y-2">
              <li>Stopbars and unidirectional stopbar models</li>
              <li>Follow‑the‑greens taxi guidance</li>
              <li>Runway lead‑on and gate lead‑in lighting</li>
              <li>Real‑time sync via BARS Core</li>
            </ul>
          </div>

          <div
            ref={setSectionRef(2)}
            className="pt-10 pb-12 border-t border-zinc-900 space-y-4 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <h2 className="text-2xl md:text-3xl font-semibold">History</h2>
            <p className="text-zinc-400 leading-relaxed">
              Development began in late 2024 after the idea of controller‑controlled stopbars came
              up inside the community. The earliest prototype was a simple controller‑side preview
              that showed state changes only inside the client. That quickly led to experiments with
              SimConnect, object placement, and the first visible in‑sim lighting renders.
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
                <p className="text-sm font-semibold text-white">Edward M (AussieScorcher)</p>
                <p className="text-sm">Co‑founder, Lead Developer — edward@stopbars.com</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Charlie H (LlamaVert)</p>
                <p className="text-sm">Co‑founder, Product Manager — charlie@stopbars.com</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">19wintersp</p>
                <p className="text-sm">EuroScope Plugin Maintainer — contact via Discord</p>
              </div>
            </div>
          </div>

          <div
            ref={setSectionRef(4)}
            className="pt-10 pb-12 border-t border-zinc-900 space-y-4 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <h2 className="text-2xl md:text-3xl font-semibold">What’s planned</h2>
            <p className="text-zinc-400 leading-relaxed">
              BARS v2 is a major update that rewrites the platform for real‑time performance,
              efficiency, and long‑term scalability. It’s in active development by volunteers and is
              expected to release in 2026.
            </p>
            <p className="text-sm text-zinc-400">
              Planned improvements include expanded lighting systems, deeper simulator support,
              improved LOD optimization, and a more responsive WebSocket‑based architecture. The
              goal is to keep expanding realism while staying lightweight and reliable.
            </p>
          </div>

          <div
            ref={setSectionRef(5)}
            className="pt-10 border-t border-zinc-900 space-y-4 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <h2 className="text-2xl md:text-3xl font-semibold">Compatibility</h2>
            <p className="text-zinc-400 leading-relaxed">
              BARS supports Microsoft Flight Simulator 2020 and 2024 on Windows and requires .NET
              8.0. The installer handles setup, updates, and uninstalls, and the platform is
              designed to remain lightweight for smooth simulator performance.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              BARS is fully open source and community‑driven. For licensing details, please refer to
              the official repositories. Contributions and donations help keep infrastructure and
              development sustainable.
            </p>
            <p className="text-sm text-zinc-400">
              GitHub:{' '}
              <a
                className="text-emerald-300 hover:text-emerald-200"
                href="https://github.com/stopbars"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/stopbars
              </a>
              <span className="mx-2 text-zinc-600">•</span>
              Support:{' '}
              <a
                className="text-emerald-300 hover:text-emerald-200"
                href="https://opencollective.com/stopbars"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Collective
              </a>
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default About;
