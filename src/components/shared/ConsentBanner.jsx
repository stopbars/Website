import { useEffect } from 'react';
import { Cookie } from 'lucide-react';
import { Button } from './Button';
import posthog from 'posthog-js';
import PropTypes from 'prop-types';

export const ConsentBanner = ({ show, setShow }) => {
  useEffect(() => {
    const consent = localStorage.getItem('analytics-consent');
    const gpc = typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true;
    const dnt = typeof navigator !== 'undefined' && (navigator.doNotTrack === '1' || window.doNotTrack === '1');

    // Respect Global Privacy Control / Do Not Track
    if (!consent && (gpc || dnt)) {
      localStorage.setItem('analytics-consent', 'denied');
    }

    if (!posthog) return;
    if (consent === 'granted') {
      // Enable features and persistence on granted
      posthog.set_config({
        autocapture: true,
        capture_exceptions: true,
        persistence: 'localStorage+cookie',
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: { password: true, email: true },
        },
      });
      posthog.opt_in_capturing();
      if (posthog.loadSessionRecordingScripts) {
        posthog.loadSessionRecordingScripts();
      }
      if (posthog.startSessionRecording) {
        posthog.startSessionRecording();
      }
    } else {
      // Denied or unknown: ensure disabled, no persistence
      posthog.set_config({
        autocapture: false,
        capture_exceptions: false,
        persistence: 'memory',
        session_recording: { maskAllInputs: true, maskInputOptions: { password: true, email: true } },
      });
      posthog.opt_out_capturing();
      if (posthog.stopSessionRecording) {
        posthog.stopSessionRecording();
      }
    }
  }, []);

  const handleAccept = () => {
    if (posthog) {
      // Switch to persistent storage and enable features only on accept
      posthog.set_config({
        autocapture: true,
        capture_exceptions: true,
        persistence: 'localStorage+cookie',
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: { password: true, email: true },
        },
      });
      posthog.opt_in_capturing();
      if (posthog.loadSessionRecordingScripts) {
        posthog.loadSessionRecordingScripts();
      }
      if (posthog.startSessionRecording) {
        posthog.startSessionRecording();
      }
      // Record consent event immediately so data appears without refresh
      posthog.capture('consent_granted');
    }
    localStorage.setItem('analytics-consent', 'granted');
    setShow(false);
  };

  const handleDecline = () => {
    if (posthog) {
      // Ensure tracking fully disabled when declined
      posthog.set_config({
        autocapture: false,
        capture_exceptions: false,
        persistence: 'memory',
        session_recording: {
          maskAllInputs: true,
          maskInputOptions: { password: true, email: true },
        },
      });
      posthog.opt_out_capturing();
      if (posthog.stopSessionRecording) {
        posthog.stopSessionRecording();
      }
    }
    localStorage.setItem('analytics-consent', 'denied');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm p-5 bg-zinc-900/95 rounded-xl border border-zinc-700 shadow-xl backdrop-blur-sm animate-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col">
        <div className="flex items-start gap-2 mb-3">
          <Cookie className="w-5 h-5 text-white/90" aria-hidden="true" />
          <h3 className="text-base font-medium">We’d like to use analytics</h3>
        </div>
        <p className="text-zinc-400 text-xs mb-4 leading-relaxed">
          We use PostHog Cloud EU to understand usage and improve BARS. No tracking occurs until you accept.
          See our <a href="/privacy" className="underline hover:text-white">Privacy Policy</a>.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button
            onClick={handleAccept}
            className="text-xs py-2 px-4 h-8"
          >
            Accept All
          </Button>
          <Button
            variant="outline"
            onClick={handleDecline}
            className="text-xs py-2 px-4 h-8 transition-all duration-300 ease-out hover:bg-zinc-800 hover:border-zinc-600"
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
  setShow: PropTypes.func.isRequired
};