import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { LoadingSkeleton } from './LoadingSkeleton';

const getRouteSkeletonVariant = (pathname) => {
  if (pathname === '/staff') return 'staff';
  if (pathname === '/account') return 'account';
  if (pathname === '/status') return 'status';
  if (pathname === '/changelog') return 'changelog';
  if (pathname === '/faq') return 'faq';
  if (pathname === '/credits') return 'credits';
  if (pathname === '/contact' || pathname === '/support' || pathname === '/auth-grant') {
    return 'form-page';
  }
  if (pathname === '/privacy' || pathname === '/terms') return 'legal';
  if (pathname === '/contribute') return 'contributions';
  if (pathname === '/contribute/new') return 'flow-form';
  if (/^\/contribute\/map\/[^/]+\/?$/.test(pathname)) return 'flow-map';
  if (/^\/contribute\/generator(?:\/[^/]+)?\/?$/.test(pathname)) return 'flow-generator';
  if (/^\/contribute\/test\/[^/]+\/?$/.test(pathname)) return 'flow-test';
  if (/^\/contribute\/details\/[^/]+\/?$/.test(pathname)) return 'flow-details';
  if (/^\/contribute\/editor\/[^/]+\/?$/.test(pathname)) return 'full-editor';
  if (/^\/divisions\/[^/]+\/manage\/?$/.test(pathname)) return 'division';
  if (/^\/divisions\/[^/]+\/airports\//.test(pathname)) return 'airport-editor';
  return 'page';
};

export const PageLoading = ({ label = 'Loading page…', page = false, variant = 'auto' }) => {
  const { pathname } = useLocation();

  if (page) {
    const resolvedVariant = variant === 'auto' ? getRouteSkeletonVariant(pathname) : variant;
    return <LoadingSkeleton label={label} variant={resolvedVariant} />;
  }

  const resolvedVariant = variant === 'auto' ? 'page' : variant;
  return <LoadingSkeleton compact label={label} variant={resolvedVariant} />;
};

PageLoading.propTypes = {
  label: PropTypes.string,
  page: PropTypes.bool,
  variant: PropTypes.oneOf([
    'account',
    'airport-editor',
    'airport-list',
    'auto',
    'changelog',
    'changelog-content',
    'contributions',
    'credits',
    'division',
    'division-tool',
    'faq',
    'faq-list',
    'flow-details',
    'flow-form',
    'flow-generator',
    'flow-map',
    'flow-test',
    'form-page',
    'full-editor',
    'legal',
    'page',
    'staff',
    'status',
    'status-content',
    'tool-card-grid',
    'tool-detail',
    'tool-list',
    'tool-stack',
  ]),
};
