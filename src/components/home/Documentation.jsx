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
    <section ref={sectionRef} className="deferred-section py-40 mb-10" id="contribute">
      <div className="max-w-7xl mx-auto px-6">
        <div data-reveal>
          <div className="text-center mb-12">
            <span className="inline-block px-4 py-1.5 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-full mb-4">
              Open Source
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Become a Contributor</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">
              Help expand BARS through scenery contributions and open-source development
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex flex-col">
              <h3 className="text-xl font-semibold text-white mb-3">Scenery Contributions</h3>
              <p className="text-zinc-400 text-sm leading-relaxed flex-1 mb-6">
                Expand airport compatibility by submitting scenery contributions for any airport.
                Our simple streamlined process makes it easy to add support for new airports
                globally.
              </p>
              <Button
                variant="secondary"
                className="w-full group/btn bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600"
                onClick={() => navigate('/contribute')}
              >
                Start Contributing
                <ExternalLink className="ml-2 h-4 w-4 opacity-50 group-hover/btn:opacity-100 transition-opacity" />
              </Button>
            </div>
            <div className="p-6 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex flex-col">
              <h3 className="text-xl font-semibold text-white mb-3">Open Source Development</h3>
              <p className="text-zinc-400 text-sm leading-relaxed flex-1 mb-6">
                Every contribution makes a difference. Our infrastructure welcomes developers to
                review, improve, and extend BARS. We welcome all who want to help build the future
                of BARS.
              </p>
              <Button
                variant="secondary"
                className="w-full group/btn bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600"
                onClick={() =>
                  window.open('https://github.com/stopbars', '_blank', 'noopener,noreferrer')
                }
              >
                View GitHub
                <ExternalLink className="ml-2 h-4 w-4 opacity-50 group-hover/btn:opacity-100 transition-opacity" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
