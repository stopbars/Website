import { useEffect } from 'react';

export const DiscordRedirect = () => {
  useEffect(() => {
    window.location.assign('https://discord.gg/7EhmtwKWzs');
  }, []);

  return;
};
