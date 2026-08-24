import { Button } from '../shared/Button';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import { useRevealGroup } from '../../hooks/useRevealGroup';

export const Documentation = () => {
  const navigate = useNavigate();
  const sectionRef = useRef(null);
  useRevealGroup(sectionRef);

  return (
    <section
      ref={sectionRef}
      className="deferred-section home-section home-section-spacious"
      id="contribute"
    >
      <div className="home-shell">
        <div data-reveal>
          <div className="home-section-header mx-auto max-w-2xl text-center">
            <h2 className="home-section-title">Become a contributor</h2>
            <p className="home-section-copy">
              Help expand BARS through scenery contributions and open-source development
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="home-panel flex flex-col p-6 sm:p-8">
              <h3 className="mb-3 text-xl font-semibold text-white">Scenery contributions</h3>
              <p className="mb-6 flex-1 text-sm leading-relaxed text-zinc-400">
                Expand airport compatibility by submitting scenery contributions for any airport.
                Our simple streamlined process makes it easy to add support for new airports
                globally.
              </p>
              <Button
                variant="secondary"
                className="w-full group/btn bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600"
                onClick={() => navigate('/contribute')}
              >
                Start contributing
                <ExternalLink
                  className="ml-2 h-4 w-4 opacity-50 transition-opacity group-hover/btn:opacity-100"
                  aria-hidden="true"
                />
              </Button>
            </div>
            <div className="home-panel flex flex-col p-6 sm:p-8">
              <h3 className="mb-3 text-xl font-semibold text-white">Open-source development</h3>
              <p className="mb-6 flex-1 text-sm leading-relaxed text-zinc-400">
                Every contribution makes a difference. Our infrastructure welcomes developers to
                review, improve, and extend BARS. We welcome all who want to help build BARS.
              </p>
              <Button
                variant="secondary"
                className="w-full group/btn bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600"
                onClick={() =>
                  window.open('https://github.com/stopbars', '_blank', 'noopener,noreferrer')
                }
              >
                View GitHub
                <ExternalLink
                  className="ml-2 h-4 w-4 opacity-50 transition-opacity group-hover/btn:opacity-100"
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
