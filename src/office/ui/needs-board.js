// "Cần bạn / Needs you": a board listing who waits for your approval or an answer, and who finished a turn you have
// not looked at yet (ui/needs-you.js decides who holds what; src/shared/needs-board.js orders them). The 3D counterpart
// of MyDesk's 2D board. Flush on a wall that faces the default camera, as the whiteboard and the task board are: on the
// company floor on the dev floor's side of the lobby's low wall, between the server room's glass and the glass doors;
// in the small office on the left wall, between the door and the framed poster. It reads at the default zoom: a big
// count, and the first three names.
// Still and dimmed when nobody is on it (a grey 0); while somebody is, its amber frame breathes slowly, nothing else moves.
// A click: the camera goes to the one waiting longest (as the edge chips do), or opens the first unread finish.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { reduceMotion } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { put, rbox, toonMat } from '../scene/blocks.js';
import { LAY } from '../world/layout.js';
import { colorOf, dn, sessions, workers } from '../people/workers.js';
import { addProp } from '../interact/props.js';
import { attentionAll } from './needs-you.js';
import { showPerson } from './camera-bar.js';
import { openSession } from './session-drawer.js';
import { toast } from './activity.js';
import { fp } from '../interact/first-person.js';
import { boardGlow, needsBoard } from '../../shared/needs-board.js';
import { t as tr } from '../../i18n/index.js';

const CW = 640, CH = 520;   // the face's canvas in pixels (its size in metres: LAY.needs, width; height to match)
const PAD = 28, HEAD = 92, COL = 196, RH = 118;   // padding, the header band, the count's column, a row of the list
let W = 1.9, H = (W * CH) / CW;
const FB = '"Be Vietnam Pro", system-ui, sans-serif';
const AMBER = '#E0912A';
let group, face, glow, canvas, tex, prop = null;
const LIT = 0.35, DIM = 0.12;   // the face's own light: lit while somebody is on it, dimmed at 0
const ROWS = 3;
let board = needsBoard([], ROWS), sig = null, checkedAt = -1;

function listNow() {
  return attentionAll().map(([id, attention]) => {
    const s = sessions.get(id);
    return { id, attention, since: attention === 'review' ? s?.doneAt || s?.lastAt || 0 : s?.lastAt || 0, name: s ? dn(s) : '', color: s?.md?.projectColor || (s ? colorOf(s) : '#3DDC84') };
  });
}
function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g.measureText(text.slice(0, m) + '…').width <= max) lo = m; else hi = m - 1; }
  return text.slice(0, lo).trimEnd() + '…';
}
// a line in at most `n` lines of `max` px
function wrap(g, text, max, n) {
  const out = []; let cur = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  if (out.length > n) { out.length = n; out[n - 1] = fit(g, `${out[n - 1]}…`, max); }
  return out.map((l) => fit(g, l, max));
}
// text at the largest of `sizes` (px) it fits in `max` at, else at the smallest, cut; sets g.font
function sized(g, text, max, weight, sizes) {
  for (const px of sizes) { g.font = `${weight} ${px}px ${FB}`; if (g.measureText(text).width <= max) return text; }
  return fit(g, text, max);
}
// The face: a header band with the title; under it the count, big, in its own column, and beside it who (a dot, the
// name whole when it can be, why in plain words), the list centred on the count; "+N more" under the list.
function draw() {
  const g = canvas.getContext('2d'), b = board, on = b.count > 0;
  g.fillStyle = '#FBFBF7'; g.fillRect(0, 0, CW, CH);
  // the header: amber while somebody is on the board, grey when nobody is
  g.fillStyle = on ? AMBER : '#C9CED6'; g.fillRect(0, 0, CW, HEAD);
  g.fillStyle = '#FFFFFF'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(sized(g, tr('activity.needsBoard.title').toUpperCase(), CW - 2 * PAD, 800, [52, 46, 40]), PAD, HEAD / 2 + 3);
  const top = HEAD + 24, bottom = CH - 24, mid = (top + bottom) / 2;
  // the count, big: what you read from across the floor
  g.fillStyle = on ? AMBER : '#C9CED6'; g.font = `900 ${b.count > 99 ? 100 : b.count > 9 ? 148 : 230}px ${FB}`; g.textAlign = 'center';
  g.fillText(String(Math.min(999, b.count)), COL / 2 + 2, mid + 10); g.textAlign = 'left';
  g.fillStyle = 'rgba(43,58,85,.12)'; g.fillRect(COL, top, 3, bottom - top);
  const X = COL + 26, RW = CW - X - PAD, TX = X + 40, TW = CW - TX - PAD;
  if (!on) {   // nobody: one plain line, centred on the 0
    g.fillStyle = '#8A93A3'; g.font = `600 34px ${FB}`;
    const ls = wrap(g, tr('activity.needsBoard.none'), RW, 3);
    ls.forEach((l, i) => g.fillText(l, X, mid - ((ls.length - 1) * 46) / 2 + i * 46));
  } else {
    const more = b.count - b.items.length, n = b.items.length;
    const block = (n - 1) * RH + 76 + (more > 0 ? 48 : 0), y0 = Math.max(top + 18, mid - block / 2 + 18);   // (y0: the first name's middle; a row's ink starts 18 px above it)
    b.items.forEach((x, i) => {
      const y = y0 + i * RH, wait = x.attention === 'wait';   // y: the name's line; why, 44 px under it
      g.fillStyle = wait ? AMBER : x.color; g.beginPath(); g.arc(X + 14, y, 14, 0, Math.PI * 2); g.fill();
      if (wait) { g.fillStyle = '#FFFFFF'; g.font = `900 21px ${FB}`; g.textAlign = 'center'; g.fillText('!', X + 14, y + 1); g.textAlign = 'left'; }
      g.fillStyle = '#22304A';
      g.fillText(sized(g, state.streamer ? tr('common.session') : x.name, TW, 800, [36, 33, 30]), TX, y);
      g.fillStyle = wait ? '#A85F0C' : '#4F5B70';
      g.fillText(sized(g, tr(wait ? 'activity.needsBoard.wait' : 'activity.needsBoard.review'), TW, 600, [28, 25, 22]), TX, y + 44);
    });
    if (more > 0) { g.fillStyle = '#6B7486'; g.font = `700 26px ${FB}`; g.fillText(tr('board.more', { n: more }), TX, y0 + (n - 1) * RH + 44 + 52); }
  }
  tex.needsUpdate = true;
  face.material.emissiveIntensity = on ? LIT : DIM;
  if (prop) prop.hint = !on ? tr('activity.needsBoard.none') : tr('activity.needsBoard.hint', { n: b.count });
}

