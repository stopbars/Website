export const SITE_ORIGIN = 'https://stopbars.com';
export const INDEX_ROBOTS = 'index, follow, max-image-preview:large';
export const NOINDEX_ROBOTS = 'noindex, follow';
export const SOCIAL_IMAGE = `${SITE_ORIGIN}/banner.png`;
export const SOCIAL_IMAGE_ALT = 'BARS airport lighting simulation for VATSIM';

export const SEO_PAGES = {
  '/': {
    title: 'BARS - Airport Lighting for VATSIM, MSFS and X-Plane',
    description:
      'Free airport lighting for VATSIM in MSFS 2020, MSFS 2024 and X-Plane 12. Add stopbars, Follow the Greens and support for default and third-party scenery.',
  },
  '/about': {
    title: 'About BARS - Airport Lighting for VATSIM',
    description:
      'Learn how BARS brings controller-operated airport lighting to VATSIM, meet the team, and explore the history of this free, open-source project.',
  },
  '/credits': {
    title: 'Contributors and Credits | BARS',
    description:
      'Meet the developers and community contributors building BARS, the free airport lighting platform for VATSIM, Microsoft Flight Simulator and X-Plane.',
  },
  '/contribute': {
    title: 'Community Airport Contributions | BARS',
    description:
      'Browse community airport lighting contributions for MSFS and X-Plane scenery, view the contributor leaderboard, and help expand BARS airport support.',
  },
  '/faq': {
    title: 'Frequently Asked Questions | BARS',
    description:
      'Find answers about BARS installation, simulator compatibility, airport scenery, contributions and using airport lighting on VATSIM.',
  },
  '/status': {
    title: 'Live Airport Activity and Scenery Support | BARS',
    description:
      'Check live BARS airport activity on VATSIM and browse available community scenery contributions for airports around the world.',
  },
  '/changelog': {
    title: 'Release Notes and Changelog | BARS',
    description:
      'Read the latest BARS release notes, including updates, improvements and fixes for the pilot client, installer and controller tools.',
  },
  '/contact': {
    title: 'Contact and Support | BARS',
    description:
      'Get help with BARS installation and airport lighting. Contact the team about bugs, feature requests, VATSIM division support or other questions.',
  },
  '/privacy': {
    title: 'Privacy Policy | BARS',
    description:
      'Read the BARS privacy policy to understand how we collect, use and protect your information when you use our website and services.',
  },
  '/terms': {
    title: 'Terms of Service | BARS',
    description:
      'Read the terms of service for the BARS website, software and community airport lighting services.',
  },
};

export const SEO_ALIASES = { '/support': '/contact' };

const PRIVATE_PAGE_TITLES = {
  '/account': 'Your account',
  '/auth-grant': 'Authorize access',
  '/auth/callback': 'Signing in',
  '/staff': 'Staff dashboard',
  '/banned': 'Account restricted',
  '/gen': 'Debug generator',
  '/contribute/new': 'Start contribution',
  '/contribute/generator': 'XML generator',
  '/discord': 'Discord community',
  '/docs': 'Documentation',
  '/documentation': 'Documentation',
  '/donate': 'Support BARS',
};

export const PRIVATE_PAGE_PATHS = Object.keys(PRIVATE_PAGE_TITLES);

function privatePageTitle(pathname) {
  if (PRIVATE_PAGE_TITLES[pathname]) return PRIVATE_PAGE_TITLES[pathname];
  if (/^\/contribute\/editor\/[^/]+$/.test(pathname)) return 'Contribution editor';
  if (/^\/contribute\/generator\/[^/]+$/.test(pathname)) return 'XML generator';
  if (/^\/contribute\/test\/[^/]+$/.test(pathname)) return 'Test contribution';
  if (/^\/contribute\/details\/[^/]+$/.test(pathname)) return 'Submit contribution';
  if (/^\/contribute\/map\/[^/]+$/.test(pathname)) return 'Review airport';
  if (/^\/divisions\/[^/]+\/manage$/.test(pathname)) return 'Manage division';
  if (/^\/divisions\/[^/]+\/airports\/[^/]+$/.test(pathname)) return 'Manage airport';
  return 'Page not found';
}

export function getPageMetadata(pathname, indexable = true) {
  const normalizedPath = pathname.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const canonicalPath = SEO_ALIASES[normalizedPath] ?? normalizedPath;
  const page = Object.hasOwn(SEO_PAGES, canonicalPath) ? SEO_PAGES[canonicalPath] : null;

  return {
    title: page?.title ?? `${privatePageTitle(normalizedPath)} | BARS`,
    description: page?.description ?? 'BARS airport lighting simulation for VATSIM.',
    canonical: page ? `${SITE_ORIGIN}${canonicalPath}` : null,
    robots: page && indexable ? INDEX_ROBOTS : NOINDEX_ROBOTS,
  };
}
