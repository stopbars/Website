import PropTypes from 'prop-types';

export const Button = ({ 
    children, 
    variant = 'primary', 
    className = '', 
    ...props 
}) => {
    const baseStyles = 'px-6 py-3 rounded-lg transition-colors flex items-center justify-center cursor-pointer font-medium';
    const variants = {
        primary: 'bg-white text-black hover:bg-gray-100 focus:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-zinc-900',
        secondary: 'bg-zinc-700 text-white hover:bg-zinc-600 focus:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900',
        outline: 'bg-transparent border-2 border-zinc-600 text-white hover:bg-zinc-700 focus:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900',
        destructive: 'bg-red-600/80 text-white border border-red-500 hover:bg-red-600 focus:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-zinc-900 shadow shadow-red-500/30 hover:shadow-red-500/50'
    };

    return (
        <button 
            className={`${baseStyles} ${variants[variant]} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
};

Button.propTypes = {
    children: PropTypes.node.isRequired,
    variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'destructive']),
    className: PropTypes.string
};
