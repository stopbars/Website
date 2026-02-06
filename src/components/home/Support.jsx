import { MessagesSquare, FileText, HeartHandshake, ExternalLink } from 'lucide-react';
import { Button } from '../shared/Button';

export const Support = () => {
  return (
    <section className="py-32 relative overflow-hidden" id="support">
      {/* Background decoration*/}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/5 blur-3xl rounded-full" />

      <div className="relative max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">We&apos;re here to help</h2>
          <p className="text-zinc-400 text-lg">
            Get support, report issues, stay updated with the latest news.
          </p>
        </div>

        {/* Main Support Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Documentation Card */}
          <div className="group relative p-8 rounded-2xl bg-linear-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors duration-300 flex flex-col">
            <div className="relative flex flex-col flex-1">
              <div className="w-14 h-14 mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <FileText className="w-7 h-7 text-red-400" />
              </div>

              <h3 className="text-xl font-semibold mb-3">Documentation</h3>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed flex-1">
                Comprehensive guides covering installation, configuration, and usage for all
                products.
              </p>

              <Button
                variant="secondary"
                className="w-full group/btn bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 mt-auto"
                onClick={() =>
                  window.open('https://docs.stopbars.com', '_blank', 'noopener,noreferrer')
                }
                aria-label="View installation and configuration guides"
              >
                View Documentation
                <ExternalLink className="ml-2 h-4 w-4 opacity-50 group-hover/btn:opacity-100 transition-opacity" />
              </Button>
            </div>
          </div>

          {/* Support BARS Card */}
          <div className="group relative p-8 rounded-2xl bg-linear-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors duration-300 flex flex-col">
            <div className="relative flex flex-col flex-1">
              <div className="w-14 h-14 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <HeartHandshake className="w-7 h-7 text-emerald-400" />
              </div>

              <h3 className="text-xl font-semibold mb-3">Support BARS</h3>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed flex-1">
                We&apos;re 100% community‑funded. Your donation helps cover servers and development,
                keeping it free.
              </p>

              <Button
                variant="secondary"
                className="w-full group/btn bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 mt-auto"
                onClick={() =>
                  window.open(
                    'https://opencollective.com/stopbars',
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
                aria-label="Support BARS with a donation on Open Collective"
              >
                Open Collective
                <ExternalLink className="ml-2 h-4 w-4 opacity-50 group-hover/btn:opacity-100 transition-opacity" />
              </Button>
            </div>
          </div>

          {/* Community Card */}
          <div className="group relative p-8 rounded-2xl bg-linear-to-br from-zinc-900 to-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors duration-300 flex flex-col">
            <div className="relative flex flex-col flex-1">
              <div className="w-14 h-14 mb-6 rounded-2xl bg-[#5865F2]/10 border border-[#5865F2]/20 flex items-center justify-center">
                <MessagesSquare className="w-7 h-7 text-[#5865F2]" />
              </div>

              <h3 className="text-xl font-semibold mb-3">Join the Community</h3>
              <p className="text-zinc-400 text-sm mb-6 leading-relaxed flex-1">
                Connect with other BARS users, get help from the community, see previews of upcoming
                features.
              </p>

              <Button
                variant="secondary"
                className="w-full group/btn bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 mt-auto"
                onClick={() =>
                  window.open('https://stopbars.com/discord', '_blank', 'noopener,noreferrer')
                }
                aria-label="Join BARS Discord community for support and updates"
              >
                Discord Server
                <ExternalLink className="ml-2 h-4 w-4 opacity-50 group-hover/btn:opacity-100 transition-opacity" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
