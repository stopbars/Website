import { ArrowRight, HeartHandshake } from 'lucide-react';

export const DonationBanner = () => {
  return (
    <section className="py-14 sm:py-16">
      <div className="home-shell">
        <div className="home-panel mx-auto flex max-w-5xl flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
              <HeartHandshake className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-white">Help Keep BARS Free</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
                BARS is community-funded. Donations help cover hosting and development.
              </p>
            </div>
          </div>

          <a
            href="https://opencollective.com/stopbars"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-100 transition-[background-color,border-color,color,scale] duration-[var(--duration-quick)] hover:border-zinc-600 hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 active:scale-[0.96] sm:self-auto"
            aria-label="Donate to BARS on Open Collective"
          >
            Donate
            <ArrowRight className="motion-forward h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
};
