// "Needs you", and what lasts until you look (src/shared/attention.js decides which):
//   - whoever waits for you gets a calm amber beacon: a soft light column and a floor ring that breathe slowly, and a
//     chip at the edge of the stage while they are out of view (a click brings the camera to them);
//   - a session whose turn ended in an error keeps a small red mark over its desk until it works again;
//   - one that finished and you have not looked at yet keeps a small flag over its desk (MyDesk's `unreviewed` when
//     MyDesk sends it, else until you open it here).
// Every one of them comes from the session's status, its events or MyDesk's record; with nobody waiting nothing here
// moves, and the frame's check is a size test.
import * as THREE from 'three';
import { state } from '../core/state.js';
import { el, reduceMotion, short } from '../core/env.js';
import { camera, scene } from '../scene/renderer.js';
import { canvasTex } from '../scene/blocks.js';
import { DESKS, dLocal } from '../world/desks.js';
import { ACT } from './event-text.js';
import { dn, sessions, workers } from '../people/workers.js';
import { autoCam, panTo, showPerson } from './camera-bar.js';
import { queueUi } from './activity.js';
import { notifyWait } from './topbar.js';
import { sfx } from '../audio/sfx.js';
import { fp } from '../interact/first-person.js';
import { attentionOf, nextMemory } from '../../shared/attention.js';
import { placeEdgeChips } from '../../shared/spread.js';
import { t as tr } from '../../i18n/index.js';

const AMBER = new THREE.Color('#F2B33D');
const memory = new Map();   // session id -> { err, done } (shared/attention.js nextMemory)
const held = new Map();     // session id -> 'wait' | 'error' | 'review'
const beacons = new Map();  // session id -> { g, ring, col }
const marks = new Map();    // session id -> { sprite, key }
const chips = new Map();    // session id -> { b, name, arrow, css }
let dirty = false, edgeEl = null, chipsAt = 0, colTex = null;
const markTex = new Map();  // 'error' | 'review:#rrggbb' -> texture

/** What session `id` holds for you now ('wait' | 'error' | 'review' | ''). */
export const attentionNow = (id) => held.get(id) || '';
/** Everyone holding something for you now: [[session id, 'wait' | 'error' | 'review'], …] (the wall's board, ui/needs-board.js). */
export const attentionAll = () => [...held];

/** A session update (net/live.js upsertSession): `prev` its status before. fx: a live change (not the first snapshot,
    not a replayed backlog); viaEvent: the update came with its own wait/ask event (life/incidents.js raises the hand,
    plays the sound and notifies for those). Agents of other CLIs only ever send updates: they get all of it here. */
export function noteStatus(s, prev, { fx = false, viaEvent = false } = {}) {
  memory.set(s.id, nextMemory(memory.get(s.id), { prev, status: s.status }));
  dirty = true;
  const w = workers.get(s.id); if (!w) return;
  // answered (or gone back to rest): the "waiting for you" bubble goes with it (else the hand lowering says it again)
  if (prev === 'wait' && s.status !== 'wait' && w.lastSay?.kind === 'wait') { w.hush(); w.lastSay = null; }
  if (s.status !== 'wait' || prev === 'wait') return;
  if (!viaEvent) {
    w.push({ ...ACT.wait, type: 'wait', text: s.last?.label ? `${tr('activity.doing.wait')} · ${s.last.label}` : tr('activity.doing.wait') });
    if (fx) { sfx.play('perm'); notifyWait(s, { label: s.last?.label || '' }); }
  }
  if (fx && !state.selectedId && autoCam()) panTo(w);   // (the approval hook's own card pans too: ui/permissions.js)
}
/** A session left the office (net/live.js removeSession): its pieces go on the next frame. */
export function noteGone() { dirty = true; }
/** One of a session's own events (life/incidents.js onEvent). */
export function noteEvent(e) {
  if (!e || e.agent || !e.sess) return;
  memory.set(e.sess, nextMemory(memory.get(e.sess), { e, status: sessions.get(e.sess)?.status }));
  dirty = true;
}

