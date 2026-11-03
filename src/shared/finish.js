// A finished turn, told from what really happened: how long the person was busy on it and how many edits it made.
// Only a turn busy for a minute or more is marked at all (a bubble with those numbers and, on the company floor, the
// walk to report to the director); a short one ends quietly. Learned from Munder Difflin's office, where "done" is
// celebrated only after real work — no random "Done!" lines.
// Plain functions over a small memory per session, kept by the page (src/office/life/finish.js).

export const CELEBRATE_MS = 60_000;
const active = (x) => x === 'work' || x === 'wait';

/** The turn's memory after a status change -> { start, busyMs, workFrom (null: not working now), edits0, end, edits1 }
    (or the old one).
    prev, status: the session's status before and now ('work' | 'wait' | 'rest'; prev undefined: first seen);
    now: ms; edits: its Edit/Write count so far (the session's counts.edit), or null when unknown;
    taskStart: when the server says the turn began (used when the page first sees it mid-turn).
    Busy time is time working: waiting for you inside the turn does not count. */
export function nextTurn(turn, { prev, status, now, edits = null, taskStart = 0 }) {
  if (prev === status) return turn;
  const ed = Number.isFinite(edits) ? edits : null;
  if (!active(prev) && active(status)) {
    if (prev === undefined) {   // opened mid-turn: from the server's start, edits before now unknown
      const from = taskStart > 0 && taskStart <= now ? taskStart : now;
      return { start: from, busyMs: 0, workFrom: status === 'work' ? from : null, edits0: null, end: 0, edits1: null };
    }
    return { start: now, busyMs: 0, workFrom: status === 'work' ? now : null, edits0: ed, end: 0, edits1: null };
  }
  if (!turn || turn.end) return turn;
  const t = { ...turn };
  if (prev === 'work' && t.workFrom != null) { t.busyMs += Math.max(0, now - t.workFrom); t.workFrom = null; }
  if (status === 'work') t.workFrom = now;
  if (!active(status)) { t.end = now; t.edits1 = ed; }
  return t;
}

/** A finished turn -> { busyMs, edits (null when unknown), celebrate }: celebrate only after >= CELEBRATE_MS busy. */
export function finishOf(turn) {
  if (!turn || !turn.end) return { busyMs: 0, edits: null, celebrate: false };
  const edits = turn.edits0 != null && turn.edits1 != null ? Math.max(0, turn.edits1 - turn.edits0) : null;
  return { busyMs: turn.busyMs, edits, celebrate: turn.busyMs >= CELEBRATE_MS };
}

/** Busy time in whole minutes and hours for the words ({ h, m }; at least 1 minute). */
export function busyParts(ms) {
  const min = Math.max(1, Math.round(ms / 60_000));
  return { h: Math.floor(min / 60), m: min % 60 };
}
