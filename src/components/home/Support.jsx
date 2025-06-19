import { FileText, AlertCircle, ArrowRight } from '../shared/Icons';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';

export const Support = () => {
  return (
    <section className="py-24" id="support">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-3xl font-bold mb-4">Need Help?</h2>
        <p className="text-zinc-400 mb-12 max-w-2xl">
          We&apos;re here to help you get the most out of BARS. Join our community for support and updates.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <Card className="p-8">
            <FileText className="w-8 h-8 text-zinc-400 mb-4" />
            <h3 className="text-xl font-medium mb-4">Documentation</h3>
            <p className="text-zinc-400 text-sm mb-6">
              Access comprehensive guides for installation, configuration, and usage for both pilots and controllers.
            </p>
            <Button 
              variant="secondary" 
              className="w-full"
              onClick={() => window.location.href = '/documentation'}
            >
              View Guides
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>

          <Card className="p-8">
            <AlertCircle className="w-8 h-8 text-zinc-400 mb-4" />
            <h3 className="text-xl font-medium mb-4">Report an Issue</h3>
            <p className="text-zinc-400 text-sm mb-4">
              Found a bug? Report it through our Discord server with detailed information to help us investigate.
            </p>
            <div className="p-3 bg-zinc-800/50 rounded-lg mb-6">
              <p className="text-xs text-zinc-400">
                Remember to save your log files from:
                <code className="block mt-1 font-mono bg-zinc-800 px-2 py-1 rounded text-emerald-400">
                  %localappdata%/BARS
                </code>
              </p>
            </div>
          </Card>

          <Card className="p-8">
            <div className="bg-indigo-500/10 rounded-xl p-6 mb-6">
              <h3 className="text-xl font-medium mb-2">Join Our Community</h3>
              <p className="text-zinc-400 text-sm">
                Connect with other BARS users, get support, and stay updated with the latest news and features.
              </p>
            </div>
            <Button 
              className="w-full bg-indigo-600 hover:bg-indigo-500"
              onClick={() => window.open('https://discord.gg/7EhmtwKWzs', '_blank')}
            >
              Join Discord Community
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        </div>
      </div>
    </section>
  );
};