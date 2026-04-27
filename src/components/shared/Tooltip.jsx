import PropTypes from 'prop-types';

export const Tooltip = ({ children, content, className = '', open = false }) => {
  if (!content) return children;

  return (
    <div className={`relative flex items-center group ${className}`}>
      {children}
      <div
        className={`absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-white whitespace-nowrap transition-opacity duration-150 ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        {content}
        {/* Arrow */}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-0.75 border-r border-b border-zinc-700 bg-zinc-900 w-2 h-2 rotate-45" />
      </div>
    </div>
  );
};

Tooltip.propTypes = {
  children: PropTypes.node.isRequired,
  content: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  className: PropTypes.string,
  open: PropTypes.bool,
};
