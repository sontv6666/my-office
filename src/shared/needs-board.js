// The "Needs you" board on the office wall (src/office/ui/needs-board.js): who waits for your approval or an answer, whose
// turn ended on an error, who has been quiet too long by MyDesk's reckoning, and who finished a turn you have not looked
// at yet — the same people src/shared/attention.js marks one by one (MyDesk's own Needs you lists the same).
// Learned from Munder Difflin's "ASK ME" board: one place to look instead of scanning the floor; its frame only moves
// while somebody is on it, and then only a slow breath.

const RANK = { wait: 0, error: 1, quiet: 2, review: 3 };
/** list: [{ id, attention ('wait' | 'error' | 'quiet' | 'review' | anything else, left out), since (ms: since when), name }]
    -> { count, wait, error, quiet, review, items (at most `max`: waiting first, then stopped on an error, then quiet,
    then unread; the longest first in each), first (the one a click goes to, or null) }. */
export function needsBoard(list, max = 5) {
  const on = (Array.isArray(list) ? list : []).filter((x) => x && Object.hasOwn(RANK, x.attention));
  on.sort((a, b) => RANK[a.attention] - RANK[b.attention] || (a.since || 0) - (b.since || 0) || String(a.id).localeCompare(String(b.id)));
  const n = (k) => on.filter((x) => x.attention === k).length;
  return { count: on.length, wait: n('wait'), error: n('error'), quiet: n('quiet'), review: n('review'), items: on.slice(0, max), first: on[0] || null };
}

/** How strongly the frame glows at time t (seconds): 0 with nobody on the board (a still frame); while count > 0 a slow
    breath between 0.35 and 1 about every 4.5 s; held at 0.7 when motion is reduced. */
export function boardGlow(count, t, reduce = false) {
  if (!count) return 0;
  if (reduce) return 0.7;
  return 0.675 + 0.325 * Math.sin(t * 1.4);
}
