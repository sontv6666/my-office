// People's bubbles never cover each other: after the labels are placed, those that overlap on screen move up just
// clear of the one below (shared/spread.js — learned from Munder Difflin's office). Only a short eased slide when the
// layout changes; with one bubble or none nothing is measured. Sizes are read once per new text, not every frame.
import * as THREE from 'three';
import { camera, labels } from '../scene/renderer.js';
import { workers } from '../people/workers.js';
import { spreadUp } from '../../shared/spread.js';

const _p = new THREE.Vector3();
let at = 0;

export function spreadBubbles(now = performance.now()) {
  if (now - at < 100) return;
  at = now;
  const W = labels.domElement.clientWidth, H = labels.domElement.clientHeight;
  const shown = [];
  for (const [id, w] of workers) {
    if (!w.bubbleObj || !w.bubbleObj.visible || !w.root.visible) { if (w._bubbleUp) lift(w, 0); continue; }
    shown.push([id, w]);
  }
  if (shown.length < 2 || !W || !H) { for (const [, w] of shown) if (w._bubbleUp) lift(w, 0); return; }
  const rects = [];
  for (const [id, w] of shown) {
    const text = w.bubbleEl.textContent;
    // (measured again while it reads 0: a bubble sized while still hidden is 0 wide and would never count as overlapping)
    if (w._bubbleText !== text || !w._bubbleW) { w._bubbleText = text; w._bubbleW = w.bubbleEl.offsetWidth; w._bubbleH = w.bubbleEl.offsetHeight; }
    if (!w._bubbleW) continue;
    w.bubbleObj.getWorldPosition(_p).project(camera);
    if (_p.z > 1) continue;   // behind the camera
    const x = (_p.x + 1) / 2 * W, y = (1 - _p.y) / 2 * H;
    rects.push({ id, x: x - w._bubbleW / 2, y: y - 22 - w._bubbleH, w: w._bubbleW, h: w._bubbleH });   // (.bubble sits 22px above its anchor)
  }
  const up = spreadUp(rects, 4);
  for (const [id, w] of shown) lift(w, up.get(id) || 0);
}

function lift(w, px) {
  if (Math.abs((w._bubbleUp || 0) - px) < 2) return;
  w._bubbleUp = px;
  w.bubbleEl.style.translate = px ? `0 ${-px}px` : '';
}
