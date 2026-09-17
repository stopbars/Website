import PropTypes from 'prop-types';

const POINT_COLORS = {
  lead_on: '#fbbf24',
  stopbar: '#ef4444',
  stand: 'rgb(255, 141, 35)',
};

const TAXIWAY_COLORS = {
  green: '#00FF00',
  'green-yellow': '#FFD700',
  'green-blue': '#0000FF',
  'green-orange': '#FFA500',
};

const TAXIWAY_QUARTER_PREFIX = {
  'green-yellow': 'taxiway-yellow',
  'green-blue': 'taxiway-blue',
  'green-orange': 'taxiway-orange',
};

function MarkerCircle({ className = '', quarters = [], style }) {
  return (
    <div className="marker-container">
      <div className={`marker-circle ${className}`.trim()} style={style}>
        {quarters.map((quarterClass) => (
          <div key={quarterClass} className={`marker-quarter ${quarterClass}`} />
        ))}
      </div>
    </div>
  );
}

MarkerCircle.propTypes = {
  className: PropTypes.string,
  quarters: PropTypes.arrayOf(PropTypes.string),
  style: PropTypes.object,
};

function directionalQuarterClasses(prefix, orientation) {
  if (orientation === 'left') {
    return [
      `${prefix}-quarter-1`,
      `${prefix}-quarter-2`,
      `${prefix}-quarter-3`,
      'taxiway-quarter-L',
    ];
  }
  return ['taxiway-quarter-R', `${prefix}-quarter-2`, `${prefix}-quarter-3`, `${prefix}-quarter-4`];
}

function TaxiwayMarker({ point }) {
  const orientation = point.orientation || 'left';
  if (point.directionality === 'bi-directional') {
    if (point.color === 'green') {
      return <MarkerCircle className="lead-on-marker taxiway-green" />;
    }
    const prefix = TAXIWAY_QUARTER_PREFIX[point.color];
    if (prefix) {
      return (
        <MarkerCircle
          className="lead-on-marker"
          quarters={[1, 2, 3, 4].map((quarter) => `${prefix}-quarter-${quarter}`)}
        />
      );
    }
  }

  if (point.directionality === 'uni-directional') {
    if (point.color === 'green') {
      return (
        <MarkerCircle
          className={`taxiway-green ${orientation}`}
          quarters={[orientation === 'left' ? 'taxiway-quarter-L' : 'taxiway-quarter-R']}
        />
      );
    }
    const prefix = TAXIWAY_QUARTER_PREFIX[point.color];
    if (prefix) {
      return (
        <MarkerCircle
          className={orientation}
          quarters={directionalQuarterClasses(prefix, orientation)}
        />
      );
    }
  }

  return <MarkerCircle style={{ backgroundColor: TAXIWAY_COLORS[point.color] ?? '#00FF00' }} />;
}

TaxiwayMarker.propTypes = {
  point: PropTypes.shape({
    color: PropTypes.string,
    directionality: PropTypes.string,
    orientation: PropTypes.string,
  }).isRequired,
};

export function PointMarkerIcon({ point }) {
  const orientation = point.orientation || 'left';
  switch (point.type) {
    case 'stopbar':
      return (
        <MarkerCircle
          className={`stopbar-marker ${orientation}`}
          quarters={
            point.directionality === 'uni-directional'
              ? [orientation === 'left' ? 'marker-quarter-4' : 'marker-quarter-1']
              : []
          }
        />
      );
    case 'lead_on':
      return (
        <MarkerCircle
          className="lead-on-marker"
          quarters={[1, 2, 3, 4].map((quarter) => `marker-quarter-${quarter}`)}
        />
      );
    case 'taxiway':
      return <TaxiwayMarker point={point} />;
    default:
      return <MarkerCircle style={{ backgroundColor: POINT_COLORS[point.type] ?? '#ef4444' }} />;
  }
}

PointMarkerIcon.propTypes = {
  point: PropTypes.shape({
    id: PropTypes.string,
    type: PropTypes.string.isRequired,
    directionality: PropTypes.string,
    color: PropTypes.string,
    orientation: PropTypes.string,
  }).isRequired,
};
