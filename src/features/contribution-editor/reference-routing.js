import { distanceMeters, nearestPointOnLine } from './editor-geometry.js';
import { referenceMatchFromProjections } from './editor-snapping.js';

export function routeReferenceLines(features, startFeature, start, endFeature, end) {
  const category = startFeature.properties?.snapCategory;
  if (category !== endFeature.properties?.snapCategory) return null;
  const nodes = new Map();
  const key = coordinate => coordinate.map(value => value.toFixed(7)).join(':');
  const add = (from, to, feature) => {
    const fromKey = key(from.coordinate);
    const toKey = key(to.coordinate);
    if (fromKey === toKey) return;
    const edges = nodes.get(fromKey) ?? [];
    edges.push({ to: toKey, from, end: to, feature, length: Math.abs(to.alongMeters - from.alongMeters) });
    nodes.set(fromKey, edges);
  };
  for (const feature of features) {
    if (feature.geometry?.type !== 'LineString' || feature.properties?.snapCategory !== category) continue;
    const semantic = feature.properties?.semanticType;
    const startSemantic = startFeature.properties?.semanticType;
    if (semantic !== startSemantic && ![semantic, startSemantic].every(type => ['taxi-centerline', 'lead-on'].includes(type))) continue;
    let alongMeters = 0;
    const points = feature.geometry.coordinates.map((coordinate, index, coordinates) => {
      if (index) alongMeters += distanceMeters(coordinates[index - 1], coordinate);
      return { coordinate, alongMeters };
    });
    const id = String(feature.properties?.sourceId ?? feature.id);
    if (id === String(startFeature.properties?.sourceId ?? startFeature.id)) points.push(start);
    if (id === String(endFeature.properties?.sourceId ?? endFeature.id)) points.push(end);
    points.sort((a, b) => a.alongMeters - b.alongMeters);
    for (let index = 1; index < points.length; index++) {
      add(points[index - 1], points[index], feature);
      add(points[index], points[index - 1], feature);
    }
  }
  const target = key(end.coordinate);
  const first = key(start.coordinate);
  const pending = [{ node: first, distance: 0 }];
  const distances = new Map([[first, 0]]);
  const previous = new Map();
  while (pending.length) {
    pending.sort((a, b) => b.distance - a.distance);
    const current = pending.pop();
    if (current.distance !== distances.get(current.node)) continue;
    if (current.node === target) break;
    for (const edge of nodes.get(current.node) ?? []) {
      const distance = current.distance + edge.length;
      if (distance >= (distances.get(edge.to) ?? Infinity)) continue;
      distances.set(edge.to, distance);
      previous.set(edge.to, { node: current.node, edge });
      pending.push({ node: edge.to, distance });
    }
  }
  if (!previous.has(target)) return null;
  const edges = [];
  for (let node = target; node !== first;) {
    const step = previous.get(node);
    edges.push(step.edge);
    node = step.node;
  }
  edges.reverse();
  const bindings = edges.map(edge => referenceMatchFromProjections(edge.feature, edge.from, edge.end).binding);
  return { coordinates: [edges[0].from.coordinate, ...edges.map(edge => edge.end.coordinate)], bindings };
}

export function routeDrawCoordinates(coordinates, features, tolerance = 1.5) {
  const points = coordinates.map(coordinate => {
    let best = null;
    for (const feature of features) {
      if (feature.geometry?.type !== 'LineString' || feature.properties?.snapCategory !== 'light-rows') continue;
      const projection = nearestPointOnLine(coordinate, feature.geometry.coordinates);
      if (projection?.distanceMeters <= tolerance && (!best || projection.distanceMeters < best.projection.distanceMeters)) {
        best = { feature, projection };
      }
    }
    return best;
  });
  if (points.some(point => !point)) return null;
  const routed = [];
  const bindings = [];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const route = routeReferenceLines(features, from.feature, from.projection, to.feature, to.projection);
    if (!route) return null;
    routed.push(...(index === 1 ? route.coordinates : route.coordinates.slice(1)));
    bindings.push(...route.bindings);
  }
  return { coordinates: routed, bindings };
}
