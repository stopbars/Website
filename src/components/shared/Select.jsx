import React from 'react';
import PropTypes from 'prop-types';
import { ChevronDown } from 'lucide-react';

const Select = ({ value, onValueChange, placeholder, disabled, error, children }) => {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        aria-expanded={open}
        className={`
          relative flex min-h-10 w-full items-center justify-between
          rounded-md border px-3 py-2 text-sm
          transition-[background-color,border-color,transform,opacity] duration-150 ease-out
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-zinc-800/50 active:scale-[0.99]'}
          ${error ? 'border-red-500' : 'border-zinc-700'}
          ${open ? 'border-blue-500 ring-2 ring-blue-500/20' : ''}
        `}
      >
        <span className={`block truncate ${!value ? 'text-zinc-500' : 'text-zinc-200'}`}>
          {value || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-zinc-400 transition-transform duration-200 
          ${open ? 'transform rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className={`
            absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-700
            bg-zinc-900 animate-in fade-in-0 zoom-in-95 duration-150
          `}
          >
            {children({
              active: value,
              onSelect: (val) => {
                onValueChange(val);
                setOpen(false);
              },
            })}
          </div>
        </>
      )}
    </div>
  );
};

const SelectTrigger = React.forwardRef(({ children, ...props }, ref) => {
  return (
    <div ref={ref} {...props}>
      {children}
    </div>
  );
});

SelectTrigger.displayName = 'SelectTrigger';

const SelectValue = React.forwardRef(({ children, placeholder }, ref) => {
  return (
    <span ref={ref} className={!children ? 'text-zinc-500' : ''}>
      {children || placeholder}
    </span>
  );
});

SelectValue.displayName = 'SelectValue';

const SelectContent = ({ children }) => {
  return <div className="py-1">{children}</div>;
};

const SelectItem = React.forwardRef(({ value, children, disabled }, ref) => {
  const itemRef = React.useRef(null);

  return (
    <button
      ref={ref || itemRef}
      className={`
        relative flex min-h-10 w-full items-center px-3 py-2 text-sm
        transition-[background-color,color,opacity] duration-150 ease-out
        focus-visible:outline-none focus-visible:bg-zinc-800
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-zinc-800'}
      `}
      onClick={() => !disabled && itemRef.current?.click()}
      tabIndex={disabled ? -1 : 0}
      data-value={value}
      disabled={disabled}
    >
      {children}
    </button>
  );
});

SelectItem.displayName = 'SelectItem';

Select.propTypes = {
  value: PropTypes.string,
  onValueChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
  error: PropTypes.bool,
  children: PropTypes.func.isRequired,
};

SelectTrigger.propTypes = {
  children: PropTypes.node,
};

SelectValue.propTypes = {
  children: PropTypes.node,
  placeholder: PropTypes.string,
};

SelectContent.propTypes = {
  children: PropTypes.node,
};

SelectItem.propTypes = {
  value: PropTypes.string.isRequired,
  children: PropTypes.node,
  disabled: PropTypes.bool,
};

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
