import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { Button } from './Button';
import { RouteLink } from './RouteLink';
import PropTypes from 'prop-types';
import {
  applyConsentDenied,
  applyConsentGranted,
  CONSENT_KEY,
  dispatchConsentChange,
  ensurePosthogInitialized,
  getLoadedPosthog,
} from '../../utils/posthogLoader';

export const ConsentBanner = ({ show, setShow }) => {
  const [isRendered, setIsRendered] = useState(show);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    const gpc = typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true;
    const dnt =
      typeof navigator !== 'undefined' &&
      (navigator.doNotTrack === '1' || window.doNotTrack === '1');

    // Respect Global Privacy Control / Do Not Track
    if (!consent && (gpc || dnt)) {
      localStorage.setItem(CONSENT_KEY, 'denied');
      dispatchConsentChange('denied');
    }
  }, []);

  useEffect(() => {
    if (show) {
      setIsRendered(true);
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setIsVisible(false);
    if (!isRendered) return undefined;

    const closeDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350;
    const timer = window.setTimeout(() => setIsRendered(false), closeDuration);
    return () => window.clearTimeout(timer);
  }, [isRendered, show]);

  const handleAccept = async () => {
    const posthog = await ensurePosthogInitialized();
    applyConsentGranted(posthog);
    posthog.capture?.('consent_granted');
    localStorage.setItem(CONSENT_KEY, 'granted');
    dispatchConsentChange('granted');
    setShow(false);
  };

  const handleDecline = () => {
    const posthog = getLoadedPosthog();
    applyConsentDenied(posthog);
    localStorage.setItem(CONSENT_KEY, 'denied');
    dispatchConsentChange('denied');
    setShow(false);
  };

  if (!isRendered) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-zinc-700 bg-zinc-900/95 p-5 backdrop-blur-sm transition-[filter,opacity,transform] ease-[var(--ease-smooth-out)] ${isVisible ? 'translate-y-0 scale-100 blur-0 opacity-100 duration-[var(--duration-slow)]' : 'pointer-events-none translate-y-2 scale-[var(--scale-small)] blur-[var(--blur-small)] opacity-0 duration-[var(--duration-medium)]'}`}
    >
      <div className="flex flex-col">
        <div className="flex items-start gap-2 mb-3">
          <Cookie className="w-5 h-5 text-white/90" aria-hidden="true" />
          <h3 className="text-base font-medium">We’d like to use analytics</h3>
        </div>
        <p className="text-zinc-400 text-xs mb-4 leading-relaxed">
          We use PostHog Cloud EU to understand usage and improve BARS. No tracking occurs until you
          accept. See our{' '}
          <RouteLink to="/privacy" className="underline hover:text-white">
            Privacy Policy
          </RouteLink>
          .
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button onClick={handleAccept} className="text-xs py-2 px-4 h-8">
            Accept
          </Button>
          <Button
            variant="outline"
            onClick={handleDecline}
            className="h-8 px-4 py-2 text-xs hover:border-zinc-600 hover:bg-zinc-800"
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
};

ConsentBanner.propTypes = {
  show: PropTypes.bool.isRequired,
  setShow: PropTypes.func.isRequired,
};
