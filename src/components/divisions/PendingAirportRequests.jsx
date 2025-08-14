import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Button } from '../shared/Button';
import { Check, X, MapPin } from 'lucide-react';
import { getVatsimToken } from '../../utils/cookieUtils';

const PendingAirportRequests = ({ onCountChange }) => {
  const [requests, setRequests] = useState([]);
  const [divisions, setDivisions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const token = getVatsimToken();

  const fetchRequests = useCallback(async () => {
    try {
      // Fetch all divisions
      const response = await fetch('https://v2.stopbars.com/divisions', {
        headers: { 'X-Vatsim-Token': token }
      });

      if (!response.ok) throw new Error('Failed to fetch divisions');
      const divisionsData = await response.json();
      
      // Create a map of division IDs to names
      const divisionMap = {};
      divisionsData.forEach(div => {
        divisionMap[div.id] = div.name;
      });
      setDivisions(divisionMap);

      // Fetch airports for each division
      const airportRequests = await Promise.all(
        divisionsData.map(async (division) => {
          const airportsResponse = await fetch(`https://v2.stopbars.com/divisions/${division.id}/airports`, {
            headers: { 'X-Vatsim-Token': token }
          });
          
          if (!airportsResponse.ok) return [];
          const airports = await airportsResponse.json();
          // Filter pending airports and add division info
          return airports
            .filter(airport => airport.status === 'pending')
            .map(airport => ({
              ...airport,
              division_id: division.id,
              division_name: division.name
            }));
        })
      );

      // Combine and flatten all pending airport requests
      const allPendingRequests = airportRequests.flat();
      setRequests(allPendingRequests);
      
      // Notify parent component of the count
      if (onCountChange) {
        onCountChange(allPendingRequests.length);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchRequests();
  }, [token]);

  const handleApprove = async (divisionId, airportId, approved) => {
    try {
      const response = await fetch(`https://v2.stopbars.com/divisions/${divisionId}/airports/${airportId}/approve`, {
        method: 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ approved })
      });

      if (!response.ok) throw new Error('Failed to update airport request');

      // Remove the approved/rejected request from the list immediately
      setRequests(prevRequests => {
        const updatedRequests = prevRequests.filter(req => req.id !== airportId);
        // Notify parent component of the updated count
        if (onCountChange) {
          onCountChange(updatedRequests.length);
        }
        return updatedRequests;
      });
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <p className="text-zinc-400">Loading requests...</p>;
  if (error) return <p className="text-red-500">{error}</p>;
  if (!requests?.length) return <p className="text-zinc-400">No pending airport requests found.</p>;

  return (
    <div className="space-y-4">
      {requests.map(request => (
        <div key={request.id} className="flex items-center justify-between p-4 border border-zinc-800 rounded-lg">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center">
              <MapPin className="w-5 h-5 mr-2 text-zinc-400" />
              {request.icao} - {divisions[request.division_id]}
            </h3>
            <p className="text-zinc-400">
              Requested by: {request.requested_by}
            </p>
            <p className="text-zinc-400 text-sm">
              {new Date(request.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handleApprove(request.division_id, request.id, true)}
              className="bg-green-600 hover:bg-green-500 hover:text-white"
            >
              <Check className="w-4 h-4 mr-2" />
              Approve
            </Button>
            <Button
              onClick={() => handleApprove(request.division_id, request.id, false)}
              className="bg-red-600 hover:bg-red-500 hover:text-white"
            >
              <X className="w-4 h-4 mr-2" />
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

PendingAirportRequests.propTypes = {
  onCountChange: PropTypes.func
};

export default PendingAirportRequests;