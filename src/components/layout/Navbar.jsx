import { useScroll } from '../../hooks/useScroll';
import { UserCircle, LogOut, ChevronRight, Menu, X } from 'lucide-react';
import { Button } from '../shared/Button';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';

// Function to parse markdown-style links in NOTAM content
const parseNotamLinks = (content) => {
  if (!content) return '';

  // RegExp to match markdown style links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  // Replace all instances of markdown links with HTML links
  // Add target="_blank" and rel="noopener noreferrer" for security
  const sanitizedContent = content.replace(
    linkRegex,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline hover:brightness-125 transition-all">$1</a>'
  );

  // Sanitize the content to prevent XSS attacks
  return DOMPurify.sanitize(sanitizedContent);
};

export const Navbar = () => {
  const scrolled = useScroll();
  const { user, logout, loading } = useAuth();
  const { initiateVatsimAuth } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotam, setShowNotam] = useState(true);
  const [notamContent, setNotamContent] = useState('');
  const [notamType, setNotamType] = useState('warning'); // Types: "warning", "info", "discord", etc.
  const notamRef = useRef(null);
  const [notamFitsOnOneLine, setNotamFitsOnOneLine] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  // Track when NOTAM state has been resolved to avoid initial border flash
  const [notamInitialized, setNotamInitialized] = useState(false);

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
  useEffect(() => {
    const fetchNotam = async () => {
      try {
        // Check when we last fetched the NOTAM
        const lastFetchTime = localStorage.getItem('notam-last-fetch');
        const currentTime = new Date().getTime();
        const cachedNotamContent = localStorage.getItem('notam-content');
        const cachedNotamType = localStorage.getItem('notam-type');

        // Only fetch from API if:
        // 1. We haven't fetched in the last hour (3600000 ms), or
        // 2. We don't have cached NOTAM data
        const shouldFetch =
          !lastFetchTime || currentTime - parseInt(lastFetchTime) > 3600000 || !cachedNotamContent;

        if (shouldFetch) {
          const response = await fetch('https://v2.stopbars.com/notam');
          if (response.ok) {
            const data = await response.json();
            if (data.notam) {
              // Save to localStorage for future page loads
              localStorage.setItem('notam-content', data.notam);
              localStorage.setItem('notam-type', data.type || 'warning');
              localStorage.setItem('notam-last-fetch', currentTime.toString());

              setNotamContent(data.notam);
              setNotamType(data.type || 'warning');
              setShowNotam(true);
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
            setShowNotam(true);
          } else {
            setShowNotam(false);
          }
        }
      } catch (error) {
        console.error('Failed to fetch NOTAM:', error);

        // Use cached NOTAM on error
        const cachedNotamContent = localStorage.getItem('notam-content');
        const cachedNotamType = localStorage.getItem('notam-type');

        if (cachedNotamContent) {
          setNotamContent(cachedNotamContent);
          setNotamType(cachedNotamType || 'warning');
          setShowNotam(true);
        } else {
          setShowNotam(false);
        }
      } finally {
        // Mark NOTAM state as initialized (whether available or not)
        setNotamInitialized(true);
      }
    };

    fetchNotam();
  }, []);
  // Check if NOTAM text wraps to multiple lines
  useEffect(() => {
    if (notamRef.current && notamContent) {
      const checkNotamHeight = () => {
        const element = notamRef.current;
        if (element) {
          // Get the line height from computed styles
          const computedStyle = window.getComputedStyle(element);
          const lineHeight =
            parseInt(computedStyle.lineHeight) || parseInt(computedStyle.fontSize) * 1.2;

          // If the element's height is greater than the line height (with a small buffer),
          // then the text is wrapping to multiple lines
          const isSingleLine = element.offsetHeight <= lineHeight * 1.2;
          setNotamFitsOnOneLine(isSingleLine);
        }
      };

      // Initial check
      checkNotamHeight();

      // Also check on window resize as available width changes
      const handleResize = () => {
        checkNotamHeight();
      };

      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [notamContent]);

  const toggleMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };
  return (
    <>
      {' '}
      {/* NOTAM Banner - Always in the DOM but visibility controlled by classes */}
      {notamContent && (
        <div
          className={`border-b overflow-hidden fixed top-0 left-0 w-full z-60 ${
            notamType === 'warning'
              ? 'bg-amber-500/10 border-amber-500/20'
              : notamType === 'info'
                ? 'bg-blue-500/10 border-blue-500/20'
                : notamType === 'discord'
                  ? 'bg-indigo-500/10 border-indigo-500/20'
                  : notamType === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : notamType === 'error'
                      ? 'bg-red-500/10 border-red-500/20'
                      : 'bg-zinc-700/20 border-zinc-600/30'
          } ${showNotam && !scrolled && notamFitsOnOneLine ? 'opacity-100' : 'opacity-0 pointer-events-none h-0'}`}
        >
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-center">
              {' '}
              <p
                ref={notamRef}
                className={`text-sm font-medium ${
                  notamType === 'warning'
                    ? 'text-amber-400'
                    : notamType === 'info'
                      ? 'text-blue-400'
                      : notamType === 'discord'
                        ? 'text-indigo-300'
                        : notamType === 'success'
                          ? 'text-emerald-400'
                          : notamType === 'error'
                            ? 'text-red-400'
                            : 'text-zinc-300'
                }`}
                dangerouslySetInnerHTML={{ __html: parseNotamLinks(notamContent) }}
              />
            </div>
          </div>
        </div>
      )}{' '}
      <nav
        className={`fixed bg-zinc-950 left-0 w-full z-50 border-b transition-colors duration-100 ${
          // Avoid showing the border until NOTAM state is initialized to prevent white flash
          scrolled || (notamInitialized && (!showNotam || !notamFitsOnOneLine || !notamContent))
            ? 'backdrop-blur-md border-zinc-800 top-0'
            : 'border-transparent top-10'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center md:flex-1">
              <Link
                to="/"
                className="text-2xl font-bold tracking-tight hover:text-zinc-300 transition-colors cursor-pointer"
              >
                BARS
              </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex md:flex-1 justify-center">
              <div className="flex items-center space-x-6 lg:space-x-12">
                <Link to="/about" className="text-zinc-400 hover:text-white transition-colors">
                  About
                </Link>
                <Link to="/contribute" className="text-zinc-400 hover:text-white transition-colors">
                  Contribute
                </Link>
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
                  <Link to="/account">
                    <Button variant="secondary" className="flex items-center space-x-2 px-4">
                      <UserCircle className="w-5 h-5" />
                      <span>{user.display_name}</span>
                    </Button>
                  </Link>
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
                className="inline-flex items-center justify-center p-2 rounded-md text-zinc-400 hover:text-white focus:outline-none"
                aria-controls="mobile-menu"
                aria-expanded="false"
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
          className={`md:hidden fixed inset-x-0 transform transition-all duration-300 ease-in-out ${
            mobileMenuOpen
              ? 'translate-y-0 opacity-100'
              : '-translate-y-2 opacity-0 pointer-events-none'
          }`}
          id="mobile-menu"
        >
          <div className="bg-zinc-900/95 backdrop-blur-md border-b border-zinc-800 shadow-lg rounded-b-xl mx-2">
            <div className="px-5 py-4 space-y-1">
              <Link
                to="/about"
                className="flex items-center space-x-3 text-zinc-300 hover:text-white hover:bg-zinc-800/70 rounded-lg p-3 transition-all"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="font-medium">About</span>
              </Link>
              <Link
                to="/contribute"
                className="flex items-center space-x-3 text-zinc-300 hover:text-white hover:bg-zinc-800/70 rounded-lg p-3 transition-all"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="font-medium">Contribute</span>
              </Link>
              <a
                href="https://docs.stopbars.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-3 text-zinc-300 hover:text-white hover:bg-zinc-800/70 rounded-lg p-3 transition-all"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="font-medium">Documentation</span>
              </a>
              <a
                href="https://opencollective.com/stopbars"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-3 text-zinc-300 hover:text-white hover:bg-zinc-800/70 rounded-lg p-3 transition-all"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="font-medium">Donate</span>
              </a>

              {/* Auth section with subtle divider */}
              <div className="my-3 border-t border-zinc-800/70"></div>

              {user ? (
                <div className="space-y-3 pt-1">
                  <Link to="/account" onClick={() => setMobileMenuOpen(false)} className="block">
                    <Button
                      variant="secondary"
                      className="flex items-center space-x-3 px-4 w-full justify-center h-12"
                    >
                      <UserCircle className="w-5 h-5" />
                      <span className="font-medium">{user.vatsim_id}</span>
                    </Button>
                  </Link>
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
    </>
  );
};
