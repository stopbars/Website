import PropTypes from 'prop-types';

const Card = ({ children, className = '', ...props }) => {
    return (
        <div 
            className={`bg-zinc-900 border border-zinc-800 rounded-xl p-6 ${className}`}
            {...props}
        >
            {children}
        </div>
    );
};

const CardHeader = ({ children, className = '', ...props }) => {
    return (
        <div 
            className={`flex flex-col space-y-1.5 pb-4 ${className}`}
            {...props}
        >
            {children}
        </div>
    );
};

const CardTitle = ({ children, className = '', ...props }) => {
    return (
        <h3 
            className={`font-semibold leading-none tracking-tight text-lg ${className}`}
            {...props}
        >
            {children}
        </h3>
    );
};

const CardContent = ({ children, className = '', ...props }) => {
    return (
        <div className={`${className}`} {...props}>
            {children}
        </div>
    );
};

// PropTypes
Card.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string
};

CardHeader.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string
};

CardTitle.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string
};

CardContent.propTypes = {
    children: PropTypes.node,
    className: PropTypes.string
};

// Default Props
Card.defaultProps = {
    className: ''
};

CardHeader.defaultProps = {
    className: ''
};

CardTitle.defaultProps = {
    className: ''
};

CardContent.defaultProps = {
    className: ''
};

export { Card, CardHeader, CardTitle, CardContent };