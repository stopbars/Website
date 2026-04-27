import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown } from 'lucide-react';

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
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentOption = options.find((opt) => !opt.isHeader && opt.value === value);
  const TriggerIcon = currentOption?.icon || null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={`flex min-h-10 w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-white transition-[background-color,border-color,transform,opacity] duration-150 ease-out hover:border-zinc-600 hover:bg-zinc-800/80 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <span className="mr-2 flex min-w-0 items-center gap-2 truncate transition-colors duration-150">
          {TriggerIcon && <TriggerIcon className="w-4 h-4 shrink-0" />}
          {currentOption?.label || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-150 ease-out ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800 animate-in fade-in-0 zoom-in-95 duration-150">
          {options.map((option, index) => {
            if (option.isHeader) {
              return (
                <div key={`header-${index}`} className="px-4 pt-3 pb-1">
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
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex min-h-10 w-full items-center gap-2 px-4 py-2.5 text-left transition-[background-color,color] duration-150 ease-out hover:bg-zinc-700 focus-visible:outline-none focus-visible:bg-zinc-700 ${
                  value === option.value
                    ? 'bg-zinc-700 text-blue-400'
                    : 'text-white hover:text-zinc-100'
                }`}
                style={{
                  animationDelay: `${index * 25}ms`,
                  animationFillMode: 'both',
                }}
              >
                {OptionIcon && <OptionIcon className="w-4 h-4 shrink-0" />}
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
};

export default Dropdown;
