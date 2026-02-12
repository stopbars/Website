import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Mail, Check } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/shared/Card';
import { Tooltip } from '../components/shared/Tooltip';

const TeamMemberCard = ({ name, role, email }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Card className="flex items-center justify-between p-4!">
      <div>
        <p className="font-medium text-white">{name}</p>
        <p className="text-sm text-zinc-400">{role}</p>
      </div>
      <Tooltip content={copied ? 'Copied!' : email}>
        <button
          onClick={handleCopyEmail}
          className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
        >
          {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Mail className="w-5 h-5" />}
        </button>
      </Tooltip>
    </Card>
  );
};

TeamMemberCard.propTypes = {
  name: PropTypes.string.isRequired,
  role: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
};

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
      {/* Hero Banner */}
      <div className="relative w-full h-[200px] sm:h-[300px] md:h-[450px] mt-[95px] sm:mt-16 overflow-hidden">
        <img
          src="/AboutBanner.png"
          alt="About banner"
          className="w-full h-full object-cover object-center"
          draggable={false}
        />
        {/* Bottom fade overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-zinc-950 via-zinc-950/40 to-transparent pointer-events-none" />
      </div>

      <section className="pt-10 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <div
            ref={setSectionRef(0)}
            className="space-y-6 pb-12 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
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
              responsibly. BARS uses a community contribution system that lets the community create
              scenery contributions using division data, expanding global airport support. Each
              object gets a unique BARS ID with metadata, and contributors simply name their scenery
              polygons after those IDs. The system then generates the correct lighting behavior
              automatically.
            </p>
          </div>

          <div
            ref={setSectionRef(1)}
            className="pt-10 pb-12 border-t border-zinc-900 space-y-4 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <h2 className="text-2xl md:text-3xl font-semibold">Why it exists</h2>
            <p className="text-zinc-400 leading-relaxed">
              BARS exists because there was a clear gap and demand for such advanced lighting
              systems. Real‑time, ATC controlled lighting synced to pilots simulators simply did not
              exist, and was assumed to be impossible. BARS was built to bring that realism to life
              and make ground operations feel as immersive and realistic as the real world.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              It adds a new level of realism where you can experience lighting change directly in
              your simulator, controlled by ATC operating the lights from within their controlling
              client, all in real time. It also introduces a practical safety layer bringing the
              same safety benefits found through using various lights, into pilots simulators.
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
              BARS development began in late 2024, after the idea of a vatSys plugin to manage
              stopbars came up amongst members of the community. The{' '}
              <a
                href="/earliest-prototype.png"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white border-b border-red-500/70 hover:border-red-400 transition-colors"
              >
                earliest prototype
              </a>{' '}
              was a simple controller only plugin that showed stopbar state changes only inside the
              client, displayed through a simple ground window. That quickly led to a{' '}
              <a
                href="/polished-plugin.png"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white border-b border-red-500/70 hover:border-red-400 transition-colors"
              >
                more polished plugin
              </a>
              , experiments with SimConnect, object placement, and the first{' '}
              <a
                href="/first-sim-renders.png"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white border-b border-red-500/70 hover:border-red-400 transition-colors"
              >
                visible in-sim lighting renders
              </a>
              . This proved that the idea was possible, and was only the start of something much
              bigger.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              After further development, it was ready. On January 11, 2025, the first public demo
              shipped in Australia, allowing pilots to run a pilot client and see controller managed
              lighting updates in their simulator in real time. The release was a success, and
              interest grew rapidly all around the world. The{' '}
              <a
                href="https://youtu.be/OWo2ahrUi2U"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white border-b border-red-500/70 hover:border-red-400 transition-colors"
              >
                release trailer
              </a>{' '}
              gained over 16,000 views, and shortly after, the stopbars.com domain was acquired.
            </p>
            <p className="text-zinc-400 leading-relaxed">
              After the initial release, it was clear the demand was real. The community grew, and
              talks quickly began on expanding global compatibility, while development continued to
              improve core systems. Most importantly, on February 3rd, 2025, BARS went global with
              the release of the{' '}
              <a
                href="https://youtu.be/Wzd6lv_mikI"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white border-b border-red-500/70 hover:border-red-400 transition-colors"
              >
                EuroScope plugin
              </a>
              , launching with several new compatible airports worldwide, through the newly
              introduced community contribution system, which would reimagine how airport scenery
              compatibility would be managed in the future.
            </p>
          </div>

          <div
            ref={setSectionRef(3)}
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

          <div
            ref={setSectionRef(4)}
            className="pt-10 pb-12 border-t border-zinc-900 space-y-6 opacity-0 translate-y-10 transition-all duration-1000 ease-out"
          >
            <h2 className="text-2xl md:text-3xl font-semibold">The Team</h2>
            <div className="space-y-4">
              <TeamMemberCard
                name="Edward M"
                role="Co-founder, Lead Developer"
                email="edward@stopbars.com"
              />
              <TeamMemberCard
                name="Charlie H"
                role="Co-founder, Product Manager"
                email="charlie@stopbars.com"
              />
              <TeamMemberCard
                name="19wintersp"
                role="EuroScope Plugin Maintainer"
                email="contact@stopbars.com"
              />
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default About;
