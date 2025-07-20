import { FileText, AlertCircle, ArrowRight } from '../shared/Icons';
import { Check, Copy } from 'lucide-react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { useState } from 'react';

export const Support = () => {
  const [copiedPath, setCopiedPath] = useState(false);

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText('%localappdata%/BARS');
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  };

  return (
    <section className="py-24" id="support">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-3xl font-bold mb-4">Need Help?</h2>
        <p className="text-zinc-300 mb-12 max-w-2xl">
          We&apos;re here to help you get the most out of BARS, join our community for support and updates.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8">
          <Card className="p-8">
            <FileText className="w-8 h-8 text-zinc-300 mb-4" />
            <h3 className="text-xl font-medium mb-4">Documentation</h3>
            <p className="text-zinc-300 text-sm mb-6">
              Access comprehensive guides for installation, configuration, and usage for both pilots and controllers.
            </p>
            <Button 
              variant="secondary" 
              className="w-full"
              onClick={() => window.location.href = '/documentation'}
              aria-label="View installation and configuration guides"
            >
              View Guides
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>

          <Card className="p-8">
            <AlertCircle className="w-8 h-8 text-zinc-300 mb-4" />
            <h3 className="text-xl font-medium mb-4">Report an Issue</h3>
            <p className="text-zinc-300 text-sm mb-4">
              Found a bug? Report it through our Discord server with detailed information to help us investigate.
            </p>
            <div className="p-2 bg-zinc-800/50 rounded-lg mb-4">
              <p className="text-xs text-zinc-300 mb-1">
                Remember to save your log files from:
              </p>
              <div className="flex items-center justify-between p-1.5 bg-zinc-800 rounded">
                <code className="font-mono text-emerald-400 text-xs">
                  %localappdata%/BARS
                </code>
                <button
                  onClick={handleCopyPath}
                  className="text-zinc-300 hover:text-white transition-colors p-1 hover:bg-zinc-700 rounded focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
                  aria-label={copiedPath ? "Path copied to clipboard" : "Copy log file path to clipboard"}
                >
                  {copiedPath ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            </div>
          </Card>

          <Card className="p-8">
            <div className="bg-[#6366F1]/10 rounded-xl p-6 mb-6">
              <h3 className="text-xl font-medium mb-2">Join Our Community</h3>
              <p className="text-zinc-400 text-sm">
                Connect with other BARS users, get support, and stay updated with the latest news and features. 
              </p>
            </div>
            <Button 
              className="w-full bg-indigo-600 hover:bg-indigo-500 focus:bg-indigo-500"
              onClick={() => window.open('https://stopbars.com/discord', '_blank')}
              aria-label="Join BARS Discord community for support and updates"
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