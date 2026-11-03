import { test } from 'node:test';
import assert from 'node:assert/strict';
import { columnOf, taskBoard } from '../../src/shared/task-board.js';

// as server/mydesk.mjs boardFor() hands it to the page (claims already the office's session ids)
const BOARD = {
  tasks: [
    { id: 't1', title: 'Fix the cart total', status: 'in_progress', claimedBy: 'office-1' },
    { id: 't2', title: 'Write the docs', status: 'ready', claimedBy: null },
    { id: 't3', title: 'Plan the release', status: 'backlog', claimedBy: null },
    { id: 't4', title: 'Check the login', status: 'review', claimedBy: 'office-2' },
    { id: 't5', title: 'Old in progress', status: 'in_progress', claimedBy: 'office-gone' },
    { id: 't6', title: 'Unclaimed in progress', status: 'in_progress', claimedBy: null },
    { id: 't7', title: 'Shipped', status: 'done', claimedBy: 'office-1' },
  ],
  doneTotal: 9,
};
const onFloor = new Set(['office-1', 'office-2']);

test('columns by status; a claimed task in progress goes to its claimant\'s desk', () => {
  const b = taskBoard(BOARD, (id) => onFloor.has(id));
  assert.deepEqual(b.todo.map((t) => t.id), ['t2', 't3']);
  assert.deepEqual(b.doing.map((t) => t.id), ['t5', 't6'], 'claimant not on the floor, or no claimant: still on the board');
  assert.deepEqual(b.review.map((t) => t.id), ['t4'], 'only work in progress is pinned at a desk');
  assert.deepEqual(b.pinned, [{ task: BOARD.tasks[0], sessionId: 'office-1' }]);
  assert.deepEqual(b.done.map((t) => t.id), ['t7']);
  assert.equal(b.doneTotal, 9);
  assert.equal(b.count, 6, 'open tasks, the pinned one included');
});

test('nobody on the floor: nothing leaves the board', () => {
  const b = taskBoard(BOARD);
  assert.equal(b.pinned.length, 0);
  assert.deepEqual(b.doing.map((t) => t.id), ['t1', 't5', 't6']);
});

test('no board data (MyDesk without projects, not linked): null; an empty one is empty', () => {
  assert.equal(taskBoard(null), null);
  assert.equal(taskBoard({ ok: false }), null);
  const e = taskBoard({ tasks: [], doneTotal: 0 });
  assert.equal(e.count, 0);
  assert.equal(e.doneTotal, 0);
});

test('statuses it does not know are to do; blocked shows with doing', () => {
  assert.equal(columnOf('weird'), 'todo');
  assert.equal(columnOf('blocked'), 'doing');
  assert.equal(columnOf('done'), 'done');
});
