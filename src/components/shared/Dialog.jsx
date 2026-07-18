import { useEffect, useCallback, useId, useRef } from 'react';
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

const DIALOG_MAX_WIDTH_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

const DIALOG_BUTTON_POSITION_CLASSES = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

const EMPTY_DIALOG_ITEMS = [];
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const DialogField = ({ field, colorScheme }) => {
  const fieldId = useId();
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

  const baseInputClasses = `w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-white placeholder-zinc-500 transition-[background-color,border-color,box-shadow,opacity] duration-150 ease-out focus:outline-none focus:ring-2 ${colorScheme.focusRing}`;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={fieldId} className="block text-sm font-medium text-zinc-300">
          {label}
        </label>
      )}

      {type === 'text' || type === 'confirmation' ? (
        <input
          id={fieldId}
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
          id={fieldId}
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
          id={fieldId}
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
          id={fieldId}
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
  fields = EMPTY_DIALOG_ITEMS,
  buttons = EMPTY_DIALOG_ITEMS,
  buttonsPosition = 'left',
  isLoading = false,
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  maxWidth = 'md',
  onSubmit,
}) => {
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

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
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = Array.from(
          dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR)
        );

        if (focusableElements.length === 0) {
          e.preventDefault();
          dialogRef.current.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements.at(-1);

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
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
      previouslyFocusedRef.current = document.activeElement;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const timer = setTimeout(() => {
        if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
          dialogRef.current.focus();
        }
      }, 10);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = previousOverflow;
        previouslyFocusedRef.current?.focus?.();
      };
    }
  }, [open]);

  if (!open) return null;

  const dialogContent = (
    // The backdrop owns pointer dismissal while the inner panel is the accessible dialog.
    // oxlint-disable-next-line react-doctor/no-noninteractive-element-interactions
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex min-h-dvh w-screen items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        className={`my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto bg-zinc-900 rounded-xl ${DIALOG_MAX_WIDTH_CLASSES[maxWidth] || DIALOG_MAX_WIDTH_CLASSES.md} w-full border border-zinc-800 shadow-2xl shadow-black/30 focus:outline-none`}
        style={{
          animation: 'dialogContentIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
      >
        <div className="flex items-start justify-between p-6 pb-0">
          <div className="flex items-center space-x-3">
            {Icon && <Icon className={`w-6 h-6 ${iconColorScheme.icon} shrink-0`} />}
            {title && (
              <h3 id={titleId} className={`text-xl font-semibold ${titleColorScheme.title}`}>
                {title}
              </h3>
            )}
          </div>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-1.5 text-zinc-500 transition-[background-color,color,transform,opacity] duration-150 ease-out hover:bg-zinc-800 hover:text-zinc-300 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6">
          {description && (
            typeof description === 'string' ? (
              <p id={descriptionId} className="text-zinc-300 mb-6">
                {description}
              </p>
            ) : (
              <div id={descriptionId} className="mb-6 text-zinc-300">
                {description}
              </div>
            )
          )}

          {children}

          {fields.length > 0 && (
            <form onSubmit={handleFormSubmit}>
              <div className="space-y-4">
                {fields.map((field) => (
                  <DialogField
                    key={field.id ?? field.label ?? field.placeholder}
                    field={{ ...field, disabled: field.disabled || isLoading }}
                    colorScheme={iconColorScheme}
                  />
                ))}
              </div>

              {buttons.length > 0 && (
                <div
                  className={`flex flex-wrap gap-3 mt-6 ${DIALOG_BUTTON_POSITION_CLASSES[buttonsPosition]}`}
                >
                  {buttons.map((button) => (
                    <DialogButton
                      key={button.id ?? button.label}
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
            <div
              className={`flex flex-wrap gap-3 mt-6 ${DIALOG_BUTTON_POSITION_CLASSES[buttonsPosition]}`}
            >
              {buttons.map((button) => (
                <DialogButton
                  key={button.id ?? button.label}
                  button={button}
                  isValid={true}
                  isLoading={isLoading}
                />
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
  description: PropTypes.node,
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
