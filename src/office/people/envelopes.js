// Envelopes in the air (src/shared/envelope.js): a subagent being started flies one from its parent to the place it
// will work, and appears there when it lands; a MyDesk handoff flies one to the session that got it (when MyDesk says
// so). At most 8 at once, each under 2 s, a small ring on landing; with reduced motion they land at once, unseen.
import * as THREE from 'three';
import { reduceMotion } from '../core/env.js';
import { scene } from '../scene/renderer.js';
import { canvasTex } from '../scene/blocks.js';
import { flightMs, flightPoint, roomFor } from '../../shared/envelope.js';

export const ENVELOPE_COLORS = { spawn: '#C4B5FD', handoff: '#7DD3FC' };
const flying = [];   // { sprite, a, b, ms, t, onLand }
const rings = [];    // { mesh, t }
let tex = null, ringGeo = null;

/** Are any in the air (or still landing)? (core/loop.js draws at 30 fps meanwhile.) */
export const envelopesFlying = () => flying.length + rings.length;

/** Fly one from `a` to `b` ({ x, y, z }, taken now), coloured by kind ('spawn' | 'handoff'); onLand() when it lands
    (at once when it cannot fly). */
export function flyEnvelope(a, b, kind = 'spawn', onLand = null) {
  if (reduceMotion || !a || !b || !roomFor(flying.length)) { onLand?.(); return; }
  tex ||= canvasTex(64, 48, (g, w, h) => {   // a white envelope with its flap drawn in
    g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = '#1B1F26'; g.fillStyle = '#FFFFFF';
    g.beginPath(); g.roundRect(4, 6, w - 8, h - 12, 4); g.fill(); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(6, 9); g.lineTo(w / 2, h / 2 + 2); g.lineTo(w - 6, 9); g.stroke();
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: ENVELOPE_COLORS[kind] || ENVELOPE_COLORS.spawn, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(0.34, 0.255, 1); sprite.userData.dynamic = true; sprite.renderOrder = 7;
  const from = { x: a.x, y: a.y, z: a.z }, to = { x: b.x, y: b.y, z: b.z };
  sprite.position.set(from.x, from.y, from.z);
  scene.add(sprite);
  flying.push({ sprite, a: from, b: to, ms: flightMs(from, to), t: 0, onLand });
}

export function updateEnvelopes(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const f = flying[i]; f.t += dt * 1000;
    const p = flightPoint(f.a, f.b, f.t / f.ms);
    f.sprite.position.set(p.x, p.y, p.z); f.sprite.material.rotation = p.tilt;
    if (f.t < f.ms) continue;
    flying.splice(i, 1); scene.remove(f.sprite); f.sprite.material.dispose();
    ringGeo ||= new THREE.RingGeometry(0.8, 1, 32);
    const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#FDE68A', transparent: true, depthWrite: false, toneMapped: false }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(f.b.x, 0.04, f.b.z); mesh.scale.setScalar(0.1); mesh.userData.dynamic = true;
    scene.add(mesh); rings.push({ mesh, t: 0 });
    try { f.onLand?.(); } catch { /* the one it was for left meanwhile */ }
  }
  for (let i = rings.length - 1; i >= 0; i--) {   // the landing ring: grows and fades in a third of a second
    const r = rings[i]; r.t += dt;
    const k = Math.min(1, r.t / 0.34);
    r.mesh.scale.setScalar(0.1 + 0.5 * k); r.mesh.material.opacity = 0.9 * (1 - k);
    if (k >= 1) { rings.splice(i, 1); scene.remove(r.mesh); r.mesh.material.dispose(); }
  }
}
