/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Opening or switching the selected airport intentionally resets the editable form draft. */

import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Check, ClipboardPaste, Loader, MapPin, Plus, Save, Trash2 } from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { parseCoordinatePair } from '../../utils/coordinateParsing';

const AIRPORT_FIELDS = [
  { key: 'icao', label: 'ICAO', type: 'text', placeholder: 'YXYZ', maxLength: 4 },
  { key: 'name', label: 'Airport name', type: 'text', placeholder: 'New Airport' },
  { key: 'latitude', label: 'Latitude', type: 'number', placeholder: '-31.25', step: 'any' },
  { key: 'longitude', label: 'Longitude', type: 'number', placeholder: '115.75', step: 'any' },
  {
    key: 'continent',
    label: 'Continent',
    type: 'select',
    options: [
      { value: 'AF', label: 'Africa (AF)' },
      { value: 'AN', label: 'Antarctica (AN)' },
      { value: 'AS', label: 'Asia (AS)' },
      { value: 'EU', label: 'Europe (EU)' },
      { value: 'NA', label: 'North America (NA)' },
      { value: 'OC', label: 'Oceania (OC)' },
      { value: 'SA', label: 'South America (SA)' },
    ],
  },
  {
    key: 'country_code',
    label: 'Country code',
    type: 'text',
    placeholder: 'AU',
    maxLength: 2,
  },
  {
    key: 'country_name',
    label: 'Country name',
    type: 'text',
    placeholder: 'Australia',
    optional: true,
  },
  {
    key: 'region_name',
    label: 'Region name',
    type: 'text',
    placeholder: 'Western Australia',
    optional: true,
  },
  {
    key: 'elevation_ft',
    label: 'Elevation (ft)',
    type: 'number',
    placeholder: '100',
    step: 'any',
  },
];

const RUNWAY_FIELDS = [
  { key: 'length_ft', label: 'Length (ft)', type: 'number', step: 'any' },
  { key: 'width_ft', label: 'Width (ft)', type: 'number', step: 'any' },
  { key: 'le_ident', label: 'Low-end ident', type: 'text', placeholder: '09' },
  {
    key: 'le_latitude_deg',
    label: 'Low-end latitude',
    type: 'number',
    step: 'any',
  },
  {
    key: 'le_longitude_deg',
    label: 'Low-end longitude',
    type: 'number',
    step: 'any',
  },
  { key: 'he_ident', label: 'High-end ident', type: 'text', placeholder: '27' },
  {
    key: 'he_latitude_deg',
    label: 'High-end latitude',
    type: 'number',
    step: 'any',
  },
  {
    key: 'he_longitude_deg',
    label: 'High-end longitude',
    type: 'number',
    step: 'any',
  },
];

const EMPTY_AIRPORT = {
  icao: '',
  latitude: '',
  longitude: '',
  name: '',
  continent: '',
  country_code: '',
  country_name: '',
  region_name: '',
  elevation_ft: '',
  runways: [],
};

let nextRunwayKey = 0;

const newRunway = (runway = {}) => ({
  _key: `runway-${nextRunwayKey++}`,
  length_ft: runway.length_ft ?? '',
  width_ft: runway.width_ft ?? '',
  le_ident: runway.le_ident ?? '',
  le_latitude_deg: runway.le_latitude_deg ?? '',
  le_longitude_deg: runway.le_longitude_deg ?? '',
  he_ident: runway.he_ident ?? '',
  he_latitude_deg: runway.he_latitude_deg ?? '',
  he_longitude_deg: runway.he_longitude_deg ?? '',
});

const airportToForm = (airport) => ({
  ...EMPTY_AIRPORT,
  ...Object.fromEntries(
    AIRPORT_FIELDS.map(({ key }) => [key, airport?.[key] === null ? '' : (airport?.[key] ?? '')])
  ),
  runways: (airport?.runways ?? []).map(newRunway),
});

const numericField = (value, label, minimum, maximum) => {
  if (value === '') throw new Error(`${label} is required.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a valid number.`);
  if (minimum !== undefined && number < minimum) {
    throw new Error(`${label} must be at least ${minimum}.`);
  }
  if (maximum !== undefined && number > maximum) {
    throw new Error(`${label} must be no more than ${maximum}.`);
  }
  return number;
};

