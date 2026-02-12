import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://stopbars.com';
const DEFAULT_IMAGE = `${SITE_URL}/banner.png`;
const FORCE_NOINDEX =
  String(import.meta.env.VITE_SEO_PREVIEW_NOINDEX || '').toLowerCase() === 'true';
const DEFAULT_META = {
  title: 'BARS - Airport Lighting Simulation',
  description:
    'BARS adds realistic airport stopbar and lighting behavior to Microsoft Flight Simulator for VATSIM operations.',
};

const ROUTE_META = {
  '/': {
    title: 'BARS - Home',
    description:
      'Explore BARS, a free add-on that brings realistic airport lighting and stopbar operations to MSFS for VATSIM users.',
  },
  '/about': {
    title: 'BARS - About',
    description:
      'Learn what BARS is, how it works, and how it improves realism for pilots and controllers in MSFS.',
  },
  '/credits': {
    title: 'BARS - Credits',
    description:
      'See the contributors, supporters, and community members who help build and maintain BARS.',
  },
  '/contribute': {
    title: 'BARS - Contribute',
    description:
      'Submit airport data, test contributions, and help expand BARS coverage for more airports.',
  },
  '/faq': {
    title: 'BARS - FAQ',
    description:
      'Read common questions and answers about BARS setup, compatibility, usage, and troubleshooting.',
  },
  '/status': {
    title: 'BARS - Status',
    description: 'Check live network activity for BARS.',
  },
  '/changelog': {
    title: 'BARS - Changelog',
    description: 'Review recent BARS releases, including updates, fixes, and changes.',
  },
  '/contact': {
    title: 'BARS - Contact',
    description: 'Get in touch with the BARS team for support, questions, and community help.',
  },
  '/privacy': {
    title: 'BARS - Privacy Policy',
    description: 'Read how BARS handles personal data, privacy, and related information.',
  },
  '/terms': {
    title: 'BARS - Terms of Service',
    description:
      'Review the terms for using BARS software, website features, and related services.',
  },
};

const startsWithMeta = [
  {
    prefix: '/contribute/',
    meta: {
      title: 'BARS - Contribute',
      description:
        'Submit airport data, test contributions, and help expand BARS coverage for more airports.',
    },
  },
];

const NOINDEX_EXACT_PATHS = new Set([
  '/account',
  '/auth/callback',
  '/support',
  '/gen',
  '/staff',
  '/banned',
]);

const NOINDEX_PREFIXES = [
  '/divisions/',
  '/contribute/new',
  '/contribute/map/',
  '/contribute/test/',
  '/contribute/details/',
  '/contribute/generator/',
];

const setTag = (selector, attrs) => {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    document.head.appendChild(tag);
  }
  Object.entries(attrs).forEach(([key, value]) => {
    tag.setAttribute(key, value);
  });
};

const setLinkTag = (selector, attrs) => {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('link');
    document.head.appendChild(tag);
  }
  Object.entries(attrs).forEach(([key, value]) => {
    tag.setAttribute(key, value);
  });
};

const getMetaForPath = (pathname) => {
  if (ROUTE_META[pathname]) return ROUTE_META[pathname];
  const matchedPrefix = startsWithMeta.find(({ prefix }) => pathname.startsWith(prefix));
  return matchedPrefix ? matchedPrefix.meta : DEFAULT_META;
};

const isNoindexPath = (pathname) =>
  NOINDEX_EXACT_PATHS.has(pathname) ||
  NOINDEX_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export const RouteSeoManager = () => {
  const location = useLocation();

  useEffect(() => {
    const pathname = location.pathname || '/';
    const meta = getMetaForPath(pathname);
    const canonicalUrl = `${SITE_URL}${pathname === '/' ? '' : pathname}`;
    const robotsContent = FORCE_NOINDEX
      ? 'noindex, nofollow'
      : isNoindexPath(pathname)
        ? 'noindex, nofollow'
        : 'index, follow';

    document.title = meta.title;

    setTag('meta[name="title"]', { name: 'title', content: meta.title });
    setTag('meta[name="description"]', { name: 'description', content: meta.description });
    setTag('meta[name="robots"]', { name: 'robots', content: robotsContent });

    setTag('meta[property="og:title"]', { property: 'og:title', content: meta.title });
    setTag('meta[property="og:description"]', {
      property: 'og:description',
      content: meta.description,
    });
    setTag('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    setTag('meta[property="og:image"]', { property: 'og:image', content: DEFAULT_IMAGE });

    setTag('meta[name="twitter:title"]', { name: 'twitter:title', content: meta.title });
    setTag('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: meta.description,
    });
    setTag('meta[name="twitter:url"]', { name: 'twitter:url', content: canonicalUrl });
    setTag('meta[name="twitter:image"]', { name: 'twitter:image', content: DEFAULT_IMAGE });

    setLinkTag('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl });
    setLinkTag('link[rel="alternate"][hreflang="en"]', {
      rel: 'alternate',
      hreflang: 'en',
      href: canonicalUrl,
    });
    setLinkTag('link[rel="alternate"][hreflang="x-default"]', {
      rel: 'alternate',
      hreflang: 'x-default',
      href: canonicalUrl,
    });
  }, [location.pathname]);

  return null;
};
