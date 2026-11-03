// Task moves acted out on the floor, as Munder Difflin's office plays its ledger (src/shared/task-moves.js decides who
// moves): MyDesk's board feed says a task was claimed, and the claimant — only while resting — gets up, walks to the
// task board, takes the note and carries it to their desk; a claimed task going to review or done, they carry it from
// their desk back to the board. Someone at work stays put: the board and the desk note just change. The board keeps
// showing the task where it was until the note is picked up; while it is carried the bubble is the task's real title.
// One move a person, two on the floor at once, none on a page's first look; after 30 s (or the person called to work)
// everything snaps to the true state. ui/task-board.js hands each board read here and draws what heldTasks() says.
import * as THREE from 'three';
import { reduceMotion, replay, short } from '../core/env.js';
import { state } from '../core/state.js';
import { mat } from '../scene/blocks.js';
import { sessions, workers } from '../people/workers.js';
import { wayTo, standBy } from '../people/navigation.js';
import { asleep, free } from '../people/errands.js';
import { WATCHDOG_S, before, heldTasks, legsOf, movesToAct, overdue } from '../../shared/task-moves.js';

const NOTE = { todo: '#F2DF8A', doing: '#9ECBF0', review: '#A7E3DC' };   // (the note as the board or the desk showed it: ui/task-board.js)
const active = new Map();   // task id -> { move, w, phase ('before' | 'carry'), task (the before copy), since (s), note (mesh), errand }
let seen = null;            // the highest move seq this page has looked at (null: none yet; its first look acts nothing)
let hooks = { redraw: () => {}, boardAt: () => null };
let timer = 0;
const nowS = () => performance.now() / 1000;
const atDesk = (id) => (sessions.get(id)?.desk ?? -1) >= 0 && workers.has(id);
// free to get up for it: in place and not in the middle of something (asleep at the desk counts: they wake for it)
const canGo = (w) => !!w && (free(w) || (asleep(w) && !w.chore && !w.after && !w.want?.priority));

export function setMoveHooks(h) { hooks = { ...hooks, ...h }; }
/** The tasks as the floor shows them now (each task under way where it was, or in a hand). */
export const shownTasks = (tasks) => heldTasks(tasks, active);
/** Under way now (?debug, tests): [{ taskId, kind, to, phase }] */
export const movesNow = () => [...active.values()].map((a) => ({ taskId: a.move.taskId, kind: a.move.kind, to: a.move.to, phase: a.phase }));

/** A board read: start the moves it brings that someone can act out (the rest just show). `last`: Map(task id -> task)
    of what the page showed before this read. */
export function takeMoves(raw, last) {
  const quiet = replay.on || reduceMotion || document.hidden;
  const plan = movesToAct(raw && raw.moves, seen, {
    working: (id) => sessions.get(id)?.status !== 'rest',
    present: (id) => !quiet && atDesk(id) && canGo(workers.get(id)),
    moving: new Set([...active.values()].map((a) => a.move.to)),
    active: active.size,
  });
  seen = plan.seen;
  const tasks = new Map((raw && Array.isArray(raw.tasks) ? raw.tasks : []).map((t) => [t.id, t]));
  for (const m of plan.act) {
    if (active.has(m.taskId)) continue;
    const task = tasks.get(m.taskId) || { id: m.taskId, title: m.title, status: m.kind === 'claim' ? 'in_progress' : m.kind, claimedBy: m.kind === 'claim' ? m.to : null };
    start(m, before(task, m, last.get(m.taskId)));
  }
}

function boardSpot(w, direct) {
  const b = hooks.boardAt(); if (!b) return null;
  return (direct && wayTo(w, b.x, b.z, [0, 1])) || standBy(b.x, b.z, [0, 1]);
}
function holdNote(w, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.15), mat(color, { roughness: 0.9 }));
  m.position.set(0, -0.06, 0.07); m.rotation.x = 0.3; m.userData.dynamic = true;
  w.P.armR.hand.add(m);
  return m;
}

