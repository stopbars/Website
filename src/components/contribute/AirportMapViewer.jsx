import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import Map from '../map/Map';

const AirportMapViewer = ({ icao }) => {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [center, setCenter] = useState(null);

  useEffect(() => {
    const fetchPoints = async () => {
      try {
        // First fetch airport data
        const airportResponse = await fetch(`https://api.stopbars.com/airports?icao=${icao}`);
        if (!airportResponse.ok) throw new Error('Failed to fetch airport');
        const airportData = await airportResponse.json();
        if (airportData?.lat && airportData?.lon) {
          setCenter([airportData.lat, airportData.lon]);
        }

        // Then fetch points
        const pointsResponse = await fetch(`https://api.stopbars.com/airports/${icao}/points`);
        if (!pointsResponse.ok) throw new Error('Failed to fetch points');
        const pointsData = await pointsResponse.json();
        setPoints(pointsData.points || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (icao) {
      fetchPoints();
    }
  }, [icao]);

  if (error) return <div className="text-red-500">{error}</div>;
  if (loading) return <div className="text-zinc-400">Loading...</div>;

  return (
    <Card className="p-4">
      <div className="aspect-[16/9] bg-zinc-900 rounded-lg">
        <Map
          points={points}
          mode="view"
          center={center}
          zoom={14}
        />
      </div>
      <div className="mt-4">
        <h4 className="font-medium mb-2">Point IDs Reference</h4>
        <div className="grid grid-cols-2 gap-4">
          {points.map(point => (
            <div key={point.id} className="text-sm text-zinc-400">
              {point.name || `Point ${point.id}`}: <span className="text-emerald-400">{point.id}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

AirportMapViewer.propTypes = {
  icao: PropTypes.string.isRequired
};

export default AirportMapViewer;