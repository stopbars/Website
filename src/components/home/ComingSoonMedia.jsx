import PropTypes from 'prop-types';

export const ComingSoonMedia = ({ className = '', children = 'Coming soon' }) => (
  <div className={`home-coming-soon-media ${className}`.trim()}>
    <p className="home-coming-soon-label">{children}</p>
  </div>
);

ComingSoonMedia.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
};
