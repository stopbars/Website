import { useEffect, useState } from 'react';

// Simple window size hook that updates on resize and avoids SSR pitfalls
export function useWindowSize() {
  const [size, setSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handler);
    // Trigger once on mount in case something changed before effect ran
    handler();
    return () => window.removeEventListener('resize', handler);
  }, []);

  return size;
}

export default useWindowSize;