const CoordinatePasteInput = ({ label, onCoordinates }) => {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState(null);

  const handleChange = (event) => {
    const nextValue = event.target.value;
    setValue(nextValue);
    setStatus(null);

    const coordinates = parseCoordinatePair(nextValue);
    if (!coordinates) return;

    onCoordinates(coordinates);
    setStatus(
      `Converted to ${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`
    );
  };

  return (
    <div className="rounded-lg border border-dashed border-blue-500/30 bg-blue-500/5 p-3">
      <label>
        <span className="mb-2 flex items-center gap-2 text-xs font-medium text-blue-200">
          <ClipboardPaste className="h-3.5 w-3.5" />
          {label}
        </span>
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={`Paste 33°53'30.6"S 150°41'44.7"E`}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      </label>
      {status ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-300">
          <Check className="h-3.5 w-3.5" />
          {status}
        </p>
      ) : (
        <p className="mt-2 text-xs text-zinc-500">
          DMS or decimal latitude/longitude pairs are supported.
        </p>
      )}
    </div>
  );
};

CoordinatePasteInput.propTypes = {
  label: PropTypes.string.isRequired,
  onCoordinates: PropTypes.func.isRequired,
};

const buildAirportPayload = (form) => {
  const icao = form.icao.trim().toUpperCase();
  const name = form.name.trim();
  const continent = form.continent.trim().toUpperCase();
  const countryCode = form.country_code.trim().toUpperCase();
  const countryName = form.country_name.trim();
  const regionName = form.region_name.trim();

  if (!/^[A-Z0-9]{4}$/.test(icao)) {
    throw new Error('ICAO must contain exactly four letters or numbers.');
  }
  if (!name) throw new Error('Airport name is required.');
  if (!/^[A-Z]{2}$/.test(continent)) {
    throw new Error('Continent must be a two-letter code.');
  }
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error('Country code must be a two-letter code.');
  }

  const runways = form.runways.map((runway, index) => {
    const runwayNumber = index + 1;
    const leIdent = runway.le_ident.trim().toUpperCase();
    const heIdent = runway.he_ident.trim().toUpperCase();
    if (!leIdent || !heIdent) {
      throw new Error(`Runway ${runwayNumber} requires both endpoint identifiers.`);
    }

    return {
      length_ft: numericField(runway.length_ft, `Runway ${runwayNumber} length`, 1),
      width_ft: numericField(runway.width_ft, `Runway ${runwayNumber} width`, 1),
      le_ident: leIdent,
      le_latitude_deg: numericField(
        runway.le_latitude_deg,
        `Runway ${runwayNumber} low-end latitude`,
        -90,
        90
      ),
      le_longitude_deg: numericField(
        runway.le_longitude_deg,
        `Runway ${runwayNumber} low-end longitude`,
        -180,
        180
      ),
      he_ident: heIdent,
      he_latitude_deg: numericField(
        runway.he_latitude_deg,
        `Runway ${runwayNumber} high-end latitude`,
        -90,
        90
      ),
      he_longitude_deg: numericField(
        runway.he_longitude_deg,
        `Runway ${runwayNumber} high-end longitude`,
        -180,
        180
      ),
    };
  });

  return {
    icao,
    latitude: numericField(form.latitude, 'Latitude', -90, 90),
    longitude: numericField(form.longitude, 'Longitude', -180, 180),
    name,
    continent,
    country_code: countryCode,
    ...(countryName ? { country_name: countryName } : {}),
    ...(regionName ? { region_name: regionName } : {}),
    elevation_ft: numericField(form.elevation_ft, 'Elevation'),
    runways,
  };
};

