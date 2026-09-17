const SIMULATOR_PRESENTATION = {
  msfs: {
    label: 'MSFS',
    badgeClassName: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  msfs2020: {
    label: 'MSFS 2020',
    badgeClassName: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  msfs2024: {
    label: 'MSFS 2024',
    badgeClassName: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  xplane: {
    label: 'X-Plane',
    badgeClassName: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
};

const DEFAULT_PRESENTATION = {
  label: 'Not specified',
  badgeClassName: 'bg-zinc-700 text-zinc-300 border-zinc-600',
};

export function getSimulatorPresentation(simulator) {
  if (typeof simulator !== 'string' || !simulator.trim()) {
    return DEFAULT_PRESENTATION;
  }

  const normalizedSimulator = simulator.trim().toLowerCase();
  return (
    SIMULATOR_PRESENTATION[normalizedSimulator] ?? {
      ...DEFAULT_PRESENTATION,
      label: simulator.trim(),
    }
  );
}

export function getSimulatorLabel(simulator) {
  return getSimulatorPresentation(simulator).label;
}
