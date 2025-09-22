import { Component } from 'react';
import PropTypes from 'prop-types';
import { useNavigate, useRouteError } from 'react-router-dom';
import { Card } from './Card';
import { Button } from './Button';
import { AlertTriangle, ArrowLeft, Home, RefreshCw, Copy, Check } from 'lucide-react';
import { Layout } from '../layout/Layout';
import { useState } from 'react';

class ErrorBoundaryClass extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // You can log the error to an error reporting service here
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback({
        error: this.state.error,
        errorInfo: this.state.errorInfo,
        resetError: () => this.setState({ hasError: false, error: null, errorInfo: null }),
      });
    }

    return this.props.children;
  }
}

ErrorBoundaryClass.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.func.isRequired,
};

// Route Error component used with errorElement
export const RouteError = () => {
  const error = useRouteError();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const resetError = () => {
    navigate(0); // Refresh the current page
  };

  const copyErrorToClipboard = async () => {
    const errorText = `Error: ${error?.message || 'An unexpected error occurred'}\n\nStack trace:\n${error?.stack || 'No stack trace available'}`;

    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy error to clipboard:', err);
    }
  };

  return (
    <Layout>
      <div className="min-h-[90vh] flex items-center justify-center px-6 pt-24">
        <Card className="max-w-2xl w-full p-12">
          <div className="flex justify-center mb-8">
            <AlertTriangle className="w-20 h-20 text-red-500" />
          </div>

          <h1 className="text-4xl font-bold mb-8 text-center">Something Went Wrong</h1>

          <div className="bg-zinc-800/50 p-4 rounded-lg mb-8 overflow-auto max-h-48 relative">
            <button
              onClick={copyErrorToClipboard}
              className="absolute top-3 right-3 p-1.5 text-zinc-400 hover:text-white transition-colors rounded"
              title="Copy error to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <p className="text-zinc-300 font-mono text-sm pr-8">
              {error?.message || 'An unexpected error occurred'}
            </p>
            {error?.stack && (
              <p className="text-zinc-400 text-xs mt-3 font-mono pr-8">
                {error.stack.split('\n').slice(0, 3).join('\n')}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="secondary" onClick={() => navigate(-1)} className="w-full sm:w-auto">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>

            <Button onClick={() => resetError()} className="w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>

            <Button onClick={() => navigate('/')} className="w-full sm:w-auto">
              <Home className="w-4 h-4 mr-2" />
              Return Home
            </Button>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

// Default fallback UI for ErrorBoundary
const DefaultFallback = ({ error, resetError }) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const copyErrorToClipboard = async () => {
    const errorText = `Error: ${error?.message || 'An unexpected error occurred'}\n\nStack trace:\n${error?.stack || 'No stack trace available'}`;

    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy error to clipboard:', err);
    }
  };

  return (
    <Layout>
      <div className="min-h-[90vh] flex items-center justify-center px-6 pt-24">
        <Card className="max-w-2xl w-full p-12">
          <div className="flex justify-center mb-8">
            <AlertTriangle className="w-20 h-20 text-red-500" />
          </div>

          <h1 className="text-4xl font-bold mb-8 text-center">Something Went Wrong</h1>

          <div className="bg-zinc-800/50 p-4 rounded-lg mb-8 overflow-auto max-h-48 relative">
            <button
              onClick={copyErrorToClipboard}
              className="absolute top-3 right-3 p-1.5 text-zinc-400 hover:text-white transition-colors rounded"
              title="Copy error to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <p className="text-zinc-300 font-mono text-sm pr-8">
              {error?.message || 'An unexpected error occurred'}
            </p>
            {error?.stack && (
              <p className="text-zinc-400 text-xs mt-3 font-mono pr-8">
                {error.stack.split('\n').slice(0, 3).join('\n')}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="secondary" onClick={() => navigate(-1)} className="w-full sm:w-auto">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>

            <Button onClick={resetError} className="w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>

            <Button onClick={() => navigate('/')} className="w-full sm:w-auto">
              <Home className="w-4 h-4 mr-2" />
              Return Home
            </Button>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

DefaultFallback.propTypes = {
  error: PropTypes.any,
  errorInfo: PropTypes.any,
  resetError: PropTypes.func.isRequired,
};

// Main ErrorBoundary component with default fallback
const ErrorBoundary = ({ children, fallback = DefaultFallback }) => {
  return <ErrorBoundaryClass fallback={fallback}>{children}</ErrorBoundaryClass>;
};

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.func,
};

export { ErrorBoundary };