/* ---------- the pieces ---------- */
function beaconFor(id) {
  let b = beacons.get(id);
  if (b) return b;
  colTex ||= canvasTex(4, 128, (g, w, h) => {   // the column: brightest at the floor, gone by the top
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.6, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const soft = { color: AMBER, transparent: true, depthWrite: false, toneMapped: false };   // (not additive: it has to show on the light day floor too)
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 48), new THREE.MeshBasicMaterial({ ...soft, opacity: 0.55 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.6, 32, 1, true), new THREE.MeshBasicMaterial({ ...soft, map: colTex, opacity: 0.2, side: THREE.DoubleSide }));
  col.position.y = 1.3;
  g.add(ring, col); g.userData.dynamic = true; g.visible = false; scene.add(g);
  b = { g, ring, col };
  beacons.set(id, b);
  return b;
}
function texFor(kind, color) {
  const key = kind === 'review' ? `review:${color}` : kind;
  let t = markTex.get(key);
  if (t) return t;
  t = canvasTex(64, 64, (g) => {
    g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = '#1B1F26';
    if (kind === 'error') {   // a red disc with a "!"
      g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fillStyle = '#E5484D'; g.fill(); g.stroke();
      g.font = '900 34px "Baloo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#FFFFFF'; g.fillText('!', 32, 34);
    } else {                  // a small flag in the project's colour
      g.beginPath(); g.moveTo(18, 56); g.lineTo(18, 8); g.lineWidth = 6; g.stroke(); g.lineWidth = 3; g.strokeStyle = '#F4F0E8'; g.stroke();
      g.beginPath(); g.moveTo(20, 9); g.lineTo(54, 19); g.lineTo(20, 31); g.closePath(); g.lineWidth = 5; g.strokeStyle = '#1B1F26'; g.stroke(); g.fillStyle = color; g.fill();
    }
  });
  markTex.set(key, t);
  return t;
}
function markFor(id, kind, color) {
  const key = `${kind}|${color}`;
  let m = marks.get(id);
  if (m?.key === key) return m;
  if (!m) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    sprite.scale.setScalar(0.34); sprite.userData.dynamic = true; scene.add(sprite);
    m = { sprite, key: '' }; marks.set(id, m);
  }
  m.key = key; m.sprite.material.map = texFor(kind, color); m.sprite.material.needsUpdate = true;
  return m;
}
function chipFor(id) {
  let c = chips.get(id);
  if (c) return c;
  const b = el('button', 'ny-edge'); b.type = 'button'; b.hidden = true; b.dataset.sess = id;
  const arrow = el('i', 'ny-arrow'), name = el('span', 'ny-name');
  b.append(arrow, el('span', 'ny-dot'), name);
  edgeEl.append(b);
  c = { b, name, arrow, css: '' };
  chips.set(id, c);
  return c;
}
function drop(map, id, off) { const x = map.get(id); if (x) { off(x); map.delete(id); } }
const dropBeacon = (id) => drop(beacons, id, (b) => { scene.remove(b.g); b.ring.geometry.dispose(); b.ring.material.dispose(); b.col.geometry.dispose(); b.col.material.dispose(); });
const dropMark = (id) => drop(marks, id, (m) => { scene.remove(m.sprite); m.sprite.material.dispose(); });
const dropChip = (id) => drop(chips, id, (c) => c.b.remove());

