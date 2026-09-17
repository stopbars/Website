import assert from 'node:assert/strict';
import test from 'node:test';
import { getSimulatorLabel, getSimulatorPresentation } from './simulatorPresentation.js';

test('formats each supported contribution simulator for display', () => {
  assert.equal(getSimulatorLabel('msfs2024'), 'MSFS 2024');
  assert.equal(getSimulatorLabel('msfs2020'), 'MSFS 2020');
  assert.equal(getSimulatorLabel('xplane'), 'X-Plane');
});

test('gives X-Plane its own contribution badge treatment', () => {
  const xplane = getSimulatorPresentation('xplane');

  assert.match(xplane.badgeClassName, /emerald/);
  assert.doesNotMatch(xplane.badgeClassName, /purple/);
});

test('preserves an unknown simulator label without breaking the badge', () => {
  assert.deepEqual(getSimulatorPresentation('Future Sim'), {
    label: 'Future Sim',
    badgeClassName: 'bg-zinc-700 text-zinc-300 border-zinc-600',
  });
});
