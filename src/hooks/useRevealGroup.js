import { useEffect } from 'react';

export const useRevealGroup = (containerRef) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }

    const elements = Array.from(container.querySelectorAll('[data-reveal]'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('reveal-visible');
          entry.target.classList.remove('reveal-pending');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -48px 0px' }
    );

    const frame = requestAnimationFrame(() => {
      elements.forEach((element, index) => {
        const alreadyVisible = element.getBoundingClientRect().top < window.innerHeight * 0.9;
        if (alreadyVisible) return;
        element.style.setProperty('--reveal-delay', `${Math.min(index, 6) * 40}ms`);
        element.classList.add('reveal-pending');
        observer.observe(element);
      });
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [containerRef]);
};
