import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { Toast } from '../shared/Toast';
import { Dialog } from '../shared/Dialog';
import { Check, X, MapPin, Loader, Search, Info, ChevronLeft, ChevronRight } from 'lucide-react';
import { getVatsimToken } from '../../utils/cookieUtils';
import useSearchQuery from '../../hooks/useSearchQuery';

// Status order for sorting: pending first, then approved, then rejected
const STATUS_ORDER = { pending: 0, approved: 1, rejected: 2 };

const STATUS_COLORS = {
  pending: 'text-orange-400',
  approved: 'text-emerald-400',
  rejected: 'text-red-400',
};

const AirportCard = ({ airport, onApprove, loadingState, onInfoClick }) => {
  const isPending = airport.status === 'pending';
  const isApproved = airport.status === 'approved';

  const handleApprove = async (approved) => {
    onApprove(airport.division_id, airport.airport_request_id, airport.icao, approved);
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl gap-4 hover:bg-zinc-800/70 transition-colors">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <MapPin className={`w-5 h-5 mr-2 ${STATUS_COLORS[airport.status]}`} />
          <span>{airport.icao}</span>
          <span className="mx-2 text-zinc-600">•</span>
          <span className="text-zinc-300 font-normal">{airport.division_name}</span>
          {!isPending && (
            <>
              <span className="mx-2 text-zinc-600">•</span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  isApproved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}
              >
                {airport.status.charAt(0).toUpperCase() + airport.status.slice(1)}
              </span>
            </>
          )}
        </h3>
        <p className="text-zinc-400 text-sm">
          {isApproved ? 'Approved by: ' : 'Requested by: '}
          <span className="text-zinc-300">
            {isApproved ? airport.approved_by : airport.requested_by}
          </span>
        </p>
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        {isPending && (
          <>
            <button
              onClick={() => handleApprove(true)}
              disabled={loadingState.id === airport.airport_request_id}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingState.id === airport.airport_request_id &&
              loadingState.action === 'approve' ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Approve
            </button>
            <button
              onClick={() => handleApprove(false)}
              disabled={loadingState.id === airport.airport_request_id}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/30 hover:border-red-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingState.id === airport.airport_request_id &&
              loadingState.action === 'reject' ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <X className="w-4 h-4" />
              )}
              Reject
            </button>
          </>
        )}
        <button
          onClick={() => onInfoClick(airport.icao)}
          className="inline-flex items-center justify-center p-2.5 rounded-lg bg-zinc-700/50 border border-zinc-600 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-500 transition-all"
          title={`View ${airport.icao} info`}
        >
          <Info className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

AirportCard.propTypes = {
  airport: PropTypes.shape({
    airport_request_id: PropTypes.number.isRequired,
    icao: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    division_id: PropTypes.number.isRequired,
    division_name: PropTypes.string.isRequired,
    requested_by: PropTypes.string,
    approved_by: PropTypes.string,
  }).isRequired,
  onApprove: PropTypes.func.isRequired,
  loadingState: PropTypes.shape({
    id: PropTypes.number,
    action: PropTypes.string,
  }).isRequired,
  onInfoClick: PropTypes.func.isRequired,
};

