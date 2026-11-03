// The "Needs you" board on the office wall (src/office/ui/needs-board.js): who waits for your approval or an answer,
// and who finished a turn you have not looked at yet — the same people src/shared/attention.js marks one by one.
// Learned from Munder Difflin's "ASK ME" board: one place to look instead of scanning the floor; its frame only moves
// while somebody is on it, and then only a slow breath.

/** list: [{ id, attention ('wait' | 'review' | anything else, left out), since (ms: since when), name }]
    -> { count, wait, review, items (at most `max`: waiting first, then unread; the longest-waiting first in each),
    first (the one a click goes to, or null) }. */
export function needsBoard(list, max = 5) {
  const rank = { wait: 0, review: 1 };
  const on = (Array.isArray(list) ? list : []).filter((x) => x && (x.attention === 'wait' || x.attention === 'review'));
  on.sort((a, b) => rank[a.attention] - rank[b.attention] || (a.since || 0) - (b.since || 0) || String(a.id).localeCompare(String(b.id)));
  const wait = on.filter((x) => x.attention === 'wait').length;
  return { count: on.length, wait, review: on.length - wait, items: on.slice(0, max), first: on[0] || null };
}

/** How strongly the frame glows at time t (seconds): 0 with nobody on the board (a still frame); while count > 0 a slow
    breath between 0.35 and 1 about every 4.5 s; held at 0.7 when motion is reduced. */
export function boardGlow(count, t, reduce = false) {
  if (!count) return 0;
  if (reduce) return 0.7;
  return 0.675 + 0.325 * Math.sin(t * 1.4);
}
