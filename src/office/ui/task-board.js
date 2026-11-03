// MyDesk's Projects tasks on the office wall (company floor: on the library's low wall, facing the desks), and each
// task in progress pinned as a note at the desk of whoever claimed it (src/shared/task-board.js decides which).
// Read from the office server (/api/mydesk/board, a read of MyDesk's own office board endpoint) every 5 s while the
// page is seen; while MyDesk has no board (not linked, its projects not set up) nothing is built and it asks every
// 30 s. Nothing here moves: a board and notes redrawn only when the tasks change.
import * as THREE from 'three';
import { HQ, PRO, STATIC } from '../core/env.js';
import { state } from '../core/state.js';
import { scene } from '../scene/renderer.js';
import { put, rbox, toonMat } from '../scene/blocks.js';
import { DESKS, dLocal } from '../world/desks.js';
import { sessions, workers } from '../people/workers.js';
import { addProp } from '../interact/props.js';
import { toast } from './activity.js';
import { handoffsToFly, taskBoard } from '../../shared/task-board.js';
import { flyEnvelope } from '../people/envelopes.js';
import { t as tr } from '../../i18n/index.js';

const CW = 1024, CH = 512, W = 2.6, H = (W * CH) / CW;
const AT = [6.5, 2.0, -2.9, -Math.PI / 2];   // the library's low wall (z -3), between its door and the pantry wall
const FB = '"Be Vietnam Pro", system-ui, sans-serif';
const NOTE = { todo: '#F2DF8A', doing: '#9ECBF0', review: '#A7E3DC', done: '#A8E0B0' };
let group = null, canvas, tex, prop = null, data = null, lastRaw = null, sig = '', timer = 0;
const deskNotes = new Map();   // task id -> { sprite, canvas, tex, key }

function fit(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g.measureText(text.slice(0, m) + '…').width <= max) lo = m; else hi = m - 1; }
  return text.slice(0, lo).trimEnd() + '…';
}
// a title in at most `n` lines of `max` px
function lines(g, text, max, n) {
  const words = String(text).split(/\s+/).filter(Boolean), out = [];
  let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (g.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; }
  if (cur) out.push(cur);
  if (out.length > n) { out.length = n; out[n - 1] = fit(g, `${out[n - 1]}…`, max); }
  return out.map((l) => fit(g, l, max));
}
const atDesk = (id) => (sessions.get(id)?.desk ?? -1) >= 0 && workers.has(id);
const hidden = (text) => (state.streamer ? '▒▒▒▒ ▒▒▒ ▒▒▒▒▒' : text);

function drawBoard(b) {
  const g = canvas.getContext('2d');
  g.fillStyle = '#C9A877'; g.fillRect(0, 0, CW, CH);   // cork
  g.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 260; i++) g.fillRect((i * 97) % CW, (i * 53) % CH, 3, 3);
  g.fillStyle = '#22304A'; g.textBaseline = 'middle';
  g.font = `800 40px ${FB}`; const title = tr('board.tasks.title').toUpperCase(); g.fillText(title, 28, 40);
  const tw = g.measureText(title).width;
  g.font = `600 22px ${FB}`; g.fillStyle = '#4A3B28'; g.fillText(fit(g, tr('board.tasks.sub'), CW - tw - 80), 28 + tw + 18, 44);
  const cols = [['todo', b.todo], ['doing', b.doing], ['review', b.review]];
  cols.forEach(([k, list], c) => {
    const x = 24 + c * 262;
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.roundRect(x, 74, 248, 40, 8); g.fill();
    g.fillStyle = '#22304A'; g.font = `800 22px ${FB}`;
    const n = k === 'doing' ? list.length + b.pinned.length : list.length;
    g.fillText(fit(g, `${tr(`board.tasks.${k}`)} · ${n}`, 228), x + 12, 95);
    list.slice(0, 5).forEach((t, i) => {
      const y = 126 + i * 66;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 4, y + 4, 240, 56);
      g.fillStyle = NOTE[k]; g.fillRect(x, y, 240, 56);
      g.fillStyle = '#C0392B'; g.beginPath(); g.arc(x + 120, y + 5, 5, 0, Math.PI * 2); g.fill();   // the pin
      g.fillStyle = '#22304A'; g.font = `600 19px ${FB}`;
      lines(g, hidden(t.title), 222, 2).forEach((l, j) => g.fillText(l, x + 9, y + 20 + j * 22));
    });
    const more = list.length - 5;
    g.fillStyle = '#4A3B28'; g.font = `700 19px ${FB}`;
    if (more > 0) g.fillText(tr('board.more', { n: more }), x + 8, 474);
    if (k === 'doing' && b.pinned.length) g.fillText(tr('board.tasks.atDesks', { n: b.pinned.length }), x + 8, more > 0 ? 498 : 474);
  });
  // the done pile: a stack of green pages and how many
  const x = 24 + 3 * 262;
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.roundRect(x, 74, 190, 40, 8); g.fill();
  g.fillStyle = '#22304A'; g.font = `800 22px ${FB}`; g.fillText(fit(g, tr('board.tasks.done'), 170), x + 12, 95);
  for (let i = Math.min(6, b.doneTotal) - 1; i >= 0; i--) { g.fillStyle = i ? '#93CF9C' : NOTE.done; g.fillRect(x + 20 + i * 4, 150 - i * 6, 150, 110); }
  g.fillStyle = '#22304A'; g.font = `900 64px ${FB}`; g.textAlign = 'center'; g.fillText(String(b.doneTotal), x + 95, 330); g.textAlign = 'left';
  if (!b.count && !b.doneTotal) { g.fillStyle = '#4A3B28'; g.font = `600 26px ${FB}`; g.fillText(tr('board.tasks.none'), 40, 160); }
  tex.needsUpdate = true;
  if (prop) prop.hint = summary(b);
}
const summary = (b) => tr('board.tasks.hint', { todo: b.todo.length, doing: b.doing.length + b.pinned.length, review: b.review.length, done: b.doneTotal });

