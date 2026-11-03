// The task board, read up close: a click on the wall board opens this sheet — MyDesk's Projects tasks in four columns
// (to do, doing, review, done), each with its project and who holds it. Built from the board the wall already shows
// (shared/task-board.js), no extra fetch. Esc, the × or a click outside closes it. Nothing here moves.
import { el } from '../core/env.js';
import { dn, sessions } from '../people/workers.js';
import { t as tr } from '../../i18n/index.js';

let root = null;

function close() { if (root) { root.remove(); root = null; } }

function row(t, projects, holder) {
  const li = el('li', 'tbs-task');
  li.append(el('span', 'tbs-title', t.title || t.id));
  const meta = [projects.get(t.projectId), holder].filter(Boolean).join(' · ');
  if (meta) li.append(el('span', 'tbs-meta', meta));
  return li;
}

/** b: shared/task-board.js taskBoard(); projects: [{ id, name }] as MyDesk sends them. */
export function openTaskSheet(b, projects = []) {
  close();
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const holder = (sid) => (sid ? dn(sessions.get(sid)) || '' : '');
  const doing = [...b.pinned.map((p) => ({ t: p.task, who: holder(p.sessionId) })), ...b.doing.map((t) => ({ t, who: holder(t.claimedBy) }))];
  const cols = [
    ['todo', b.todo.map((t) => ({ t, who: '' }))],
    ['doing', doing],
    ['review', b.review.map((t) => ({ t, who: holder(t.claimedBy) }))],
    ['done', b.done.map((t) => ({ t, who: '' }))],
  ];
  root = el('div', 'tbs-backdrop');
  const sheet = el('section', 'tbs');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', tr('board.tasks.name'));
  const head = el('header', 'tbs-head');
  head.append(el('h2', 'tbs-h', tr('board.tasks.title')), el('span', 'tbs-sub', tr('board.tasks.sub')));
  const x = el('button', 'tbs-close', '×'); x.type = 'button'; x.setAttribute('aria-label', tr('board.tasks.close')); x.addEventListener('click', close);
  head.append(x);
  const grid = el('div', 'tbs-cols');
  for (const [key, items] of cols) {
    const col = el('div', 'tbs-col tbs-col--' + key);
    const n = key === 'done' ? b.doneTotal : items.length;
    col.append(el('h3', 'tbs-ch', `${tr('board.tasks.' + key)} · ${n}`));
    const ul = el('ul', 'tbs-list');
    for (const { t, who } of items.slice(0, 40)) ul.append(row(t, names, who));
    if (!items.length) ul.append(el('li', 'tbs-empty', '—'));
    col.append(ul);
    grid.append(col);
  }
  sheet.append(head, grid);
  if (!b.count && !b.doneTotal) sheet.append(el('p', 'tbs-none', tr('board.tasks.emptySheet')));
  sheet.append(el('p', 'tbs-foot', tr('board.tasks.foot')));
  root.append(sheet);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  document.body.append(root);
  x.focus();
}

export function setup() {
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root) close(); });
}
