import { useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X, Loader } from 'lucide-react';
import { Button } from './Button';

/**
 *
 * @example
 * <Dialog
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   icon={AlertOctagon}
 *   iconColor="red"
 *   title="Delete Account"
 *   description="This action cannot be undone."
 *   fields={[{ type: 'confirmation', label: 'Type DELETE:', confirmText: 'DELETE', value, onChange }]}
 *   buttons={[
 *     { label: 'Delete', variant: 'destructive', type: 'submit', requiresValidation: true },
 *     { label: 'Cancel', variant: 'outline', onClick: () => setIsOpen(false) }
 *   ]}
 * />
 */

const colorClasses = {
  red: {
    icon: 'text-red-500',
    title: 'text-red-500',
    border: 'border-red-500/20',
    focusRing: 'focus:border-red-500 focus:ring-red-500/20',
  },
  orange: {
    icon: 'text-orange-400',
    title: 'text-orange-400',
    border: 'border-orange-500/20',
    focusRing: 'focus:border-orange-500 focus:ring-orange-500/20',
  },
  blue: {
    icon: 'text-blue-400',
    title: 'text-blue-400',
    border: 'border-blue-500/20',
    focusRing: 'focus:border-blue-500 focus:ring-blue-500/20',
  },
  green: {
    icon: 'text-green-400',
    title: 'text-green-400',
    border: 'border-green-500/20',
    focusRing: 'focus:border-green-500 focus:ring-green-500/20',
  },
  zinc: {
    icon: 'text-zinc-400',
    title: 'text-white',
    border: 'border-zinc-700',
    focusRing: 'focus:border-zinc-500 focus:ring-zinc-500/20',
  },
  white: {
    icon: 'text-white',
    title: 'text-white',
    border: 'border-zinc-700',
    focusRing: 'focus:border-zinc-500 focus:ring-zinc-500/20',
  },
};

const DialogField = ({ field, colorScheme }) => {
  const {
    type = 'text',
    label,
    placeholder,
    value,
    onChange,
    disabled = false,
    rows = 4,
    maxLength,
    autoFocus = false,
    helperText,
  } = field;

  const baseInputClasses = `w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 transition-all focus:outline-none focus:ring-2 ${colorScheme.focusRing}`;

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium text-zinc-300">{label}</label>}

      {type === 'text' || type === 'confirmation' ? (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          autoFocus={autoFocus}
          className={`${baseInputClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      ) : type === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          maxLength={maxLength}
          autoFocus={autoFocus}
          className={`${baseInputClasses} resize-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      ) : type === 'email' ? (
        <input
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={`${baseInputClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      ) : type === 'password' ? (
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={`${baseInputClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      ) : null}

      {helperText && <p className="text-sm text-zinc-500">{helperText}</p>}
    </div>
  );
};

DialogField.propTypes = {
  field: PropTypes.shape({
    type: PropTypes.oneOf(['text', 'textarea', 'confirmation', 'email', 'password']),
    label: PropTypes.string,
    placeholder: PropTypes.string,
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    confirmText: PropTypes.string,
    disabled: PropTypes.bool,
    rows: PropTypes.number,
    maxLength: PropTypes.number,
    autoFocus: PropTypes.bool,
    helperText: PropTypes.string,
  }).isRequired,
  colorScheme: PropTypes.object.isRequired,
};

const DialogButton = ({ button, isValid, isLoading }) => {
  const {
    label,
    onClick,
    variant = 'primary',
    icon: ButtonIcon,
    loadingLabel,
    disabled = false,
    requiresValidation = false,
    type = 'button',
    className = '',
  } = button;

  const isDisabled = disabled || isLoading || (requiresValidation && !isValid);
  const disabledClassName = isDisabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '';

  return (
    <Button
      type={type}
      variant={variant}
      onClick={onClick}
      disabled={isDisabled}
      className={`${className} ${disabledClassName}`}
    >
      {isLoading && requiresValidation ? (
        <>
          <Loader className="w-4 h-4 mr-2 animate-spin" />
          {loadingLabel || 'Loading...'}
        </>
      ) : (
        <>
          {ButtonIcon && <ButtonIcon className="w-4 h-4 mr-2" />}
          {label}
        </>
      )}
    </Button>
  );
};

DialogButton.propTypes = {
  button: PropTypes.shape({
    label: PropTypes.string.isRequired,
    onClick: PropTypes.func,
    variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'destructive']),
    icon: PropTypes.elementType,
    loadingLabel: PropTypes.string,
    disabled: PropTypes.bool,
    requiresValidation: PropTypes.bool,
    type: PropTypes.oneOf(['button', 'submit']),
    className: PropTypes.string,
  }).isRequired,
  isValid: PropTypes.bool,
  isLoading: PropTypes.bool,
};

