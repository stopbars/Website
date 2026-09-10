import { Children } from 'react';
import PropTypes from 'prop-types';

export const IconSwap = ({ active, children, className = '' }) => {
  const [first, second] = Children.toArray(children);

  return (
    <span className={`t-icon-swap ${className}`} data-state={active ? 'b' : 'a'} aria-hidden="true">
      <span className="t-icon inline-flex" data-icon="a">
        {first}
      </span>
      <span className="t-icon inline-flex" data-icon="b">
        {second}
      </span>
    </span>
  );
};

IconSwap.propTypes = {
  active: PropTypes.bool.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};
