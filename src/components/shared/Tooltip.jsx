import PropTypes from 'prop-types';

export const Tooltip = ({ children, content, className = '', open = false, side = 'top' }) => {
  if (!content) return children;

  const opensBelow = side === 'bottom';

  return (
    <div className={`relative flex items-center group ${className}`}>
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 max-w-64 -translate-x-1/2 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-center text-xs text-white whitespace-normal transition-[opacity,transform] duration-[var(--duration-quick)] ease-[var(--ease-out)] max-sm:right-0 max-sm:left-auto max-sm:translate-x-0 ${opensBelow ? 'top-full mt-2 origin-top' : 'bottom-full mb-2 origin-bottom'} ${open ? 'translate-y-0 scale-100 opacity-100' : `${opensBelow ? '-translate-y-1' : 'translate-y-1'} scale-[var(--scale-small)] opacity-0 delay-0 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-hover:delay-[var(--duration-micro)] group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100`}`}
      >
        {content}
        <div
          className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 transform bg-zinc-900 ${opensBelow ? 'bottom-full -mb-0.75 border-t border-l border-zinc-700' : 'top-full -mt-0.75 border-r border-b border-zinc-700'}`}
        />
      </div>
    </div>
  );
};

Tooltip.propTypes = {
  children: PropTypes.node.isRequired,
  content: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  className: PropTypes.string,
  open: PropTypes.bool,
  side: PropTypes.oneOf(['top', 'bottom']),
};
