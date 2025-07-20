import PropTypes from 'prop-types';

export const Button = ({ 
    children, 
    variant = 'primary', 
    className = '', 
    ...props 
}) => {
    const baseStyles = 'px-6 py-3 rounded-lg transition-colors flex items-center justify-center cursor-pointer';
    const variants = {
        primary: 'bg-white text-black hover:bg-zinc-100',
        secondary: 'bg-zinc-800 text-white hover:bg-zinc-700',
        outline: 'bg-transparent border border-zinc-800 text-white hover:bg-zinc-800'
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
    variant: PropTypes.oneOf(['primary', 'secondary', 'outline']),
    className: PropTypes.string
};
