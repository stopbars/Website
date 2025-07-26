import { Navigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { useAuth } from '../../hooks/useAuth';
import { Loader } from 'lucide-react';
import { getVatsimToken } from '../../utils/cookieUtils';

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const savedToken = getVatsimToken();
 
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader className="w-8 h-8 animate-spin text-white" />
      </div>
    );
  }
  
  if (savedToken) {
    return children;
  }
 
  return user ? children : <Navigate to="/" />;
};

ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired
};