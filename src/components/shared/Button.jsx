import PropTypes from 'prop-types';

export const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  const baseStyles =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-6 py-3 font-medium cursor-pointer select-none whitespace-nowrap transition-[background-color,border-color,color,transform,opacity] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50';
  const variants = {
    primary: 'bg-white text-black hover:bg-gray-100 border-transparent active:bg-gray-200',
    secondary: 'bg-zinc-700 text-white hover:bg-zinc-600 border-transparent active:bg-zinc-500',
    outline:
      'bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600 active:bg-zinc-700',
    destructive: 'bg-red-600 text-white hover:bg-red-700 border-transparent active:bg-red-800',
  };

  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'destructive']),
  className: PropTypes.string,
};
