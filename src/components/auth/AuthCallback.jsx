import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Card } from '../shared/Card';
import { Loader, AlertTriangle, Check } from 'lucide-react';
import { setVatsimToken } from '../../utils/cookieUtils';

export const AuthCallback = () => {
  const navigate = useNavigate();
  const { fetchUserData } = useAuth();
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('authenticating'); // 'authenticating', 'success', 'error'

  useEffect(() => {
    const handleAuthentication = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      // Get redirect URL from localStorage instead of query parameter
      const redirectTo = localStorage.getItem('authRedirectPage') || '/account'; // Default to account page if no stored redirect

      if (token) {
        setVatsimToken(token);
        try {
          const result = await fetchUserData(token);
          if (result?.status === 'banned') {
            // Go straight to banned page
            navigate('/banned', { replace: true });
            return;
          }
          setStatus('success');
          // Brief delay to show success message before redirecting
          setTimeout(() => navigate(redirectTo), 1000);
          localStorage.removeItem('authRedirectPage');
        } catch (err) {
          setError(err.message);
          setStatus('error');
          setTimeout(() => navigate('/'), 3000);
        }
      } else {
        setError('No token found');
        setStatus('error');
        setTimeout(() => navigate('/'), 3000);
      }
    };

    handleAuthentication();
    // Remove fetchUserData from dependencies to prevent infinite loops
    // Only run this effect once when the component mounts
  }, [navigate, fetchUserData]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950">
      <Card className="p-8 max-w-md w-full">
        {status === 'authenticating' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader className="w-12 h-12 animate-spin text-blue-500 mb-6" />
            <h2 className="text-xl font-medium mb-2">Authenticating with VATSIM</h2>
            <p className="text-zinc-400 text-center">
              Please wait while we verify your credentials...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-medium mb-2">Authentication Successful</h2>
            <p className="text-zinc-400 text-center">Redirecting to your account...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-medium mb-2">Authentication Failed</h2>
            <p className="text-red-400 text-center mb-1">{error}</p>
            <p className="text-zinc-400 text-center">Redirecting to home page...</p>
          </div>
        )}
      </Card>
    </div>
  );
};
