import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MOVES, before, heldTasks, legsOf, movesToAct, overdue } from '../../src/shared/task-moves.js';

const mv = (seq, taskId, kind, to, extra = {}) => ({ seq, taskId, kind, to, title: `Task ${taskId}`, ...extra });

test('a first look acts nothing (no history replayed), then each new move once', () => {
  const list = [mv(5, 't1', 'claim', 'a'), mv(7, 't2', 'review', 'b')];
  assert.deepEqual(movesToAct(list, null), { act: [], skip: [], seen: 7 });
  assert.deepEqual(movesToAct(list, undefined).act, []);
  const next = movesToAct([...list, mv(9, 't3', 'claim', 'c')], 7);
  assert.deepEqual(next.act.map((m) => m.seq), [9]);
  assert.equal(next.seen, 9);
  assert.deepEqual(movesToAct([...list, mv(9, 't3', 'claim', 'c')], 9).act, [], 'nothing twice');
  const none = movesToAct([], null);
  assert.equal(none.seen, 0, 'a first look with none yet: the next one is new');
  assert.deepEqual(movesToAct([mv(1, 't1', 'claim', 'a')], none.seen).act.map((m) => m.seq), [1]);
});

test('a working claimant does not get up; one not on the floor neither: those just update', () => {
  const working = (id) => id === 'busy';
  const present = (id) => id !== 'gone';
  const r = movesToAct([mv(2, 't1', 'claim', 'busy'), mv(3, 't2', 'claim', 'gone'), mv(4, 't3', 'done', 'idle'), mv(5, 't4', 'claim', null)], 1, { working, present });
  assert.deepEqual(r.act.map((m) => m.taskId), ['t3']);
  assert.deepEqual(r.skip.map((m) => m.taskId), ['t1', 't2', 't4']);
});

test('one move a person, two on the floor at once', () => {
  const list = [mv(2, 't1', 'claim', 'a'), mv(3, 't2', 'claim', 'a'), mv(4, 't3', 'claim', 'b'), mv(5, 't4', 'claim', 'c')];
  const r = movesToAct(list, 1);
  assert.equal(MAX_MOVES, 2);
  assert.deepEqual(r.act.map((m) => m.taskId), ['t1', 't3'], 'a has one already; the third person waits for nobody: skipped');
  assert.deepEqual(r.skip.map((m) => m.taskId), ['t2', 't4']);
  const busy = movesToAct([mv(6, 't5', 'claim', 'a'), mv(7, 't6', 'claim', 'd')], 5, { moving: new Set(['a']), active: 1 });
  assert.deepEqual(busy.act.map((m) => m.taskId), ['t6'], 'a is still carrying a note; one more fits on the floor');
  assert.deepEqual(movesToAct([mv(8, 't7', 'claim', 'e')], 7, { active: 2 }).act, [], 'the floor is full');
});

test('several moves of one task in one look: only its last is acted', () => {
  const r = movesToAct([mv(2, 't1', 'claim', 'a'), mv(3, 't1', 'review', 'a')], 1);
  assert.deepEqual(r.act.map((m) => m.kind), ['review']);
  assert.deepEqual(r.skip.map((m) => m.kind), ['claim']);
});

test('unknown kinds and broken entries are left out', () => {
  const r = movesToAct([null, { seq: 'x', taskId: 't', kind: 'claim', to: 'a' }, mv(3, 't1', 'fly', 'a'), mv(4, '', 'claim', 'a')], 1);
  assert.deepEqual(r, { act: [], skip: [], seen: 1 });
});

test('legs: a claim from the board to the desk; review and done from the desk to the board (or within the board)', () => {
  assert.deepEqual(legsOf(mv(1, 't', 'claim', 'a'), false), [{ at: 'board', act: 'pick' }, { at: 'desk', act: 'place' }]);
  assert.deepEqual(legsOf(mv(1, 't', 'review', 'a'), true), [{ at: 'desk', act: 'pick' }, { at: 'board', act: 'place' }]);
  assert.deepEqual(legsOf(mv(1, 't', 'done', 'a', { from: 'review' }), false), [{ at: 'board', act: 'pick' }, { at: 'board', act: 'place' }]);
});

test('before: the copy the page last showed, else what the move says it was', () => {
  const now = { id: 't1', title: 'Fix it', status: 'in_progress', claimedBy: 'a' };
  assert.deepEqual(before(now, mv(1, 't1', 'claim', 'a'), { id: 't1', status: 'ready', claimedBy: null }), { ...now, status: 'ready', claimedBy: null });
  assert.deepEqual(before(now, mv(1, 't1', 'claim', 'a', { from: 'backlog' }), null), { ...now, status: 'backlog', claimedBy: null });
  assert.deepEqual(before(now, mv(1, 't1', 'claim', 'a'), null), { ...now, status: 'todo', claimedBy: null });
  const rev = { id: 't1', title: 'Fix it', status: 'review', claimedBy: null };
  assert.deepEqual(before(rev, mv(1, 't1', 'review', 'a'), null), { ...rev, status: 'in_progress', claimedBy: 'a' });
  const done = { ...rev, status: 'done' };
  assert.deepEqual(before(done, mv(1, 't1', 'done', 'a', { from: 'review' }), null), { ...done, status: 'review' });
});

test('held tasks: the old copy until picked up, nothing while carried, the truth once placed', () => {
  const tasks = [{ id: 't1', status: 'in_progress', claimedBy: 'a' }, { id: 't2', status: 'todo' }];
  const old = { id: 't1', status: 'todo', claimedBy: null };
  assert.equal(heldTasks(tasks, new Map()), tasks);
  assert.deepEqual(heldTasks(tasks, new Map([['t1', { phase: 'before', task: old }]])), [old, tasks[1]]);
  assert.deepEqual(heldTasks(tasks, new Map([['t1', { phase: 'carry', task: old }]])), [tasks[1]]);
  assert.deepEqual(heldTasks(tasks, new Map([['t1', { phase: 'placed', task: old }]])), tasks);
  const gone = { id: 't9', status: 'in_progress', claimedBy: 'a' };
  assert.deepEqual(heldTasks(tasks, new Map([['t9', { phase: 'before', task: gone }]])), [...tasks, gone], 'off the list already: still shown until carried');
});

test('the watchdog: 30 s, then everything snaps to the truth', () => {
  assert.equal(overdue(100, 129), false);
  assert.equal(overdue(100, 131), true);
  assert.equal(overdue(100, 50), true, 'a clock gone backwards: snap');
});
