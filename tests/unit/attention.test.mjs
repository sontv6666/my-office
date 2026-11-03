import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attentionOf, nextMemory } from '../../src/shared/attention.js';

const after = (steps) => steps.reduce((m, x) => nextMemory(m, x), undefined);

test('waiting for you comes first, whatever happened before', () => {
  assert.equal(attentionOf({ status: 'wait' }, { err: true, done: true }), 'wait');
  assert.equal(attentionOf({ status: 'wait', md: { state: 'error', unreviewed: true } }), 'wait');
});

test('at work: nothing lasting shows, even with an old outcome in memory', () => {
  assert.equal(attentionOf({ status: 'work' }, { err: true, done: true }), '');
  assert.equal(attentionOf(null), '');
});

test('a failed turn stays an error until it works again; a tool failing mid-turn is not one', () => {
  let m = after([{ prev: 'work', status: 'rest' }, { e: { type: 'fail' }, status: 'rest' }]);
  assert.equal(attentionOf({ status: 'rest' }, m), 'error');
  m = nextMemory(m, { seen: true });
  assert.equal(attentionOf({ status: 'rest' }, m), 'error', 'looking at it does not clear an error');
  m = nextMemory(m, { prev: 'rest', status: 'work' });
  assert.equal(attentionOf({ status: 'rest' }, m), '', 'it worked again');
  assert.equal(attentionOf({ status: 'rest' }, after([{ e: { type: 'fail' }, status: 'work' }])), '');
});

test('done and not looked at: until you open it, or it works again', () => {
  let m = after([{ prev: 'work', status: 'rest' }, { e: { type: 'stop' }, status: 'rest' }]);
  assert.equal(attentionOf({ status: 'rest' }, m), 'review');
  assert.equal(attentionOf({ status: 'rest' }, nextMemory(m, { seen: true })), '');
  m = nextMemory(m, { e: { type: 'prompt' }, prev: 'rest', status: 'work' });
  assert.equal(attentionOf({ status: 'rest' }, m), '');
});

test("a subagent's events are not the session's", () => {
  assert.deepEqual(after([{ e: { type: 'stop', agent: 'a1' }, status: 'rest' }]), { err: false, done: false });
  assert.deepEqual(after([{ e: { type: 'fail', agent: 'a1' }, status: 'rest' }]), { err: false, done: false });
});

test('a new outcome replaces the old one; stopping it yourself clears both', () => {
  const failed = after([{ e: { type: 'fail' }, status: 'rest' }]);
  assert.deepEqual(nextMemory(failed, { e: { type: 'stop' }, status: 'rest' }), { err: false, done: true });
  assert.deepEqual(nextMemory({ err: false, done: true }, { e: { type: 'fail' }, status: 'rest' }), { err: true, done: false });
  assert.deepEqual(nextMemory({ err: true, done: true }, { e: { type: 'interrupt' }, status: 'rest' }), { err: false, done: false });
});

test("MyDesk's record wins for done-but-unreviewed, and its error counts", () => {
  assert.equal(attentionOf({ status: 'rest', md: { state: 'completed', unreviewed: true } }), 'review');
  assert.equal(attentionOf({ status: 'rest', md: { state: 'completed', unreviewed: false } }, { done: true }), '', 'looked at in MyDesk');
  assert.equal(attentionOf({ status: 'rest', md: { state: 'error', unreviewed: false } }), 'error');
  assert.equal(attentionOf({ status: 'rest', md: { state: 'idle', unreviewed: false } }, { err: true }), 'error', "the office saw it fail");
  assert.equal(attentionOf({ status: 'rest', md: null }, { done: true }), 'review', 'no MyDesk: the page remembers');
});
