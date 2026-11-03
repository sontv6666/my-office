import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardGlow, needsBoard } from '../../src/shared/needs-board.js';

test('counts who waits for you and who finished unread; errors and the rest are not on it', () => {
  const b = needsBoard([
    { id: 'a', attention: 'review', since: 10 },
    { id: 'b', attention: 'wait', since: 50 },
    { id: 'c', attention: 'error', since: 1 },
    { id: 'd', attention: '', since: 1 },
    { id: 'e', attention: 'wait', since: 20 },
  ]);
  assert.equal(b.count, 3);
  assert.equal(b.wait, 2);
  assert.equal(b.review, 1);
  assert.deepEqual(b.items.map((x) => x.id), ['e', 'b', 'a'], 'waiting first, the longest-waiting first');
  assert.equal(b.first.id, 'e', 'a click goes to the one waiting longest');
});

test('an empty board: nothing to show, nowhere to go', () => {
  for (const list of [[], null, undefined, [null, { id: 'x' }]]) {
    const b = needsBoard(list);
    assert.equal(b.count, 0);
    assert.deepEqual(b.items, []);
    assert.equal(b.first, null);
  }
});

test('at most `max` notes, the count still says them all', () => {
  const list = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, attention: 'wait', since: i }));
  const b = needsBoard(list, 5);
  assert.equal(b.count, 9);
  assert.equal(b.items.length, 5);
});

test('the frame is still with nobody on the board, breathes slowly with somebody, holds still for reduced motion', () => {
  for (const t of [0, 1.3, 77]) assert.equal(boardGlow(0, t), 0);
  const seen = Array.from({ length: 200 }, (_, i) => boardGlow(2, i * 0.05));
  assert.ok(Math.min(...seen) >= 0.35 - 1e-9 && Math.max(...seen) <= 1 + 1e-9);
  assert.ok(Math.max(...seen) - Math.min(...seen) > 0.5, 'it does breathe');
  // slow: from one frame to the next (1/8 s, an unfocused window) it changes by little
  for (let i = 1; i < 80; i++) assert.ok(Math.abs(boardGlow(1, i / 8) - boardGlow(1, (i - 1) / 8)) < 0.06);
  assert.equal(boardGlow(3, 5, true), boardGlow(3, 9, true));
});
