import { useEffect } from 'react';

export const DonateRedirect = () => {
  useEffect(() => {
    window.location.assign('https://opencollective.com/stopbars');
  }, []);

  return;
};
