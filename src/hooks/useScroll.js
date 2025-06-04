import { useState, useEffect } from 'react';

export const useScroll = (threshold = 20) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Function that directly updates state without debouncing
    const handleScroll = () => {
      setScrolled(window.scrollY > threshold);
    };
    
    // Initial check
    handleScroll();
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  return scrolled;
};