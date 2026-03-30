import { useEffect } from 'react';

export const DonateRedirect = () => {
  useEffect(() => {
    window.location.href = 'https://opencollective.com/stopbars';
  }, []);

  return;
};
