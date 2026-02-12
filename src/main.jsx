import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import './styles/globals.css';
import { AuthProvider } from './context/AuthContext.jsx';
import { ProtectedRoute } from './components/shared/ProtectedRoute';
import { AppRouteShell } from './components/shared/AppRouteShell';
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
const XMLGenerator = lazy(() => import('./pages/XMLGenerator.jsx'));
const DivisionManagement = lazy(() => import('./components/divisions/DivisionManagement.jsx'));
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
    element: <AppRouteShell />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'about',
        element: <About />,
      },
      {
        path: 'credits',
        element: <Credits />,
      },
      {
        path: 'account',
        element: (
          <ProtectedRoute>
            <Account />
          </ProtectedRoute>
        ),
      },
      {
        path: 'auth/callback',
        element: <AuthCallback />,
      },
      {
        path: 'status',
        element: <GlobalStatus />,
      },
      {
        path: 'changelog',
        element: <Changelog />,
      },
      {
        path: 'support',
        element: <Navigate to="/contact" replace />,
      },
      {
        path: 'contact',
        element: <Contact />,
      },
      {
        path: 'privacy',
        element: <Privacy />,
      },
      {
        path: 'terms',
        element: <Terms />,
      },
      {
        path: 'discord',
        element: <DiscordRedirect />,
      },
      {
        path: 'docs',
        element: <DocsRedirect />,
      },
      {
        path: 'documentation',
        element: <DocsRedirect />,
      },
      {
        path: 'contribute',
        element: <ContributionDashboard />,
      },
      {
        path: 'contribute/new',
        element: <ContributeNew />,
      },
      {
        path: 'contribute/map/:icao',
        element: <ContributeMap />,
      },
      {
        path: 'contribute/test/:icao',
        element: <ContributeTest />,
      },
      {
        path: 'contribute/details/:icao',
        element: <ContributeDetails />,
      },
      {
        path: 'contribute/generator/:icao?',
        element: <XMLGenerator />,
      },
      {
        path: 'faq',
        element: <FAQPage />,
      },
      {
        path: 'divisions/:id/manage',
        element: (
          <ProtectedRoute>
            <DivisionManagement />
          </ProtectedRoute>
        ),
      },
      {
        path: 'divisions/:divisionId/airports/:airportId',
        element: (
          <ProtectedRoute>
            <DivisionAirportManager />
          </ProtectedRoute>
        ),
      },
      {
        path: 'gen',
        element: <DebugGenerator />,
      },
      {
        path: 'banned',
        element: <Banned />,
      },
      {
        path: 'staff',
        element: (
          <ProtectedRoute>
            <StaffDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
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