const AirportManagement = () => {
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingState, setLoadingState] = useState({ id: null, action: null });
  const [searchTerm, setSearchTerm] = useSearchQuery();
  const [toast, setToast] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Info dialog state
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoData, setInfoData] = useState(null);
  const [infoIcao, setInfoIcao] = useState('');

  const token = getVatsimToken();

  const fetchAirports = useCallback(async () => {
    try {
      if (!token) return;
      setLoading(true);

      const response = await fetch('https://v2.stopbars.com/staff/divisions/airports', {
        headers: { 'X-Vatsim-Token': token },
      });

      if (!response.ok) throw new Error('Failed to fetch division airports');
      const data = await response.json();

      const airportsArray = Array.isArray(data) ? data : data.airports || data.data || [];

      // Sort by status: pending first, then approved, then rejected
      const sortedAirports = [...airportsArray].sort((a, b) => {
        return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      });

      setAirports(sortedAirports);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAirports();
  }, [fetchAirports]);

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

      // Refetch airports to get updated data
      await fetchAirports();

      // Show success toast
      showToast({
        title: approved ? `${icao} Approved` : `${icao} Rejected`,
        description: approved
          ? `Airport ${icao} has been successfully approved.`
          : `Airport ${icao} has been rejected.`,
        variant: 'success',
      });
    } catch (err) {
      setError(err.message);
      showToast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingState({ id: null, action: null });
    }
  };

  const handleInfoClick = async (icao) => {
    setInfoIcao(icao);
    setInfoDialogOpen(true);
    setInfoLoading(true);
    setInfoData(null);

    try {
      const response = await fetch(`https://v2.stopbars.com/airports?icao=${icao}`);
      if (!response.ok) throw new Error('Failed to fetch airport info');
      const data = await response.json();
      setInfoData(data);
    } catch (err) {
      setInfoData({ error: err.message });
    } finally {
      setInfoLoading(false);
    }
  };

  const showToast = (toastData) => {
    setToast({ ...toastData, show: true });
  };

  const handleToastClose = () => {
    setToast(null);
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Filter airports based on search term
  const filteredAirports = airports.filter((airport) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      airport.icao.toLowerCase().includes(search) ||
      (airport.division_name && airport.division_name.toLowerCase().includes(search)) ||
      (airport.division_id && String(airport.division_id).includes(search)) ||
      (airport.requested_by && airport.requested_by.toLowerCase().includes(search)) ||
      (airport.approved_by && airport.approved_by.toLowerCase().includes(search)) ||
      (airport.status && airport.status.toLowerCase().includes(search))
    );
  });

  const ITEMS_PER_PAGE = 10;
  const totalItems = filteredAirports.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedAirports = filteredAirports.slice(startIndex, endIndex);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Count pending airports
  const pendingCount = airports.filter((a) => a.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-xl font-semibold text-white">Airport Management</h2>
          <p className="text-sm text-zinc-400 mt-1">Manage and review division airports </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
            <MapPin className="w-4 h-4 mr-2 text-zinc-400" />
            {pendingCount} pending
          </span>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearch}
              placeholder="Search airports..."
              className="pl-9 pr-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 w-64 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          {loading ? (
            <div className="text-center py-8 text-zinc-400">
              <Loader className="w-12 h-12 mx-auto mb-3 opacity-50 animate-spin" />
              <p>Loading airports...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              {error}
            </div>
          ) : !filteredAirports?.length ? (
            <div className="text-center py-8 text-zinc-500">
              <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{searchTerm ? 'No airports match your search.' : 'No airport requests found.'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedAirports.map((airport) => (
                <AirportCard
                  key={airport.airport_request_id}
                  airport={airport}
                  onApprove={handleApprove}
                  loadingState={loadingState}
                  onInfoClick={handleInfoClick}
                />
              ))}
              {totalItems > 0 && totalPages > 1 && (
                <div className="pt-2">
                  <div className="grid grid-cols-3 items-center">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={safePage === 1}
                      className="justify-self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700/60 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>
                    <span className="text-sm text-zinc-400 justify-self-center">
                      Page <span className="font-medium text-zinc-300">{safePage}</span> of{' '}
                      <span className="font-medium text-zinc-300">{totalPages}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={safePage === totalPages}
                      className="justify-self-end flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700/60 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Airport Info Dialog */}
      <Dialog
        open={infoDialogOpen}
        onClose={() => setInfoDialogOpen(false)}
        icon={MapPin}
        iconColor="blue"
        title={`${infoIcao} Info`}
        description={
          infoLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : infoData?.error ? (
            <div className="text-red-400">{infoData.error}</div>
          ) : infoData ? (
            <div className="space-y-3 text-left">
              <div className="flex justify-between">
                <span className="text-zinc-400">Name:</span>
                <span className="text-white">{infoData.name || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Continent:</span>
                <span className="text-white">{infoData.continent || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Country Code:</span>
                <span className="text-white">{infoData.country_code || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Country Name:</span>
                <span className="text-white">{infoData.country_name || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Region:</span>
                <span className="text-white">{infoData.region_name || 'N/A'}</span>
              </div>
            </div>
          ) : null
        }
        buttons={[
          {
            label: 'Close',
            variant: 'outline',
            onClick: () => setInfoDialogOpen(false),
          },
        ]}
      />

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
