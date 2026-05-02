import { useMemo } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, KeyRound, Shield, XCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getVatsimToken } from '../utils/cookieUtils';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/shared/Button';
import { Card } from '../components/shared/Card';

const AUTH_GRANT_CLIENTS = new Map([
  [
    'ZGlzY29yZC5zdG9wYmFycy5jb20=',
    { name: 'BARS Linker', redirectUrl: 'https://discord.stopbars.com/bars/redirect' },
  ],
  [
    'ZXVyb3Njb3BlLnN0b3BiYXJzLmNvbQ==',
    { name: 'Euroscope Editor', redirectUrl: 'https://euroscope.stopbars.com/bars/redirect' },
  ],
  [
    'd2ViLnN0b3BiYXJzLmNvbQ==',
    { name: 'Web Client', redirectUrl: 'https://web.stopbars.com/bars/redirect' },
  ],
]);

const getClientRequest = (clientKey) => {
  const client = AUTH_GRANT_CLIENTS.get(clientKey || '');

  if (!client) {
    return { error: 'Redirect not allowed.' };
  }

  try {
    const url = new URL(client.redirectUrl);
    url.hash = '';
    return { client, url };
  } catch {
    return { error: 'Redirect not allowed.' };
  }
};

const buildCallbackRedirect = (redirectUrl, values) => {
  const destination = new URL(redirectUrl.toString());
  destination.hash = new URLSearchParams(values).toString();
  return destination.toString();
};

export default function AuthGrant() {
  const { user, loading, initiateVatsimAuth, bannedInfo } = useAuth();

  const request = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const clientRequest = getClientRequest(params.get('client'));

    return {
      appName: clientRequest.client?.name || 'Unknown client',
      redirectUrl: clientRequest.url,
      redirectError: clientRequest.error,
    };
  }, []);

  const token = getVatsimToken();
  const apiToken = user?.api_key;
  const hasValidRequest = Boolean(request.redirectUrl);
  const canGrant = Boolean(apiToken && hasValidRequest && !bannedInfo?.banned);

  const handleSignIn = () => {
    if (!hasValidRequest) return;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    initiateVatsimAuth(currentPath);
  };

  const handleGrant = () => {
    if (!canGrant) return;

    const destination = buildCallbackRedirect(request.redirectUrl, {
      bars_api_token: apiToken,
    });

    window.location.assign(destination);
  };

  const handleDeny = () => {
    if (request.redirectUrl) {
      const destination = buildCallbackRedirect(request.redirectUrl, {
        error: 'access_denied',
        error_description: 'The user denied access to their BARS API token.',
      });
      window.location.assign(destination);
      return;
    }

    window.location.assign('/account');
  };

  return (
    <Layout>
      <div className="min-h-screen pt-40 pb-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Authorize Access</h1>
              <p className="mt-2 text-sm text-zinc-400">
                Review this external access request before proceeding
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300">
              <Shield className="mr-2 h-4 w-4 text-white" />
              Consent required
            </span>
          </div>

          <Card className="border border-zinc-800 p-0">
            <div className="border-b border-zinc-800 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/80">
                    <KeyRound className="h-5 w-5 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    {hasValidRequest ? (
                      <>
                        <h2 className="text-xl font-semibold text-white">{request.appName}</h2>
                        <p className="mt-1 text-sm text-zinc-400">
                          Wants access to your BARS API Token
                        </p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-xl font-semibold text-white">Invalid request</h2>
                        <p className="mt-1 text-sm text-zinc-400">Redirect not allowed.</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 p-5 sm:p-6">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                <div className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  Keep your token secret
                </div>
                <p className="text-sm leading-6 text-zinc-300">
                  Grant only if you trust this application. It can use your API Token until you
                  regenerate it from your account page.
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/50">
                <div className="grid gap-0 sm:grid-cols-[10rem_1fr]">
                  <div className="border-b border-zinc-800/50 px-4 py-3 text-sm font-medium text-zinc-400 sm:border-b-0 sm:border-r">
                    Application
                  </div>
                  <div className="border-b border-zinc-800/50 px-4 py-3 text-sm text-zinc-100 sm:border-b">
                    {request.appName}
                  </div>

                  <div className="border-b border-zinc-800/50 px-4 py-3 text-sm font-medium text-zinc-400 sm:border-b-0 sm:border-r">
                    Redirect
                  </div>
                  <div className="px-4 py-3">
                    {request.redirectUrl ? (
                      <div className="min-w-0">
                        <p className="break-all text-sm font-medium text-zinc-100">
                          {request.redirectUrl.origin}
                        </p>
                        <p className="mt-1 break-all text-xs text-zinc-500">
                          {request.redirectUrl.pathname}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm leading-6 text-red-400">{request.redirectError}</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-zinc-400">
                  By granting access, this allows:
                </h3>
                <div className="overflow-hidden rounded-lg border border-zinc-800/50 bg-zinc-900/50">
                  <div className="flex items-start gap-3 border-b border-zinc-800/50 p-4 text-sm text-zinc-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                    <p>Authenticate to the BARS API as your account.</p>
                  </div>
                  <div className="flex items-start gap-3 border-b border-zinc-800/50 p-4 text-sm text-zinc-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                    <p>Use API access available to your account and roles.</p>
                  </div>
                  <div className="flex items-start gap-3 p-4 text-sm text-zinc-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                    <p>Continue working until you regenerate your API token.</p>
                  </div>
                </div>
              </div>

              {!loading && !token && (
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-300">
                  You need to sign in before you can review this request.
                </div>
              )}

              {!loading && token && !apiToken && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                  Your account data loaded, but no BARS API token is available to grant.
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-zinc-800 bg-zinc-900/30 p-5 sm:flex-row sm:justify-end sm:p-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleDeny}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                <XCircle className="h-4 w-4" />
                Deny
              </Button>

              {!token ? (
                <Button
                  type="button"
                  onClick={handleSignIn}
                  disabled={loading || !hasValidRequest}
                  className="w-full sm:w-auto"
                >
                  Login to review
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleGrant}
                  disabled={loading || !canGrant}
                  className="w-full sm:w-auto"
                >
                  Grant access
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