const AirportEditorDialog = ({ open, mode, airport, isLoading, onClose, onSave }) => {
  const [form, setForm] = useState(() => airportToForm(airport));
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(airportToForm(airport));
      setValidationError('');
    }
  }, [airport, open]);

  const updateAirportField = (key, value) => {
    const normalizedValue = ['icao', 'continent', 'country_code'].includes(key)
      ? value.toUpperCase()
      : value;
    setForm((current) => ({ ...current, [key]: normalizedValue }));
  };

  const updateRunwayField = (runwayKey, field, value) => {
    setForm((current) => ({
      ...current,
      runways: current.runways.map((runway) =>
        runway._key === runwayKey
          ? {
              ...runway,
              [field]: ['le_ident', 'he_ident'].includes(field) ? value.toUpperCase() : value,
            }
          : runway
      ),
    }));
  };

  const removeRunway = (runwayKey) => {
    setForm((current) => ({
      ...current,
      runways: current.runways.filter((runway) => runway._key !== runwayKey),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setValidationError('');
    try {
      await onSave(buildAirportPayload(form));
    } catch (error) {
      setValidationError(error.message || 'Unable to save the airport.');
    }
  };

  const isEdit = mode === 'edit';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      icon={MapPin}
      iconColor="blue"
      title={isEdit ? `Edit ${airport?.icao ?? 'airport'}` : 'Create airport'}
      description={
        isEdit
          ? 'Saving replaces the complete runway list with the rows shown below.'
          : 'Create the airport and any optional runways in one request.'
      }
      isLoading={isLoading}
      closeOnBackdrop={!isLoading}
      closeOnEscape={!isLoading}
      maxWidth="2xl"
    >
      <form className="space-y-6" onSubmit={handleSubmit}>
        <fieldset disabled={isLoading} className="space-y-6 disabled:opacity-70">
          <CoordinatePasteInput
            label="Paste airport coordinates"
            onCoordinates={({ latitude, longitude }) =>
              setForm((current) => ({
                ...current,
                latitude: String(latitude),
                longitude: String(longitude),
              }))
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {AIRPORT_FIELDS.map((field) => (
              <label key={field.key} className={field.key === 'name' ? 'sm:col-span-2' : ''}>
                <span className="mb-2 block text-sm font-medium text-zinc-300">{field.label}</span>
                {field.type === 'select' ? (
                  <select
                    value={form[field.key]}
                    onChange={(event) => updateAirportField(field.key, event.target.value)}
                    required
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="" disabled>
                      Select a continent
                    </option>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={form[field.key]}
                    onChange={(event) => updateAirportField(field.key, event.target.value)}
                    placeholder={field.placeholder}
                    maxLength={field.maxLength}
                    step={field.step}
                    required={!field.optional}
                    disabled={isEdit && field.key === 'icao'}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                )}
              </label>
            ))}
          </div>

          <section className="space-y-4" aria-labelledby="runways-heading">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 id="runways-heading" className="font-semibold text-white">
                  Runways
                </h4>
                <p className="mt-1 text-sm text-zinc-400">
                  Optional when creating. Saving an empty list removes all runways when editing.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    runways: [...current.runways, newRunway()],
                  }))
                }
                className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/15 px-3.5 py-2 text-sm font-medium text-blue-300 transition-colors hover:bg-blue-500/25"
              >
                <Plus className="h-4 w-4" />
                Add runway
              </button>
            </div>

            {form.runways.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-800/25 px-4 py-6 text-center text-sm text-zinc-500">
                No runways included.
              </div>
            ) : (
              <div className="space-y-4">
                {form.runways.map((runway, index) => (
                  <fieldset
                    key={runway._key}
                    className="rounded-xl border border-zinc-700 bg-zinc-800/30 p-4"
                  >
                    <legend className="sr-only">Runway {index + 1}</legend>
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-sm font-semibold text-zinc-200">
                        Runway {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeRunway(runway._key)}
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                        aria-label={`Remove runway ${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mb-4 grid gap-3 sm:grid-cols-2">
                      <CoordinatePasteInput
                        label="Paste low-end coordinates"
                        onCoordinates={({ latitude, longitude }) =>
                          setForm((current) => ({
                            ...current,
                            runways: current.runways.map((currentRunway) =>
                              currentRunway._key === runway._key
                                ? {
                                    ...currentRunway,
                                    le_latitude_deg: String(latitude),
                                    le_longitude_deg: String(longitude),
                                  }
                                : currentRunway
                            ),
                          }))
                        }
                      />
                      <CoordinatePasteInput
                        label="Paste high-end coordinates"
                        onCoordinates={({ latitude, longitude }) =>
                          setForm((current) => ({
                            ...current,
                            runways: current.runways.map((currentRunway) =>
                              currentRunway._key === runway._key
                                ? {
                                    ...currentRunway,
                                    he_latitude_deg: String(latitude),
                                    he_longitude_deg: String(longitude),
                                  }
                                : currentRunway
                            ),
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {RUNWAY_FIELDS.map((field) => (
                        <label key={field.key}>
                          <span className="mb-2 block text-xs font-medium text-zinc-400">
                            {field.label}
                          </span>
                          <input
                            type={field.type}
                            value={runway[field.key]}
                            onChange={(event) =>
                              updateRunwayField(runway._key, field.key, event.target.value)
                            }
                            placeholder={field.placeholder}
                            step={field.step}
                            required
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          />
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
          </section>
        </fieldset>

        {validationError && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {validationError}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-800 pt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <Loader className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isLoading ? 'Saving…' : isEdit ? 'Save changes' : 'Create airport'}
          </button>
        </div>
      </form>
    </Dialog>
  );
};

AirportEditorDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(['create', 'edit']).isRequired,
  airport: PropTypes.object,
  isLoading: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

export default AirportEditorDialog;
