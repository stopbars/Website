import PropTypes from 'prop-types';

export const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  const baseStyles =
    'px-6 py-3 rounded-lg transition-colors flex items-center justify-center cursor-pointer font-medium focus:outline-none border';
  const variants = {
    primary: 'bg-white text-black hover:bg-gray-100 border-transparent',
    secondary: 'bg-zinc-700 text-white hover:bg-zinc-600 border-transparent',
    outline:
      'bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600',
    destructive: 'bg-red-600 text-white hover:bg-red-700 border-transparent',
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
