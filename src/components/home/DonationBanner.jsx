import { HeartHandshake, ArrowRight } from 'lucide-react';

export const DonationBanner = () => {
  return (
    <section className="pt-10 pb-20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="relative overflow-hidden rounded-2xl bg-emerald-900 border border-emerald-700">
          <div className="relative px-8 py-10 text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <HeartHandshake className="w-7 h-7 text-white" />
              <h2 className="text-2xl font-semibold text-white">Keep BARS free for everyone!</h2>
            </div>

            <p className="text-lg text-emerald-50">
              We’re 100% community‑funded. Even $5 helps cover servers and development.
            </p>

            <div className="mt-6">
              <div className="mx-auto max-w-2xl rounded-lg bg-emerald-900 border border-emerald-700 p-6">
                <p className="text-emerald-50">
                  As our community grows, so do our costs. Your support directly keeps BARS free and
                  accessible for everyone. All our finances are completely public, donations,
                  expenses, and transactions, ensuring your support is used responsibly.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <a
                href="https://opencollective.com/stopbars"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center px-7 py-3 text-base font-semibold rounded-md text-white bg-emerald-700 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900 transition-transform duration-200 hover:scale-[1.02] shadow-lg shadow-emerald-900/30"
                aria-label="Support BARS with a donation on Open Collective"
              >
                Support BARS
                <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DonationBanner;
