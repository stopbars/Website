import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { ArrowRight, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { Layout } from '../layout/Layout';
import { Button } from '../shared/Button';
import { Card } from '../shared/Card';

const Confetti = lazy(() => import('react-confetti'));

const useViewportSize = (enabled) => {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    if (!enabled) return undefined;

    let animationFrame = null;
    const updateViewport = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        setViewport({ width: window.innerWidth, height: window.innerHeight });
      });
    };

    window.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [enabled]);

  return viewport;
};

export const SubmissionSuccess = ({ icao }) => {
  const navigate = useNavigate();
  const headingRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const viewport = useViewportSize(!prefersReducedMotion);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const confetti =
    !prefersReducedMotion && viewport.width > 0 && viewport.height > 0 ? (
      <div
        className="submission-confetti pointer-events-none fixed inset-0 z-50 overflow-hidden"
        aria-hidden="true"
      >
        <Suspense fallback={null}>
          <Confetti
            width={viewport.width}
            height={viewport.height}
            numberOfPieces={180}
            recycle={false}
            tweenDuration={1800}
            gravity={0.18}
            colors={['#60a5fa', '#34d399', '#f4f4f5', '#a1a1aa']}
          />
        </Suspense>
      </div>
    ) : null;

  return (
    <Layout>
      {confetti && typeof document !== 'undefined'
        ? createPortal(confetti, document.body)
        : confetti}

      <div className="flex min-h-screen items-center pt-32 pb-20">
        <div className="mx-auto w-full max-w-3xl px-6">
          <Card className="p-8 text-center sm:p-10">
            <div className="submission-success-enter mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/25">
              <Check className="h-8 w-8 text-emerald-400" strokeWidth={2} aria-hidden="true" />
            </div>
            <p className="mb-3 text-sm font-medium text-emerald-400">Sent for review</p>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mb-4 text-2xl font-bold text-white focus:outline-none"
            >
              Contribution submitted
            </h1>
            <p className="mb-8 text-zinc-400">Your {icao} contribution is ready for review.</p>
            <div className="flex justify-center">
              <Button onClick={() => navigate('/contribute')}>
                View contributions
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

SubmissionSuccess.propTypes = {
  icao: PropTypes.string.isRequired,
};
