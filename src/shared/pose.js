// What a person is doing, worked out from their session alone: what the server tells MyDesk's desk window while no
// office page is open to report the real thing (server activityNow(); the page's people: office/people/workers.js).
// The page's office has more (lunch, the restroom, errands); this is its main thread: the hand up while waiting for
// you, at work with what the last step is done with (ACT in office/ui/event-text.js), a coffee after a turn, then the nap.

// The step's pose at work (ACT[type].anim; the station's own for the rest).
const WORK = {
  prompt: 'board', plan: 'board', agent: 'board',
  read: 'read', grep: 'read', glob: 'read', skill: 'read',
  edit: 'type', write: 'type', other: 'type',
  bash: 'console', web: 'globe', fetch: 'globe', mcp: 'globe',
  test: 'think', interrupt: 'think', commit: 'tidy',
};
// Shown for a moment after the step, then back to the work.
const MOMENT = {
  fail: 'sweat', cired: 'sweat', testfail: 'sweat',
  push: 'celebrate', deploy: 'celebrate', cigreen: 'celebrate', release: 'celebrate', testok: 'celebrate',
  compact: 'stomp',
};
const MOMENT_MS = 4000;
const COFFEE_MS = 20000;   // (the page: to the coffee corner after a turn, a few seconds there, then home for the nap)

/** s: { status: 'work' | 'wait' | 'rest', last: { type }, lastAt, doneAt, bg: [] } -> a pose name (people/chibi-rig.js) */
export function poseOf(s, now = Date.now()) {
  const status = s?.status;
  if (status === 'wait') return 'hand';
  if (status === 'work') {
    const type = s.last?.type || '';
    if (MOMENT[type] && now - (s.lastAt || 0) < MOMENT_MS) return MOMENT[type];
    return WORK[type] || 'type';
  }
  if (Array.isArray(s?.bg) && s.bg.length) return 'think';   // (a background task still running: waiting on it)
  const done = s?.doneAt || s?.lastAt || 0;
  return done && now - done < COFFEE_MS ? 'coffee' : 'sleep';
}
