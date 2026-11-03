import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boardFor, createMyDesk } from '../../server/mydesk.mjs';

// what MyDesk's GET /api/v2/office/board sends (Mydesk src/main/projects/officeBoard.js)
const RAW = {
  tasks: [
    { id: 't1', projectId: 'p1', title: 'Fix the cart\ntotal', status: 'in_progress', priority: 1, claimedBy: 'sid-claude' },
    { id: 't2', projectId: 'p1', title: 'Write the docs', status: 'ready', priority: 2, claimedBy: null },
    { id: 't3', projectId: 'p1', title: 'Ship it', status: 'done', priority: 3, claimedBy: 'sid-gone' },
    { id: 't4', projectId: 'p1', title: 'Odd', status: 'In Progress!', priority: 'x' },
    null, { title: 'no id' },
  ],
  doneTotal: 12, projects: [{ id: 'p1', name: 'Shop' }], cursor: 40, events: [],
};

test('the board for the wall: tidy titles, known statuses, claims as office session ids', () => {
  const b = boardFor(RAW, (sid) => (sid === 'sid-claude' ? 'office-1' : null));
  assert.equal(b.tasks.length, 4);
  assert.deepEqual(b.tasks[0], { id: 't1', title: 'Fix the cart total', status: 'in_progress', priority: 1, projectId: 'p1', claimedBy: 'office-1' });
  assert.equal(b.tasks[2].claimedBy, null, 'a claimant not on the floor is no one here');
  assert.equal(b.tasks[3].status, 'backlog', 'a status it cannot read is a backlog one');
  assert.equal(b.tasks[3].priority, null);
  assert.equal(b.doneTotal, 12);
  assert.deepEqual(b.projects, [{ id: 'p1', name: 'Shop' }]);
});

test('not a board: null (MyDesk answering an error, nothing at all)', () => {
  assert.equal(boardFor({ error: 'projects store is not ready' }), null);
  assert.equal(boardFor(null), null);
  assert.equal(boardFor('x'), null);
});

test('board(): read only while linked; MyDesk not ready or gone is null', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-board-'));
  let answer = { status: 200, body: [] };
  const fetchImpl = async (u) => {
    if (u.endsWith('/api/agents')) return { ok: true, json: async () => [] };
    return { ok: answer.status === 200, json: async () => answer.body };
  };
  const md = createMyDesk({ dataDir: dir, fetchImpl, env: {}, everyMs: 0 });
  assert.equal(await md.board(), null, 'not linked');
  md.link('http://127.0.0.1:3002'); await md.poll();
  answer = { status: 503, body: { error: 'projects store is not ready' } };
  assert.equal(await md.board(), null);
  answer = { status: 200, body: RAW };
  assert.deepEqual(await md.board(), { ...RAW, handoffs: [] });   // (+ the handoffs it has kept: none on a first read)
});

test('handoffs: the first read replays nothing; later handoff_sent events are kept with the receiving office session', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-handoff-'));
  const urls = [];
  let events = [];
  const fetchImpl = async (u) => {
    urls.push(String(u));
    if (String(u).endsWith('/api/agents')) return new Response(JSON.stringify([{ id: 'sid-a', name: 'a', status: 'working' }]), { status: 200 });
    return new Response(JSON.stringify({ tasks: [], projects: [], doneTotal: 0, cursor: 50 + events.length, events }), { status: 200 });
  };
  const md = createMyDesk({ dataDir: dir, fetchImpl, env: {}, everyMs: 0 });
  md.link('http://127.0.0.1:3000');
  await md.poll();
  events = [{ seq: 41, type: 'claimed', taskId: 't1', payload: {} }];
  const first = await md.board();
  assert.ok(!urls.at(-1).includes('since='), 'a first look asks for no history');
  assert.deepEqual(first.handoffs, []);
  events = [{ seq: 51, type: 'handoff_sent', taskId: 't1', payload: { sessionId: 'sid-a', via: 'hook' } }];
  const next = await md.board();
  assert.ok(urls.at(-1).endsWith('?since=51'), 'then only what is new');
  const b = boardFor(next, (sid) => (sid === 'sid-a' ? 'office-a' : null));
  assert.deepEqual(b.handoffs, [{ seq: 51, taskId: 't1', to: 'office-a' }]);
  assert.deepEqual(boardFor(next, () => null).handoffs, [], 'a receiver not on the floor flies nothing');
});