function start(move, old) {
  const w = workers.get(move.to), d = sessions.get(move.to)?.desk ?? -1;
  if (!w || d < 0) return;
  const pinned = old.status === 'in_progress' && old.claimedBy === move.to;
  const [a, b] = legsOf(move, pinned);
  const desk = w.homeSpot(), b0 = hooks.boardAt();
  if (!desk || !b0) return;
  const at = (leg) => (leg.at === 'board' ? [b0.x, b0.z] : [desk.x, desk.z]);
  const there = (leg) => (leg.at === 'desk' ? w.station === 'desk' && Math.hypot(w.pos.x - desk.x, w.pos.y - desk.z) < 0.3 : false);
  const A = { move, w, phase: 'before', task: old, since: nowS(), note: null, errand: null };
  active.set(move.taskId, A);
  const title = state.streamer ? '▒▒▒▒ ▒▒▒ ▒▒▒▒▒' : short(old.title || move.title || '', 40);   // (the real title; hidden when streaming)
  const pick = () => {
    if (active.get(move.taskId) !== A) return null;
    A.phase = 'carry'; A.note = holdNote(w, move.kind === 'claim' ? NOTE.todo : pinned ? NOTE.doing : NOTE.review); hooks.redraw();
    return null;
  };
  const place = () => {
    if (active.get(move.taskId) !== A) return;
    end(A);
  };
  // leg one: the errand there (or in place, already at the desk); leg two: the errand's way back, to the other place
  const firstSpot = there(a) ? null : a.at === 'board' ? boardSpot(w, true) : desk;
  if (a.at === 'board' && !firstSpot) { active.delete(move.taskId); return; }
  const e = w.errand({ taskMove: move.taskId, spot: firstSpot, look: at(a), type: 'plan', anim: 'tidy', wait: w.anim === 'sleep' ? 1.4 : 0.8, hold: 0.9, linger: 0.4, line: title,
    at: () => { pick(); return title; },
    done: () => {
      place();
      if (b.at === 'board' && !w.leaving) w.goTo(w.homeSpot(), () => { w.station = 'desk'; });   // (put on the board: back to the desk, to rest)
    } });
  const second = b.at === 'board' ? (a.at === 'board' ? firstSpot : boardSpot(w, false)) : desk;
  e.b = { ...e.b, spot: second, station: b.at === 'desk' ? 'desk' : 'errand', say: null, shown: false };
  e.spot ||= second;   // (picked up in place: the way back still walks, to the board)
  A.errand = e;
  hooks.redraw();
  clearInterval(timer); timer = setInterval(watch, 1000);
}

// the move done (or snapped): the note out of the hand, the task shown as it truly is
function end(A, snap = false) {
  if (active.get(A.move.taskId) !== A) return;
  active.delete(A.move.taskId);
  if (A.note) { A.note.removeFromParent(); A.note.geometry.dispose(); A.note.material.dispose(); A.note = null; }
  const w = A.w;
  if (snap && w.chore === A.errand && !w.leaving) {   // called away mid-way: straight back to the desk, nothing more to do
    A.errand.done = null; A.errand.b = { ...A.errand.b, spot: w.homeSpot(), station: 'desk' };
    w.after = null; A.errand.spot ||= A.errand.b.spot;
    w.errandBack();
  }
  if (!active.size) { clearInterval(timer); timer = 0; }
  hooks.redraw();
}

// once a second while a move is under way: 30 s at most, and someone called to work (or gone) stops at once
function watch() {
  const now = nowS();
  for (const A of [...active.values()]) {
    const w = A.w, s = sessions.get(A.move.to);
    if (overdue(A.since, now, WATCHDOG_S) || !s || s.status !== 'rest' || workers.get(A.move.to) !== w || w.leaving || w.chore !== A.errand) end(A, true);
  }
}
