import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELEBRATE_MS, busyParts, finishOf, nextTurn } from '../../src/shared/finish.js';

const S = 1000;
const play = (steps) => steps.reduce((t, x) => nextTurn(t, x), undefined);

test('a turn busy for 12 minutes with 5 edits: celebrated, with those numbers', () => {
  const t = play([
    { prev: 'rest', status: 'work', now: 0, edits: 10 },
    { prev: 'work', status: 'rest', now: 12 * 60 * S, edits: 15 },
  ]);
  assert.deepEqual(finishOf(t), { busyMs: 12 * 60 * S, edits: 5, celebrate: true });
});

test('a short turn ends quietly', () => {
  const t = play([{ prev: 'rest', status: 'work', now: 0, edits: 0 }, { prev: 'work', status: 'rest', now: 59 * S, edits: 2 }]);
  assert.equal(finishOf(t).celebrate, false);
  assert.equal(finishOf(play([{ prev: 'rest', status: 'work', now: 0 }, { prev: 'work', status: 'rest', now: CELEBRATE_MS }])).celebrate, true);
});

test('waiting for you inside the turn is not busy time', () => {
  const t = play([
    { prev: 'rest', status: 'work', now: 0, edits: 0 },
    { prev: 'work', status: 'wait', now: 40 * S },
    { prev: 'wait', status: 'work', now: 10 * 60 * S },   // ten minutes before you answered
    { prev: 'work', status: 'rest', now: 10 * 60 * S + 15 * S, edits: 1 },
  ]);
  assert.equal(finishOf(t).busyMs, 55 * S);
  assert.equal(finishOf(t).celebrate, false);
});

test('opened mid-turn: counted from the server\'s start, the number of edits unknown', () => {
  const t = play([
    { prev: undefined, status: 'work', now: 300 * S, edits: 40, taskStart: 100 * S },
    { prev: 'work', status: 'rest', now: 400 * S, edits: 44 },
  ]);
  assert.deepEqual(finishOf(t), { busyMs: 300 * S, edits: null, celebrate: true });
  const noStart = play([{ prev: undefined, status: 'work', now: 300 * S, taskStart: 0 }, { prev: 'work', status: 'rest', now: 330 * S }]);
  assert.equal(finishOf(noStart).busyMs, 30 * S, 'without a start: from when the page saw it');
});

test('no turn, a turn still running, the same status twice, a first sight at rest', () => {
  assert.deepEqual(finishOf(undefined), { busyMs: 0, edits: null, celebrate: false });
  const running = play([{ prev: 'rest', status: 'work', now: 0 }]);
  assert.equal(finishOf(running).celebrate, false);
  assert.equal(nextTurn(running, { prev: 'work', status: 'work', now: 5 }), running);
  assert.equal(play([{ prev: undefined, status: 'rest', now: 0 }]), undefined);
});

test('busy time in words: at least a minute, hours past 60', () => {
  assert.deepEqual(busyParts(20 * S), { h: 0, m: 1 });
  assert.deepEqual(busyParts(12 * 60 * S), { h: 0, m: 12 });
  assert.deepEqual(busyParts(95 * 60 * S), { h: 1, m: 35 });
});
