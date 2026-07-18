import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../hooks/useAuth';
import { getVatsimToken } from '../../utils/cookieUtils';
import { PageLoading } from './PageLoading';

export const ProtectedRoute = ({ children }) => {
  const { user, loading, bannedInfo } = useAuth();
  const savedToken = getVatsimToken();

  if (loading) {
    return <PageLoading page label="Checking your account…" />;
  }
  // If banned, always redirect to banned page
  if (bannedInfo?.banned) {
    return <Navigate to="/banned" replace />;
  }

  // Allow access if we have a valid token (not banned) or a resolved user
  if (savedToken || user) {
    return children;
  }

  return <Navigate to="/" replace />;
};

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
