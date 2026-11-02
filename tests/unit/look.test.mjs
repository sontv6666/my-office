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

import { guessDesk } from '../../src/shared/look.js';
test('guessDesk: a free desk in the area its project sits in, else the area it had last if empty, else -1', () => {
  const units = [[0, 3, 1, 2], [4, 7, 5, 6], [8, 9]];
  // the project already sits at desk 0: the next seat of that area
  assert.equal(guessDesk({ proj: 'a', units, seated: [{ desk: 0, proj: 'a' }, { desk: 4, proj: 'b' }] }), 3);
  // nobody of it here: the area it had last, if it is empty
  assert.equal(guessDesk({ proj: 'c', units, homes: { c: [2] }, seated: [{ desk: 0, proj: 'a' }] }), 8);
  // that area is taken: no guess
  assert.equal(guessDesk({ proj: 'c', units, homes: { c: [1] }, seated: [{ desk: 4, proj: 'b' }] }), -1);
  // its area is full: no guess from it
  assert.equal(guessDesk({ proj: 'z', units: [[0]], seated: [{ desk: 0, proj: 'z' }] }), -1);
});

import { cleanWear, wearOn } from '../../src/shared/look.js';
test('cleanWear keeps only valid clothes; wearOn lays them over the look', () => {
  assert.equal(cleanWear(null), null);
  assert.equal(cleanWear({ shirt: 'red', style: 'mohawk', outfit: 'cape' }), null);
  assert.deepEqual(cleanWear({ shirt: '#d64550', hair: '#1e1e24', style: 'bun', acc: 'none', outfit: 'suit', pants: '#2B2F36', x: 1 }),
    { shirt: '#D64550', hair: '#1E1E24', pants: '#2B2F36', style: 'bun', acc: 'none', outfit: 'suit' });
  const base = lookOf({ name: 'billing', desk: 2 });
  assert.equal(wearOn(base, null), base);
  const on = wearOn(base, { shirt: '#000000', acc: 'none', outfit: 'hoodie' });
  assert.equal(on.shirt, '#000000'); assert.equal(on.acc, null); assert.equal(on.outfit, 'hoodie'); assert.equal(on.hair, base.hair);
});
