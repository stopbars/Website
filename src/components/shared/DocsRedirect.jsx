import { useEffect } from 'react';

export const DocsRedirect = () => {
  useEffect(() => {
    window.location.href = 'https://docs.stopbars.com';
  }, []);
  
  return <div>Redirecting to Documentation...</div>;
};