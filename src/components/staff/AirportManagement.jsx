import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { Toast } from '../shared/Toast';
import { Check, X, MapPin, Loader } from 'lucide-react';
import { getVatsimToken } from '../../utils/cookieUtils';

// Inlined PendingAirportRequests component
const PendingAirportRequests = ({ onCountChange, onToast }) => {
  const [requests, setRequests] = useState([]);
  const [divisions, setDivisions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingState, setLoadingState] = useState({ id: null, action: null });
  const token = getVatsimToken();

  const fetchRequests = useCallback(async () => {
    try {
      if (!token) return;
      // Fetch all divisions
      const response = await fetch('https://v2.stopbars.com/divisions', {
        headers: { 'X-Vatsim-Token': token },
      });

      if (!response.ok) throw new Error('Failed to fetch divisions');
      const divisionsData = await response.json();

      // Create a map of division IDs to names
      const divisionMap = {};
      divisionsData.forEach((div) => {
        divisionMap[div.id] = div.name;
      });
      setDivisions(divisionMap);

      // Fetch airports for each division
      const airportRequests = await Promise.all(
        divisionsData.map(async (division) => {
          const airportsResponse = await fetch(
            `https://v2.stopbars.com/divisions/${division.id}/airports`,
            {
              headers: { 'X-Vatsim-Token': token },
            }
          );

          if (!airportsResponse.ok) return [];
          const airports = await airportsResponse.json();
          // Filter pending airports and add division info
          return airports
            .filter((airport) => airport.status === 'pending')
            .map((airport) => ({
              ...airport,
              division_id: division.id,
              division_name: division.name,
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
  }, [token, onCountChange]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (divisionId, airportId, icao, approved) => {
    setLoadingState({ id: airportId, action: approved ? 'approve' : 'reject' });
    try {
      const response = await fetch(
        `https://v2.stopbars.com/divisions/${divisionId}/airports/${airportId}/approve`,
        {
          method: 'POST',
          headers: {
            'X-Vatsim-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ approved }),
        }
      );

      if (!response.ok) throw new Error('Failed to update airport request');

      // Remove the approved/rejected request from the list immediately
      setRequests((prevRequests) => {
        const updatedRequests = prevRequests.filter((req) => req.id !== airportId);
        // Notify parent component of the updated count
        if (onCountChange) {
          onCountChange(updatedRequests.length);
        }
        return updatedRequests;
      });

      // Show success toast
      if (onToast) {
        onToast({
          title: approved ? `${icao} Approved` : `${icao} Rejected`,
          description: approved
            ? `Airport ${icao} has been successfully approved.`
            : `Airport ${icao} has been rejected.`,
          variant: 'success',
        });
      }
    } catch (err) {
      setError(err.message);
      // Show error toast
      if (onToast) {
        onToast({
          title: 'Error',
          description: err.message,
          variant: 'destructive',
        });
      }
    } finally {
      setLoadingState({ id: null, action: null });
    }
  };

  if (loading)
    return (
      <div className="text-center py-8 text-zinc-400">
        <Loader className="w-12 h-12 mx-auto mb-3 opacity-50 animate-spin" />
        <p>Loading requests...</p>
      </div>
    );
  if (error)
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
        {error}
      </div>
    );
  if (!requests?.length)
    return (
      <div className="text-center py-8 text-zinc-500">
        <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No pending airport requests found.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <div
          key={request.id}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl gap-4 hover:bg-zinc-800/70 transition-colors"
        >
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <MapPin className="w-5 h-5 mr-2 text-blue-400" />
              <span className="font-mono">{request.icao}</span>
              <span className="mx-2 text-zinc-600">•</span>
              <span className="text-zinc-300 font-normal">{divisions[request.division_id]}</span>
            </h3>
            <p className="text-zinc-400 text-sm">
              Requested by: <span className="text-zinc-300">{request.requested_by}</span>
            </p>
            <p className="text-zinc-500 text-xs">{new Date(request.created_at).toLocaleString()}</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleApprove(request.division_id, request.id, request.icao, true)}
              disabled={loadingState.id === request.id}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingState.id === request.id && loadingState.action === 'approve' ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Approve
            </button>
            <button
              onClick={() => handleApprove(request.division_id, request.id, request.icao, false)}
              disabled={loadingState.id === request.id}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/30 hover:border-red-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingState.id === request.id && loadingState.action === 'reject' ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <X className="w-4 h-4" />
              )}
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

PendingAirportRequests.propTypes = {
  onCountChange: PropTypes.func,
  onToast: PropTypes.func,
};

const AirportManagement = () => {
  const [pendingCount, setPendingCount] = useState(0);
  const [toast, setToast] = useState(null);

  const showToast = (toastData) => {
    setToast({ ...toastData, show: true });
  };

  const handleToastClose = () => {
    setToast(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-xl font-semibold text-white">Airport Management</h2>
          <p className="text-sm text-zinc-400 mt-1">Review and approve airport requests</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
            <MapPin className="w-4 h-4 mr-2 text-zinc-400" />
            {pendingCount || '0'} pending request{pendingCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <PendingAirportRequests onCountChange={setPendingCount} onToast={showToast} />
        </Card>
      </div>

      {/* Toast notification */}
      {toast && (
        <Toast
          title={toast.title}
          description={toast.description}
          variant={toast.variant}
          show={toast.show}
          onClose={handleToastClose}
        />
      )}
    </div>
  );
};

export default AirportManagement;
