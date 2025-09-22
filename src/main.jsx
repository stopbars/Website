import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './styles/globals.css';

// PostHog
import { PostHogProvider } from 'posthog-js/react';

// Pages
import Home from './pages/Home.jsx';
import Account from './pages/Account.jsx';
import Privacy from './pages/Privacy.jsx';
import Terms from './pages/Terms.jsx';
import FAQPage from './pages/FAQs.jsx';
import GlobalStatus from './pages/GlobalStatus.jsx';
import Changelog from './pages/Changelog.jsx';
import Contact from './pages/Contact.jsx';
import About from './pages/About.jsx';
import Credits from './pages/Credits.jsx';
import NotFound from './pages/NotFound.jsx';
import Banned from './pages/Banned.jsx';
import DivisionAirportManager from './pages/DivisionAirportManager.jsx';
import DebugGenerator from './pages/DebugGenerator.jsx';
import ContributionDashboard from './pages/ContributionDashboard.jsx';
import ContributeNew from './pages/ContributeNew.jsx';
import ContributeMap from './pages/ContributeMap.jsx';
import ContributeDetails from './pages/ContributeDetails.jsx';
import ContributeTest from './pages/ContributeTest.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import Divisions from './pages/Divisions.jsx';
import DivisionManagement from './components/divisions/DivisionManagement';
import NewDivision from './components/divisions/NewDivision';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { AuthCallback } from './components/auth/AuthCallback';
import { DiscordRedirect } from './components/shared/DiscordRedirect';
import { DocsRedirect } from './components/shared/DocsRedirect';
import StaffDashboard from './pages/StaffDashboard.jsx';
import { ErrorBoundary, RouteError } from './components/shared/ErrorBoundary';
import { PostHogConsentBootstrap } from './components/shared/PostHogConsentBootstrap';

const router = createBrowserRouter([
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
    path: '/faq',
    element: <FAQPage />,
    errorElement: <RouteError />,
  },
  {
    path: '/divisions',
    element: (
      <ProtectedRoute>
        <Divisions />
      </ProtectedRoute>
    ),
    errorElement: <RouteError />,
  },
  {
    path: '/divisions/new',
    element: (
      <ProtectedRoute>
        <NewDivision />
      </ProtectedRoute>
    ),
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
]);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        defaults: '2025-05-24',
        debug: import.meta.env.MODE === 'development',
        opt_out_capturing_by_default: true,
        autocapture: false,
        capture_exceptions: false,
        persistence: 'memory',
      }}
    >
      <AuthProvider>
        <PostHogConsentBootstrap />
        <ErrorBoundary>
          <RouterProvider router={router} />
        </ErrorBoundary>
      </AuthProvider>
    </PostHogProvider>
  </StrictMode>
);
