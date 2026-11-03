// The task board with many projects (src/office/ui/task-board.js on the wall, ui/task-board-sheet.js up close): which
// projects are on it, a colour of its own for each (the same colour wherever and whenever it shows), and the board
// cut down to one project for the sheet's filter. Plain functions, tested.

// mid tones that read on the cork, on every note colour (yellow, blue, teal, green) and on the sheet's light and dark
export const PROJECT_COLORS = ['#D9534F', '#E8742A', '#B8901A', '#5E9E3A', '#2A9D8F', '#3F7CC4', '#5B5FC7', '#8E5BB5', '#C2508A', '#7A5C48', '#4F6D7A', '#A0522D'];

function hash(id) {   // FNV-1a
  let h = 0x811c9dc5;
  for (const c of String(id ?? '')) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
/** A colour from a project's id alone (for one MyDesk did not list). */
export const projectColor = (id) => PROJECT_COLORS[hash(id) % PROJECT_COLORS.length];

/** MyDesk's projects ([{ id }]) -> Map id -> colour: each from its id, the next free one when another project already
    has it, taken in id order (MyDesk's ids grow with time, so a new project never takes an older one's colour). Up to
    PROJECT_COLORS.length projects all differ; past that they share. */
export function projectColors(projects) {
  const ids = [...new Set((Array.isArray(projects) ? projects : []).filter((p) => p && p.id != null).map((p) => String(p.id)))].sort();
  const N = PROJECT_COLORS.length, used = new Set(), out = new Map();
  for (const id of ids) {
    let k = hash(id) % N;
    if (used.size < N) while (used.has(k)) k = (k + 1) % N;
    used.add(k); out.set(id, PROJECT_COLORS[k]);
  }
  return out;
}

const keyOf = (t) => (t && t.projectId != null ? String(t.projectId) : '');

/** b: shared/task-board.js taskBoard(); projects: [{ id, name }] as MyDesk sends them.
    -> the projects with a task on the board: [{ id ('' for tasks without one), name (the id when MyDesk did not name
    it, '' for none), open, active (doing + review), done, color (projectColors()) }], the busiest first: most under way, then most
    open, then by name. */
export function boardProjects(b, projects = []) {
  if (!b) return [];
  const names = new Map((Array.isArray(projects) ? projects : []).filter((p) => p && p.id != null).map((p) => [String(p.id), String(p.name || '')]));
  const colors = projectColors(projects);
  const by = new Map();
  const add = (t, field) => {
    const id = keyOf(t);
    let p = by.get(id);
    if (!p) by.set(id, (p = { id, name: id ? names.get(id) || id : '', open: 0, active: 0, done: 0, color: colors.get(id) || projectColor(id) }));
    p[field]++;
    if (field === 'active') p.open++;
  };
  for (const t of b.todo) add(t, 'open');
  for (const t of [...b.doing, ...b.review, ...b.pinned.map((p) => p.task)]) add(t, 'active');
  for (const t of b.done) add(t, 'done');
  return [...by.values()].sort((x, y) => y.active - x.active || y.open - x.open || y.done - x.done
    || (!x.id) - (!y.id) || x.name.localeCompare(y.name) || x.id.localeCompare(y.id));
}

/** The board with one project's tasks only ('' = the tasks without a project; null/undefined = all of them, b itself).
    Its done pile counts the done tasks it has (MyDesk's doneTotal is for every project). */
export function filterBoard(b, projectId) {
  if (!b || projectId === null || projectId === undefined) return b;
  const id = String(projectId), mine = (t) => keyOf(t) === id;
  const out = { todo: b.todo.filter(mine), doing: b.doing.filter(mine), review: b.review.filter(mine), done: b.done.filter(mine), pinned: b.pinned.filter((p) => mine(p.task)) };
  out.count = out.todo.length + out.doing.length + out.review.length + out.pinned.length;
  out.doneTotal = out.done.length;
  return out;
}

/** The filter the sheet opens with: the one remembered when it still has tasks on the board, else all (null). With a
    single project there is nothing to choose (null). */
export function pickProject(list, remembered) {
  if (!Array.isArray(list) || list.length < 2 || remembered === null || remembered === undefined) return null;
  return list.some((p) => p.id === remembered) ? remembered : null;
}
