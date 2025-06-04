import PropTypes from 'prop-types';
import { X } from 'lucide-react';

const Alert = ({ children, variant = 'default', className = '', onClose, ...props }) => {
  const variantStyles = {
    default: 'bg-zinc-900 border-zinc-800',
    destructive: 'bg-red-900/10 border-red-900/50 text-red-500',
    warning: 'bg-yellow-900/10 border-yellow-900/50 text-yellow-500',
    info: 'bg-blue-900/10 border-blue-900/50 text-blue-500',
    success: 'bg-emerald-900/10 border-emerald-900/50 text-emerald-500',
  };

  return (
    <div
      role="alert"
      className={`relative w-full rounded-lg border p-4 ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {onClose && (
        <button
          onClick={onClose}
          className="absolute right-2 top-2 rounded-sm opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
};

const AlertTitle = ({ children, className = '', ...props }) => {
  return (
    <h5
      className={`mb-1 font-medium leading-none tracking-tight ${className}`}
      {...props}
    >
      {children}
    </h5>
  );
};

const AlertDescription = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`text-sm opacity-90 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

// PropTypes
Alert.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.oneOf(['default', 'destructive', 'warning', 'info', 'success']),
  className: PropTypes.string,
  onClose: PropTypes.func
};

AlertTitle.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string
};

AlertDescription.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string
};

// Default Props
Alert.defaultProps = {
  variant: 'default',
  className: ''
};

AlertTitle.defaultProps = {
  className: ''
};

AlertDescription.defaultProps = {
  className: ''
};
export { Alert, AlertTitle, AlertDescription };