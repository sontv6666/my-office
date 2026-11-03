// Dashed lines from a boss to its subagents: always there, faint, so whose helper is whose reads at a glance; strong for
// the boss you selected or point at (or whose helper you point at).
import * as THREE from 'three';
import { state } from '../core/state.js';
import { scene } from '../scene/renderer.js';
import { leaving, subs, workers } from './workers.js';
import { fp } from '../interact/first-person.js';

const MAX = 48;
let strong, faint;
function lines(opacity, order) {
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * MAX), 3));
  const l = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color: '#8EC2FF', dashSize: 0.16, gapSize: 0.1, transparent: true, opacity, depthTest: false }));
  l.frustumCulled = false; l.renderOrder = order; l.visible = false; l.userData.dynamic = true; l.userData.n = -1; l.userData.key = '';
  scene.add(l);
  return l;
}
// the segments boss -> helper for `team`, written only when someone moved (a still office writes nothing)
function draw(l, team) {
  if (!team.length || fp.on) { l.visible = false; return; }
  const a = l.geometry.attributes.position;
  let n = 0, key = '';
  for (const m of team) {
    if (n >= MAX * 2) break;
    const b = m.parent, bx = b.pos.x, bz = b.pos.y, sx = m.pos.x, sz = m.pos.y;
    key += `${bx.toFixed(2)},${bz.toFixed(2)},${sx.toFixed(2)},${sz.toFixed(2)};`;
    a.setXYZ(n++, bx, 1.1 + b.gy(), bz); a.setXYZ(n++, sx, 0.8 + m.gy(), sz);
  }
  l.visible = true;
  if (key === l.userData.key) return;
  l.userData.key = key;
  a.needsUpdate = true; l.geometry.setDrawRange(0, n); l.computeLineDistances();
}
export function updateTeam() {
  const boss = (state.selectedId && workers.get(state.selectedId)) || (state.hovered ? (state.hovered.sub ? state.hovered.parent : state.hovered) : null);
  const on = [], off = [];
  for (const m of [...subs.values(), ...leaving]) {
    if (!m.sub || !m.parent || !m.root.parent || !m.root.visible || workers.get(m.parent.id) !== m.parent) continue;
    (m.parent === boss ? on : off).push(m);
  }
  draw(strong, on);
  draw(faint, off);
}

export function setup() {
  /* team lines: faint for every team, strong for the selected (or pointed-at) boss's; drawn over everything */
  faint = lines(0.3, 5);
  strong = lines(0.9, 6);
}
