// The 3D view losing its WebGL context (the GPU process restarted, a driver reset, too many WebGL views open at once):
// drawing pauses, the context is asked back after ~1.5 s, and what lived only on the GPU (the environment maps, the
// shadow map) is made again; after 3 tries the stage says so in plain words, with a way to load the page again.
// The policy is src/shared/gl-recovery.js; three.js itself already keeps the context restorable (preventDefault) and
// uploads geometry and textures again on its own when it is back.
import { el, stage } from '../core/env.js';
import { labels, renderer, rebuildEnv, resize } from './renderer.js';
import { glStart, glStep } from '../../shared/gl-recovery.js';
import { t as tr } from '../../i18n/index.js';

let st = glStart(), timer = 0, note = null, loseExt = null;
/** True while the scene must not be drawn (context gone, or given up). */
export const glDown = () => st.phase !== 'ok';
/** True once it has given up (the render loop stops). */
export const glDead = () => st.phase === 'dead';

function step(ev) {
  const r = glStep(st, ev, performance.now());
  st = r.st;
  clearTimeout(timer); timer = 0;
  if (st.at) timer = setTimeout(() => step('tick'), Math.max(0, st.at - performance.now()) + 5);
  if (r.act === 'pause' || r.act === 'restore') say(tr('world.glLost'), false);
  if (r.act === 'restore') try { loseExt?.restoreContext(); } catch { /* not lost after all, or not ours to restore: the next tick counts it */ }
  if (r.act === 'rebuild') {
    try { rebuildEnv(); } catch { /* drawn without reflections rather than not at all */ }
    renderer.shadowMap.needsUpdate = true;
    resize();
    say(null);
  }
  if (r.act === 'dead') say(tr('world.glDead'), true);
}
function say(text, dead) {
  labels.domElement.style.visibility = text ? 'hidden' : '';   // (names and bubbles go with the picture they belong to)
  if (!text) { note?.remove(); note = null; return; }
  if (!note) { note = el('div', 'empty panel gl-note'); note.setAttribute('role', 'status'); stage.append(note); }
  note.replaceChildren(el('span', '', text));
  if (dead) {
    const b = el('button', 'btn btn--sm btn--accent', tr('world.glReload')); b.type = 'button';
    b.addEventListener('click', () => location.reload());
    note.append(el('br'), b);
  }
}

export function setup() {
  const c = renderer.domElement;
  // (taken now: once the context is lost the extension can no longer be asked for, and it is the way to ask it back)
  loseExt = renderer.getContext().getExtension('WEBGL_lose_context');
  c.addEventListener('webglcontextlost', (e) => { e.preventDefault(); step('lost'); });
  c.addEventListener('webglcontextrestored', () => step('restored'));
}
