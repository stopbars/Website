import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';
import './ImageLightbox.css';

export const ImageLightbox = ({ feature, onClose }) => {
  const dialogRef = useRef(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus({ preventScroll: true });
    };
  }, []);

  const close = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) onClose();
    else setClosing(true);
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className={`feature-lightbox${closing ? ' is-closing' : ''}`}
      aria-label={feature.title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && closing) onClose();
      }}
    >
      <button
        type="button"
        className="feature-lightbox-close"
        aria-label="Close image"
        onClick={close}
      >
        <X size={22} aria-hidden="true" />
      </button>
      <img className="feature-lightbox-image" src={feature.image} alt={feature.imageAlt} />
    </dialog>,
    document.body
  );
};

ImageLightbox.propTypes = {
  feature: PropTypes.shape({
    title: PropTypes.string.isRequired,
    image: PropTypes.string.isRequired,
    imageAlt: PropTypes.string.isRequired,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};
