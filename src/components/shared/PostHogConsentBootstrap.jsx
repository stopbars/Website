import { useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  applyConsentDenied,
  applyConsentGranted,
  CONSENT_KEY,
  ensurePosthogInitialized,
  getLoadedPosthog,
} from '../../utils/posthogLoader';

// Dynamically initialises PostHog only when consent is granted
export const PostHogConsentBootstrap = ({ children }) => {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;

    const applyState = async (value) => {
      if (cancelled) return;
      if (value === 'granted') {
        try {
          const posthog = await ensurePosthogInitialized();
          if (cancelled) return;
          applyConsentGranted(posthog);
        } catch (e) {
          console.error('PostHog consent enable failed', e);
        }
        return;
      }

      const posthog = getLoadedPosthog();
      if (posthog) {
        try {
          applyConsentDenied(posthog);
        } catch (e) {
          console.error('PostHog consent disable failed', e);
        }
      }
    };

    const storedConsent = window.localStorage.getItem(CONSENT_KEY);
    applyState(storedConsent);

    const storageListener = (event) => {
      if (event.key === CONSENT_KEY) {
        applyState(event.newValue);
      }
    };

    const customListener = (event) => {
      applyState(event.detail);
    };

    window.addEventListener('storage', storageListener);
    window.addEventListener('analytics-consent-change', customListener);

    return () => {
      cancelled = true;
      window.removeEventListener('storage', storageListener);
      window.removeEventListener('analytics-consent-change', customListener);
    };
  }, []);

  // Ensure downstream consumers always render regardless of consent state
  return children;
};

PostHogConsentBootstrap.propTypes = {
  children: PropTypes.node.isRequired,
};
