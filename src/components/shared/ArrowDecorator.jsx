import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
// Extends Leaflet with L.polylineDecorator and L.Symbol
import 'leaflet-polylinedecorator';

/**
 * ArrowDecorator
 * Renders repeated arrowheads along a polyline. Drawn on a dedicated pane above overlays
 * so it always appears on top of gradient stroke segments.
 */
const ArrowDecorator = ({
  positions,
  pane = 'arrowsPane',
  offset = '6%',
  repeat = '24%',
  pixelSize = 8,
  color = '#ffffff',
  weight = 2,
  opacity = 0.9,
  minZoom = 19,
}) => {
  const map = useMap();
  const decoratorRef = useRef(null);
  const baseLineRef = useRef(null);

  useEffect(() => {
    if (!map || !Array.isArray(positions) || positions.length < 2) return;
    let paneEl = map.getPane(pane);
    if (!paneEl) {
      map.createPane(pane);
      paneEl = map.getPane(pane);
      if (paneEl) {
        paneEl.style.zIndex = 625;
        paneEl.style.pointerEvents = 'none';
      }
    }
    const baseLine = L.polyline(positions, { pane });
    baseLineRef.current = baseLine;
    const symbol = L.Symbol.arrowHead({
      pixelSize,
      headAngle: 45,
      polygon: true,
      pathOptions: {
        fill: true,
        fillColor: color,
        fillOpacity: opacity,
        stroke: false,
        color,
        weight,
        opacity,
      },
    });
    const decorator = L.polylineDecorator(baseLine, {
      patterns: [
        {
          offset,
          repeat,
          symbol,
        },
      ],
      pane,
    });

    const ensureVisibility = () => {
      const show = map.getZoom() >= minZoom;
      const isOnMap = decoratorRef.current && map.hasLayer(decoratorRef.current);
      if (show && !isOnMap) {
        decorator.addTo(map);
      } else if (!show && isOnMap) {
        decorator.remove();
      }
    };

    decoratorRef.current = decorator;
    ensureVisibility();
    map.on('zoomend', ensureVisibility);

    return () => {
      map.off('zoomend', ensureVisibility);
      if (decoratorRef.current) {
        try {
          decoratorRef.current.remove();
        } catch {
          /* ignore */
        }
        decoratorRef.current = null;
      }
      if (baseLineRef.current) {
        try {
          baseLineRef.current.remove();
        } catch {
          /* ignore */
        }
        baseLineRef.current = null;
      }
    };
  }, [map, pane, offset, repeat, pixelSize, color, weight, opacity, positions, minZoom]);

  return null;
};

ArrowDecorator.propTypes = {
  positions: PropTypes.arrayOf(PropTypes.array).isRequired,
  pane: PropTypes.string,
  offset: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  repeat: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  pixelSize: PropTypes.number,
  color: PropTypes.string,
  weight: PropTypes.number,
  opacity: PropTypes.number,
  minZoom: PropTypes.number,
};

export default ArrowDecorator;