// a note at a claimant's desk: the task's title on a blue card by the screen
function noteFor(id) {
  let n = deskNotes.get(id);
  if (n) return n;
  const c = Object.assign(document.createElement('canvas'), { width: 256, height: 128 });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  sprite.scale.set(0.5, 0.25, 1); sprite.userData.dynamic = true; scene.add(sprite);
  n = { sprite, canvas: c, tex: t, key: '' };
  deskNotes.set(id, n);
  return n;
}
function syncDeskNotes(b) {
  const want = new Map(), perDesk = new Map();
  for (const p of b.pinned) {
    const d = sessions.get(p.sessionId)?.desk; if (!(d >= 0)) continue;
    const k = perDesk.get(d) || 0; perDesk.set(d, k + 1);
    if (k < 2) want.set(p.task.id, { task: p.task, d, k });   // (two a desk at most: the board counts the rest)
  }
  for (const [id, n] of deskNotes) if (!want.has(id)) { scene.remove(n.sprite); n.sprite.material.dispose(); n.tex.dispose(); deskNotes.delete(id); }
  for (const [id, w] of want) {
    const n = noteFor(id), key = `${w.task.title}|${w.d}|${w.k}|${state.streamer}`;
    if (n.key === key) continue;
    n.key = key;
    const g = n.canvas.getContext('2d');
    g.clearRect(0, 0, 256, 128);
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(6, 8, 248, 118);
    g.fillStyle = NOTE.doing; g.fillRect(2, 2, 248, 118);
    g.fillStyle = '#C0392B'; g.beginPath(); g.arc(126, 10, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#22304A'; g.font = `700 25px ${FB}`; g.textBaseline = 'middle';
    lines(g, hidden(w.task.title), 228, 3).forEach((l, j) => g.fillText(l, 14, 38 + j * 30));
    n.tex.needsUpdate = true;
    const [x, z] = dLocal(DESKS[w.d], -0.55 + w.k * 0.34, 0.3);   // (by the screen, on the side away from the marks of ui/needs-you.js)
    n.sprite.position.set(x, 1.34 + w.k * 0.06, z);
  }
}

function build() {
  group = new THREE.Group(); group.position.set(AT[0], AT[1], AT[2]); group.rotation.y = AT[3];
  group.userData.noMerge = true; scene.add(group);
  put(group, rbox(0.06, H + 0.12, W + 0.12, '#6E5639', 0.025), 0, 0, 0).castShadow = false;
  canvas = Object.assign(document.createElement('canvas'), { width: CW, height: CH });
  tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // (a little light of its own: a board you read from across the floor, at night too)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), toonMat({ map: tex, roughness: 0.8, emissive: '#FFFFFF', emissiveMap: tex, emissiveIntensity: 0.5 }));
  face.rotation.y = Math.PI / 2; face.position.x = 0.036; group.add(face);
  group.updateMatrixWorld(true);
  prop = addProp('tasks', { name: tr('board.tasks.name'), hint: '', meshes: [...group.children], act: () => { if (data) toast(summary(data), 6000); } });
}

/** A board from the server (or a test): built the first time there is one; redrawn when it changes. */
let seenHandoff = null;   // the highest handoff seq this page has shown (null: none looked at yet)
const _from = new THREE.Vector3();
export function showTasks(raw) {
  const b = taskBoard(raw, atDesk);
  if (!b) return false;
  data = b; lastRaw = raw;
  if (!group) build();
  // a MyDesk handoff: a brief flies from this board to the desk of the session that got it
  const h = handoffsToFly(raw && raw.handoffs, seenHandoff);
  seenHandoff = h.seen;
  for (const x of h.fly.slice(0, 4)) {
    const w = workers.get(x.to);
    if (!w || !w.root.visible) continue;
    group.getWorldPosition(_from);
    flyEnvelope({ x: _from.x, y: _from.y, z: _from.z }, { x: w.pos.x, y: 1.3 + w.gy(), z: w.pos.y }, 'handoff');
  }
  const key = JSON.stringify([state.streamer, b.todo, b.doing, b.review, b.doneTotal, b.pinned.map((p) => [p.task.id, p.task.title, p.sessionId, sessions.get(p.sessionId)?.desk])]);
  if (key !== sig) { sig = key; drawBoard(b); syncDeskNotes(b); }
  return true;
}
async function poll() {
  clearTimeout(timer);
  let ok = false;
  if (!document.hidden) {
    try { const r = await fetch('/api/mydesk/board', { cache: 'no-store' }); ok = r.ok && showTasks(await r.json()); } catch { /* the office restarting */ }
  }
  timer = setTimeout(poll, ok || document.hidden ? 5000 : 30000);
}

export function setup() {
  if (!PRO && !HQ) return;   // (the small office has no wall free for it)
  document.fonts?.ready.then(() => { sig = ''; if (lastRaw) showTasks(lastRaw); });   // (drawn again in the office's own font)
  if (new URLSearchParams(location.search).has('debug') && window.__office) window.__office.showTasks = showTasks;   // (screenshots, tests)
  if (STATIC || new URLSearchParams(location.search).has('demo')) return;   // (the demo has no MyDesk)
  timer = setTimeout(poll, 3000);
}
