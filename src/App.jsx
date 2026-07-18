import { lazy } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { ErrorBoundary, RouteError } from './components/shared/ErrorBoundary';
import { PostHogConsentBootstrap } from './components/shared/PostHogConsentBootstrap';
import { Layout } from './components/layout/Layout';
import { routeModules } from './utils/routeModules';
import Home from './pages/Home.jsx';

const Account = lazy(routeModules.account);
const Privacy = lazy(routeModules.privacy);
const Terms = lazy(routeModules.terms);
const FAQPage = lazy(routeModules.faq);
const GlobalStatus = lazy(routeModules.status);
const Changelog = lazy(routeModules.changelog);
const Contact = lazy(routeModules.contact);
const About = lazy(routeModules.about);
const Credits = lazy(routeModules.credits);
const NotFound = lazy(routeModules.notFound);
const Banned = lazy(routeModules.banned);
const AuthGrant = lazy(routeModules.authGrant);
const DivisionAirportManager = lazy(routeModules.divisionAirportManager);
const DebugGenerator = lazy(routeModules.debugGenerator);
const ContributionDashboard = lazy(routeModules.contributionDashboard);
const ContributeNew = lazy(routeModules.contributeNew);
const ContributeMap = lazy(routeModules.contributeMap);
const ContributeDetails = lazy(routeModules.contributeDetails);
const ContributeTest = lazy(routeModules.contributeTest);
const XMLGenerator = lazy(routeModules.xmlGenerator);
const DivisionManagement = lazy(routeModules.divisionManagement);
const StaffDashboard = lazy(routeModules.staffDashboard);
const AuthCallback = lazy(routeModules.authCallback);
const DiscordRedirect = lazy(routeModules.discordRedirect);
const DocsRedirect = lazy(routeModules.docsRedirect);
const DonateRedirect = lazy(routeModules.donateRedirect);

const appRoutes = [
  {
    path: '/',
    element: <Home />,
    errorElement: <RouteError />,
  },
  {
    path: '/about',
    element: <About />,
    errorElement: <RouteError />,
  },
  {
    path: '/credits',
    element: <Credits />,
    errorElement: <RouteError />,
  },
  {
    path: '/account',
    element: (
      <ProtectedRoute>
        <Account />
      </ProtectedRoute>
    ),
    errorElement: <RouteError />,
  },
  {
    path: '/auth-grant',
    element: <AuthGrant />,
    errorElement: <RouteError />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallback />,
    errorElement: <RouteError />,
  },
  {
    path: '/status',
    element: <GlobalStatus />,
    errorElement: <RouteError />,
  },
  {
    path: '/changelog',
    element: <Changelog />,
    errorElement: <RouteError />,
  },
  {
    path: '/support',
    element: <Contact />,
    errorElement: <RouteError />,
  },
  {
    path: '/contact',
    element: <Contact />,
    errorElement: <RouteError />,
  },
  {
    path: '/privacy',
    element: <Privacy />,
    errorElement: <RouteError />,
  },
  {
    path: '/terms',
    element: <Terms />,
    errorElement: <RouteError />,
  },
  {
    path: '/discord',
    element: <DiscordRedirect />,
    errorElement: <RouteError />,
  },
  {
    path: '/docs',
    element: <DocsRedirect />,
    errorElement: <RouteError />,
  },
  {
    path: '/donate',
    element: <DonateRedirect />,
    errorElement: <RouteError />,
  },
  {
    path: '/documentation',
    element: <DocsRedirect />,
    errorElement: <RouteError />,
  },
  {
    path: '/contribute',
    element: <ContributionDashboard />,
    errorElement: <RouteError />,
  },
  {
    path: '/contribute/new',
    element: <ContributeNew />,
    errorElement: <RouteError />,
  },
  {
    path: '/contribute/map/:icao',
    element: <ContributeMap />,
    errorElement: <RouteError />,
  },
  {
    path: '/contribute/test/:icao',
    element: <ContributeTest />,
    errorElement: <RouteError />,
  },
  {
    path: '/contribute/details/:icao',
    element: <ContributeDetails />,
    errorElement: <RouteError />,
  },
  {
    path: '/contribute/generator/:icao?',
    element: <XMLGenerator />,
    errorElement: <RouteError />,
  },
  {
    path: '/faq',
    element: <FAQPage />,
    errorElement: <RouteError />,
  },
  {
    path: '/divisions/:id/manage',
    element: (
      <ProtectedRoute>
        <DivisionManagement />
      </ProtectedRoute>
    ),
    errorElement: <RouteError />,
  },
  {
    path: '/divisions/:divisionId/airports/:airportId',
    element: (
      <ProtectedRoute>
        <DivisionAirportManager />
      </ProtectedRoute>
    ),
    errorElement: <RouteError />,
  },
  {
    path: '/gen',
    element: <DebugGenerator />,
    errorElement: <RouteError />,
  },
  {
    path: '/banned',
    element: <Banned />,
    errorElement: <RouteError />,
  },
  {
    path: '/staff',
    element: (
      <ProtectedRoute>
        <StaffDashboard />
      </ProtectedRoute>
    ),
    errorElement: <RouteError />,
  },
  {
    path: '*',
    element: <NotFound />,
    errorElement: <RouteError />,
  },
];

const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Layout>
          <Outlet />
        </Layout>
      </AuthProvider>
    ),
    children: appRoutes,
  },
]);

export default function App() {
  return (
    <PostHogConsentBootstrap>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </PostHogConsentBootstrap>
  );
}