/** Each frame: the board redrawn when who is on it changed (looked at twice a second); the frame's slow breath. */
export function updateNeedsBoard(t) {
  if (!group) return;
  if (t - checkedAt > 0.5 || t < checkedAt) {
    checkedAt = t;
    const next = needsBoard(listNow(), ROWS), key = JSON.stringify([state.streamer, next.count, next.items.map((x) => [x.id, x.attention, x.name, x.color])]);
    board = next;
    if (key !== sig) { sig = key; draw(); }
  }
  const k = boardGlow(board.count, t, reduceMotion);
  const vis = k > 0 && !fp.on;
  if (glow.visible !== vis) glow.visible = vis;
  if (vis) glow.material.opacity = 0.25 + 0.6 * k;
}

function goFirst() {
  const x = board.first;
  if (!x) { toast(tr('incident.turn.none')); return; }
  const w = workers.get(x.id);
  if (x.attention === 'wait' && w && !state.selectedId) showPerson(w);
  else openSession(x.id);
}

export function setup() {
  const at = LAY.needs; if (!at) return;
  const [x, y, z, turn = 0, width = 0] = at;
  W = width || W; H = (W * CH) / CW;
  group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = turn;
  group.userData.noMerge = true;   // (its face is redrawn and its frame glows: core/optimize.js leaves it as it is)
  scene.add(group);
  put(group, rbox(0.06, H + 0.1, W + 0.1, '#5E6670', 0.025), 0, 0, 0).castShadow = false;   // (no shadow worth a draw call)
  canvas = Object.assign(document.createElement('canvas'), { width: CW, height: CH });
  tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), toonMat({ map: tex, roughness: 0.5, emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: DIM }));   // (readable at night too)
  face.rotation.y = Math.PI / 2; face.position.x = 0.036; group.add(face);
  // the frame's glow: an amber border just in front of the frame, round the face; shown only while somebody is on it
  glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.14, H + 0.14), new THREE.MeshBasicMaterial({ color: '#F2B33D', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  glow.rotation.y = Math.PI / 2; glow.position.x = 0.032; glow.visible = false; group.add(glow);
  draw();
  document.fonts?.ready.then(() => { sig = null; });   // (drawn again in the office's own font once it has loaded)
  group.updateMatrixWorld(true);
  prop = addProp('needs', { name: tr('activity.needsBoard.title'), hint: tr('activity.needsBoard.none'), meshes: [...group.children], act: goFirst });
}
