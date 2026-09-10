import PropTypes from 'prop-types';

export const ComingSoonMedia = ({ className = '' }) => (
  <div className={`home-coming-soon-media ${className}`.trim()}>
    <p className="home-coming-soon-label">Coming soon</p>
  </div>
);

ComingSoonMedia.propTypes = {
  className: PropTypes.string,
};
