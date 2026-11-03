import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ENVELOPES, flightMs, flightPoint, roomFor } from '../../src/shared/envelope.js';

test('a flight takes between 0.8 and 2 s, longer for a longer way', () => {
  assert.equal(flightMs({ x: 0, z: 0 }, { x: 0, z: 0 }), 800);
  assert.equal(flightMs({ x: 0, z: 0 }, { x: 40, z: 30 }), 2000);
  const near = flightMs({ x: 0, z: 0 }, { x: 6, z: 0 }), far = flightMs({ x: 0, z: 0 }, { x: 9, z: 0 });
  assert.ok(near < far && near >= 800 && far <= 2000);
});

test('it starts and lands on its ends, flies above the straight line in between', () => {
  const a = { x: 0, y: 1, z: 0 }, b = { x: 8, y: 0.5, z: 4 };
  const p0 = flightPoint(a, b, 0), p1 = flightPoint(a, b, 1), mid = flightPoint(a, b, 0.5);
  assert.deepEqual([p0.x, p0.y, p0.z], [0, 1, 0]);
  assert.ok(Math.abs(p1.x - 8) < 1e-9 && Math.abs(p1.y - 0.5) < 1e-9 && Math.abs(p1.z - 4) < 1e-9);
  assert.ok(mid.y > 0.75 + 0.5, 'an arc, not a line');
  assert.ok(Math.abs(mid.tilt) <= 0.12 + 1e-9);
  assert.deepEqual(flightPoint(a, b, 7), p1, 'past the end it stays landed');
});

test(`never more than ${MAX_ENVELOPES} in the air`, () => {
  assert.equal(roomFor(0), true);
  assert.equal(roomFor(MAX_ENVELOPES - 1), true);
  assert.equal(roomFor(MAX_ENVELOPES), false);
  assert.ok(MAX_ENVELOPES <= 8);
});
