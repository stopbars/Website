/* eslint-disable no-undef */
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';
import PropTypes from 'prop-types';

export const ConsentBanner = ({ show, setShow }) => {
  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem('analytics-consent');
    if (!consent) {
      // Set default denied state for GA4
      gtag('consent', 'default', {
        'analytics_storage': 'denied'
      });
    } else {
      // Apply saved preference
      gtag('consent', 'update', {
        'analytics_storage': consent === 'granted' ? 'granted' : 'denied'
      });
    }
  }, []);

  const handleAccept = () => {
    gtag('consent', 'update', {
      'analytics_storage': 'granted'
    });
    localStorage.setItem('analytics-consent', 'granted');
    setShow(false);
  };

  const handleDecline = () => {
    gtag('consent', 'update', {
      'analytics_storage': 'denied'
    });
    localStorage.setItem('analytics-consent', 'denied');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md p-4 bg-zinc-900/95 rounded-lg border border-zinc-800 shadow-lg backdrop-blur-sm">
        <div className="flex flex-col">
            <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-medium">Analytics Consent</h3>
                <button 
                    onClick={() => setShow(false)} 
                    className="text-zinc-500 hover:text-white p-1 -mt-1 -mr-1"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            
            <p className="text-zinc-400 text-xs mb-4">
                We use analytics to improve your experience. No personal data is shared.
            </p>

            <div className="flex items-center justify-end gap-2">
            <Button
                onClick={handleAccept}
                className="text-xs py-1 px-3 h-8"
            >
                Accept
            </Button>
            <Button
                variant="outline"
                onClick={handleDecline}
                className="text-xs py-1 px-3 h-8"
            >
                Decline
            </Button>
        </div>
        </div>
    </div>
);
};

ConsentBanner.propTypes = {
  show: PropTypes.bool.isRequired,
  setShow: PropTypes.func.isRequired
};