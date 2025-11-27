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

  const currentOption = options.find((opt) => opt.value === value);

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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={`flex items-center justify-between w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white transition-all duration-200 hover:border-zinc-600 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <span className="transition-colors duration-200">
          {currentOption?.label || placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-2.5 text-left hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg transition-all duration-150 ${
                value === option.value
                  ? 'bg-zinc-700 text-blue-400'
                  : 'text-white hover:text-zinc-100'
              }`}
              style={{
                animationDelay: `${index * 25}ms`,
                animationFillMode: 'both',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

Dropdown.propTypes = {
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ),
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  className: PropTypes.string,
  disabled: PropTypes.bool,
};

export default Dropdown;
