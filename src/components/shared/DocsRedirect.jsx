import { useEffect } from 'react';

export const DocsRedirect = () => {
  useEffect(() => {
    window.location.assign('https://docs.stopbars.com');
  }, []);

  return;
};
