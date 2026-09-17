export async function assertUnpatchedAptSource(entries, sourceFile, icao) {
  const normalize = (path) => String(path).replaceAll('\\', '/').toLowerCase();
  const expected = normalize(sourceFile) + '.bars-removals.json';
  const marker = entries.find((entry) => normalize(entry.path) === expected);
  if (!marker) return;
  if (marker.file.size > 65536) throw new Error('The BARS scenery status file is invalid.');
  const status = JSON.parse(await marker.file.text());
  if (status.schema !== 'bars-xplane-source-status/v1' || !Array.isArray(status.airports)) {
    throw new Error('The BARS scenery status file is invalid.');
  }
  if (status.airports.some((airport) => String(airport).toUpperCase() === icao.toUpperCase())) {
    throw new Error(
      `${icao}: this scenery has active BARS removals. Turn off its removals in Pilot Client with X-Plane closed, then load the scenery again.`
    );
  }
}
