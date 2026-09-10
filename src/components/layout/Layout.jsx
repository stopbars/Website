import { Navbar } from './Navbar';
import { Footer } from './Footer';
import PropTypes from 'prop-types';
import {
  createContext,
  memo,
  Suspense,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { ConsentBanner } from '../shared/ConsentBanner';
import { PageLoading } from '../shared/PageLoading';
import { CONSENT_KEY } from '../../utils/posthogLoader';

const StableNavbar = memo(Navbar);
const StableFooter = memo(Footer);
const LayoutContext = createContext(false);
const SITE_NAME = 'BARS';

const getPageTitle = (pathname) => {
  if (/^\/contribute\/editor\/[^/]+\/?$/.test(pathname)) return 'Contribution editor';
  if (/^\/contribute\/generator\/[^/]+\/?$/.test(pathname)) return 'XML generator';
  if (/^\/contribute\/test\/[^/]+\/?$/.test(pathname)) return 'Test contribution';
  if (/^\/contribute\/details\/[^/]+\/?$/.test(pathname)) return 'Submit contribution';
  if (/^\/contribute\/map\/[^/]+\/?$/.test(pathname)) return 'Review airport';
  if (pathname === '/contribute/new') return 'Start contribution';
  if (pathname.startsWith('/contribute')) return 'Contributions';
  return SITE_NAME;
};

const ConsentLayer = memo(function ConsentLayer() {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const consent = window.localStorage.getItem(CONSENT_KEY);
      const gpc = typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true;
      const dnt =
        typeof navigator !== 'undefined' &&
        (navigator.doNotTrack === '1' || window.doNotTrack === '1');

      if (!consent && (gpc || dnt)) {
        window.localStorage.setItem(CONSENT_KEY, 'denied');
        return false;
      }

      return !consent;
    } catch {
      return false;
    }
  });

  return <ConsentBanner show={show} setShow={setShow} />;
});

/* oxlint-disable react-doctor/advanced-event-handler-refs -- The Easter-egg listener intentionally follows its stable text-transform callbacks. */
const LayoutFrame = ({ children }) => {
  const { pathname } = useLocation();
  const isFullScreenEditor = /^\/contribute\/editor\/[^/]+\/?$/.test(pathname);
  const keyBufferRef = useRef('');
  const layoutRef = useRef(null);
  const previousPathRef = useRef(pathname);

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
          Array.from(node.childNodes).forEach((child) => processNode(child));
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
          Array.from(node.childNodes).forEach((child) => processNode(child));
        }
      }
    };

    if (layoutRef.current) {
      processNode(layoutRef.current);
    }
  }, []);

  // Handles key presses and checks for Easter egg keywords
  const handleKeyPress = useCallback(
    (event) => {
      const key = event.key.toLowerCase();

      // Only track alphabetic keys
      if (/^[a-z]$/.test(key)) {
        const newBuffer = (keyBufferRef.current + key).slice(-8);

        if (newBuffer === 'srabpots') {
          console.log('SRAB!');
          reverseAllText();
        } else if (newBuffer === 'stopbars') {
          console.log('BARS!');
          restoreAllText();
        }

        keyBufferRef.current = newBuffer;
      }
    },
    [reverseAllText, restoreAllText]
  );

  // Page navigation effect
  useLayoutEffect(() => {
    const routeChanged = previousPathRef.current !== pathname;
    previousPathRef.current = pathname;
    const pageTitle = getPageTitle(pathname);
    document.title = pageTitle === SITE_NAME ? SITE_NAME : `${pageTitle} · ${SITE_NAME}`;
    window.scrollTo(0, 0);

    // Always restore text when navigating between pages
    if (layoutRef.current) {
      restoreAllText();
    }

    if (routeChanged) {
      const focusTimer = window.requestAnimationFrame(() => {
        const heading = layoutRef.current?.querySelector('h1');
        if (heading) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
        }
      });

      return () => window.cancelAnimationFrame(focusTimer);
    }

    return undefined;
  }, [pathname, restoreAllText]);

  // Console banner effect
  useEffect(() => {
    // Prevent duplicate logs in React StrictMode
    if (!window._barsBannerLogged) {
      console.log(
        `%c
██████╗  █████╗ ██████╗ ███████╗
██╔══██╗██╔══██╗██╔══██╗██╔════╝
██████╔╝███████║██████╔╝███████╗
██╔══██╗██╔══██║██╔══██╗╚════██║
██████╔╝██║  ██║██║  ██║███████║
╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝

%cContribute to BARS: https://github.com/stopbars
Support BARS: https://stopbars.com/donate`,
        'color: #ef4444; font-weight: bold;', // ASCII art
        'color: inherit;' // Everything else normal
      );
      window._barsBannerLogged = true;
    }
  }, []);

  // Add keydown event listener for the Easter egg
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  if (isFullScreenEditor) {
    return (
      <div ref={layoutRef} className="h-dvh overflow-hidden bg-zinc-950 text-white">
        <Suspense fallback={<PageLoading page label="Loading editor…" />}>
          <div className="h-full">{children}</div>
        </Suspense>
        <ConsentLayer />
      </div>
    );
  }

  return (
    <div ref={layoutRef} className="min-h-screen bg-zinc-950 text-white relative">
      <div className="flex flex-col min-h-screen">
        <div className="z-40">
          <StableNavbar />
        </div>
        <main
          className={pathname === '/' ? 'relative grow' : 'container relative mx-auto grow px-6'}
        >
          <Suspense fallback={<PageLoading page label="Loading page…" />}>
            <div key={pathname} className="route-surface">
              {children}
            </div>
          </Suspense>
        </main>
        <ConsentLayer />
        <StableFooter />
      </div>
    </div>
  );
};

LayoutFrame.propTypes = {
  children: PropTypes.node.isRequired,
};

export const Layout = ({ children }) => {
  const isInsideLayout = use(LayoutContext);

  if (isInsideLayout) return children;

  return (
    <LayoutContext.Provider value>
      <LayoutFrame>{children}</LayoutFrame>
    </LayoutContext.Provider>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};
