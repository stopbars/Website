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

export const getClientRequest = (clientKey) => {
  const client = AUTH_GRANT_CLIENTS.get(clientKey || '');
  if (!client) return { error: 'Redirect not allowed.' };
  return { client, url: new URL(client.redirectUrl) };
};

export const buildCallbackRedirect = (redirectUrl, values, state) => {
  const destination = new URL(redirectUrl.toString());
  const fragment = new URLSearchParams(values);
  if (state) fragment.set('state', state);
  destination.hash = fragment.toString();
  return destination.toString();
};
