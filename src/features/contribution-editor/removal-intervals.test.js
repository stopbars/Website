import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMsfsSelectionEdit,
  applyXPlaneSelectorEdit,
  editableMsfsRemovalGroup,
  previewMsfsRemovalEdit,
} from './removal-intervals.js';

test('a routed removal edit gathers every selected row and shared polygon in one group', () => {
  const document = { objects: [], removals: [
    { id: 'a-shared', origin: 'msfs-auto', sourceIds: ['a', 'sibling'], selections: [{ sourceId: 'a' }, { sourceId: 'sibling' }] },
    { id: 'c-manual', origin: 'msfs-manual', sourceIds: ['c'], selections: [{ sourceId: 'c', rangeStartMeters: 2, rangeEndMeters: 8 }] },
    { id: 'unrelated', origin: 'msfs-auto', sourceIds: ['other'], selections: [{ sourceId: 'other' }] },
  ] };
  const group = editableMsfsRemovalGroup(document, ['a', 'b', 'c'], ['a', 'b', 'c', 'sibling', 'other']);
  assert.deepEqual(new Set(group.sourceIds), new Set(['a', 'b', 'c', 'sibling']));
  assert.deepEqual(new Set(group.removalIds), new Set(['a-shared', 'c-manual']));
  let selections = group.selections;
  let keepSelections = group.keepSelections;
  for (const sourceId of ['a', 'b', 'c']) {
    const selection = { sourceId, rangeStartMeters: 0, rangeEndMeters: 10 };
    selections = applyMsfsSelectionEdit(selections, selection, 'erase', 10);
    keepSelections = applyMsfsSelectionEdit(keepSelections, selection, 'add', 10);
  }
  assert.deepEqual(selections, [{ sourceId: 'sibling' }]);
  assert.deepEqual(keepSelections, [{ sourceId: 'a' }, { sourceId: 'b' }, { sourceId: 'c' }]);
});

test('adding manual removal preserves automatic geometry and does not inherit its selection', () => {
  const automatic = { id: 'auto', origin: 'msfs-auto', sourceIds: ['a'], selections: [{ sourceId: 'a' }], coordinates: [[0, 0]] };
  const manual = { id: 'manual', origin: 'msfs-manual', sourceIds: ['a'], selections: [{ sourceId: 'a', rangeStartMeters: 2, rangeEndMeters: 4 }] };
  const document = { objects: [{ sourceBindings: [{ sourceId: 'a', rangeStartMeters: 0, rangeEndMeters: 100 }] }], removals: [automatic, manual] };
  for (const removals of [[automatic], [automatic, manual]]) {
    const current = { ...document, removals };
    const group = editableMsfsRemovalGroup(current, 'a', ['a'], [], true);
    assert.deepEqual(group.removalIds, removals.includes(manual) ? ['manual'] : []);
    assert.deepEqual(group.selections, removals.includes(manual) ? manual.selections : []);
    const next = applyMsfsSelectionEdit(group.selections, { sourceId: 'a', rangeStartMeters: 10, rangeEndMeters: 20 }, 'add', 100);
    const preview = previewMsfsRemovalEdit(current, group, next);
    assert.equal(preview.removals[0], automatic);
    assert.equal(preview.removals.length, 2);
  }
});

