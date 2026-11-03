import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boardFor, createMyDesk, taskMove } from '../../server/mydesk.mjs';

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
  assert.deepEqual(await md.board(), { ...RAW, handoffs: [], moves: [] });   // (+ the handoffs and moves it has kept: none on a first read)
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

// MyDesk's events for one claim, then a review, then done (Mydesk src/main/projects/store.js claimTask / setTaskStatus)
const agent = (id) => ({ type: 'agent', id });
const known = () => ({ claimants: new Map(), statuses: new Map([['t1', 'ready']]), froms: new Map() });

test('task moves: a claim (its status change first), a review by the agent, done by you to the claimant on record', () => {
  const k = known();
  assert.equal(taskMove({ seq: 1, taskId: 't1', type: 'status_changed', actor: agent('sid-a'), payload: { from: 'ready', to: 'in_progress' } }, k), null);
  assert.deepEqual(taskMove({ seq: 2, taskId: 't1', type: 'claimed', actor: agent('sid-a'), payload: { sessionId: 'sid-a' } }, k),
    { seq: 2, taskId: 't1', kind: 'claim', sessionId: 'sid-a', from: 'ready' });
  assert.equal(taskMove({ seq: 3, taskId: 't1', type: 'evidence_added', actor: agent('sid-a'), payload: {} }, k), null);
  assert.deepEqual(taskMove({ seq: 4, taskId: 't1', type: 'status_changed', actor: agent('sid-a'), payload: { from: 'in_progress', to: 'review' } }, k),
    { seq: 4, taskId: 't1', kind: 'review', sessionId: 'sid-a', from: 'in_progress' });
  assert.equal(taskMove({ seq: 5, taskId: 't1', type: 'released', actor: agent('sid-a'), payload: {} }, k), null);
  assert.deepEqual(taskMove({ seq: 6, taskId: 't1', type: 'status_changed', actor: { type: 'user', id: null }, payload: { from: 'review', to: 'done' } }, k),
    { seq: 6, taskId: 't1', kind: 'done', sessionId: 'sid-a', from: 'review' }, 'released, but still its claimant');
});

test('task moves: nobody ever claimed it, or nothing to act out', () => {
  const k = known();
  assert.equal(taskMove({ seq: 1, taskId: 't1', type: 'status_changed', actor: { type: 'user' }, payload: { from: 'ready', to: 'done' } }, k), null, 'you closed an unclaimed task');
  assert.equal(taskMove({ seq: 2, taskId: 't1', type: 'claimed', actor: { type: 'user' }, payload: {} }, k), null);
  assert.equal(taskMove({ seq: 3, taskId: '', type: 'claimed', payload: { sessionId: 'x' } }, k), null);
  assert.equal(taskMove({ seq: 'x', taskId: 't1', type: 'claimed', payload: { sessionId: 'x' } }, k), null);
  assert.equal(taskMove(null, k), null);
});

test('board(): moves from the feed after the first read, the claimant mapped to the office, the title from the board', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-moves-'));
  let body = { tasks: [{ id: 't1', title: 'Fix the cart', status: 'ready', claimedBy: null }], projects: [], doneTotal: 0, cursor: 10, events: [] };
  const fetchImpl = async (u) => {
    if (String(u).endsWith('/api/agents')) return new Response(JSON.stringify([{ id: 'sid-a', name: 'a', status: 'idle' }]), { status: 200 });
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const md = createMyDesk({ dataDir: dir, fetchImpl, env: {}, everyMs: 0 });
  md.link('http://127.0.0.1:3000'); await md.poll();
  assert.deepEqual((await md.board()).moves, [], 'a first read: no history');
  body = { tasks: [{ id: 't1', title: 'Fix the cart', status: 'in_progress', claimedBy: 'sid-a' }], projects: [], doneTotal: 0, cursor: 12, events: [
    { seq: 11, taskId: 't1', type: 'status_changed', actor: agent('sid-a'), payload: { from: 'ready', to: 'in_progress' } },
    { seq: 12, taskId: 't1', type: 'claimed', actor: agent('sid-a'), payload: { sessionId: 'sid-a' } },
  ] };
  const b = boardFor(await md.board(), (sid) => (sid === 'sid-a' ? 'office-a' : null));
  assert.deepEqual(b.moves, [{ seq: 12, taskId: 't1', kind: 'claim', from: 'ready', title: 'Fix the cart', to: 'office-a' }]);
  body = { tasks: [{ id: 't1', title: 'Fix the cart', status: 'review', claimedBy: null }], projects: [], doneTotal: 0, cursor: 14, events: [
    { seq: 13, taskId: 't1', type: 'status_changed', actor: agent('sid-a'), payload: { from: 'in_progress', to: 'review' } },
    { seq: 14, taskId: 't1', type: 'released', actor: agent('sid-a'), payload: {} },
  ] };
  const raw = await md.board();
  assert.deepEqual(boardFor(raw, (sid) => (sid === 'sid-a' ? 'office-a' : null)).moves.map((m) => [m.seq, m.kind, m.to]), [[12, 'claim', 'office-a'], [13, 'review', 'office-a']]);
  assert.deepEqual(boardFor(raw, () => null).moves, [], 'a claimant not on the floor moves nothing');
});
