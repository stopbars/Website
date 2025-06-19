import { useAuth } from '../../context/AuthContext';
import { Button } from './Button';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';

export const AuthModal = ({ isOpen, onClose }) => {
  const { initiateVatsimAuth } = useAuth();
  const currentPage = window.location.pathname;

  const handleVatsimAuth = () => {
    initiateVatsimAuth(currentPage);
  }

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl p-10 w-full max-w-[540px] relative border border-zinc-700 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 text-zinc-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-white">Sign in with VATSIM</h2>
          <p className="text-zinc-300 mt-3 max-w-md mx-auto">
            Use your VATSIM account to access BARS
          </p>
        </div><Button
          onClick={handleVatsimAuth}
          className="w-full flex items-center justify-center py-3 text-base font-medium"
        >
          Continue with VATSIM
        </Button>

        <p className="mt-6 text-sm text-zinc-400 text-center">
          By continuing, you agree to our{' '}
          <a href="/privacy" className="text-blue-400 hover:text-blue-300">
            Privacy Policy
          </a>{' '}
          and{' '}
          <a href="/terms" className="text-blue-400 hover:text-blue-300">
            Terms of Use
          </a>
        </p>
      </div>
    </div>
  );
};

AuthModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};