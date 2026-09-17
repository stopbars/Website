export const CONTRIBUTION_STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected', 'outdated'];

const searchableValue = (value) =>
  String(value ?? '')
    .trim()
    .toLocaleLowerCase();

export const filterContributionHistory = (contributions, searchTerm, status) => {
  const query = searchableValue(searchTerm);

  return contributions.filter((contribution) => {
    if (status !== 'all' && contribution.status !== status) return false;
    if (!query) return true;

    return [
      contribution.id,
      contribution.airportIcao,
      contribution.packageName,
      contribution.userDisplayName,
      contribution.userId,
      contribution.simulator,
      contribution.rejectionReason,
    ].some((value) => containsSearchTerm(value, query));
  });
};

const containsSearchTerm = (value, query) => searchableValue(value).includes(query);

export const countContributionStatuses = (contributions) => {
  const counts = {
    all: contributions.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    outdated: 0,
  };
  for (const contribution of contributions) {
    counts[contribution.status] = (counts[contribution.status] ?? 0) + 1;
  }
  return counts;
};
