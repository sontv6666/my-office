// The office's cast from MyDesk (an agent dashboard that shows this office as its 3D view): when linked, MyDesk says
// which sessions exist and the office shows exactly those, so its 2D office and this one hold the same people. The
// office still reads everything else itself (hooks, transcripts, git): MyDesk only decides who is in.
//
// Linked by POST /api/mydesk {url} from MyDesk (loopback only), or OFFICE_MYDESK_URL; the url is kept in
// data/mydesk.json so a restart links again. MyDesk's GET <url>/api/agents is read every 2 s:
//   - a Claude Code session is in when MyDesk lists it (its sessionId); its subagents follow it as usual;
//   - an agent of another CLI (Codex, Gemini…) has no session file or hooks here, so it is shown from MyDesk's
//     record alone (`external`); so is a Claude session MyDesk lists that the office cannot find (yet), until it does;
//   - MyDesk not answering 3 times in a row (it was closed): the office goes back to showing every session it finds.
import fs from 'node:fs';
import path from 'node:path';

const FAILS_TO_UNLINK = 3;

/** MyDesk's status -> the office's three. */
export function officeStatus(status) {
  if (status === 'working' || status === 'thinking') return 'work';
  if (status === 'waiting' || status === 'help') return 'wait';
  return 'rest';
}

/** The office's agent tag for a MyDesk provider id ('' for Claude Code, the office's default). */
export function agentTag(providerId) {
  const p = String(providerId || '').toLowerCase();
  if (!p || p === 'claude') return '';
  if (p.includes('codex')) return 'codex';
  if (p.includes('gemini') || p.includes('antigravity')) return 'gemini';
  return p;
}

/** What MyDesk knows of an agent beyond the office's three statuses, kept with its record (`md`):
    - state: MyDesk's own status (working, thinking, waiting, help, completed, error, idle): an error is not a rest;
    - unreviewed: it finished and you have not looked at it in MyDesk yet;
    - parentId: the session it works for (MyDesk's metadata.parentId), or null;
    - toolWarning: the tool it is running cannot be undone (MyDesk's irreversible-tool check);
    - projectColor: MyDesk's colour for its project ('#rrggbb'), or null. */
export function mydeskInfo(a) {
  const st = String(a?.status || '');
  const color = String(a?.projectColor || '');
  return {
    state: /^[a-z_]{1,24}$/.test(st) ? st : 'idle',
    unreviewed: !!a?.unreviewed,
    parentId: a?.metadata?.parentId ? String(a.metadata.parentId) : null,
    toolWarning: !!a?.toolWarning,
    projectColor: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null,
  };
}

/** Lay MyDesk's record (`md`, mydeskInfo()) on one of the office's sessions -> true when it changed (the page is told
    again then). null takes it off (MyDesk gone, or it no longer lists that session). */
export function applyMydesk(s, md) {
  const next = md ? { ...md } : null;
  if (JSON.stringify(s.md ?? null) === JSON.stringify(next)) return false;
  s.md = next;
  return true;
}

/** /api/agents -> who is in: { claude: Set(sessionId), external: [{ id, name, cwd, status, agent, tool, md }] } — external holds
    every agent's record (agent '' for Claude Code), the stand-in when the office has no session of its own; md is
    mydeskInfo(). Subagents are left out. */
export function castOf(list) {
  const claude = new Set(), external = [];
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || typeof a !== 'object' || a.metadata?.isSubagent || a.metadata?.isTeammate) continue;
    const id = String(a.sessionId || a.id || '');
    if (!id) continue;
    const tag = agentTag(a.providerId);
    if (!tag) claude.add(id);
    external.push({
      id, name: String(a.name || tag || 'claude'), cwd: String(a.metadata?.projectPath || ''), status: officeStatus(a.status), agent: tag,
      tool: a.currentTool ? String(a.currentTool) : '', md: mydeskInfo(a),
    });
  }
  return { claude, external };
}

const sameCast = (a, b) => !!a && !!b && a.claude.size === b.claude.size && [...a.claude].every((x) => b.claude.has(x))
  && JSON.stringify(a.external) === JSON.stringify(b.external);

/** MyDesk's Projects board (GET <url>/api/v2/office/board) -> what the office wall shows, or null when it is not one:
    { tasks: [{ id, title, status, priority, projectId, claimedBy }], projects: [{ id, name }], doneTotal }.
    claimedBy becomes the office's own session id by officeIdOf(MyDesk's session id) (null: not on the floor). */
