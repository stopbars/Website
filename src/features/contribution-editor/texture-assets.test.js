import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextureEntryIndex, findTextureEntry } from './texture-assets.js';

function entry(path) {
  return { path, file: { name: path.split('/').at(-1) } };
}

test('resolves an X-Plane library selected below the simulator root', () => {
  const texture = entry('sim objects/airport/lines/hold_short.dds');
  const index = createTextureEntryIndex([texture]);

  assert.equal(
    findTextureEntry(
      index,
      'Resources/default scenery/sim objects/airport/lines/hold_short.dds'
    ),
    texture
  );
});

test('does not guess when two selected libraries contain the same shortened texture path', () => {
  const index = createTextureEntryIndex([
    entry('first/lines/hold_short.dds'),
    entry('second/lines/hold_short.dds'),
  ]);

  assert.equal(findTextureEntry(index, 'lines/hold_short.dds'), null);
});

test('uses the X-Plane DDS sibling when an art asset references its PNG source', () => {
  const texture = entry('airport/pavement/asphalt.dds');
  const index = createTextureEntryIndex([texture]);

  assert.equal(findTextureEntry(index, 'Custom Scenery/demo/airport/pavement/asphalt.png'), texture);
});
