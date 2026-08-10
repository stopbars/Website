import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Card } from '../shared/Card';
import { Toast } from '../shared/Toast';
import { Dialog } from '../shared/Dialog';
import {
  Check,
  X,
  MapPin,
  Loader,
  Search,
  Info,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
} from 'lucide-react';
import { getVatsimToken } from '../../utils/cookieUtils';
import useSearchQuery from '../../hooks/useSearchQuery';
import AirportEditorDialog from './AirportEditorDialog';
import { PageLoading } from '../shared/PageLoading';

// Status order for sorting: pending first, then approved, then rejected
const STATUS_ORDER = { pending: 0, approved: 1, rejected: 2 };

const STATUS_COLORS = {
  pending: 'text-orange-400',
  approved: 'text-emerald-400',
  rejected: 'text-red-400',
};

const AIRPORT_INFO_FIELDS = [
  ['Name', 'name'],
  ['Continent', 'continent'],
  ['Country code', 'country_code'],
  ['Country', 'country_name'],
  ['Region', 'region_name'],
];

const readErrorMessage = async (response, fallback) => {
  try {
    const body = await response.json();
    return body.error || body.message || fallback;
  } catch {
    return fallback;
  }
};

const AirportCard = ({ airport, onApprove, onInfoClick, onEdit }) => {
  const isPending = airport.status === 'pending';
  const isApproved = airport.status === 'approved';
  const [loadingAction, setLoadingAction] = useState(null);

  const handleApprove = async (approved) => {
    const action = approved ? 'approve' : 'reject';
    setLoadingAction(action);
    try {
      await onApprove(airport.division_id, airport.airport_request_id, airport.icao, approved);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl gap-4 hover:bg-zinc-800/70 transition-colors">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-white flex items-center flex-wrap gap-y-1">
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
        {isApproved && (
          <span
            className={`inline-flex items-center gap-1.5 mt-1 px-1.5 py-0.5 rounded-md text-xs ${
              airport.contributions_enabled
                ? 'text-blue-300/80 bg-blue-500/5'
                : 'text-zinc-400/80 bg-zinc-800/40'
            }`}
            title={
              airport.contributions_enabled ? 'Contributions enabled' : 'Contributions disabled'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                airport.contributions_enabled ? 'bg-blue-400/80' : 'bg-zinc-500/70'
              }`}
            ></span>
            Contributions {airport.contributions_enabled ? 'Enabled' : 'Disabled'}
          </span>
        )}
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        {isPending && (
          <>
            <button
              type="button"
              onClick={() => handleApprove(true)}
              disabled={loadingAction !== null}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-sm font-medium text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAction === 'approve' ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Approve
            </button>
            <button
              type="button"
              onClick={() => handleApprove(false)}
              disabled={loadingAction !== null}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-red-500/20 border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/30 hover:border-red-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAction === 'reject' ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <X className="w-4 h-4" />
              )}
              Reject
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onInfoClick(airport.icao)}
          className="inline-flex items-center justify-center p-2.5 rounded-lg bg-zinc-700/50 border border-zinc-600 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-500 transition-all"
          title={`View ${airport.icao} info`}
        >
          <Info className="w-4 h-4" />
        </button>
        {isApproved && (
          <button
            type="button"
            onClick={() => onEdit(airport.icao)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/15 px-3 py-2.5 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/25"
            title={`Edit ${airport.icao}`}
          >
            <Pencil className="w-4 h-4" />
            <span className="hidden md:inline">Edit</span>
          </button>
        )}
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
    contributions_enabled: PropTypes.bool,
  }).isRequired,
  onApprove: PropTypes.func.isRequired,
  onInfoClick: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
};

// oxlint-disable-next-line react-doctor/prefer-useReducer -- Independent admin filters, pagination, dialog, and request states do not share transitions.
const AirportManagement = () => {
  const [airports, setAirports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useSearchQuery();
  const [toast, setToast] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Info dialog state
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoData, setInfoData] = useState(null);
  const [infoIcao, setInfoIcao] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('create');
  const [editorAirport, setEditorAirport] = useState(null);
  const [editorLoading, setEditorLoading] = useState(false);

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
      const sortedAirports = airportsArray.toSorted((a, b) => {
        return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      });

      setAirports(sortedAirports);
    } catch (err) {
      showToast({
        title: 'Failed to load airports',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAirports();
  }, [fetchAirports]);

  const handleApprove = async (divisionId, airportId, icao, approved) => {
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
      showToast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
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

  const handleCreateClick = () => {
    setEditorMode('create');
    setEditorAirport(null);
    setEditorOpen(true);
  };

  const handleEditClick = async (icao) => {
    setEditorLoading(true);
    try {
      const response = await fetch(
        `https://v2.stopbars.com/airports?icao=${encodeURIComponent(icao)}`,
        { headers: { 'X-Vatsim-Token': token } }
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, `Failed to load ${icao}.`));
      }

      const airport = await response.json();
      setEditorAirport(airport);
      setEditorMode('edit');
      setEditorOpen(true);
    } catch (err) {
      showToast({
        title: 'Failed to open airport editor',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setEditorLoading(false);
    }
  };

  const handleSaveAirport = async (payload) => {
    if (!token) throw new Error('Authentication token not found. Please log in again.');

    const isEdit = editorMode === 'edit';
    const airportIcao = editorAirport?.icao;
    if (isEdit && !airportIcao) {
      throw new Error('Airport ICAO is missing; reload the airport and try again.');
    }

    setEditorLoading(true);
    try {
      const endpoint = isEdit
        ? `https://v2.stopbars.com/airports/${encodeURIComponent(airportIcao)}`
        : 'https://v2.stopbars.com/airports';
      const requestPayload = isEdit
        ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'icao'))
        : payload;
      const response = await fetch(endpoint, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: {
          'X-Vatsim-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            isEdit ? 'Failed to update the airport.' : 'Failed to create the airport.'
          )
        );
      }

      setEditorOpen(false);
      await fetchAirports();
      const savedIcao = isEdit ? airportIcao : payload.icao;
      showToast({
        title: isEdit ? `${savedIcao} updated` : `${savedIcao} created`,
        description: isEdit
          ? 'Airport data and its complete runway list were saved.'
          : 'Airport data and optional runways were created.',
        variant: 'success',
      });
    } finally {
      setEditorLoading(false);
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
    setCurrentPage(1);
  };

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
    <div className="staff-tool space-y-6">
      <div className="staff-tool-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Airport Management</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Review division requests and manage core airport data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleCreateClick}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/15 px-3.5 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/25"
          >
            <Plus className="h-4 w-4" />
            Create airport
          </button>
          <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 whitespace-nowrap shrink-0">
            <MapPin className="w-4 h-4 mr-2 text-zinc-400" />
            {pendingCount} pending
          </span>
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500" />
            <input
              aria-label="Search airports"
              type="text"
              value={searchTerm}
              onChange={handleSearch}
              placeholder="Search airports..."
              className="pl-9 pr-4 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 w-full sm:w-64 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          {loading ? (
            <PageLoading label="Loading airports…" variant="tool-stack" />
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
                  onInfoClick={handleInfoClick}
                  onEdit={handleEditClick}
                />
              ))}
              {totalItems > 0 && totalPages > 1 && (
                <div className="pt-2">
                  <div className="grid grid-cols-3 items-center">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={safePage === 1}
                      aria-label="Previous page"
                      className="justify-self-start flex items-center p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700/60 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-zinc-400 justify-self-center">
                      Page <span className="font-medium text-zinc-300">{safePage}</span> of{' '}
                      <span className="font-medium text-zinc-300">{totalPages}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={safePage === totalPages}
                      aria-label="Next page"
                      className="justify-self-end flex items-center p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-700/60 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
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
        title={`${infoIcao} airport details`}
        description="Reference data returned by the airport directory."
        buttons={[
          {
            label: 'Close',
            variant: 'outline',
            onClick: () => setInfoDialogOpen(false),
          },
        ]}
      >
        {infoLoading ? (
          <div className="flex min-h-40 items-center justify-center rounded-lg bg-zinc-800/35">
            <Loader className="h-5 w-5 animate-spin text-zinc-400" />
            <span className="ml-2 text-sm text-zinc-400">Loading airport details…</span>
          </div>
        ) : infoData?.error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            {infoData.error}
          </div>
        ) : infoData ? (
          <dl className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800/25">
            {AIRPORT_INFO_FIELDS.map(([label, key]) => (
              <div
                key={key}
                className="grid grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.4fr)] gap-4 border-b border-zinc-800 px-4 py-3 last:border-b-0"
              >
                <dt className="text-sm text-zinc-400">{label}</dt>
                <dd className="min-w-0 break-words text-sm font-medium text-zinc-100">
                  {infoData[key] || 'Not available'}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Dialog>

      <AirportEditorDialog
        open={editorOpen}
        mode={editorMode}
        airport={editorAirport}
        isLoading={editorLoading}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveAirport}
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
