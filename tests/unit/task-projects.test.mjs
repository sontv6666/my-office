import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskBoard } from '../../src/shared/task-board.js';
import { PROJECT_COLORS, boardProjects, filterBoard, pickProject, projectColor, projectColors } from '../../src/shared/task-projects.js';

// three projects, as server/mydesk.mjs boardFor() hands them to the page
const RAW = {
  tasks: [
    { id: 'a1', title: 'Cart total', status: 'in_progress', projectId: 'shop', claimedBy: 'office-1' },
    { id: 'a2', title: 'Coupons', status: 'ready', projectId: 'shop' },
    { id: 'a3', title: 'Old cart', status: 'done', projectId: 'shop' },
    { id: 'b1', title: 'Docs', status: 'backlog', projectId: 'docs' },
    { id: 'b2', title: 'Guide', status: 'backlog', projectId: 'docs' },
    { id: 'b3', title: 'FAQ', status: 'todo', projectId: 'docs' },
    { id: 'c1', title: 'Login', status: 'review', projectId: 'api' },
    { id: 'n1', title: 'Loose end', status: 'todo', projectId: null },
  ],
  projects: [{ id: 'shop', name: 'Shop' }, { id: 'docs', name: 'Docs site' }],
  doneTotal: 12,
};
const PROJECTS = RAW.projects;
const board = () => taskBoard(RAW, (id) => id === 'office-1');

test('each project on the board once, with its open, under-way and done counts; the busiest first', () => {
  const list = boardProjects(board(), PROJECTS);
  assert.deepEqual(list.map((p) => [p.id, p.name, p.open, p.active, p.done]), [
    ['shop', 'Shop', 2, 1, 1],   // one under way (pinned at a desk counts), one to do
    ['api', 'api', 1, 1, 0],     // MyDesk did not name it: its id
    ['docs', 'Docs site', 3, 0, 0],
    ['', '', 1, 0, 0],           // the tasks without a project, last among equals
  ]);
  const colors = projectColors(PROJECTS);
  for (const p of list) assert.equal(p.color, colors.get(p.id) || projectColor(p.id), 'listed by MyDesk: its colour; else from its id');
});

test("MyDesk's projects each get a colour of their own, the same every time; a newer one never takes an older one's", () => {
  const ids = Array.from({ length: PROJECT_COLORS.length }, (_, i) => ({ id: `proj_${String(i).padStart(3, '0')}` }));
  const all = projectColors(ids);
  assert.equal(new Set(all.values()).size, PROJECT_COLORS.length, 'as many projects as colours: all different');
  assert.deepEqual([...projectColors([...ids].reverse())], [...all], 'whatever order MyDesk lists them in');
  const older = projectColors(ids.slice(0, 5));
  for (const [id, c] of older) assert.equal(all.get(id), c, "projects made later leave the older ones' colours alone");
  const more = projectColors([...ids, { id: 'proj_999' }, { id: 'proj_998' }]);
  assert.ok(PROJECT_COLORS.includes(more.get('proj_999')), 'past the palette they share');
  assert.equal(projectColors(null).size, 0);
});

test('a project keeps its colour whatever else is on the board', () => {
  assert.equal(projectColor('shop'), projectColor('shop'));
  assert.ok(PROJECT_COLORS.includes(projectColor('shop')));
  assert.ok(PROJECT_COLORS.includes(projectColor('')));
  assert.ok(PROJECT_COLORS.includes(projectColor(null)));
  const many = new Set(Array.from({ length: 60 }, (_, i) => projectColor(`proj_${i}`)));
  assert.ok(many.size >= PROJECT_COLORS.length - 2, 'ids spread over the palette');
  const solo = boardProjects(taskBoard({ tasks: [{ id: 'x', status: 'todo', projectId: 'shop' }] }), PROJECTS);
  assert.equal(solo[0].color, boardProjects(board(), PROJECTS)[0].color);
});

test('one project only: every column, the desk pins and the done pile cut to it', () => {
  const b = board();
  const shop = filterBoard(b, 'shop');
  assert.deepEqual(shop.todo.map((t) => t.id), ['a2']);
  assert.deepEqual(shop.pinned.map((p) => p.task.id), ['a1'], 'a claimed task stays at its claimant\'s desk');
  assert.deepEqual(shop.done.map((t) => t.id), ['a3']);
  assert.equal(shop.doneTotal, 1, 'its own done tasks, not every project\'s');
  assert.equal(shop.count, 2);
  const api = filterBoard(b, 'api');
  assert.deepEqual([api.review.map((t) => t.id), api.todo, api.count], [['c1'], [], 1]);
  assert.deepEqual(filterBoard(b, '').todo.map((t) => t.id), ['n1'], 'the tasks without a project');
  assert.equal(filterBoard(b, 'gone').count, 0);
  assert.equal(filterBoard(b, null), b, 'all: the board as it is');
  assert.equal(filterBoard(b, undefined), b);
  assert.equal(b.todo.length, 5, 'the board itself is left as it was');
});

test('the sheet opens on the remembered project while it still has tasks; with one project, no filter', () => {
  const list = boardProjects(board(), PROJECTS);
  assert.equal(pickProject(list, 'docs'), 'docs');
  assert.equal(pickProject(list, ''), '', 'the no-project chip can be remembered too');
  assert.equal(pickProject(list, 'gone'), null);
  assert.equal(pickProject(list, null), null);
  assert.equal(pickProject(list.slice(0, 1), 'shop'), null);
  assert.equal(pickProject(null, 'shop'), null);
});

test('no board: no projects', () => {
  assert.deepEqual(boardProjects(null), []);
  assert.deepEqual(boardProjects(taskBoard({ tasks: [] })), []);
});
