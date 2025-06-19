import { useEffect } from 'react';

export const DiscordRedirect = () => {
  useEffect(() => {
    window.location.href = 'https://discord.gg/7EhmtwKWzs';
  }, []);
  
  return <div>Redirecting to Discord...</div>;
};