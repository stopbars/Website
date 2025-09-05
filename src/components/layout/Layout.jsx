import { Navbar } from './Navbar';
import { Footer } from './Footer';
import PropTypes from 'prop-types';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { ConsentBanner } from '../shared/ConsentBanner';

export const Layout = ({ children }) => {  const { pathname } = useLocation();
  const [showConsentBanner, setShowConsentBanner] = useState(false);
  const [, setKeyBuffer] = useState("");  
  const layoutRef = useRef(null);
  
  // Function to reverse all text content
  const reverseAllText = useCallback(() => {
    const processNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        // Store original text and reverse it
        node._originalText = node.textContent;
        node.textContent = node.textContent.split('').reverse().join('');
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Skip certain elements
        if (!['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA'].includes(node.nodeName)) {
          Array.from(node.childNodes).forEach(child => processNode(child));
        }
      }
    };
    
    if (layoutRef.current) {
      processNode(layoutRef.current);
    }
  }, []);
  
  // Function to restore all text content
  const restoreAllText = useCallback(() => {
    const processNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE && node._originalText) {
        // Restore original text if it exists
        node.textContent = node._originalText;
        delete node._originalText;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Skip certain elements
        if (!['SCRIPT', 'STYLE', 'INPUT', 'TEXTAREA'].includes(node.nodeName)) {
          Array.from(node.childNodes).forEach(child => processNode(child));
        }
      }
    };
    
    if (layoutRef.current) {
      processNode(layoutRef.current);
    }
  }, []);
  
  // Handles key presses and checks for Easter egg keywords
  const handleKeyPress = useCallback((event) => {
    const key = event.key.toLowerCase();
    
    // Only track alphabetic keys
    if (/^[a-z]$/.test(key)) {
      setKeyBuffer(prev => {
        // Update buffer with new key (keep the last 8 keys)
        const newBuffer = (prev + key).slice(-8);
        
        // Check for keywords
        if (newBuffer === "srabpots") {
          console.log("SRAB!");
          reverseAllText();
        } else if (newBuffer === "stopbars") {
          console.log("BARS!");
          restoreAllText();
        }
        
        return newBuffer;
      });
    }
  }, [reverseAllText, restoreAllText]);

  // Page navigation effect
  useEffect(() => {
    window.scrollTo(0, 0);
    
    // Always restore text when navigating between pages
    if (layoutRef.current) {
      restoreAllText();
    }
  }, [pathname, restoreAllText]);

  // Console banner effect
  useEffect(() => {
    // Prevent duplicate logs in React StrictMode
    if (!window._barsBannerLogged) {
      console.log(`%c
██████╗  █████╗ ██████╗ ███████╗
██╔══██╗██╔══██╗██╔══██╗██╔════╝
██████╔╝███████║██████╔╝███████╗
██╔══██╗██╔══██║██╔══██╗╚════██║
██████╔╝██║  ██║██║  ██║███████║
╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝

%cContribute to BARS: https://github.com/stopbars
Support BARS: https://stopbars.com/donate`, 
        'color: #ef4444; font-weight: bold;',  // ASCII art
        'color: inherit;'                       // Everything else normal
      );
      window._barsBannerLogged = true;
    }
  }, []);

  // Consent banner effect
  useEffect(() => {
    const consent = localStorage.getItem('analytics-consent');
    const gpc = typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true;
    const dnt = typeof navigator !== 'undefined' && (navigator.doNotTrack === '1' || window.doNotTrack === '1');

    if (!consent) {
      if (gpc || dnt) {
        localStorage.setItem('analytics-consent', 'denied');
        setShowConsentBanner(false);
      } else {
        setShowConsentBanner(true);
      }
    }
  }, []);
  // Add keydown event listener for the Easter egg
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);  return (
    <div ref={layoutRef} className="min-h-screen bg-zinc-950 text-white relative">
      <div className="flex flex-col min-h-screen">
        <div className="z-40">
          <Navbar />
        </div>
        <main className="flex-grow container mx-auto px-6 relative">{children}</main>
  <ConsentBanner show={showConsentBanner} setShow={setShowConsentBanner} />
  <Footer onOpenConsent={() => setShowConsentBanner(true)} />
      </div>
    </div>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired
};