export const Dialog = ({
  open,
  onClose,
  icon: Icon,
  iconColor = 'zinc',
  title,
  titleColor,
  description,
  children,
  fields = [],
  buttons = [],
  buttonsPosition = 'right',
  isLoading = false,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  maxWidth = 'md',
  onSubmit,
}) => {
  const dialogRef = useRef(null);

  const resolvedTitleColor = titleColor || iconColor;
  const iconColorScheme = colorClasses[iconColor] || colorClasses.zinc;
  const titleColorScheme = colorClasses[resolvedTitleColor] || colorClasses.zinc;

  const isFormValid = fields.every((field) => {
    if (field.type === 'confirmation') {
      return field.value === field.confirmText;
    }
    return true;
  });

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && closeOnEscape && !isLoading) {
        onClose();
      }
    },
    [closeOnEscape, isLoading, onClose]
  );

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget && closeOnBackdrop && !isLoading) {
        onClose();
      }
    },
    [closeOnBackdrop, isLoading, onClose]
  );

  const handleFormSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (onSubmit && isFormValid && !isLoading) {
        onSubmit();
      }
    },
    [onSubmit, isFormValid, isLoading]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [open, handleKeyDown]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
          dialogRef.current.focus();
        }
      }, 10);

      return () => {
        clearTimeout(timer);
      };
    }
  }, [open]);

  if (!open) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  const buttonPositionClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  const dialogContent = (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-out"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'dialog-title' : undefined}
      aria-describedby={description ? 'dialog-description' : undefined}
      style={{
        animation: 'dialogBackdropIn 0.2s ease-out forwards',
      }}
    >
      <style>{`
        @keyframes dialogBackdropIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes dialogContentIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`bg-zinc-900 rounded-xl ${maxWidthClasses[maxWidth] || maxWidthClasses.md} w-full border border-zinc-800 shadow-2xl shadow-black/50 focus:outline-none`}
        style={{
          animation: 'dialogContentIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <div className="flex items-start justify-between p-6 pb-0">
          <div className="flex items-center space-x-3">
            {Icon && <Icon className={`w-6 h-6 ${iconColorScheme.icon} shrink-0`} />}
            {title && (
              <h3 id="dialog-title" className={`text-xl font-semibold ${titleColorScheme.title}`}>
                {title}
              </h3>
            )}
          </div>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6">
          {description && (
            <p id="dialog-description" className="text-zinc-300 mb-6">
              {description}
            </p>
          )}

          {children}

          {fields.length > 0 && (
            <form onSubmit={handleFormSubmit}>
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <DialogField
                    key={index}
                    field={{ ...field, disabled: field.disabled || isLoading }}
                    colorScheme={iconColorScheme}
                  />
                ))}
              </div>

              {buttons.length > 0 && (
                <div
                  className={`flex flex-wrap gap-3 mt-6 ${buttonPositionClasses[buttonsPosition]}`}
                >
                  {buttons.map((button, index) => (
                    <DialogButton
                      key={index}
                      button={button}
                      isValid={isFormValid}
                      isLoading={isLoading}
                    />
                  ))}
                </div>
              )}
            </form>
          )}

          {fields.length === 0 && buttons.length > 0 && (
            <div className={`flex flex-wrap gap-3 mt-6 ${buttonPositionClasses[buttonsPosition]}`}>
              {buttons.map((button, index) => (
                <DialogButton key={index} button={button} isValid={true} isLoading={isLoading} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};

Dialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  icon: PropTypes.elementType,
  iconColor: PropTypes.oneOf(['red', 'orange', 'blue', 'green', 'zinc', 'white']),
  title: PropTypes.string,
  titleColor: PropTypes.oneOf(['red', 'orange', 'blue', 'green', 'zinc', 'white']),
  description: PropTypes.string,
  children: PropTypes.node,
  fields: PropTypes.arrayOf(
    PropTypes.shape({
      type: PropTypes.oneOf(['text', 'textarea', 'confirmation', 'email', 'password']),
      label: PropTypes.string,
      placeholder: PropTypes.string,
      value: PropTypes.string,
      onChange: PropTypes.func.isRequired,
      confirmText: PropTypes.string,
      disabled: PropTypes.bool,
      rows: PropTypes.number,
      maxLength: PropTypes.number,
      autoFocus: PropTypes.bool,
      helperText: PropTypes.string,
    })
  ),
  buttons: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      onClick: PropTypes.func,
      variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'destructive']),
      icon: PropTypes.elementType,
      loadingLabel: PropTypes.string,
      disabled: PropTypes.bool,
      requiresValidation: PropTypes.bool,
      type: PropTypes.oneOf(['button', 'submit']),
      className: PropTypes.string,
    })
  ),
  buttonsPosition: PropTypes.oneOf(['left', 'center', 'right']),
  isLoading: PropTypes.bool,
  showCloseButton: PropTypes.bool,
  closeOnBackdrop: PropTypes.bool,
  closeOnEscape: PropTypes.bool,
  maxWidth: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', '2xl']),
  onSubmit: PropTypes.func,
};

export default Dialog;
