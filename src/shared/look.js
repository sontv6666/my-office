// What a session's person looks like: shirt, hair, hair style, accessory, coat and bag, from its name and its desk.
// One function for the page (people/workers.js builds the chibi from it) and the server (server/mydesk.mjs tells
// MyDesk, whose desk window draws the same people). Pure: no three.js, no DOM.

export const PALETTE = ['#6A8042', '#E8742A', '#3F7CC4', '#8C4FA8', '#D64550', '#2A9D8F', '#C9A227', '#5B6CD8', '#B5651D', '#C2577A', '#3E8E7E', '#7A6FD0'];
export const HAIRS = ['#3B2618', '#1E1E24', '#9A4A24', '#E2B04A', '#5A3825', '#2B2B2B', '#C2703D', '#7A4E2D'];
export const STYLES = ['bob', 'spiky', 'ponytail', 'bun', 'plain', 'curly'];
export const ACCS = ['headphones', 'glasses', 'beanie', 'cap', null, null, null];
// a person's things while they work: the coat over the chair back and the backpack beside it (world/desks.js)
export const COATS = ['#2F3B52', '#6B4F3A', '#46553F', '#7D2E3A', '#C2A97E', '#26292E', '#4F6D8F', '#8A8F98'];
export const BAGS = ['#2B2F36', '#3F7CC4', '#E8742A', '#5E7A3A', '#8C4FA8', '#A0A8B2', '#C8553D'];

export function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** The shirt: the desk's colour, else one from the name. */
export const colorOf = (s) => (s.desk >= 0 ? PALETTE[s.desk] : PALETTE[hash(s.name) % PALETTE.length]);

/** { name, desk } -> the look makeChibi takes (with the office's look style added by the caller). */
export function lookOf(s) {
  const h = hash(s.name);
  return { shirt: colorOf(s), hair: HAIRS[h % HAIRS.length], style: STYLES[(h >>> 3) % STYLES.length], acc: ACCS[(h >>> 7) % ACCS.length], coat: COATS[(h >>> 11) % COATS.length], bag: BAGS[(h >>> 15) % BAGS.length] };
}
