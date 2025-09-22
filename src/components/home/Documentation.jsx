import { ArrowRight } from '../shared/Icons';
import { Github, PlaneTakeoff } from 'lucide-react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { useNavigate } from 'react-router-dom';

export const Documentation = () => {
  const navigate = useNavigate();

  return (
    <section className="py-24" id="contribute">
      <div className="max-w-7xl mx-auto px-6">
        <div className="mb-16">
          <h2 className="text-3xl font-bold mb-4">Join Our Contributors</h2>
          <p className="text-zinc-400">
            Help expand BARS through airport mapping and open-source development
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Airport Mapping Contributions */}
          <Card className="p-5">
            <div className="flex items-center mb-4">
              <PlaneTakeoff className="w-5 h-5 mr-3 text-zinc-400" />
              <h3 className="text-lg font-medium">Airport Lighting</h3>
            </div>

            <p className="text-zinc-400 mb-5 text-sm">
              Expand airport and scenery compatibility by mapping airport lighting profiles for your
              home airport or favorite facilities, expanding the number of BARS compatible airports.
            </p>

            <ul className="space-y-2 mb-6 text-sm">
              <li className="flex items-center text-zinc-300">
                <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0"></div>
                Map airport lighting positions
              </li>
              <li className="flex items-center text-zinc-300">
                <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0"></div>
                Expand airport and scenery compatibility
              </li>
              <li className="flex items-center text-zinc-300">
                <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0"></div>
                Simple submission process
              </li>
              <li className="flex items-center text-zinc-300">
                <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0"></div>
                Improve ground operations globally
              </li>
            </ul>

            <Button onClick={() => navigate('/contribute')} className="group w-full text-sm">
              Start Mapping
              <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Card>

          {/* Open Source Development */}
          <Card className="p-5">
            <div className="flex items-center mb-4">
              <Github className="w-5 h-5 mr-3 text-zinc-400" />
              <h3 className="text-lg font-medium">Open Source Development</h3>
            </div>

            <p className="text-zinc-400 mb-5 text-sm">
              BARS is now open source! Anyone can help contribute to various pieces of BARS
              infrastructure, help ship features faster and enhance the platform for everyone.
            </p>

            <ul className="space-y-2 mb-6 text-sm">
              <li className="flex items-center text-zinc-300">
                <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0"></div>
                Speed up development cycles
              </li>
              <li className="flex items-center text-zinc-300">
                <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0"></div>
                Anyone can contribute improvements
              </li>
              <li className="flex items-center text-zinc-300">
                <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0"></div>
                Ship more features to the community
              </li>
              <li className="flex items-center text-zinc-300">
                <div className="w-2 h-2 bg-emerald-500 rounded-full mr-3 flex-shrink-0"></div>
                Enhance BARS faster together
              </li>
            </ul>

            <Button
              onClick={() =>
                window.open('https://github.com/stopbars', '_blank', 'noopener,noreferrer')
              }
              className="group w-full text-sm"
            >
              View on GitHub
              <ArrowRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default Documentation;
