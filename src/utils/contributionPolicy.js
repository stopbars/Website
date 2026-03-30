export const fetchContributionPolicy = async (icao) => {
  const normalizedIcao = String(icao || '')
    .trim()
    .toUpperCase();

  if (!/^[A-Z0-9]{4}$/.test(normalizedIcao)) {
    throw new Error('Invalid airport ICAO format');
  }

  const response = await fetch(
    `https://v2.stopbars.com/airports/${normalizedIcao}/contribution-policy`
  );

  if (!response.ok) {
    throw new Error('Failed to load contribution policy');
  }

  const data = await response.json();
  return {
    icao: data.icao || normalizedIcao,
    managed: Boolean(data.managed),
    divisionId: data.divisionId ?? null,
    divisionName: data.divisionName ?? null,
    contributionsEnabled: Boolean(data.contributionsEnabled),
  };
};

export const getContributionDisabledMessage = (policy) => {
  const divisionName = policy?.divisionName;

  if (divisionName) {
    return `Community contributions for this airport are currently disabled by ${divisionName}.`;
  }

  return 'Community contributions for this airport are currently disabled by the owning division.';
};
