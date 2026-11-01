import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, HAIRS, STYLES, colorOf, hash, lookOf } from '../../src/shared/look.js';

test('a person is the same from the same name and desk (page and server agree)', () => {
  const a = lookOf({ name: 'billing-f4', desk: 3 }), b = lookOf({ name: 'billing-f4', desk: 3 });
  assert.deepEqual(a, b);
  assert.equal(a.shirt, PALETTE[3]);   // the desk's colour
  const h = hash('billing-f4');
  assert.equal(a.hair, HAIRS[h % HAIRS.length]);
  assert.equal(a.style, STYLES[(h >>> 3) % STYLES.length]);
});

test('without a desk, the shirt comes from the name', () => {
  assert.equal(colorOf({ name: 'x', desk: -1 }), PALETTE[hash('x') % PALETTE.length]);
  assert.ok(['coat', 'bag', 'acc'].every((k) => k in lookOf({ name: 'x', desk: -1 })));
});
