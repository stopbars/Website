import { Button } from '../shared/Button';
import { X } from 'lucide-react';
import { useState } from 'react';
import PropTypes from 'prop-types';

// Root component that handles the dialog visibility and backdrop
const AlertDialog = ({ children, open, onOpenChange }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      {/* Dialog positioning */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
};

// Content wrapper for the dialog
const AlertDialogContent = ({ children, className = "" }) => {
  return (
    <div 
      className={`relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl transform transition-all ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
};

// Header section of the dialog
const AlertDialogHeader = ({ children, className = "" }) => {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
};

// Title component
const AlertDialogTitle = ({ children, className = "" }) => {
  return (
    <h2 className={`text-xl font-semibold mb-2 ${className}`}>
      {children}
    </h2>
  );
};

// Description component
const AlertDialogDescription = ({ children, className = "" }) => {
  return (
    <p className={`text-zinc-400 ${className}`}>
      {children}
    </p>
  );
};

// Footer section
const AlertDialogFooter = ({ children, className = "" }) => {
  return (
    <div className={`p-6 pt-0 flex justify-end space-x-4 ${className}`}>
      {children}
    </div>
  );
};

// Action button component
const AlertDialogAction = ({ children, onClick, className = "", ...props }) => {
  return (
    <Button
      onClick={onClick}
      className={className}
      {...props}
    >
      {children}
    </Button>
  );
};

// Close button component
const AlertDialogClose = ({ onClick, className = "" }) => {
  return (
    <button
      onClick={onClick}
      className={`absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors ${className}`}
    >
      <X className="w-5 h-5" />
    </button>
  );
};

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogClose
};

// Usage Example:
const ExampleUsage = () => {
  const [open, setOpen] = useState(false);
  
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogClose onClick={() => setOpen(false)} />
        <AlertDialogHeader>
          <AlertDialogTitle>
            Welcome to Airport Contributions!
          </AlertDialogTitle>
          <AlertDialogDescription>
            Before submitting your first airport, we recommend checking out our comprehensive guide.
            It contains important information about the submission process and requirements.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => window.location.href = '/guide'}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            View Guide
          </AlertDialogAction>
          <AlertDialogAction
            onClick={() => setOpen(false)}
            className="bg-zinc-600 hover:bg-zinc-700"
          >
            Maybe Later
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ExampleUsage;

AlertDialog.propTypes = {
    children: PropTypes.node.isRequired,
    open: PropTypes.bool.isRequired,
    onOpenChange: PropTypes.func.isRequired
  };
  
  AlertDialogContent.propTypes = {
    children: PropTypes.node.isRequired,
    className: PropTypes.string
  };
  
  AlertDialogContent.defaultProps = {
    className: ""
  };
  
  AlertDialogHeader.propTypes = {
    children: PropTypes.node.isRequired,
    className: PropTypes.string
  };
  
  AlertDialogHeader.defaultProps = {
    className: ""
  };
  
  AlertDialogTitle.propTypes = {
    children: PropTypes.node.isRequired,
    className: PropTypes.string
  };
  
  AlertDialogTitle.defaultProps = {
    className: ""
  };
  
  AlertDialogDescription.propTypes = {
    children: PropTypes.node.isRequired,
    className: PropTypes.string
  };
  
  AlertDialogDescription.defaultProps = {
    className: ""
  };
  
  AlertDialogFooter.propTypes = {
    children: PropTypes.node.isRequired,
    className: PropTypes.string
  };
  
  AlertDialogFooter.defaultProps = {
    className: ""
  };
  
  AlertDialogAction.propTypes = {
    children: PropTypes.node.isRequired,
    onClick: PropTypes.func.isRequired,
    className: PropTypes.string,
    ...Button.propTypes
  };
  
  AlertDialogAction.defaultProps = {
    className: ""
  };
  
  AlertDialogClose.propTypes = {
    onClick: PropTypes.func.isRequired,
    className: PropTypes.string
  };
  
  AlertDialogClose.defaultProps = {
    className: ""
  };
  
  ExampleUsage.propTypes = {}; // No props for the example component