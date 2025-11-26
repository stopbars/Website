import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Info, Check, AlertTriangle, X } from 'lucide-react';

export const Toast = ({
  title,
  description,
  variant = 'default',
  duration = 5000,
  onClose,
  show = true,
}) => {
  const [isVisible, setIsVisible] = useState(show);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleClose = useCallback(() => {
    setIsAnimating(false);
    setTimeout(() => {
      setIsVisible(false);
      if (onClose) onClose();
    }, 500); // Wait for exit animation
  }, [onClose]);

  useEffect(() => {
    if (!show) return undefined;

    let animationDelay;
    let autoDismiss;
    const opener = setTimeout(() => {
      setIsVisible(true);
      animationDelay = setTimeout(() => {
        setIsAnimating(true);
      }, 50);
      autoDismiss = setTimeout(() => {
        handleClose();
      }, duration);
    }, 0);

    return () => {
      clearTimeout(opener);
      if (animationDelay) clearTimeout(animationDelay);
      if (autoDismiss) clearTimeout(autoDismiss);
    };
  }, [show, duration, handleClose]);

  useEffect(() => {
    if (show) return undefined;

    let finalizeTimer;
    const hideTimer = setTimeout(() => {
      setIsAnimating(false);
      finalizeTimer = setTimeout(() => {
        setIsVisible(false);
      }, 500);
    }, 0);

    return () => {
      clearTimeout(hideTimer);
      if (finalizeTimer) clearTimeout(finalizeTimer);
    };
  }, [show]);

  if (!isVisible) return null;

  // Icon components for each variant
  const icons = {
    default: <Info className="w-5 h-5" />,
    success: <Check className="w-5 h-5" />,
    warning: <AlertTriangle className="w-5 h-5" />,
    destructive: <AlertTriangle className="w-5 h-5" />,
  };

  // Variant styles
  const variants = {
    default: {
      container: 'bg-zinc-900/95 border-zinc-700 text-white shadow-xl backdrop-blur-sm',
      icon: 'text-white/90',
      title: 'text-white',
      description: 'text-zinc-400',
    },
    success: {
      container: 'bg-green-900/90 border-green-700 text-white shadow-xl backdrop-blur-sm',
      icon: 'text-green-400',
      title: 'text-green-100',
      description: 'text-green-200',
    },
    warning: {
      container: 'bg-orange-900/90 border-orange-700 text-white shadow-xl backdrop-blur-sm',
      icon: 'text-orange-400',
      title: 'text-orange-100',
      description: 'text-orange-200',
    },
    destructive: {
      container: 'bg-red-900/90 border-red-700 text-white shadow-xl backdrop-blur-sm',
      icon: 'text-red-400',
      title: 'text-red-100',
      description: 'text-red-200',
    },
  };

  const currentVariant = variants[variant] || variants.default;

  return (
    <div
      className={`
        fixed bottom-4 left-4 z-50 max-w-sm w-full
        transform transition-all duration-500 ease-out
        ${
          isAnimating
            ? 'translate-x-0 opacity-100 scale-100'
            : '-translate-x-full opacity-0 scale-95'
        }
      `}
    >
      <div
        className={`
          ${currentVariant.container}
          border rounded-xl p-5 relative
          transform transition-all duration-500 ease-out
          ${isAnimating ? 'translate-y-0 scale-100' : 'translate-y-2 scale-98'}
        `}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 p-1 hover:bg-white/10 rounded-full transition-colors duration-200"
          aria-label="Close notification"
        >
          <X className="w-4 h-4 text-current opacity-70 hover:opacity-100" />
        </button>

        {/* Content */}
        <div className="flex items-start space-x-3 pr-8">
          {/* Icon */}
          <div className={`shrink-0 mt-0.5 ${currentVariant.icon}`}>
            {icons[variant] || icons.default}
          </div>

          {/* Text content */}
          <div className="flex-1 min-w-0">
            <h4 className={`text-sm font-medium mb-1 ${currentVariant.title}`}>{title}</h4>
            {description && (
              <p className={`text-xs leading-relaxed ${currentVariant.description}`}>
                {description}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

Toast.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'success', 'warning', 'destructive']),
  duration: PropTypes.number,
  onClose: PropTypes.func,
  show: PropTypes.bool,
};
