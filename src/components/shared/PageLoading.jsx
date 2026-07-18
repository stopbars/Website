import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import { LoadingSkeleton } from './LoadingSkeleton';

const getRouteSkeletonVariant = (pathname) => {
  if (pathname === '/staff') return 'staff';
  if (pathname === '/account') return 'account';
  if (/^\/divisions\/[^/]+\/manage\/?$/.test(pathname)) return 'division';
  if (/^\/divisions\/[^/]+\/airports\//.test(pathname)) return 'editor';
  if (pathname.startsWith('/contribute/generator')) return 'editor';
  return 'page';
};

export const PageLoading = ({ label = 'Loading page…', page = false, variant = 'auto' }) => {
  const { pathname } = useLocation();

  if (page) {
    const resolvedVariant = variant === 'auto' ? getRouteSkeletonVariant(pathname) : variant;
    return <LoadingSkeleton label={label} variant={resolvedVariant} />;
  }

  return <LoadingSkeleton compact label={label} />;
};

PageLoading.propTypes = {
  label: PropTypes.string,
  page: PropTypes.bool,
  variant: PropTypes.oneOf(['account', 'auto', 'division', 'editor', 'page', 'staff']),
};
