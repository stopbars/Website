const cachedImport = (importer) => {
  let promise;
  return () => {
    promise ??= importer();
    return promise;
  };
};

export const routeModules = {
  account: cachedImport(() => import('../pages/Account.jsx')),
  privacy: cachedImport(() => import('../pages/Privacy.jsx')),
  terms: cachedImport(() => import('../pages/Terms.jsx')),
  faq: cachedImport(() => import('../pages/FAQs.jsx')),
  status: cachedImport(() => import('../pages/GlobalStatus.jsx')),
  changelog: cachedImport(() => import('../pages/Changelog.jsx')),
  contact: cachedImport(() => import('../pages/Contact.jsx')),
  about: cachedImport(() => import('../pages/About.jsx')),
  credits: cachedImport(() => import('../pages/Credits.jsx')),
  notFound: cachedImport(() => import('../pages/NotFound.jsx')),
  banned: cachedImport(() => import('../pages/Banned.jsx')),
  authGrant: cachedImport(() => import('../pages/AuthGrant.jsx')),
  divisionAirportManager: cachedImport(() => import('../pages/DivisionAirportManager.jsx')),
  debugGenerator: cachedImport(() => import('../pages/DebugGenerator.jsx')),
  contributionDashboard: cachedImport(() => import('../pages/ContributionDashboard.jsx')),
  contributeNew: cachedImport(() => import('../pages/ContributeNew.jsx')),
  contributeMap: cachedImport(() => import('../pages/ContributeMap.jsx')),
  contributeDetails: cachedImport(() => import('../pages/ContributeDetails.jsx')),
  contributeTest: cachedImport(() => import('../pages/ContributeTest.jsx')),
  xmlGenerator: cachedImport(() => import('../pages/XMLGenerator.jsx')),
  divisionManagement: cachedImport(() => import('../components/divisions/DivisionManagement.jsx')),
  staffDashboard: cachedImport(() => import('../pages/StaffDashboard.jsx')),
  authCallback: cachedImport(() =>
    import('../components/auth/AuthCallback.jsx').then((module) => ({
      default: module.AuthCallback,
    }))
  ),
  discordRedirect: cachedImport(() =>
    import('../components/shared/DiscordRedirect.jsx').then((module) => ({
      default: module.DiscordRedirect,
    }))
  ),
  docsRedirect: cachedImport(() =>
    import('../components/shared/DocsRedirect.jsx').then((module) => ({
      default: module.DocsRedirect,
    }))
  ),
  donateRedirect: cachedImport(() =>
    import('../components/shared/DonateRedirect.jsx').then((module) => ({
      default: module.DonateRedirect,
    }))
  ),
};

const routeModuleByPath = new Map([
  ['/about', routeModules.about],
  ['/account', routeModules.account],
  ['/status', routeModules.status],
  ['/changelog', routeModules.changelog],
  ['/support', routeModules.contact],
  ['/contact', routeModules.contact],
  ['/privacy', routeModules.privacy],
  ['/terms', routeModules.terms],
  ['/contribute', routeModules.contributionDashboard],
  ['/contribute/new', routeModules.contributeNew],
  ['/faq', routeModules.faq],
  ['/credits', routeModules.credits],
  ['/staff', routeModules.staffDashboard],
]);

export const preloadRoute = (to) => {
  if (typeof to !== 'string') return;
  const pathname = to.split(/[?#]/, 1)[0];
  const exactImporter = routeModuleByPath.get(pathname);
  if (exactImporter) {
    exactImporter();
    return;
  }

  if (/^\/divisions\/[^/]+\/manage\/?$/.test(pathname)) {
    routeModules.divisionManagement();
    return;
  }

  if (/^\/divisions\/[^/]+\/airports\//.test(pathname)) {
    routeModules.divisionAirportManager();
  }
};
