// "Cần bạn / Needs you": a board listing who waits for your approval or an answer, and who finished a turn you have
// not looked at yet (ui/needs-you.js decides who holds what; src/shared/needs-board.js orders them). The 3D counterpart
// of MyDesk's 2D board. On the company floor it stands on the low wall by the lobby's glass doors, turned and tilted
// back toward the default camera so it reads at the default zoom: a big count, and the first three names. In the small
// office it hangs by the door.
// Still when nobody is on it (a grey 0); while somebody is, its amber frame breathes slowly, nothing else moves.
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

const CW = 640, CH = 440;   // the face's canvas in pixels (its size in metres: LAY.needs, width; height to match)
let W = 2.0, H = 1.375;
const FB = '"Be Vietnam Pro", system-ui, sans-serif';
const AMBER = '#E0912A';
let group, face, glow, canvas, tex, prop = null;
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
function draw() {
  const g = canvas.getContext('2d'), b = board, on = b.count > 0;
  g.fillStyle = '#FBFBF7'; g.fillRect(0, 0, CW, CH);
  // the header: amber while somebody is on the board, grey when nobody is
  g.fillStyle = on ? AMBER : '#C9CED6'; g.fillRect(0, 0, CW, 96);
  g.fillStyle = '#FFFFFF'; g.font = `800 56px ${FB}`; g.textBaseline = 'middle';
  g.fillText(fit(g, tr('activity.needsBoard.title').toUpperCase(), CW - 52), 26, 52);
  // the count, big: what you read from across the floor
  const NX = 132;
  g.fillStyle = on ? AMBER : '#C9CED6'; g.font = `900 ${b.count > 99 ? 120 : b.count > 9 ? 170 : 230}px ${FB}`; g.textAlign = 'center';
  g.fillText(String(Math.min(999, b.count)), NX, 278); g.textAlign = 'left';
  g.fillStyle = 'rgba(43,58,85,.12)'; g.fillRect(262, 124, 3, CH - 152);
  const X = 288, RW = CW - X - 22;
  if (!on) {   // nobody: one plain line
    g.fillStyle = '#8A93A3'; g.font = `600 34px ${FB}`;
    const ls = wrap(g, tr('activity.needsBoard.none'), RW, 3);
    ls.forEach((l, i) => g.fillText(l, X, 268 - ((ls.length - 1) * 46) / 2 + i * 46));
  } else {
    b.items.forEach((x, i) => {
      const y = 148 + i * 92, wait = x.attention === 'wait';
      g.fillStyle = wait ? AMBER : x.color; g.beginPath(); g.arc(X + 16, y, 16, 0, Math.PI * 2); g.fill();
      if (wait) { g.fillStyle = '#FFFFFF'; g.font = `900 24px ${FB}`; g.textAlign = 'center'; g.fillText('!', X + 16, y + 1); g.textAlign = 'left'; }
      g.fillStyle = '#22304A'; g.font = `800 38px ${FB}`;
      g.fillText(state.streamer ? tr('common.session') : fit(g, x.name, RW - 46), X + 46, y);
      g.fillStyle = '#6B7486'; g.font = `600 25px ${FB}`;
      g.fillText(fit(g, tr(wait ? 'activity.needsBoard.wait' : 'activity.needsBoard.review'), RW - 46), X + 46, y + 36);
    });
    if (b.count > b.items.length) { g.fillStyle = '#6B7486'; g.font = `700 26px ${FB}`; g.fillText(tr('board.more', { n: b.count - b.items.length }), X + 46, CH - 22); }
  }
  tex.needsUpdate = true;
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
  const [x, y, z, turn = 0, width = 0, tilt = 0, wallTop = null] = at;
  W = width || W; H = (W * CH) / CW;
  group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = turn;
  group.userData.noMerge = true;   // (its face is redrawn and its frame glows: core/optimize.js leaves it as it is)
  scene.add(group);
  // standing on a low wall: a post from the wall's top up behind the board
  if (wallTop != null) put(group, rbox(0.07, y - wallTop, 0.07, '#5E6670', 0.01), -0.06, -(y - wallTop) / 2, 0).castShadow = false;
  const face3 = new THREE.Group(); face3.rotation.z = tilt; group.add(face3);   // (tilted back: its face looks up at the camera)
  put(face3, rbox(0.06, H + 0.1, W + 0.1, '#5E6670', 0.025), 0, 0, 0).castShadow = false;   // (no shadow worth a draw call)
  canvas = Object.assign(document.createElement('canvas'), { width: CW, height: CH });
  tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), toonMat({ map: tex, roughness: 0.5, emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 0.35 }));   // (readable at night too)
  face.rotation.y = Math.PI / 2; face.position.x = 0.036; face3.add(face);
  // the frame's glow: an amber border just in front of the frame, round the face; shown only while somebody is on it
  glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.14, H + 0.14), new THREE.MeshBasicMaterial({ color: '#F2B33D', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  glow.rotation.y = Math.PI / 2; glow.position.x = 0.032; glow.visible = false; face3.add(glow);
  draw();
  document.fonts?.ready.then(() => { sig = null; });   // (drawn again in the office's own font once it has loaded)
  group.updateMatrixWorld(true);
  prop = addProp('needs', { name: tr('activity.needsBoard.title'), hint: tr('activity.needsBoard.none'), meshes: [...face3.children], act: goFirst });
}
