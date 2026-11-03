// What a person in the office holds for you, until it changes (drawn by src/office/ui/needs-you.js):
//   'wait'   — waiting for your permission or an answer (its status is wait);
//   'error'  — its turn ended in an error (a StopFailure seen here, or MyDesk's own status 'error'), until it works again;
//   'review' — done and not looked at yet: MyDesk's `unreviewed` when MyDesk sends it, else finished while this page was
//              open and not opened since; until it works again or you look;
//   ''       — nothing.
// Plain functions of the session and the page's memory of it, shared so they can be tested without a page.

/** The page's memory of one session ({ err, done }) after something happened -> the next memory.
    e: an event of the session's own ({ type, agent }; a subagent's is ignored); prev, status: its status before and
    now; seen: you opened it. */
export function nextMemory(mem, { e = null, prev, status, seen = false } = {}) {
  let err = !!mem?.err, done = !!mem?.done;
  if (prev && status && status !== prev && status !== 'rest') { err = false; done = false; }   // back at work, or asking: the old outcome is over
  if (e && !e.agent) {
    if (e.type === 'prompt' || e.type === 'interrupt') { err = false; done = false; }   // (you gave it work, or stopped it yourself)
    else if (e.type === 'fail' && status === 'rest') { err = true; done = false; }     // a failed turn (a tool failing mid-turn is not one)
    else if (e.type === 'stop') { err = false; done = true; }
  }
  if (seen) done = false;
  return { err, done };
}

/** -> 'wait' | 'error' | 'review' | '' for a session ({ status, md }: md is MyDesk's record, server/mydesk.mjs mydeskInfo())
    and the page's memory of it (nextMemory()). */
export function attentionOf(s, mem) {
  if (!s) return '';
  if (s.status === 'wait') return 'wait';
  if (s.status !== 'rest') return '';
  const md = s.md && typeof s.md === 'object' ? s.md : null;
  if (md?.state === 'error' || mem?.err) return 'error';
  if (md && typeof md.unreviewed === 'boolean') return md.unreviewed ? 'review' : '';   // (MyDesk knows whether you looked)
  return mem?.done ? 'review' : '';
}
