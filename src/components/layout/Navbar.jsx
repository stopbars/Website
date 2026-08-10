import { useScroll } from '../../hooks/useScroll';
import { UserCircle, LogOut, ChevronRight, Menu, X } from 'lucide-react';
import { Button } from '../shared/Button';
import { RouteLink } from '../shared/RouteLink';
import { useAuth } from '../../hooks/useAuth';
import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';

const DISMISSED_NOTAM_KEY = 'dismissed-notam';
const NOTAM_STYLES = {
  warning: {
    banner: 'border-[#38270b] bg-[#21180b]',
    text: 'text-amber-400',
    button: 'text-amber-300 hover:bg-amber-400/10 hover:text-amber-200',
  },
  info: {
    banner: 'border-[#131f3a] bg-[#0e1523]',
    text: 'text-blue-400',
    button: 'text-blue-300 hover:bg-blue-400/10 hover:text-blue-200',
  },
  discord: {
    banner: 'border-[#1b1c39] bg-[#12121e]',
    text: 'text-indigo-300',
    button: 'text-indigo-300 hover:bg-indigo-400/10 hover:text-indigo-200',
  },
  success: {
    banner: 'border-[#0a2c23] bg-[#0a1b17]',
    text: 'text-emerald-400',
    button: 'text-emerald-300 hover:bg-emerald-400/10 hover:text-emerald-200',
  },
  error: {
    banner: 'border-[#371516] bg-[#201012]',
    text: 'text-red-400',
    button: 'text-red-300 hover:bg-red-400/10 hover:text-red-200',
  },
  default: {
    banner: 'border-[#19191d] bg-[#141417]',
    text: 'text-zinc-300',
    button: 'text-zinc-300 hover:bg-white/5 hover:text-white',
  },
};

const getNotamIdentity = (content, type) => JSON.stringify([type || 'warning', content || '']);

const isNotamDismissed = (content, type) => {
  if (!content) return false;

  try {
    return localStorage.getItem(DISMISSED_NOTAM_KEY) === getNotamIdentity(content, type);
  } catch {
    return false;
  }
};

// Function to parse markdown-style links in NOTAM content
const sanitizeNotamLinks = (content) => {
  if (!content) return '';

  // RegExp to match markdown style links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  // Replace all instances of markdown links with HTML links
  // Add target="_blank" and rel="noopener noreferrer" for security
  const sanitizedContent = content.replace(
    linkRegex,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline transition-[filter] duration-150 hover:brightness-125">$1</a>'
  );

  // Sanitize the content to prevent XSS attacks
  return DOMPurify.sanitize(sanitizedContent);
};

