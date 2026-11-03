// "Cần bạn / Needs you": a board on the wall by the lobby doors (in the small office, by its door) listing who waits
// for your approval or an answer, and who finished a turn you have not looked at yet (ui/needs-you.js decides who
// holds what; src/shared/needs-board.js orders them). The 3D counterpart of MyDesk's 2D board.
// Still when nobody is on it (a faint "?"); while somebody is, its amber frame breathes slowly, nothing else moves.
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

const CW = 580, CH = 400;   // the face's canvas in pixels (its size in metres: LAY.needs, width; height to match)
let W = 1.45, H = 1.0;
const FB = '"Be Vietnam Pro", system-ui, sans-serif';
const AMBER = '#E0912A';
let group, face, glow, canvas, tex, prop = null;
const ROWS = 4;
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
function draw() {
  const g = canvas.getContext('2d'), b = board, on = b.count > 0;
  g.fillStyle = '#FBFBF7'; g.fillRect(0, 0, CW, CH);
  // the header: amber while somebody is on the board, grey when nobody is
  g.fillStyle = on ? AMBER : '#C9CED6'; g.fillRect(0, 0, CW, 92);
  g.fillStyle = '#FFFFFF'; g.font = `800 48px ${FB}`; g.textBaseline = 'middle';
  g.fillText(fit(g, tr('activity.needsBoard.title').toUpperCase(), on ? CW - 150 : CW - 48), 26, 49);
  if (on) { g.font = `900 70px ${FB}`; g.textAlign = 'right'; g.fillText(String(b.count), CW - 26, 52); g.textAlign = 'left'; }
  if (!on) {   // nobody: a faint "?" and one plain line
    g.fillStyle = 'rgba(43,58,85,.12)'; g.font = `900 180px ${FB}`; g.textAlign = 'center'; g.fillText('?', CW / 2, 225);
    g.fillStyle = '#8A93A3'; g.font = `600 30px ${FB}`; g.fillText(fit(g, tr('activity.needsBoard.none'), CW - 40), CW / 2, 350); g.textAlign = 'left';
  } else {
    b.items.forEach((x, i) => {
      const y = 138 + i * 64, wait = x.attention === 'wait';
      g.fillStyle = wait ? AMBER : x.color; g.beginPath(); g.arc(42, y, 14, 0, Math.PI * 2); g.fill();
      if (wait) { g.fillStyle = '#FFFFFF'; g.font = `900 21px ${FB}`; g.textAlign = 'center'; g.fillText('!', 42, y + 1); g.textAlign = 'left'; }
      const what = tr(wait ? 'activity.needsBoard.wait' : 'activity.needsBoard.review');
      g.font = `600 24px ${FB}`; const ww = Math.min(210, g.measureText(what).width);
      g.fillStyle = '#6B7486'; g.textAlign = 'right'; g.fillText(fit(g, what, 210), CW - 24, y); g.textAlign = 'left';
      g.fillStyle = '#22304A'; g.font = `700 32px ${FB}`;
      g.fillText(state.streamer ? tr('common.session') : fit(g, x.name, CW - 70 - ww - 40), 68, y);
    });
    if (b.count > b.items.length) { g.fillStyle = '#6B7486'; g.font = `600 22px ${FB}`; g.fillText(tr('board.more', { n: b.count - b.items.length }), 68, CH - 18); }
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
  W = at[4] || W; H = (W * CH) / CW;
  group = new THREE.Group(); group.position.set(at[0], at[1], at[2]); group.rotation.y = at[3];
  group.userData.noMerge = true;   // (its face is redrawn and its frame glows: core/optimize.js leaves it as it is)
  scene.add(group);
  put(group, rbox(0.06, H + 0.1, W + 0.1, '#5E6670', 0.025), 0, 0, 0).castShadow = false;   // (flat on the wall: no shadow worth a draw call)
  canvas = Object.assign(document.createElement('canvas'), { width: CW, height: CH });
  tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), toonMat({ map: tex, roughness: 0.5 }));
  face.rotation.y = Math.PI / 2; face.position.x = 0.036; group.add(face);
  // the frame's glow: an amber border just in front of the frame, round the face; shown only while somebody is on it
  glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.12, H + 0.12), new THREE.MeshBasicMaterial({ color: '#F2B33D', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  glow.rotation.y = Math.PI / 2; glow.position.x = 0.032; glow.visible = false; group.add(glow);
  draw();
  document.fonts?.ready.then(() => { sig = null; });   // (drawn again in the office's own font once it has loaded)
  group.updateMatrixWorld(true);
  prop = addProp('needs', { name: tr('activity.needsBoard.title'), hint: tr('activity.needsBoard.none'), meshes: [...group.children], act: goFirst });
}