test('MSFS removal previews replace stale geometry and expose the new selection immediately', () => {
  const unrelated = {
    id: 'unrelated',
    origin: 'msfs-source',
    sourceIds: ['row-b'],
    coordinates: [],
  };
  const document = {
    removals: [
      {
        id: 'old-row-a',
        origin: 'msfs-source',
        sourceIds: ['row-a'],
        coordinates: [[0, 0]],
      },
      unrelated,
    ],
  };
  const preview = previewMsfsRemovalEdit(
    document,
    { sourceIds: ['row-a'], removalIds: ['old-row-a'] },
    [{ sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 }]
  );

  assert.equal(preview.removals[0], unrelated);
  assert.deepEqual(preview.removals[1].selections, [
    { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
  ]);
  assert.equal(preview.removals[1].origin, 'msfs-manual');
});

test('adding separate MSFS sections keeps the gap between them', () => {
  let selections = applyMsfsSelectionEdit(
    [],
    { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
    'add',
    100
  );
  selections = applyMsfsSelectionEdit(
    selections,
    { sourceId: 'row-a', rangeStartMeters: 40, rangeEndMeters: 50 },
    'add',
    100
  );

  assert.deepEqual(selections, [
    { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
    { sourceId: 'row-a', rangeStartMeters: 40, rangeEndMeters: 50 },
  ]);
});

test('adding MSFS sections fills a forgotten gap of one metre or less', () => {
  let selections = applyMsfsSelectionEdit(
    [],
    { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
    'add',
    100
  );
  selections = applyMsfsSelectionEdit(
    selections,
    { sourceId: 'row-a', rangeStartMeters: 21, rangeEndMeters: 30 },
    'add',
    100
  );

  assert.deepEqual(selections, [
    { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 30 },
  ]);
});

test('an explicitly erased sub-metre MSFS gap stays preserved', () => {
  const selections = applyMsfsSelectionEdit(
    [{ sourceId: 'row-a' }],
    { sourceId: 'row-a', rangeStartMeters: 49.75, rangeEndMeters: 50.25 },
    'erase',
    100
  );

  assert.deepEqual(selections, [
    { sourceId: 'row-a', rangeStartMeters: 0, rangeEndMeters: 49.75 },
    { sourceId: 'row-a', rangeStartMeters: 50.25, rangeEndMeters: 100 },
  ]);
});

test('erasing an MSFS section splits a whole-row removal', () => {
  const selections = applyMsfsSelectionEdit(
    [{ sourceId: 'row-a' }],
    { sourceId: 'row-a', rangeStartMeters: 30, rangeEndMeters: 70 },
    'erase',
    100
  );

  assert.deepEqual(selections, [
    { sourceId: 'row-a', rangeStartMeters: 0, rangeEndMeters: 30 },
    { sourceId: 'row-a', rangeStartMeters: 70, rangeEndMeters: 100 },
  ]);
});

test('adding and erasing X-Plane sections preserves disjoint selectors', () => {
  const base = { feature: '0123456789abcdef', code: 101, run: 0 };
  let selectors = applyXPlaneSelectorEdit([], { ...base, start: 0.1, end: 0.8 }, 'add');
  selectors = applyXPlaneSelectorEdit(selectors, { ...base, start: 0.3, end: 0.6 }, 'erase');

  assert.deepEqual(selectors, [
    { ...base, start: 0.1, end: 0.3 },
    { ...base, start: 0.6, end: 0.8 },
  ]);
});

test('whole-row erase clears every selector for that row', () => {
  const base = { feature: '0123456789abcdef', code: 101, run: 0 };
  const selectors = applyXPlaneSelectorEdit(
    [
      { ...base, start: 0.1, end: 0.3 },
      { ...base, start: 0.6, end: 0.8 },
    ],
    { ...base, start: 0, end: 1 },
    'erase'
  );

  assert.deepEqual(selectors, []);
});

test('generated MSFS removals become editable from BARS source bindings', () => {
  const group = editableMsfsRemovalGroup(
    {
      removals: [
        {
          id: 'draft-removal',
          origin: 'msfs-source',
          sourceIds: ['row-a:division-section:BARS_A'],
        },
      ],
      objects: [
        {
          sourceBindings: [
            {
              sourceId: 'row-a:division-section:BARS_A',
              rangeStartMeters: 20,
              rangeEndMeters: 60,
            },
          ],
        },
      ],
    },
    'row-a',
    ['row-a']
  );

  assert.deepEqual(group, {
    selections: [{ sourceId: 'row-a', rangeStartMeters: 20, rangeEndMeters: 60 }],
    keepSelections: [],
    removalIds: ['draft-removal'],
    sourceIds: ['row-a'],
    targetSourceId: 'row-a',
  });
});

test('linked generated rows are rebuilt together when one row is edited', () => {
  const group = editableMsfsRemovalGroup(
    {
      removals: [
        {
          id: 'shared-removal',
          origin: 'msfs-auto',
          sourceIds: ['row-a', 'row-b'],
          selections: [
            { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
            { sourceId: 'row-b', rangeStartMeters: 30, rangeEndMeters: 40 },
          ],
        },
      ],
      objects: [],
    },
    'row-a',
    ['row-a', 'row-b']
  );

  assert.deepEqual(group.selections, [
    { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
    { sourceId: 'row-b', rangeStartMeters: 30, rangeEndMeters: 40 },
  ]);
  assert.deepEqual(group.sourceIds, ['row-a', 'row-b']);
});

test('keep-area polygon seeds expand the editable group to overlapping source rows', () => {
  const group = editableMsfsRemovalGroup(
    {
      removals: [
        {
          id: 'row-a-removal',
          origin: 'msfs-auto',
          sourceIds: ['row-a'],
          selections: [{ sourceId: 'row-a' }],
        },
        {
          id: 'crossing-row-removal',
          origin: 'msfs-auto',
          sourceIds: ['row-b'],
          selections: [{ sourceId: 'row-b' }],
        },
      ],
      objects: [],
    },
    'row-a',
    ['row-a', 'row-b'],
    ['crossing-row-removal']
  );

  assert.deepEqual(group.sourceIds, ['row-a', 'row-b']);
  assert.deepEqual(group.removalIds.sort(), ['crossing-row-removal', 'row-a-removal']);
  assert.deepEqual(group.selections, [{ sourceId: 'row-b' }, { sourceId: 'row-a' }]);
});

test('explicit empty selection metadata does not become a whole-row removal', () => {
  const group = editableMsfsRemovalGroup(
    {
      removals: [
        {
          id: 'bounded-removal',
          origin: 'msfs-manual',
          sourceIds: ['row-a', 'row-b'],
          selections: [{ sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 }],
        },
      ],
      objects: [],
    },
    'row-a',
    ['row-a', 'row-b']
  );

  assert.deepEqual(group.selections, [
    { sourceId: 'row-a', rangeStartMeters: 10, rangeEndMeters: 20 },
  ]);
});

test('manual keep edits remain authoritative over the original BARS source binding', () => {
  const group = editableMsfsRemovalGroup(
    {
      removals: [
        {
          id: 'manual-removal',
          origin: 'msfs-manual',
          sourceIds: ['row-a'],
          selections: [
            { sourceId: 'row-a', rangeStartMeters: 0, rangeEndMeters: 30 },
            { sourceId: 'row-a', rangeStartMeters: 70, rangeEndMeters: 100 },
          ],
          keepSelections: [{ sourceId: 'row-a', rangeStartMeters: 30, rangeEndMeters: 70 }],
        },
      ],
      objects: [
        {
          sourceBindings: [{ sourceId: 'row-a', rangeStartMeters: 0, rangeEndMeters: 100 }],
        },
      ],
    },
    'row-a',
    ['row-a']
  );

  assert.deepEqual(group.selections, [
    { sourceId: 'row-a', rangeStartMeters: 0, rangeEndMeters: 30 },
    { sourceId: 'row-a', rangeStartMeters: 70, rangeEndMeters: 100 },
  ]);
  assert.deepEqual(group.keepSelections, [
    { sourceId: 'row-a', rangeStartMeters: 30, rangeEndMeters: 70 },
  ]);
});

test('generated raw row aliases resolve to the editable parent row', () => {
  const group = editableMsfsRemovalGroup(
    {
      removals: [
        { id: 'generated', origin: 'msfs-source', sourceIds: ['raw-row'], selections: [] },
      ],
      objects: [
        {
          sourceBindings: [
            {
              sourceId: 'parent-row:division-section:BARS_A',
              rangeStartMeters: 5,
              rangeEndMeters: 15,
            },
          ],
        },
      ],
    },
    'parent-row',
    [{ id: 'parent-row', sourceRowIds: ['raw-row'] }]
  );

  assert.deepEqual(group.selections, [
    { sourceId: 'parent-row', rangeStartMeters: 5, rangeEndMeters: 15 },
  ]);
  assert.deepEqual(group.removalIds, ['generated']);
});
