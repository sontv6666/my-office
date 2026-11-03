// A small envelope flown from one person to another when work really passes between them: a subagent being started
// (from its parent to it) or a MyDesk handoff (to the session that got it). Learned from Munder Difflin's office: the
// ends are taken when it sets off, it flies a low arc in at most 2 s, and never more than a few are in the air.
// Plain functions, tested; src/office/people/envelopes.js draws them.

export const MAX_ENVELOPES = 8;
const SPEED = 6;            // metres a second
const MIN_MS = 800, MAX_MS = 2000;

/** How long a flight from `a` to `b` ({ x, z }) takes, in ms: by distance, between 0.8 and 2 s. */
export function flightMs(a, b) {
  const d = Math.hypot((b.x || 0) - (a.x || 0), (b.z || 0) - (a.z || 0));
  return Math.round(Math.min(MAX_MS, Math.max(MIN_MS, (d / SPEED) * 1000)));
}

const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** Where an envelope is at progress u (0..1) from a to b ({ x, y, z }): eased along the way, lifted on an arc that is
    higher for a longer flight (0.6 to 1.6 m), tilted a little ({ x, y, z, tilt }). */
export function flightPoint(a, b, u) {
  u = Math.min(1, Math.max(0, u));
  const k = ease(u), d = Math.hypot(b.x - a.x, b.z - a.z), h = Math.min(1.6, 0.6 + d * 0.12);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k + h * Math.sin(Math.PI * k), z: a.z + (b.z - a.z) * k, tilt: 0.12 * Math.sin(Math.PI * 2 * u) };
}

/** Can another one set off with `n` already in the air? (No: it lands at once, unseen.) */
export const roomFor = (n, max = MAX_ENVELOPES) => n < max;
