import { useState, useRef, useEffect, useId, useMemo } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown } from 'lucide-react';

const EMPTY_DROPDOWN_OPTIONS = [];

/**
 * Dropdown Component
 *
 * @param {Object} props
 * @param {Array<{value: string, label: string}>} props.options - Array of options to display
 * @param {string} props.value - Currently selected value
 * @param {function} props.onChange - Callback when selection changes (receives value)
 * @param {string} [props.placeholder] - Placeholder text when no value selected
 * @param {string} [props.className] - Additional classes for the container
 * @param {boolean} [props.disabled] - Whether the dropdown is disabled
 */
export function Dropdown({
  options = EMPTY_DROPDOWN_OPTIONS,
  value,
  onChange,
  placeholder = 'Select…',
  className = '',
  disabled = false,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRendered, setIsRendered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef(null);
  const closeTimerRef = useRef(null);
  if (optionRefs.current === null) optionRefs.current = new Map();
  const generatedId = useId();
  const triggerId = id || `dropdown-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;

  const selectableOptions = useMemo(() => options.filter((option) => !option.isHeader), [options]);
  const currentOption = selectableOptions.find((option) => option.value === value);
  const TriggerIcon = currentOption?.icon || null;

  const openDropdown = (requestedIndex) => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    const selectedIndex = selectableOptions.findIndex((option) => option.value === value);
    const fallbackIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex = Math.min(
      Math.max(requestedIndex ?? fallbackIndex, 0),
      Math.max(selectableOptions.length - 1, 0)
    );

    setActiveIndex(nextIndex);
    setIsRendered(true);
    setIsClosing(false);
    setIsOpen(true);
  };

  const closeDropdown = ({ restoreFocus = false } = {}) => {
    setIsOpen(false);
    setIsClosing(true);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setIsRendered(false);
      setIsClosing(false);
    }, 150);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(
    () => () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  const selectOption = (option) => {
    onChange(option.value);
    closeDropdown({ restoreFocus: true });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        closeDropdown({ restoreFocus: isOpen });
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const activeOption = selectableOptions[activeIndex];
      if (activeOption) optionRefs.current.get(activeOption.value)?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, isOpen, selectableOptions]);

  const handleTriggerKeyDown = (event) => {
    if (disabled || selectableOptions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openDropdown();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openDropdown(selectableOptions.length - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      openDropdown(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      openDropdown(selectableOptions.length - 1);
    }
  };

  const handleListboxKeyDown = (event) => {
    if (selectableOptions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % selectableOptions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + selectableOptions.length) % selectableOptions.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(selectableOptions.length - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && activeIndex >= 0) {
      event.preventDefault();
      selectOption(selectableOptions[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeDropdown({ restoreFocus: true });
    } else if (event.key === 'Tab') {
      closeDropdown();
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        onKeyDown={handleTriggerKeyDown}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) return;
          if (isOpen) closeDropdown();
          else openDropdown();
        }}
        disabled={disabled}
        className={`flex min-h-11 w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-white transition-[background-color,border-color,transform,opacity] duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:border-zinc-600 hover:bg-zinc-800/80 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <span className="mr-2 flex min-w-0 items-center gap-2 truncate transition-colors duration-[var(--duration-quick)]">
          {TriggerIcon && <TriggerIcon className="w-4 h-4 shrink-0" aria-hidden="true" />}
          {currentOption?.label || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-[var(--duration-quick)] ease-[var(--ease-out)] ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isRendered && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          tabIndex={-1}
          onKeyDown={handleListboxKeyDown}
          aria-hidden={isClosing}
          className={`${isClosing ? 'dropdown-exit pointer-events-none' : 'dropdown-enter'} absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl shadow-black/20`}
        >
          {options.map((option) => {
            if (option.isHeader) {
              return (
                <div key={`header-${option.label}`} className="px-4 pt-3 pb-1">
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    {option.label}
                  </p>
                </div>
              );
            }
            const OptionIcon = option.icon;
            return (
              <button
                key={option.value}
                ref={(element) => {
                  if (element) optionRefs.current.set(option.value, element);
                  else optionRefs.current.delete(option.value);
                }}
                type="button"
                role="option"
                aria-selected={value === option.value}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectOption(option);
                }}
                className={`flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left transition-[background-color,color] duration-[var(--duration-quick)] ease-[var(--ease-out)] hover:bg-zinc-700 focus-visible:outline-none focus-visible:bg-zinc-700 ${
                  value === option.value
                    ? 'bg-zinc-700 text-blue-400'
                    : 'text-white hover:text-zinc-100'
                }`}
              >
                {OptionIcon && <OptionIcon className="w-4 h-4 shrink-0" aria-hidden="true" />}
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

Dropdown.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string,
      label: PropTypes.string.isRequired,
      icon: PropTypes.elementType,
      isHeader: PropTypes.bool,
    })
  ),
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  className: PropTypes.string,
  disabled: PropTypes.bool,
  id: PropTypes.string,
  'aria-label': PropTypes.string,
  'aria-labelledby': PropTypes.string,
};
