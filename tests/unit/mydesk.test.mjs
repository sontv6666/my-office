import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentTag, applyMydesk, castOf, createMyDesk, mydeskInfo, officeStatus } from '../../server/mydesk.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'office-mydesk-'));
const agent = (over) => ({ id: 'a', sessionId: 'a', name: 'alpha', status: 'working', providerId: 'claude', metadata: { projectPath: 'D:\\w\\app', isSubagent: false }, ...over });
const reply = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });

test('MyDesk statuses map to the office three', () => {
  assert.deepEqual(['working', 'thinking', 'waiting', 'help', 'idle', 'done', 'error', 'completed'].map(officeStatus),
    ['work', 'work', 'rest', 'wait', 'rest', 'rest', 'rest', 'rest']);   // waiting = turn over, your next prompt: not an approval
});

test('provider ids become the tags the page knows; Claude Code is the default', () => {
  assert.deepEqual(['claude', '', 'codex', 'openai-codex', 'gemini', 'antigravity', 'kiro'].map(agentTag), ['', '', 'codex', 'codex', 'gemini', 'gemini', 'kiro']);
});

test('the cast: Claude sessions by session id, other CLIs as records, subagents and teammates left out', () => {
  const c = castOf([
    agent({ id: 's1', sessionId: 's1' }),
    agent({ id: 'sub', sessionId: 'sub', metadata: { isSubagent: true } }),
    agent({ id: 'tm', sessionId: 'tm', metadata: { isTeammate: true } }),
    agent({ id: 'cx', sessionId: 'cx', name: 'codex-1', providerId: 'codex', status: 'help', currentTool: 'shell' }),
    null, { name: 'no id' },
  ]);
  assert.deepEqual([...c.claude], ['s1']);
  const md = (state) => ({ state, unreviewed: false, parentId: null, toolWarning: false, projectColor: null });
  assert.deepEqual(c.external, [
    { id: 's1', name: 'alpha', cwd: 'D:\\w\\app', status: 'work', agent: '', tool: '', md: md('working') },   // (the stand-in if the office has no s1)
    { id: 'cx', name: 'codex-1', cwd: 'D:\\w\\app', status: 'wait', agent: 'codex', tool: 'shell', md: md('help') },
  ]);
  assert.deepEqual(castOf('nope'), { claude: new Set(), external: [] });
});

test('not linked: every session is in', () => {
  const m = createMyDesk({ dataDir: tmp(), env: {}, everyMs: 0 });
  assert.equal(m.allows('anything'), true);
  assert.equal(m.cast(), null);
  assert.deepEqual(m.status(), { url: '', linked: false, sessions: null });
});

test('linked: only what MyDesk lists, reported once per change; the url is kept for the next start', async () => {
  const dir = tmp(), changes = [];
  let body = [agent({ id: 's1', sessionId: 's1' })];
  const m = createMyDesk({ dataDir: dir, env: {}, everyMs: 0, fetchImpl: async (u) => { assert.equal(u, 'http://127.0.0.1:3000/api/agents'); return reply(body)(); }, onChange: (c) => changes.push(c) });
  assert.equal(m.link('http://127.0.0.1:3000/app/#/agents'), true);
  await m.poll();
  assert.equal(m.allows('s1'), true);
  assert.equal(m.allows('observer'), false);
  assert.equal(m.allows(undefined), false);
  await m.poll();
  assert.equal(changes.length, 1, 'same cast twice: one change');
  body = [agent({ id: 's2', sessionId: 's2' })];
  await m.poll();
  assert.equal(changes.length, 2);
  assert.equal(m.allows('s1'), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'mydesk.json'), 'utf8')), { url: 'http://127.0.0.1:3000' });
  const again = createMyDesk({ dataDir: dir, env: {}, everyMs: 0, fetchImpl: reply([]) });
  assert.equal(again.status().url, 'http://127.0.0.1:3000');
});

test('only a loopback http origin can be linked', () => {
  const m = createMyDesk({ dataDir: tmp(), env: {}, everyMs: 0, fetchImpl: reply([]) });
  for (const bad of ['http://evil.example:3000', 'file:///c:/x', 'javascript:alert(1)', '', null]) assert.equal(m.link(bad), false, String(bad));
  assert.equal(m.link('http://localhost:3001'), true);
});

test('MyDesk gone (3 failed reads): back to every session', async () => {
  const changes = [];
  let up = true;
  const m = createMyDesk({ dataDir: tmp(), env: { OFFICE_MYDESK_URL: 'http://127.0.0.1:3000' }, everyMs: 0,
    fetchImpl: async () => { if (!up) throw new TypeError('fetch failed'); return reply([agent({})])(); }, onChange: (c) => changes.push(c) });
  await m.poll();
  assert.equal(m.allows('other'), false);
  up = false;
  await m.poll(); await m.poll();
  assert.equal(m.allows('other'), false, 'two misses: still linked');
  await m.poll();
  assert.equal(m.allows('other'), true);
  assert.equal(changes.at(-1), null);
});

test("MyDesk's own record rides along: an error is not a rest, done-but-unreviewed, the parent, the warning, the colour", () => {
  const [x] = castOf([agent({ status: 'error', unreviewed: true, toolWarning: true, projectColor: '#38BDF8', metadata: { projectPath: 'D:\\w', parentId: 'boss' } })]).external;
  assert.equal(x.status, 'rest', 'the office still has its three');
  assert.deepEqual(x.md, { state: 'error', unreviewed: true, parentId: 'boss', toolWarning: true, projectColor: '#38bdf8' });
  assert.equal(castOf([agent({ status: 'completed', unreviewed: true })]).external[0].md.state, 'completed');
  // (whatever MyDesk sends, the page gets a plain record)
  assert.deepEqual(mydeskInfo({ status: '<b>x</b>', projectColor: 'red; background:url(x)', metadata: null }),
    { state: 'idle', unreviewed: false, parentId: null, toolWarning: false, projectColor: null });
  assert.deepEqual(mydeskInfo(null), { state: 'idle', unreviewed: false, parentId: null, toolWarning: false, projectColor: null });
});

test("a change in MyDesk's record alone (looked at: unreviewed off) is a change of cast, and md(id) reads it", async () => {
  const changes = [];
  let body = [agent({ id: 's1', sessionId: 's1', status: 'completed', unreviewed: true })];
  const m = createMyDesk({ dataDir: tmp(), env: { OFFICE_MYDESK_URL: 'http://127.0.0.1:3000' }, everyMs: 0, fetchImpl: async () => reply(body)(), onChange: (c) => changes.push(c) });
  await m.poll();
  assert.equal(m.md('s1').unreviewed, true);
  body = [agent({ id: 's1', sessionId: 's1', status: 'completed', unreviewed: false })];
  await m.poll();
  assert.equal(changes.length, 2);
  assert.equal(m.md('s1').unreviewed, false);
  assert.equal(m.md('nobody'), null);
  assert.equal(m.md(undefined), null);
  assert.equal(createMyDesk({ dataDir: tmp(), env: {}, everyMs: 0 }).md('s1'), null, 'not linked: no record');
});

test('applyMydesk: true only when the record on a session changes; null takes it off', () => {
  const s = {};
  const md = mydeskInfo({ status: 'error' });
  assert.equal(applyMydesk(s, md), true);
  assert.equal(applyMydesk(s, { ...md }), false, 'the same again: nothing to send');
  assert.equal(applyMydesk(s, { ...md, state: 'working' }), true);
  assert.equal(applyMydesk(s, null), true);
  assert.equal(s.md, null);
  assert.equal(applyMydesk(s, null), false);
});
