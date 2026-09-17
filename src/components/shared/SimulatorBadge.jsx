import PropTypes from 'prop-types';
import { getSimulatorPresentation } from '../../utils/simulatorPresentation';

const SIZE_CLASS_NAMES = {
  xs: 'px-2 py-0.5 text-xs',
  sm: 'px-2.5 py-1 text-sm',
};

export const SimulatorBadge = ({ simulator, size = 'xs', className = '' }) => {
  const presentation = getSimulatorPresentation(simulator);

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border font-medium ${SIZE_CLASS_NAMES[size]} ${presentation.badgeClassName} ${className}`}
    >
      {presentation.label}
    </span>
  );
};

SimulatorBadge.propTypes = {
  simulator: PropTypes.string,
  size: PropTypes.oneOf(['xs', 'sm']),
  className: PropTypes.string,
};
