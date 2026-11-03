// A finished turn, told with its real numbers (src/shared/finish.js): each session's turn is followed from its status
// changes; when it ends, a turn busy for a minute or more gets a bubble like "done · 12 min · 5 file edits" (and, on
// the company floor, the walk to report to the director: life/incidents.js); a shorter one ends quietly.
// Claude Code sessions end with their Stop event (incidents.js takes the finish then); agents of other CLIs (and
// MyDesk's stand-ins) only send status updates, so for them the change to rest is the end.
import { ACT } from '../ui/event-text.js';
import { workers } from '../people/workers.js';
import { busyParts, finishOf, nextTurn } from '../../shared/finish.js';
import { t as tr } from '../../i18n/index.js';

const turns = new Map();   // session id -> the turn's memory (shared/finish.js nextTurn), until its finish is taken
const last = new Map();    // session id -> the last finish told ({ busyMs, edits }), for when you poke them later

/** A session update (net/live.js upsertSession): prev its status before (undefined: first seen); e the event it came
    with, if any; live: a change seen as it happens (not a snapshot or a replay). */
export function noteTurn(s, prev, { e = null, live = false } = {}) {
  const t = turns.get(s.id);
  const next = nextTurn(t, { prev, status: s.status, now: Date.now(), edits: s.counts?.edit ?? null, taskStart: s.taskStart || 0 });
  if (next) turns.set(s.id, next); else turns.delete(s.id);
  // another CLI's agent, or MyDesk's stand-in (no process of its own here, no Stop event): its change to rest ends it
  if (live && next?.end && !t?.end && !e && !s.pid && s.md) {
    const f = takeFinish(s.id), w = workers.get(s.id);
    if (f.celebrate && w) w.push({ ...ACT.stop, type: 'stop', text: finishLine(f) });
  }
}
export function forgetTurn(id) { turns.delete(id); last.delete(id); }

/** The finish of a session's turn that just ended -> { busyMs, edits, celebrate }; taken once (a second Stop without a
    new turn says nothing). */
export function takeFinish(id) {
  const t = turns.get(id);
  if (!t?.end) return { busyMs: 0, edits: null, celebrate: false };
  turns.delete(id);
  const f = finishOf(t);
  if (f.celebrate) last.set(id, f);
  return f;
}
/** The last finish told for a session, or null. */
export const lastFinish = (id) => last.get(id) || null;

/** "done · 12 min · 5 file edits" (a finish's numbers in words; the edits only when known and not none). */
export function finishLine(f, head = tr('incident.finish.done')) {
  const { h, m } = busyParts(f.busyMs);
  const time = h ? tr('time.hourMin', { h, m }) : tr('time.min', { n: m });
  return [head, time, f.edits ? tr('incident.finish.edits', { n: f.edits }) : ''].filter(Boolean).join(' · ');
}
