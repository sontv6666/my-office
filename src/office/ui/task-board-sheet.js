// The task board, read up close: a click on the wall board opens this sheet — MyDesk's Projects tasks in four columns
// (to do, doing, review, done), each with who holds it. Built from the board the wall already shows
// (shared/task-board.js), no extra fetch. With more than one project, chips at the top pick one (All, then each project
// with its open tasks, the busiest first; shared/task-projects.js) and the columns show only its tasks; the choice is
// kept for the tab's session. Esc, the × or a click outside closes it. Nothing here moves.
import { el } from '../core/env.js';
import { dn, sessions } from '../people/workers.js';
import { toast } from './activity.js';
import { boardProjects, filterBoard, pickProject } from '../../shared/task-projects.js';
import { t as tr } from '../../i18n/index.js';

let root = null;
const KEY = 'office-task-project';   // (sessionStorage: the project picked, as JSON; null = all of them)
let remembered = null;
try { remembered = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { /* storage blocked */ }
function remember(id) { remembered = id; try { sessionStorage.setItem(KEY, JSON.stringify(id)); } catch { /* storage blocked */ } }

function close() { if (root) { root.remove(); root = null; } }

async function openInMyDesk(t) {
  try {
    const r = await fetch('/api/mydesk/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: t.projectId, taskId: t.id }) });
    const ok = r.ok && (await r.json()).ok;
    if (ok) close(); else toast(tr('board.tasks.openFailed'), 4000);
  } catch { toast(tr('board.tasks.openFailed'), 4000); }
}

const dot = (color) => { const d = el('span', 'tbs-dot'); d.style.background = color; d.setAttribute('aria-hidden', 'true'); return d; };

// a task: its title, then its project (in "All", with several projects) and who holds it
function row(t, project, holder) {
  const li = el('li');
  const b = el('button', 'tbs-task'); b.type = 'button'; b.title = tr('board.tasks.open');
  b.append(el('span', 'tbs-title', t.title || t.id));
  const meta = [project && (project.name || tr('board.tasks.noProject')), holder].filter(Boolean).join(' · ');
  if (meta) { const m = el('span', 'tbs-meta'); if (project) m.append(dot(project.color)); m.append(meta); b.append(m); }
  if (t.projectId) b.addEventListener('click', () => openInMyDesk(t)); else b.disabled = true;
  li.append(b);
  return li;
}

/** all: shared/task-board.js taskBoard(); projects: [{ id, name }] as MyDesk sends them. */
export function openTaskSheet(all, projects = []) {
  close();
  const list = boardProjects(all, projects), byId = new Map(list.map((p) => [p.id, p]));
  const holder = (sid) => (sid ? dn(sessions.get(sid)) || '' : '');
  let pick = pickProject(list, remembered);
  root = el('div', 'tbs-backdrop');
  const sheet = el('section', 'tbs');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', tr('board.tasks.name'));
  const head = el('header', 'tbs-head');
  head.append(el('h2', 'tbs-h', tr('board.tasks.title')), el('span', 'tbs-sub', tr('board.tasks.sub')));
  const x = el('button', 'tbs-close', '×'); x.type = 'button'; x.setAttribute('aria-label', tr('board.tasks.close')); x.addEventListener('click', close);
  head.append(x);
  sheet.append(head);
  const grid = el('div', 'tbs-cols');
  function render() {
    const b = filterBoard(all, pick), tagged = pick === null && list.length > 1;
    const proj = (t) => (tagged ? byId.get(t.projectId != null ? String(t.projectId) : '') : null);
    const cols = [
      ['todo', b.todo.map((t) => ({ t, who: '' }))],
      ['doing', [...b.pinned.map((p) => ({ t: p.task, who: holder(p.sessionId) })), ...b.doing.map((t) => ({ t, who: holder(t.claimedBy) }))]],
      ['review', b.review.map((t) => ({ t, who: holder(t.claimedBy) }))],
      ['done', b.done.map((t) => ({ t, who: '' }))],
    ];
    grid.replaceChildren();
    for (const [key, items] of cols) {
      const col = el('div', 'tbs-col tbs-col--' + key);
      const n = key === 'done' ? b.doneTotal : items.length;
      col.append(el('h3', 'tbs-ch', `${tr('board.tasks.' + key)} · ${n}`));
      const ul = el('ul', 'tbs-list');
      for (const { t, who } of items.slice(0, 40)) ul.append(row(t, proj(t), who));
      if (!items.length) ul.append(el('li', 'tbs-empty', '—'));
      col.append(ul);
      grid.append(col);
    }
  }
  // the project filter: All, then each project with its open tasks; none with a single project
  if (list.length > 1) {
    const chips = el('div', 'tbs-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', tr('board.tasks.filter'));
    const chip = (id, label, n, color) => {
      const c = el('button', 'tbs-chip'); c.type = 'button';
      if (color) c.append(dot(color));
      c.append(el('span', 'tbs-chip-name', label), el('span', 'tbs-chip-n', String(n)));
      c.setAttribute('aria-pressed', String(id === pick));
      c.addEventListener('click', () => {
        pick = id; remember(id);
        for (const o of chips.children) o.setAttribute('aria-pressed', String(o === c));
        render();
      });
      return c;
    };
    chips.append(chip(null, tr('board.tasks.allProjects'), all.count));
    for (const p of list) chips.append(chip(p.id, p.name || tr('board.tasks.noProject'), p.open, p.color));
    sheet.append(chips);
  }
  render();
  sheet.append(grid);
  if (!all.count && !all.doneTotal) sheet.append(el('p', 'tbs-none', tr('board.tasks.emptySheet')));
  sheet.append(el('p', 'tbs-foot', tr('board.tasks.foot')));
  root.append(sheet);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.body.append(root);
  x.focus();
}

export function setup() {
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root) close(); });
}