/* ---------- each frame ---------- */
// what everyone holds, worked out again after a change; the pieces made or put away to match
function sync() {
  dirty = false;
  let changed = false;
  for (const id of [...memory.keys()]) if (!sessions.has(id)) memory.delete(id);
  for (const [id, s] of sessions) {
    const a = attentionOf(s, memory.get(id));
    if ((held.get(id) || '') !== a) { changed = true; if (a) held.set(id, a); else held.delete(id); }
    const w = workers.get(id);
    if (w) {
      w.tagEl.classList.toggle('tag--err', a === 'error');
      w.tagEl.classList.toggle('tag--review', a === 'review');
    }
  }
  for (const id of [...held.keys()]) if (!sessions.has(id)) { held.delete(id); changed = true; }
  for (const id of [...beacons.keys()]) if (held.get(id) !== 'wait') dropBeacon(id);
  for (const id of [...chips.keys()]) if (held.get(id) !== 'wait') dropChip(id);
  for (const id of [...marks.keys()]) if (held.get(id) !== 'error' && held.get(id) !== 'review') dropMark(id);
  for (const [id, a] of held) {
    if (a === 'wait') { beaconFor(id); chipFor(id); }
    else markFor(id, a, sessions.get(id)?.md?.projectColor || '#3DDC84');
  }
  if (changed) queueUi();   // (the session list says it too: ui/activity.js doingOf)
}
const _v = new THREE.Vector3();
// the chips at the edge of the stage, for those waiting out of view (a few times a second is plenty)
function placeChips(now) {
  if (now - chipsAt < 150) return;
  chipsAt = now;
  const W = edgeEl.clientWidth, H = edgeEl.clientHeight, pad = 46;
  const want = [];   // chips to show: where they point, before keeping them apart
  for (const [id, c] of chips) {
    const w = workers.get(id);
    if (w && w.root.visible && !fp.on && !state.photo && W && H) {
      _v.set(w.pos.x, 1.0 + w.gy(), w.pos.y).project(camera);
      if (Math.abs(_v.x) > 0.94 || Math.abs(_v.y) > 0.9) {
        const dx = _v.x, dy = -_v.y, k = 1 / Math.max(Math.abs(dx), Math.abs(dy), 1e-6);
        const label = short(dn(sessions.get(id)) || '', 18);
        if (c.name.textContent !== label) { c.name.textContent = label; c.b.title = tr('activity.needsYou.show', { name: label }); c.w = 0; }
        want.push({ id, x: W / 2 + dx * k * (W / 2 - pad), y: H / 2 + dy * k * (H / 2 - pad), w: c.w || 150, h: c.h || 28,
          a: Math.round((Math.atan2(dy * H, dx * W) * 180) / Math.PI) });
      }
    }
  }
  // never over the camera toolbar, never on top of each other (shared/spread.js)
  let pos = new Map();
  if (want.length) {
    const host = edgeEl.getBoundingClientRect();
    const avoid = [...document.querySelectorAll('.toolbar')].map((b) => b.getBoundingClientRect()).filter((r) => r.width && r.height)
      .map((r) => ({ x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height }));
    pos = placeEdgeChips(want, W, H, { avoid });
  }
  for (const [id, c] of chips) {
    const p = pos.get(id), a = p ? want.find((x) => x.id === id).a : 0;
    const css = p ? `${p.x},${p.y},${a}` : '';
    if (css === c.css) continue;
    c.css = css; c.b.hidden = !css;
    if (css) {
      c.b.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`; c.arrow.style.transform = `rotate(${a}deg)`;
      if (!c.w) { c.w = c.b.offsetWidth; c.h = c.b.offsetHeight; }   // its real size, for the next pass
    }
  }
}
export function updateNeedsYou(t) {
  if (state.selectedId && memory.get(state.selectedId)?.done) {   // opened: looked at
    memory.set(state.selectedId, nextMemory(memory.get(state.selectedId), { seen: true })); dirty = true;
  }
  if (dirty) sync();
  if (!held.size) return;
  // a slow breath (about 2.9 s), held still for reduced motion
  const k = reduceMotion ? 0.6 : 0.5 + 0.5 * Math.sin(t * 2.2);
  for (const [id, b] of beacons) {
    const w = workers.get(id);
    const on = !!w && w.root.visible && !fp.on;
    if (b.g.visible !== on) b.g.visible = on;
    if (!on) continue;
    b.g.position.set(w.pos.x, w.gy(), w.pos.y);
    b.ring.material.opacity = 0.35 + 0.35 * k;
    b.col.material.opacity = 0.1 + 0.12 * k;
  }
  for (const [id, m] of marks) {   // over the desk (by the screen); someone without a desk: over their head
    const s = sessions.get(id), w = workers.get(id), d = s && s.desk >= 0 ? DESKS[s.desk] : null;
    if (d) { const [x, z] = dLocal(d, 0.5, 0.28); m.sprite.position.set(x, 1.22, z); m.sprite.visible = true; }
    else if (w) { m.sprite.position.set(w.pos.x, 2.55 + w.gy(), w.pos.y); m.sprite.visible = w.root.visible; }
    else m.sprite.visible = false;
  }
  if (chips.size) placeChips(performance.now());
}

export function setup() {
  edgeEl = el('div', 'ny-edges');
  document.getElementById('stage-wrap')?.append(edgeEl);
  edgeEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sess]'); if (!b) return;
    const w = workers.get(b.dataset.sess); if (w) showPerson(w);
  });
}
