import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentTag, applyMydesk, castOf, createMyDesk, extToolName, langFrom, linkAllowed, linkedCost, LOOK_TOOLS, mydeskHash, mydeskInfo, officeStatus } from '../../server/mydesk.mjs';

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
  const md = (state, id) => ({ id, state, unreviewed: false, parentId: null, toolWarning: false, projectColor: null, quiet: false, quietSince: null, stopKind: null });
  assert.deepEqual(c.external, [
    { id: 's1', name: 'alpha', cwd: 'D:\\w\\app', status: 'work', agent: '', tool: '', md: md('working', 's1') },   // (the stand-in if the office has no s1)
    { id: 'cx', name: 'codex-1', cwd: 'D:\\w\\app', status: 'wait', agent: 'codex', tool: 'shell', md: md('help', 'cx') },
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
  assert.deepEqual(x.md, { id: 'a', state: 'error', unreviewed: true, parentId: 'boss', toolWarning: true, projectColor: '#38bdf8', quiet: false, quietSince: null, stopKind: null });
  assert.equal(castOf([agent({ status: 'completed', unreviewed: true })]).external[0].md.state, 'completed');
  // (whatever MyDesk sends, the page gets a plain record)
  const plain = { id: null, state: 'idle', unreviewed: false, parentId: null, toolWarning: false, projectColor: null, quiet: false, quietSince: null, stopKind: null };
  assert.deepEqual(mydeskInfo({ id: 'a/../b?x=1', status: '<b>x</b>', projectColor: 'red; background:url(x)', metadata: null, quiet: { since: 'soon' }, stopError: { kind: '<script>' } }),
    { ...plain, quiet: true, stopKind: 'unknown' });
  assert.deepEqual(mydeskInfo(null), plain);
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

test("MyDesk's quiet and the error its turn ended on ride along too", () => {
  const [x] = castOf([agent({ status: 'thinking', quiet: { since: 1_700_000_000_000 } })]).external;
  assert.equal(x.status, 'work', 'still at work for the office');
  assert.equal(x.md.quiet, true);
  assert.equal(x.md.quietSince, 1_700_000_000_000);
  const [y] = castOf([agent({ status: 'error', stopError: { kind: 'rate_limit', details: 'x', message: 'y', at: 1 } })]).external;
  assert.equal(y.md.stopKind, 'rate_limit');
  assert.equal(y.md.quiet, false);
  assert.equal(castOf([agent({ quiet: null, stopError: null })]).external[0].md.stopKind, null);
});

test("an agent's id is kept for MyDesk's Inspector: another CLI's, with its ':', too", () => {
  const [a, b] = castOf([agent({ id: 'antigravity:7f3e-11aa', sessionId: 'antigravity:7f3e-11aa', providerId: 'antigravity' }), agent({ id: 'x y', sessionId: 'x y' })]).external;
  assert.equal(a.md.id, 'antigravity:7f3e-11aa');
  assert.equal(b.md.id, null, 'one a link cannot carry: no button for it');
});

test('a teammate is left out, unless the office has that Claude session itself (a lead an older MyDesk flagged)', () => {
  // what MyDesk lists after a TeammateIdle that carried no agent_id: the flag on the session the hook named
  const list = [
    agent({ id: 'lead', sessionId: 'lead', metadata: { isTeammate: true, teamName: 'session-a1b2c3d4', projectPath: 'D:\\w' } }),
    agent({ id: 'mate', sessionId: 'mate', metadata: { isTeammate: true, parentId: 'lead' } }),
    agent({ id: 'cx', sessionId: 'cx', providerId: 'codex', metadata: { isTeammate: true } }),
  ];
  assert.deepEqual(castOf(list).external.map((x) => x.id), [], 'the office knows none of them: all out, as before');
  const c = castOf(list, { own: (sid) => sid === 'lead' || sid === 'cx' });
  assert.deepEqual([...c.claude], ['lead'], 'the lead the office has stays in');
  assert.deepEqual(c.external.map((x) => x.id), ['lead'], 'another CLI is never one the office has');
});

test('createMyDesk passes own() on to the cast', async () => {
  const m = createMyDesk({ dataDir: tmp(), env: { OFFICE_MYDESK_URL: 'http://127.0.0.1:3000' }, everyMs: 0, own: (sid) => sid === 'lead',
    fetchImpl: reply([agent({ id: 'lead', sessionId: 'lead', metadata: { isTeammate: true } })]) });
  await m.poll();
  assert.equal(m.allows('lead'), true);
});

test("MyDesk's language with its link: only one the office speaks, and only a change", () => {
  assert.equal(langFrom({ url: 'x', lang: 'vi' }, 'en'), 'vi');
  assert.equal(langFrom({ lang: 'vi' }, 'vi'), '', 'already speaks it: nothing to switch (no page reloads)');
  assert.equal(langFrom({ lang: 'xx' }, 'en'), '');
  assert.equal(langFrom({ lang: '__proto__' }, 'en'), '');
  assert.equal(langFrom({ url: 'x' }, 'en'), '', 'an older MyDesk sends none');
  assert.equal(langFrom(null, 'en'), '');
});

test("the MyDesk page a click opens: a person's Inspector, a held task's Work page, else its project", () => {
  assert.equal(mydeskHash({ agentId: '3f2a9c1e-77b0-4d6e-9a51-0c2f8e1b5d44' }), '#/agents/3d?inspect=3f2a9c1e-77b0-4d6e-9a51-0c2f8e1b5d44');
  assert.equal(mydeskHash({ agentId: 'antigravity:7f3e-11aa' }), '#/agents/3d?inspect=antigravity%3A7f3e-11aa', "another CLI's ':' encoded");
  for (const bad of [null, '', 'a&itab=x', 'a?b', '<img>', 'x'.repeat(161), 42]) assert.equal(mydeskHash({ agentId: bad }), '', String(bad));
  assert.equal(mydeskHash({ projectId: 'p1', taskId: 't1', claimed: true }), '#/work/t1');
  assert.equal(mydeskHash({ projectId: 'p1', taskId: 't1', claimed: false }), '#/projects/p1?task=t1');
  assert.equal(mydeskHash({ projectId: 'p1' }), '#/projects/p1');
  assert.equal(mydeskHash({ taskId: 't1', claimed: true }), '', 'no project: refused, as before');
  assert.equal(mydeskHash({ projectId: 'p1', taskId: 't/1', claimed: true }), '#/projects/p1', 'a task id a link cannot carry is left out');
});

test("Codex's tool names in Claude's words; others as they come", () => {
  assert.deepEqual(['shell', 'exec_command', 'apply_patch', 'web_search', 'update_plan', 'Read', 'mcp__gh__search', '', null, '  ', 'toString'].map(extToolName),
    ['Bash', 'Bash', 'Edit', 'WebSearch', 'TodoWrite', 'Read', 'mcp__gh__search', '', '', '', 'toString']);
});

test('MyDesk\'s currentTool is "Tool: detail": the name is the part before the first ": "', () => {
  // as MyDesk's summarizeTool (src/utils.js) writes them, cut at 48 characters
  assert.equal(extToolName('Read: C:\\Users\\me\\app\\src\\index.js'), 'Read');
  assert.equal(extToolName('Bash: git commit -m "fix: the cart: total"'), 'Bash', 'a command with ": " in it');
  assert.equal(extToolName('Edit: D:\\Project\\[1]Personal\\a.ts'), 'Edit');
  assert.equal(extToolName('shell: npm run build'), 'Bash', "Codex's name with its detail");
  assert.equal(extToolName('apply_patch: *** Begin Patch'), 'Edit');
  assert.equal(extToolName('WebFetch: https://example.com/a'), 'WebFetch', 'no ": " before the URL\'s colon');
  assert.equal(extToolName('github · search_issues'), 'mcp__github__search_issues', 'an MCP tool as MyDesk shows it');
  assert.equal(extToolName('Grep'), 'Grep', 'a tool with no detail');
  assert.equal(extToolName(': odd'), ': odd'.trim(), 'nothing before the ": ": left as it is');
});

test('a spend mark while linked: none for a session that only looked, its numbers for one that did more', () => {
  const at = 1_000_000_000, st = { kind: 'cost', usd: 0.8, mins: 12, at };
  assert.equal(linkedCost(st, 0), 'skip', 'nothing but looking seen');
  assert.equal(linkedCost(st, at - 20 * 60e3), 'skip', 'its last command was before the spend began');
  assert.equal(linkedCost(st, at - 5 * 60e3), 'numbers');
  assert.equal(linkedCost(st, at - 12.5 * 60e3), 'numbers', 'a minute of slack for the rounded minutes');
  for (const t of ['Read', 'Grep', 'WebFetch', 'TodoWrite', 'Agent']) assert.ok(LOOK_TOOLS.has(t), t);
  for (const t of ['Bash', 'Edit', 'Write', 'mcp__db__query']) assert.ok(!LOOK_TOOLS.has(t), t);
});

test("the link is taken from MyDesk's own process only: JSON and no Origin, never a browser page's post", () => {
  // MyDesk's myOffice.link(): Node's fetch, { 'Content-Type': 'application/json' }, no Origin header
  assert.equal(linkAllowed({ host: '127.0.0.1:4310', 'content-type': 'application/json', 'user-agent': 'node' }), true);
  assert.equal(linkAllowed({ 'content-type': 'application/json; charset=utf-8' }), true);
  assert.equal(linkAllowed({ 'content-type': 'text/plain', origin: 'https://evil.example' }), false, 'a no-cors fetch from a page');
  assert.equal(linkAllowed({ 'content-type': 'application/x-www-form-urlencoded', origin: 'null' }), false, 'a form');
  assert.equal(linkAllowed({ 'content-type': 'application/json', origin: 'http://127.0.0.1:4310' }), false, 'even the office\'s own pages never link');
  assert.equal(linkAllowed({ 'content-type': 'text/plain' }), false, 'not JSON');
  assert.equal(linkAllowed({}), false);
});

test('own(): a lead MyDesk flagged before the office met it is let in once the office knows it (its hooks, its session file)', async () => {
  const known = new Set();
  const lead = agent({ id: 'lead', sessionId: 'lead', metadata: { isTeammate: true } });
  const m = createMyDesk({ dataDir: tmp(), env: { OFFICE_MYDESK_URL: 'http://127.0.0.1:3000' }, everyMs: 0, own: (sid) => known.has(sid), fetchImpl: reply([lead]) });
  await m.poll();
  assert.equal(m.allows('lead'), false, 'not met yet: out, as a teammate');
  known.add('lead');   // (its first hook held here, or its live session file found)
  await m.poll();
  assert.equal(m.allows('lead'), true);
});
