import { Button } from '../shared/Button';
import { useNavigate } from 'react-router-dom';

// CTA banner displayed beneath the Support section on the Home page
// TODO: Wire the Download button href once installer / download page is available.
export const CTA = () => {
  const navigate = useNavigate();
  return (
    <section className="pt-12 pb-24">
      <div className="max-w-5xl mx-auto px-6">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl px-10 py-16 text-center relative overflow-hidden">
          {/* Subtle gradient / vignette */}
          <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_70%)]" />

          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white relative z-10">
            Get started with <span className="text-red-500">BARS</span> today,{' '}
            <span className="text-green-400">completely free</span>
          </h2>
          <p className="mt-4 text-base md:text-lg text-zinc-300 max-w-3xl mx-auto leading-relaxed relative z-10">
            Join thousands of virtual controllers and pilots using BARS to create a more realistic
            airport lighting simulation. Experience realistic stopbars, follow the greens, real‑time
            syncing, global airport support, and much more, open source, and completely free.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
            <Button
              variant="secondary"
              onClick={() => navigate('/about')}
              className="w-full sm:w-auto px-8 py-3 text-sm font-medium"
            >
              Learn more
            </Button>
            <Button
              variant="primary"
              // TODO: Replace onClick with actual download link when available
              onClick={() => {
                /* Add download link logic here */
              }}
              className="w-full sm:w-auto px-8 py-3 text-sm font-medium"
            >
              Download
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTA;
