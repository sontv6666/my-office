import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeEdgeChips, spreadUp } from '../../src/shared/spread.js';

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('two bubbles on top of each other: the lower keeps its place, the other moves up clear of it', () => {
  const up = spreadUp([{ id: 'a', x: 100, y: 100, w: 120, h: 30 }, { id: 'b', x: 130, y: 110, w: 120, h: 30 }], 4);
  assert.equal(up.get('b'), 0);
  assert.equal(up.get('a'), 24);   // its top goes from 100 to 110 - 30 - 4 = 76
});

test('a pile of four ends with no overlaps; bubbles far apart do not move; same input, same answer', () => {
  const rects = [0, 1, 2, 3].map((i) => ({ id: `s${i}`, x: 100 + i * 10, y: 100 + i * 3, w: 160, h: 32 })).concat([{ id: 'far', x: 900, y: 100, w: 160, h: 32 }]);
  const up = spreadUp(rects);
  const moved = rects.map((r) => ({ ...r, y: r.y - up.get(r.id) }));
  for (let i = 0; i < moved.length; i++) for (let j = i + 1; j < moved.length; j++) assert.equal(overlap(moved[i], moved[j]), false);
  assert.equal(up.get('far'), 0);
  assert.deepEqual([...spreadUp(rects)], [...up]);
});

test('edge chips stay out of the toolbar and apart from each other', () => {
  const bar = { x: 300, y: 920, w: 700, h: 56 };   // the camera bar along the bottom
  const chips = [
    { id: 'a', x: 500, y: 950, w: 140, h: 26 },
    { id: 'b', x: 520, y: 950, w: 140, h: 26 },
    { id: 'c', x: 1500, y: 400, w: 120, h: 26 },
  ];
  const pos = placeEdgeChips(chips, 1600, 1000, { avoid: [bar] });
  const boxes = chips.map((c) => ({ x: pos.get(c.id).x - c.w / 2, y: pos.get(c.id).y - c.h / 2, w: c.w, h: c.h }));
  for (const b of boxes) assert.equal(overlap(b, bar), false, 'never over the toolbar');
  assert.equal(overlap(boxes[0], boxes[1]), false);
  assert.deepEqual(pos.get('c'), { x: 1500, y: 400 }, 'a chip with room keeps its place');
  for (const b of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1600 && b.y + b.h <= 1000, 'inside the stage');
});
