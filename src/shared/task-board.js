// MyDesk's Projects tasks on the office wall (src/office/ui/task-board.js), as Munder Difflin's office pins them:
// columns to do / doing / review, a pile of done; a task in progress that someone on the floor has claimed leaves the
// board and is pinned at that person's desk. One whose claimant is not on the floor stays on the board ("nothing
// silently disappears"). Plain functions, tested.

const COLUMN = { backlog: 'todo', ready: 'todo', todo: 'todo', in_progress: 'doing', doing: 'doing', blocked: 'doing', review: 'review', done: 'done' };
export const columnOf = (status) => COLUMN[status] || 'todo';

/** board: the server's /api/mydesk/board ({ tasks, doneTotal }); atDesk(sessionId) -> true when that session is on the
    floor at a desk. -> { todo, doing, review, done (most recent first, as sent), doneTotal, pinned: [{ task, sessionId }],
    count (open tasks, pinned ones included) }; null when there is no board. */
export function taskBoard(board, atDesk = () => false) {
  if (!board || !Array.isArray(board.tasks)) return null;
  const out = { todo: [], doing: [], review: [], done: [], pinned: [], doneTotal: 0, count: 0 };
  for (const t of board.tasks) {
    if (!t || !t.id) continue;
    const col = columnOf(t.status);
    if (col === 'doing' && t.status === 'in_progress' && t.claimedBy && atDesk(t.claimedBy)) out.pinned.push({ task: t, sessionId: t.claimedBy });
    else out[col].push(t);
    if (col !== 'done') out.count++;
  }
  out.doneTotal = Math.max(Number(board.doneTotal) || 0, out.done.length);
  return out;
}

/** Handoffs a page has not shown yet: seen = the highest seq it has seen (null on its first look — then nothing flies (and with none yet, 0),
    the past is not replayed). -> { fly: [{ seq, taskId, to }], seen } */
export function handoffsToFly(handoffs, seen) {
  const list = Array.isArray(handoffs) ? handoffs.filter((h) => h && Number.isFinite(h.seq) && h.to) : [];
  const top = list.reduce((m, h) => Math.max(m, h.seq), seen ?? -Infinity);
  if (seen === null || seen === undefined) return { fly: [], seen: Number.isFinite(top) ? top : 0 };   // (none yet: every one after is new)
  return { fly: list.filter((h) => h.seq > seen).sort((a, b) => a.seq - b.seq), seen: top };
}
