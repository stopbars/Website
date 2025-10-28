const CONSENT_KEY = 'analytics-consent';

let posthogImportPromise = null;
let posthogInstance = null;
let initPromise = null;

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;
const IS_DEV = import.meta.env.MODE === 'development';

const baseOptions = {
  api_host: POSTHOG_HOST,
  debug: IS_DEV,
  autocapture: false,
  capture_exceptions: false,
  persistence: 'memory',
  opt_out_capturing_by_default: true,
  session_recording: {
    maskAllInputs: true,
    maskInputOptions: { password: true, email: true },
  },
};

const consentGrantedOptions = {
  autocapture: true,
  capture_exceptions: true,
  persistence: 'localStorage+cookie',
  session_recording: {
    maskAllInputs: true,
    maskInputOptions: { password: true, email: true },
  },
};

const consentDeniedOptions = {
  autocapture: false,
  capture_exceptions: false,
  persistence: 'memory',
  session_recording: {
    maskAllInputs: true,
    maskInputOptions: { password: true, email: true },
  },
};

async function importPosthog() {
  if (!posthogImportPromise) {
    posthogImportPromise = import('posthog-js').then((mod) => mod?.default ?? mod);
  }
  posthogInstance = await posthogImportPromise;
  return posthogInstance;
}

export async function ensurePosthogInitialized() {
  const posthog = await importPosthog();

  if (!POSTHOG_KEY || !POSTHOG_HOST) {
    console.warn('PostHog environment variables missing; analytics disabled.');
    return posthog;
  }

  if (!initPromise) {
    initPromise = (async () => {
      if (!posthog.__BARS_INITIALIZED) {
        posthog.init(POSTHOG_KEY, baseOptions);
        posthog.opt_out_capturing();
        posthog.__BARS_INITIALIZED = true;
      }
      return posthog;
    })();
  }

  await initPromise;
  return posthog;
}

export function getLoadedPosthog() {
  return posthogInstance;
}

export function applyConsentGranted(posthog) {
  if (!posthog || !posthog.__BARS_INITIALIZED) return;
  posthog.set_config(consentGrantedOptions);
  posthog.opt_in_capturing();
  if (posthog.loadSessionRecordingScripts) {
    posthog.loadSessionRecordingScripts();
  }
  if (posthog.startSessionRecording) {
    posthog.startSessionRecording();
  }
}

export function applyConsentDenied(posthog) {
  if (!posthog || !posthog.__BARS_INITIALIZED) return;
  posthog.set_config(consentDeniedOptions);
  posthog.opt_out_capturing();
  if (posthog.stopSessionRecording) {
    posthog.stopSessionRecording();
  }
}

export function dispatchConsentChange(value) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('analytics-consent-change', { detail: value }));
}

export { CONSENT_KEY };
