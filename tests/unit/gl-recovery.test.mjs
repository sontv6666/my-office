import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GL_MAX_TRIES, GL_RETRY_MS, GL_WAIT_MS, glStart, glStep } from '../../src/shared/gl-recovery.js';

const run = (steps, st = glStart()) => {
  const acts = [];
  for (const [ev, now] of steps) { const r = glStep(st, ev, now); st = r.st; acts.push(r.act); }
  return { st, acts };
};

test('a loss pauses, asks for the context back after ~1.5 s, and rebuilds when it returns', () => {
  const { st, acts } = run([['lost', 0], ['tick', GL_RETRY_MS - 1], ['tick', GL_RETRY_MS], ['restored', GL_RETRY_MS + 40]]);
  assert.deepEqual(acts, ['pause', '', 'restore', 'rebuild']);
  assert.equal(st.phase, 'ok');
  assert.equal(st.tries, 1);
});

test('the browser giving it back on its own, before we ask, is a rebuild too', () => {
  const { acts } = run([['lost', 0], ['restored', 300]]);
  assert.deepEqual(acts, ['pause', 'rebuild']);
});

test('a restore that never comes counts as a failed try and is asked for again', () => {
  const { st, acts } = run([['lost', 0], ['tick', GL_RETRY_MS], ['tick', GL_RETRY_MS + GL_WAIT_MS]]);
  assert.deepEqual(acts, ['pause', 'restore', 'pause']);
  assert.equal(st.phase, 'lost');
  assert.equal(st.tries, 2);
});

test(`at most ${GL_MAX_TRIES} tries in a page's life, then it gives up and stays given up`, () => {
  let st = glStart(), now = 0;
  const acts = [];
  for (let i = 0; i < GL_MAX_TRIES; i++) {
    for (const ev of ['lost', 'tick', 'restored']) { now += GL_RETRY_MS; const r = glStep(st, ev, now); st = r.st; acts.push(r.act); }
  }
  assert.deepEqual(acts.filter((a) => a === 'rebuild').length, GL_MAX_TRIES);
  const last = glStep(st, 'lost', now + 1);
  assert.equal(last.act, 'dead');
  assert.equal(last.st.phase, 'dead');
  assert.equal(glStep(last.st, 'restored', now + 2).act, '', 'dead is final');
  assert.equal(glStep(last.st, 'tick', now + 1e9).act, '');
});

test('noise: a restore while drawing, a second loss while paused, an early tick', () => {
  assert.equal(glStep(glStart(), 'restored', 0).act, '');
  const paused = glStep(glStart(), 'lost', 0).st;
  assert.equal(glStep(paused, 'lost', 10).act, '', 'already paused: not another try');
  assert.equal(glStep(paused, 'tick', 10).act, '', 'too early');
  assert.equal(glStep(undefined, 'lost', 0).act, 'pause');
});
