import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import { preloadRoute } from '../../utils/routeModules';

export const RouteLink = ({ to, onFocus, onPointerEnter, onTouchStart, ...props }) => {
  const warmRoute = () => preloadRoute(to);

  return (
    <Link
      {...props}
      to={to}
      onFocus={(event) => {
        warmRoute();
        onFocus?.(event);
      }}
      onPointerEnter={(event) => {
        warmRoute();
        onPointerEnter?.(event);
      }}
      onTouchStart={(event) => {
        warmRoute();
        onTouchStart?.(event);
      }}
    />
  );
};

RouteLink.propTypes = {
  to: PropTypes.oneOfType([PropTypes.string, PropTypes.object]).isRequired,
  onFocus: PropTypes.func,
  onPointerEnter: PropTypes.func,
  onTouchStart: PropTypes.func,
};
