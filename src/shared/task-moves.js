// Task moves acted out on the floor (src/office/ui/task-moves.js), as Munder Difflin's office plays its ledger: MyDesk's
// board feed says a task was claimed, or a claimed one went to review or done, and the claimant — only when resting —
// walks to the task board, takes the note and carries it to their desk (a claim), or carries it from their desk back to
// the board (review, done). Someone at work does not get up: the note just moves. The board keeps showing the task where
// it was until the note is carried. Rules: one move a person, two on the floor at once, a first look never replays
// history, and after 30 s everything snaps to the true state. Plain functions, tested.

export const MAX_MOVES = 2;
export const WATCHDOG_S = 30;
const KINDS = new Set(['claim', 'review', 'done']);

/** Moves a page has not looked at yet -> { act: [move] (to act out, oldest first), skip: [move] (just updated), seen }.
    moves: [{ seq, taskId, kind ('claim' | 'review' | 'done'), to (the claimant's office id), from, title }];
    seen: the highest seq this page has looked at (null on its first look: nothing is acted, the past is not replayed);
    opts: { working(id) -> true when that person is at work (or waiting on you), present(id) -> true when they are on the
    floor at a desk, moving: Set of ids already acting a move, active: how many moves are on the floor now, max }.
    Several moves of one task in one look: only its last is acted (the earlier ones are past already). */
export function movesToAct(moves, seen, { working = () => false, present = () => true, moving = new Set(), active = 0, max = MAX_MOVES } = {}) {
  const list = (Array.isArray(moves) ? moves : []).filter((m) => m && Number.isFinite(m.seq) && m.taskId && KINDS.has(m.kind));
  const top = list.reduce((a, m) => Math.max(a, m.seq), seen ?? -Infinity);
  if (seen === null || seen === undefined) return { act: [], skip: [], seen: Number.isFinite(top) ? top : 0 };   // (none yet: every one after is new)
  const fresh = list.filter((m) => m.seq > seen).sort((a, b) => a.seq - b.seq);
  const last = new Map();
  for (const m of fresh) last.set(m.taskId, m);
  const act = [], skip = [], busy = new Set(moving);
  let n = active;
  for (const m of fresh) {
    if (last.get(m.taskId) !== m || !m.to || !present(m.to) || working(m.to) || busy.has(m.to) || n >= max) { skip.push(m); continue; }
    act.push(m); busy.add(m.to); n++;
  }
  return { act, skip, seen: Number.isFinite(top) ? top : seen };
}

/** The legs of a move: where the note is picked up and where it is put down. A claim: at the board, then at the desk.
    Review or done: from the desk when the note was pinned there (pinned: the board showed it at the claimant's desk),
    else (from the review column to done) the note goes from one column to the other at the board. */
export function legsOf(move, pinned) {
  if (move.kind === 'claim') return [{ at: 'board', act: 'pick' }, { at: 'desk', act: 'place' }];
  if (pinned) return [{ at: 'desk', act: 'pick' }, { at: 'board', act: 'place' }];
  return [{ at: 'board', act: 'pick' }, { at: 'board', act: 'place' }];
}

/** The task as it was before the move (what the board keeps showing until the note is picked up): `old` is the copy
    the page last showed, when it had one. A claim: on the board, unclaimed; review / done: in progress at the
    claimant's desk (or, from review to done, in the review column). */
export function before(task, move, old) {
  if (old && old.id === task.id) return { ...task, status: old.status, claimedBy: old.claimedBy ?? null };
  if (move.kind === 'claim') return { ...task, status: move.from && move.from !== 'in_progress' ? move.from : 'todo', claimedBy: null };
  return move.from === 'review' ? { ...task, status: 'review' } : { ...task, status: 'in_progress', claimedBy: move.to };
}

/** The tasks as the floor shows them while moves are under way. holds: Map(taskId -> { phase, task (the before copy) }):
    phase 'before' shows the before copy, 'carry' shows nothing (the note is in a hand), anything else the truth. A task
    held 'before' that has left the list (done and pushed off its recent few) is shown from its copy. */
export function heldTasks(tasks, holds) {
  if (!holds || !holds.size) return tasks;
  const out = [], seen = new Set();
  for (const t of tasks) {
    const h = t && holds.get(t.id);
    if (t) seen.add(t.id);
    if (!h) out.push(t);
    else if (h.phase === 'before') out.push(h.task);
    else if (h.phase !== 'carry') out.push(t);
  }
  for (const [id, h] of holds) if (!seen.has(id) && h.phase === 'before' && h.task) out.push(h.task);
  return out;
}

/** Is a move overdue (started at `since`, seconds; now `now`)? Then everything snaps to the true state. */
export const overdue = (since, now, limit = WATCHDOG_S) => now - since > limit || now < since;