export function boardFor(raw, officeIdOf = () => null) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) return null;
  const str = (v, n) => String(v ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, n);
  const tasks = raw.tasks.slice(0, 300).filter((t) => t && typeof t === 'object' && t.id != null).map((t) => ({
    id: str(t.id, 64), title: str(t.title, 160), status: /^[a-z_]{1,24}$/.test(String(t.status)) ? String(t.status) : 'backlog',
    priority: Number.isFinite(t.priority) ? t.priority : null, projectId: t.projectId == null ? null : str(t.projectId, 64),
    claimedBy: t.claimedBy ? officeIdOf(String(t.claimedBy)) || null : null,
  }));
  const projects = (Array.isArray(raw.projects) ? raw.projects : []).slice(0, 100).filter((p) => p && p.id != null).map((p) => ({ id: str(p.id, 64), name: str(p.name, 80) }));
  // handoffs MyDesk sent (task events handoff_sent, kept by createMyDesk().board()): to = the receiving session here
  const handoffs = (Array.isArray(raw.handoffs) ? raw.handoffs : []).slice(-20)
    .map((h) => ({ seq: Number(h && h.seq), taskId: str(h && h.taskId, 64), to: h && h.sessionId ? officeIdOf(String(h.sessionId)) || null : null }))
    .filter((h) => Number.isFinite(h.seq) && h.to);
  return { tasks, projects, doneTotal: Number.isFinite(raw.doneTotal) ? raw.doneTotal : tasks.filter((t) => t.status === 'done').length, handoffs };
}

/**
 * createMyDesk({ dataDir, onChange(cast|null), fetchImpl, env }) -> { link(url), allows(sid), cast(), status(), poll(), md(id), board() }.
 * board() is MyDesk's Projects board as it sends it (boardFor() makes it the wall's), null when there is none.
 * cast() is null while not linked (or MyDesk is gone): then every session is allowed.
 * md(agentId) is MyDesk's record of that agent (mydeskInfo()), null when it has none. The server lays it on its sessions
 * when the cast changes and sends it to the page with each session:
 *   syncCast():  for (const s of sessions.values()) if (applyMydesk(s, mydesk.md(agentIdOf(s)))) broadcast({ k: 'sess', s: pub(s) });
 *   pub(s):      md: s.md || null
 */
export function createMyDesk({ dataDir, onChange = () => {}, fetchImpl = fetch, env = process.env, everyMs = 2000 } = {}) {
  const FILE = path.join(dataDir, 'mydesk.json');
  let url = '', cast = null, fails = 0, inflight = null;

  const clean = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(x.hostname) ? x.origin : ''; } catch { return ''; } };
  url = clean(env.OFFICE_MYDESK_URL);
  if (!url) { try { url = clean(JSON.parse(fs.readFileSync(FILE, 'utf8')).url); } catch { /* not linked */ } }

  function set(next) {
    if (next === null ? cast === null : sameCast(cast, next)) return;
    cast = next;
    onChange(cast);
  }

  /** Read MyDesk once (a read already under way is shared, never doubled). */
  function poll() {
    if (!url) return Promise.resolve();
    return (inflight ??= (async () => {
      try {
        const r = await fetchImpl(`${url}/api/agents`, { signal: AbortSignal.timeout(1500) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        fails = 0;
        set(castOf(await r.json()));
      } catch {
        if (++fails >= FAILS_TO_UNLINK) set(null);
      }
    })().finally(() => { inflight = null; }));
  }

  /** Link to MyDesk at `u` (a loopback http origin). -> false when the url is not one. */
  function link(u) {
    const next = clean(u);
    if (!next) return false;
    if (next !== url) {
      url = next; fails = 0;
      try { fs.writeFileSync(FILE, JSON.stringify({ url })); } catch { /* data dir read-only: linked until restart */ }
    }
    poll();
    return true;
  }

  /** MyDesk's Projects board, read when an office page asks (every few seconds while one is open): null when not
      linked, MyDesk gone, or its projects not ready. */
  // (the feed's events after a cursor: the first read takes none — a cold start never replays — then each read the
  // new ones; handoffs are kept, the last 20, with their seq, so every page sees each once whatever its timing)
  let boardCursor = null;
  const handoffs = [];
  async function board() {
    if (!url || !cast) return null;
    try {
      const q = boardCursor === null ? '' : `?since=${encodeURIComponent(boardCursor)}`;
      const r = await fetchImpl(`${url}/api/v2/office/board${q}`, { signal: AbortSignal.timeout(1500) });
      if (!r.ok) return null;
      const raw = await r.json();
      if (raw && raw.cursor != null) boardCursor = raw.cursor;
      for (const e of (raw && Array.isArray(raw.events) ? raw.events : [])) {
        if (e && e.type === 'handoff_sent' && e.payload && e.payload.sessionId) handoffs.push({ seq: e.seq, taskId: e.taskId, sessionId: e.payload.sessionId });
      }
      handoffs.splice(0, Math.max(0, handoffs.length - 20));
      return raw && typeof raw === 'object' ? { ...raw, handoffs: handoffs.slice() } : raw;
    } catch { return null; }
  }

  if (everyMs > 0) setInterval(poll, everyMs).unref();
  if (url) poll();

  return {
    link,
    poll,
    board,
    allows: (sid) => !cast || (!!sid && cast.claude.has(sid)),
    cast: () => cast,
    md: (id) => (cast && id && cast.external.find((x) => x.id === id)?.md) || null,
    status: () => ({ url, linked: !!cast, sessions: cast ? cast.external.length : null }),
  };
}
