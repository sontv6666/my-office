import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poseOf } from '../../src/shared/pose.js';

const NOW = 1_800_000_000_000;

test('waiting for the user: the raised hand', () => {
  assert.equal(poseOf({ status: 'wait', last: { type: 'bash' } }, NOW), 'hand');
});

test('working: what the last step is done with (console for a command, books for a read, the desk otherwise)', () => {
  assert.equal(poseOf({ status: 'work', last: { type: 'bash' }, lastAt: NOW - 60e3 }, NOW), 'console');
  assert.equal(poseOf({ status: 'work', last: { type: 'grep' }, lastAt: NOW - 60e3 }, NOW), 'read');
  assert.equal(poseOf({ status: 'work', last: { type: 'web' }, lastAt: NOW - 60e3 }, NOW), 'globe');
  assert.equal(poseOf({ status: 'work', last: { type: 'edit' }, lastAt: NOW - 60e3 }, NOW), 'type');
  assert.equal(poseOf({ status: 'work', last: null }, NOW), 'type');
  assert.equal(poseOf({ status: 'work', last: { type: 'something-new' }, lastAt: NOW }, NOW), 'type');
});

test('a failure or a push shows for a moment, then the work goes on', () => {
  assert.equal(poseOf({ status: 'work', last: { type: 'fail' }, lastAt: NOW - 1000 }, NOW), 'sweat');
  assert.equal(poseOf({ status: 'work', last: { type: 'fail' }, lastAt: NOW - 30e3 }, NOW), 'type');
  assert.equal(poseOf({ status: 'work', last: { type: 'push' }, lastAt: NOW - 1000 }, NOW), 'celebrate');
});

test('done: a coffee first, then the nap; a background task still running keeps them thinking', () => {
  assert.equal(poseOf({ status: 'rest', doneAt: NOW - 3000 }, NOW), 'coffee');
  assert.equal(poseOf({ status: 'rest', doneAt: NOW - 120e3 }, NOW), 'sleep');
  assert.equal(poseOf({ status: 'rest', doneAt: 0, lastAt: NOW - 3000 }, NOW), 'coffee');
  assert.equal(poseOf({ status: 'rest', doneAt: NOW - 120e3, bg: [{ id: 'b1' }] }, NOW), 'think');
  assert.equal(poseOf({ status: 'rest' }, NOW), 'sleep');
});
