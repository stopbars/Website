import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './styles/globals.css';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { ErrorBoundary, RouteError } from './components/shared/ErrorBoundary';
import { PostHogConsentBootstrap } from './components/shared/PostHogConsentBootstrap';
import Home from './pages/Home.jsx';
import { Loader } from 'lucide-react';

const Account = lazy(() => import('./pages/Account.jsx'));
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const Terms = lazy(() => import('./pages/Terms.jsx'));
const FAQPage = lazy(() => import('./pages/FAQs.jsx'));
const GlobalStatus = lazy(() => import('./pages/GlobalStatus.jsx'));
const Changelog = lazy(() => import('./pages/Changelog.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Credits = lazy(() => import('./pages/Credits.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Banned = lazy(() => import('./pages/Banned.jsx'));
const DivisionAirportManager = lazy(() => import('./pages/DivisionAirportManager.jsx'));
const DebugGenerator = lazy(() => import('./pages/DebugGenerator.jsx'));
const ContributionDashboard = lazy(() => import('./pages/ContributionDashboard.jsx'));
const ContributeNew = lazy(() => import('./pages/ContributeNew.jsx'));
const ContributeMap = lazy(() => import('./pages/ContributeMap.jsx'));
const ContributeDetails = lazy(() => import('./pages/ContributeDetails.jsx'));
const ContributeTest = lazy(() => import('./pages/ContributeTest.jsx'));
const Divisions = lazy(() => import('./pages/Divisions.jsx'));
const DivisionManagement = lazy(() => import('./components/divisions/DivisionManagement.jsx'));
const NewDivision = lazy(() => import('./components/divisions/NewDivision.jsx'));
const StaffDashboard = lazy(() => import('./pages/StaffDashboard.jsx'));
const AuthCallback = lazy(() =>
  import('./components/auth/AuthCallback.jsx').then((module) => ({
    default: module.AuthCallback,
  }))
);
const DiscordRedirect = lazy(() =>
  import('./components/shared/DiscordRedirect.jsx').then((module) => ({
    default: module.DiscordRedirect,
  }))
);
const DocsRedirect = lazy(() =>
  import('./components/shared/DocsRedirect.jsx').then((module) => ({
    default: module.DocsRedirect,
  }))
);

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

const suspenseFallback = (
  <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-200">
    <Loader className="h-10 w-10 animate-spin" aria-label="Loading" />
  </div>
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PostHogConsentBootstrap>
      <AuthProvider>
        <ErrorBoundary>
          <Suspense fallback={suspenseFallback}>
            <RouterProvider router={router} />
          </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </PostHogConsentBootstrap>
  </StrictMode>
);
