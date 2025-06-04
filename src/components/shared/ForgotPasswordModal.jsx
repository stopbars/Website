import { useState } from 'react';
import { X, AlertTriangle, ArrowLeft } from 'lucide-react';
import PropTypes from 'prop-types';

export const ForgotPasswordModal = ({ isOpen, onClose, onBack }) => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState('email');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitEmail = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsSubmitting(true);
      
    try {
      const response = await fetch('https://api.stopbars.com/auth/forgot-password', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
        
      const data = await response.json();
        
      if (!response.ok) {
        setMessageType('error');
        setMessage(data.message || 'An error occurred');
        setTimeout(() => setMessage(''), 5000);
        return;
      }
        
      setMessageType('success');  
      setMessage(data.message);
      setTimeout(() => {
        setMessage('');
        setStep('code');
      }, 3000);
  
    } catch (error) {
      setMessageType('error');
      setMessage('An error occurred. Please try again.');
      console.error('Error sending reset email:', error);
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/auth/verify-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setMessageType('error');
        setMessage(data.message || 'An error occurred');
        setTimeout(() => setMessage(''), 5000);
        return;
      }
      
      setStep('newPassword');
    } catch (error) {
      setMessageType('error');
      setMessage('An error occurred. Please try again.');
        console.error('Error verifying reset code:', error);
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }
      
      onClose();
    } catch (error) {
      setError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl p-8 w-full max-w-[520px] relative border border-zinc-800 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <button
          onClick={() => step === 'email' ? onBack() : setStep('email')}
          className="absolute left-4 top-4 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white">Reset Password</h2>
          <p className="text-zinc-400 mt-2">
            {step === 'email' && 'Enter your email to receive a verification code'}
            {step === 'code' && 'Enter the verification code sent to your email'}
            {step === 'newPassword' && 'Enter your new password'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-500 text-sm">{error}</p>
          </div>
        )}

        {message && (
        <div className={`mb-6 p-4 ${
        messageType === 'error' ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'
        } border rounded-lg flex items-start gap-3`}>
        <AlertTriangle className={`w-5 h-5 ${
            messageType === 'error' ? 'text-red-500' : 'text-green-500'
        } flex-shrink-0 mt-0.5`} />
        <p className={
            messageType === 'error' ? 'text-red-500' : 'text-green-500'
        }>{message}</p>
        </div>
        )}

        <form onSubmit={
          step === 'email' ? handleSubmitEmail : 
          step === 'code' ? handleVerifyCode :
          handleResetPassword
        } className="space-y-5">
          {step === 'email' && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                placeholder="you@example.com"
                required
              />
            </div>
          )}

          {step === 'code' && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Verification Code
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                placeholder="Enter 6-digit code"
                required
                pattern="[0-9]{6}"
              />
            </div>
          )}

          {step === 'newPassword' && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-blue-500 text-white"
                placeholder="Enter new password"
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : (
              step === 'email' ? 'Send Code' :
              step === 'code' ? 'Verify Code' :
              'Reset Password'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

ForgotPasswordModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
};