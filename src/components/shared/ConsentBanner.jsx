/* eslint-disable no-undef */
import { useEffect } from 'react';
import { X, Cookie } from 'lucide-react';
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
    <div className="fixed bottom-4 right-4 z-50 max-w-sm p-5 bg-zinc-900/95 rounded-xl border border-zinc-700 shadow-xl backdrop-blur-sm animate-in slide-in-from-bottom-2 duration-300">
        <div className="flex flex-col">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Cookie className="w-5 h-5 text-white transition-transform duration-500 ease-out hover:rotate-12 hover:scale-110 cursor-pointer" />
                    <h3 className="text-base font-medium">Analytics Consent</h3>
                </div>
                <button 
                    onClick={() => setShow(false)} 
                    className="text-zinc-500 hover:text-white p-1 -mt-1 -mr-1 transition-colors duration-200"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            
            <p className="text-zinc-400 text-xs mb-5 leading-relaxed">
                Help us improve BARS by allowing anonymous analytics. 
                Your data stays secure and is never shared with third parties.
            </p>

            <div className="flex items-center justify-end gap-3">
            <Button
                onClick={handleAccept}
                className="text-xs py-2 px-4 h-8"
            >
                Accept
            </Button>
            <Button
                variant="outline"
                onClick={handleDecline}
                className="text-xs py-2 px-4 h-8 transition-all duration-300 ease-out hover:bg-zinc-800 hover:border-zinc-600"
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