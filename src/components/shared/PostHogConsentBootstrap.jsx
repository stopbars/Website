import { useEffect } from 'react';
import posthog from 'posthog-js';

// Applies stored consent and preferences on app startup and route changes
export const PostHogConsentBootstrap = () => {
  useEffect(() => {
    try {
      const consent = localStorage.getItem('analytics-consent');

      if (!posthog) return;

      if (consent === 'granted') {
        // Full enable on granted
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
        // Unknown or denied => ensure fully disabled
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
    } catch (e) {
      // Fails silently
      console.error('PostHogConsentBootstrap error', e);
    }
  }, []);

  return null;
};