// Navigation, account controls, mobile menu, and the NOTAM banner share responsive layout state.
// oxlint-disable react-doctor/no-giant-component
export const Navbar = () => {
  const scrolled = useScroll();
  const { user, logout, loading, initiateVatsimAuth } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cachedNotam] = useState(() => ({
    content: localStorage.getItem('notam-content') || '',
    type: localStorage.getItem('notam-type') || 'warning',
  }));
  const [notamContent, setNotamContent] = useState(cachedNotam.content);
  const [notamType, setNotamType] = useState(cachedNotam.type); // Types: "warning", "info", "discord", etc.
  const [showNotam, setShowNotam] = useState(() => {
    return (
      Boolean(cachedNotam.content) && !isNotamDismissed(cachedNotam.content, cachedNotam.type)
    );
  });
  const [authLoading, setAuthLoading] = useState(false);
  // Track when NOTAM state has been resolved to avoid initial border flash
  const [notamInitialized, setNotamInitialized] = useState(() => Boolean(notamContent));

  // Close mobile menu when navigating to a new page or resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Fetch NOTAM from backend and handle caching
  // The request is aborted on unmount; cached values provide the fallback path.
  // oxlint-disable-next-line react-doctor/no-fetch-in-effect
  useEffect(() => {
    const controller = new AbortController();
    const fetchNotam = async () => {
      const cachedNotamContent = localStorage.getItem('notam-content');
      const cachedNotamType = localStorage.getItem('notam-type');
      try {
        // Check when we last fetched the NOTAM
        const lastFetchTime = localStorage.getItem('notam-last-fetch');
        const currentTime = new Date().getTime();

        // Only fetch from API if:
        // 1. We haven't fetched in the last hour (3600000 ms), or
        // 2. We don't have cached NOTAM data
        const shouldFetch =
          !lastFetchTime || currentTime - parseInt(lastFetchTime) > 3600000 || !cachedNotamContent;

        if (shouldFetch) {
          const response = await fetch('https://v2.stopbars.com/notam', {
            signal: controller.signal,
          });
          if (response.ok) {
            const data = await response.json();
            if (data.notam) {
              // Save to localStorage for future page loads
              localStorage.setItem('notam-content', data.notam);
              localStorage.setItem('notam-type', data.type || 'warning');
              localStorage.setItem('notam-last-fetch', currentTime.toString());

              setNotamContent(data.notam);
              setNotamType(data.type || 'warning');
              setShowNotam(!isNotamDismissed(data.notam, data.type || 'warning'));
            } else {
              setShowNotam(false);
              // Clear cached NOTAM if the API returns none
              localStorage.removeItem('notam-content');
              localStorage.removeItem('notam-type');
            }
          }
        } else {
          // Use cached NOTAM
          if (cachedNotamContent) {
            setNotamContent(cachedNotamContent);
            setNotamType(cachedNotamType || 'warning');
            setShowNotam(!isNotamDismissed(cachedNotamContent, cachedNotamType || 'warning'));
          } else {
            setShowNotam(false);
          }
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Failed to fetch NOTAM:', error);

        // Use cached NOTAM on error
        if (cachedNotamContent) {
          setNotamContent(cachedNotamContent);
          setNotamType(cachedNotamType || 'warning');
          setShowNotam(!isNotamDismissed(cachedNotamContent, cachedNotamType || 'warning'));
        } else {
          setShowNotam(false);
        }
      } finally {
        // Mark NOTAM state as initialized (whether available or not)
        setNotamInitialized(true);
      }
    };

    fetchNotam();
    return () => controller.abort();
  }, []);
  const toggleMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const dismissNotam = () => {
    try {
      localStorage.setItem(DISMISSED_NOTAM_KEY, getNotamIdentity(notamContent, notamType));
    } catch {
      // The notice can still be dismissed for this session when storage is unavailable.
    }
    setShowNotam(false);
  };

  const mobileLinkClasses =
    'flex min-h-10 items-center space-x-3 rounded-lg p-3 text-zinc-300 transition-[background-color,color,transform] duration-150 ease-out hover:bg-zinc-800/70 hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900';

  const notamVisible = Boolean(notamContent) && showNotam;
  const notamStyles = NOTAM_STYLES[notamType] || NOTAM_STYLES.default;

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/* Keeping the NOTAM and navbar in one stack lets the navbar reclaim its exact height. */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          notamVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
        aria-hidden={!notamVisible}
        inert={!notamVisible}
      >
        <div
          className={`min-h-0 overflow-hidden transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            notamVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
          }`}
        >
          <div className={`border-b ${notamStyles.banner}`}>
            <div className="grid min-h-10 w-full grid-cols-[3rem_minmax(0,1fr)_3rem] items-center px-1">
              <span aria-hidden="true" />
              {notamContent && (
                <p
                  className={`mx-auto max-w-7xl break-words py-2 text-center text-sm font-medium ${notamStyles.text}`}
                  dangerouslySetInnerHTML={{ __html: sanitizeNotamLinks(notamContent) }}
                />
              )}
              <button
                type="button"
                onClick={dismissNotam}
                className={`inline-flex size-10 items-center justify-center justify-self-end rounded-md transition-[background-color,color,transform] duration-150 ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${notamStyles.button}`}
                aria-label="Dismiss notice"
                title="Dismiss notice"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <nav
        className={`w-full border-b transition-[background-color,border-color] duration-200 ease-out ${
          // Avoid showing the border until NOTAM state is initialized to prevent white flash
          scrolled || (notamInitialized && (!showNotam || !notamContent))
            ? 'border-zinc-800 bg-zinc-950/90 backdrop-blur-md'
            : 'border-transparent bg-zinc-950'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center md:flex-1">
              <RouteLink
                to="/"
                className="text-2xl font-bold tracking-tight hover:text-zinc-300 transition-colors cursor-pointer"
              >
                BARS
              </RouteLink>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex md:flex-1 justify-center">
              <div className="flex items-center space-x-6 lg:space-x-12">
                <RouteLink to="/about" className="text-zinc-400 hover:text-white transition-colors">
                  About
                </RouteLink>
                <RouteLink
                  to="/contribute"
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  Contribute
                </RouteLink>
                <a
                  href="https://docs.stopbars.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  Documentation
                </a>
                <a
                  href="https://opencollective.com/stopbars"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  Donate
                </a>
              </div>
            </div>

            <div className="hidden md:flex md:flex-1 items-center justify-end">
              {user ? (
                <div className="flex items-center space-x-4">
                  <RouteLink to="/account">
                    <Button variant="secondary" className="flex items-center space-x-2 px-4">
                      <UserCircle className="w-5 h-5" />
                      <span>{user.display_name}</span>
                    </Button>
                  </RouteLink>
                  <Button variant="outline" onClick={logout} className="px-4">
                    <LogOut className="w-5 h-5" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAuthLoading(true);
                    initiateVatsimAuth('/account');
                  }}
                  disabled={authLoading || loading}
                  className="flex items-center space-x-2 px-4"
                >
                  <span>{authLoading || loading ? 'Loading...' : 'Continue with VATSIM'}</span>
                  {authLoading || loading ? (
                    <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin ml-2"></div>
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </Button>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center">
              <button
                onClick={toggleMenu}
                type="button"
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md p-2 text-zinc-400 transition-[background-color,color,transform] duration-150 ease-out hover:bg-zinc-800/70 hover:text-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                aria-controls="mobile-menu"
                aria-expanded={mobileMenuOpen}
              >
                <span className="sr-only">Open main menu</span>
                {mobileMenuOpen ? (
                  <X className="block h-6 w-6" aria-hidden="true" />
                ) : (
                  <Menu className="block h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
        {/* Mobile menu, show/hide based on menu state with smooth animation */}
        <div
          className={`md:hidden fixed inset-x-0 transform transition-[opacity,transform] duration-200 ease-out ${
            mobileMenuOpen
              ? 'translate-y-0 opacity-100'
              : '-translate-y-2 opacity-0 pointer-events-none'
          }`}
          id="mobile-menu"
        >
          <div className="mx-2 rounded-b-xl border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-md">
            <div className="px-5 py-4 space-y-1">
              <RouteLink
                to="/about"
                className={mobileLinkClasses}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="font-medium">About</span>
              </RouteLink>
              <RouteLink
                to="/contribute"
                className={mobileLinkClasses}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="font-medium">Contribute</span>
              </RouteLink>
              <a
                href="https://docs.stopbars.com"
                target="_blank"
                rel="noopener noreferrer"
                className={mobileLinkClasses}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="font-medium">Documentation</span>
              </a>
              <a
                href="https://opencollective.com/stopbars"
                target="_blank"
                rel="noopener noreferrer"
                className={mobileLinkClasses}
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="font-medium">Donate</span>
              </a>

              {/* Auth section with subtle divider */}
              <div className="my-3 border-t border-zinc-800/70"></div>

              {user ? (
                <div className="space-y-3 pt-1">
                  <RouteLink
                    to="/account"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block"
                  >
                    <Button
                      variant="secondary"
                      className="flex items-center space-x-3 px-4 w-full justify-center h-12"
                    >
                      <UserCircle className="w-5 h-5" />
                      <span className="font-medium">{user.vatsim_id}</span>
                    </Button>
                  </RouteLink>
                  <Button
                    variant="outline"
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="px-4 w-full justify-center h-12 hover:bg-red-900/20 hover:border-red-800/30 transition-colors"
                  >
                    <LogOut className="w-5 h-5 mr-3 text-red-400" />
                    <span>Logout</span>
                  </Button>
                </div>
              ) : (
                <div className="pt-1">
                  {' '}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setAuthLoading(true);
                      initiateVatsimAuth('/account');
                      setMobileMenuOpen(false);
                    }}
                    disabled={authLoading || loading}
                    className="flex items-center space-x-2 px-4 w-full justify-center h-12"
                  >
                    <span className="font-medium">
                      {authLoading || loading ? 'Loading...' : 'Continue with VATSIM'}
                    </span>
                    {authLoading || loading ? (
                      <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin ml-2"></div>
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};
