import PropTypes from 'prop-types';
import images from 'virtual:optimized-images';

export const OptimizedImage = ({ src, alt, sizes = '100vw', width, height, ...props }) => {
  const image = images[src];

  return (
    <img
      loading="lazy"
      decoding="async"
      {...props}
      src={image ? image.sources[image.sources.length - 1].src : src}
      srcSet={image?.sources.map((source) => `${source.src} ${source.width}w`).join(', ')}
      sizes={image ? sizes : undefined}
      width={width ?? image?.width}
      height={height ?? image?.height}
      alt={alt}
    />
  );
};

OptimizedImage.propTypes = {
  src: PropTypes.string.isRequired,
  alt: PropTypes.string.isRequired,
  sizes: PropTypes.string,
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};
