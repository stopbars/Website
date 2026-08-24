import { fetchContributionPolicy } from './contributionPolicy.js';
import { deduplicateExactDivisionPoints } from './divisionPoints.js';

const airportResources = new Map();
const pointResources = new Map();
const policyResources = new Map();

function contributionKey(icao) {
  const value = String(icao ?? '')
    .trim()
    .toUpperCase();
  return /^[A-Z0-9]{4}$/.test(value) ? value : null;
}

function normalizeIcao(icao) {
  const value = contributionKey(icao);
  if (!value) throw new Error('Invalid airport ICAO format');
  return value;
}

function peek(cache, icao) {
  const key = contributionKey(icao);
  return key ? (cache.get(key)?.value ?? null) : null;
}

function load(cache, icao, request) {
  const key = normalizeIcao(icao);
  const cached = cache.get(key);
  if (cached?.value) return Promise.resolve(cached.value);
  if (cached?.promise) return cached.promise;

  const promise = request(key)
    .then((value) => {
      cache.set(key, { value });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, { promise });
  return promise;
}

export function getCachedContributionAirport(icao) {
  return peek(airportResources, icao);
}

export function loadContributionAirport(icao) {
  return load(airportResources, icao, async (key) => {
    const response = await fetch(`https://v2.stopbars.com/airports?icao=${key}`);
    if (!response.ok) throw new Error('Failed to load airport data');
    const data = await response.json();
    return {
      icao: data.icao || key,
      name: data.name,
      latitude: data.latitude,
      longitude: data.longitude,
      elevation_m: data.elevation_m,
      bbox_min_lat: data.bbox_min_lat,
      bbox_min_lon: data.bbox_min_lon,
      bbox_max_lat: data.bbox_max_lat,
      bbox_max_lon: data.bbox_max_lon,
    };
  });
}

export function getCachedContributionPoints(icao) {
  return peek(pointResources, icao);
}

export function loadContributionPoints(icao) {
  return load(pointResources, icao, async (key) => {
    const response = await fetch(`https://v2.stopbars.com/airports/${key}/points`);
    if (!response.ok) throw new Error('Failed to load airport points');
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid airport points response');
    return deduplicateExactDivisionPoints(data).map((point) => ({
      id: point.id,
      type: point.type,
      name: point.name,
      coordinates: point.coordinates,
      directionality: point.directionality,
      color: point.color || undefined,
      elevated: point.elevated,
      ihp: point.ihp,
    }));
  });
}

export function getCachedContributionPolicy(icao) {
  return peek(policyResources, icao);
}

export function loadContributionPolicy(icao) {
  return load(policyResources, icao, fetchContributionPolicy);
}

export function getCachedContributionContext(icao) {
  const airport = getCachedContributionAirport(icao);
  const points = getCachedContributionPoints(icao);
  const policy = getCachedContributionPolicy(icao);
  return airport && points && policy ? { airport, points, policy } : null;
}

export async function loadContributionContext(icao) {
  const [airport, points, policy] = await Promise.all([
    loadContributionAirport(icao),
    loadContributionPoints(icao),
    loadContributionPolicy(icao),
  ]);
  return { airport, points, policy };
}

export function clearContributionFlowDataForTests() {
  airportResources.clear();
  pointResources.clear();
  policyResources.clear();
}
