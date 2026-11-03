// What to do when the 3D view loses its WebGL context (the GPU process restarted, a driver reset, or too many contexts
// open at once — MyDesk's terminals draw with WebGL too). Learned from Munder Difflin's glRecovery: never leave a dead
// canvas; wait a little, ask for the context back, and after a few tries say so in plain words.
// A plain step function over a small state, so it can be tested without a GPU (src/office/scene/gl-recovery.js runs it).
//
//   phase 'ok'        drawing;
//         'lost'      context gone: drawing paused, a restore is asked for at `at`;
//         'restoring' a restore was asked for: waiting for the browser to give the context back until `at`;
//         'dead'      given up: the page shows a message instead.
// Every loss (or a restore that never came) uses one of `maxTries`; the page's life has that many, not more.

export const GL_RETRY_MS = 1500;   // after a loss, how long before asking for the context back
export const GL_WAIT_MS = 5000;    // how long a restore may take before it counts as failed
export const GL_MAX_TRIES = 3;

/** The state a page starts with. */
export const glStart = () => ({ phase: 'ok', tries: 0, at: 0 });

/** One step: `ev` is 'lost' (webglcontextlost), 'restored' (webglcontextrestored) or 'tick' (a timer the caller set
    for `st.at`) -> { st, act } with act one of:
      ''        nothing to do;
      'pause'   stop drawing (the context is gone; a tick is due at st.at);
      'restore' ask for the context back now (WEBGL_lose_context.restoreContext; a tick is due at st.at);
      'rebuild' the context is back: rebuild what lived only on the GPU (environment maps, shadow map) and draw again;
      'dead'    give up: stop drawing and show the message. */
export function glStep(st, ev, now, { retryMs = GL_RETRY_MS, waitMs = GL_WAIT_MS, maxTries = GL_MAX_TRIES } = {}) {
  st = st || glStart();
  if (st.phase === 'dead') return { st, act: '' };
  const fail = () => (st.tries + 1 > maxTries
    ? { st: { phase: 'dead', tries: st.tries + 1, at: 0 }, act: 'dead' }
    : { st: { phase: 'lost', tries: st.tries + 1, at: now + retryMs }, act: 'pause' });
  if (ev === 'lost') return st.phase === 'ok' || st.phase === 'restoring' ? fail() : { st, act: '' };
  if (ev === 'restored') return st.phase === 'ok' ? { st, act: '' } : { st: { phase: 'ok', tries: st.tries, at: 0 }, act: 'rebuild' };
  if (ev === 'tick' && now >= st.at) {
    if (st.phase === 'lost') return { st: { phase: 'restoring', tries: st.tries, at: now + waitMs }, act: 'restore' };
    if (st.phase === 'restoring') return fail();   // asked, and it never came back
  }
  return { st, act: '' };
}
