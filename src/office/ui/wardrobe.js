// "Đổi đồ": a person's own clothes, picked in the session drawer — shirt, outfit, hair, hair style, accessory, trousers.
// Sent to the server (POST /api/wardrobe), kept per agent (data/wardrobe.json) and sent back with the session (s.wear):
// the office redraws the person (net/live.js upsertSession) and MyDesk's desk window bakes the same one.
import { el } from '../core/env.js';
import { ACCS, HAIRS, OUTFITS, PALETTE, PANTS, STYLES, lookOf, wearOn } from '../../shared/look.js';
import { TOKEN, upsertSession } from '../net/live.js';
import { toast } from './activity.js';
import { t as tr } from '../../i18n/index.js';

async function save(s, wear) {
  s.wear = wear; upsertSession(s, false);   // (at once on this page; the server's answer comes back as a session update)
  try {
    const r = await fetch(`/api/wardrobe${TOKEN ? `?k=${encodeURIComponent(TOKEN)}` : ''}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, wear }) });
    if (!r.ok) toast(tr('drawer.wear.failed'));
  } catch { toast(tr('drawer.wear.failed')); }
}

/** the panel for session s; redraw() is called after each pick */
export function wardrobePanel(s, redraw) {
  const now = wearOn(lookOf(s), s.wear);
  const box = el('div', 'dr-wear');
  const pick = (k, v) => { save(s, { ...(s.wear || {}), [k]: v }); redraw(); };
  const row = (label, items) => { const r = el('div', 'dr-wear-row'); r.append(el('small', 'dr-wear-l', label), ...items); box.append(r); };
  const swatch = (k, c, on) => {
    const b = el('button', `dr-wear-sw${on ? ' is-on' : ''}`); b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => pick(k, c)); return b;
  };
  const chip = (k, v, label, on) => {
    const b = el('button', `dr-wear-chip${on ? ' is-on' : ''}`, label); b.type = 'button'; b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', () => pick(k, v)); return b;
  };
  const same = (a, b) => String(a || '').toUpperCase() === String(b || '').toUpperCase();
  const outfit = now.outfit || null;   // (none chosen: the rig picks shirt or hoodie from the name)
  row(tr('drawer.wear.shirt'), PALETTE.map((c) => swatch('shirt', c, same(now.shirt, c))));
  row(tr('drawer.wear.outfit'), OUTFITS.map((o) => chip('outfit', o, tr(`drawer.wear.outfits.${o}`), outfit === o)));
  row(tr('drawer.wear.hair'), HAIRS.map((c) => swatch('hair', c, same(now.hair, c))));
  row(tr('drawer.wear.style'), STYLES.map((st) => chip('style', st, tr(`drawer.wear.styles.${st}`), now.style === st)));
  row(tr('drawer.wear.acc'), [...new Set(ACCS.filter(Boolean)), 'none'].map((a) => chip('acc', a, tr(`drawer.wear.accs.${a}`), a === 'none' ? !now.acc : now.acc === a)));
  row(tr('drawer.wear.pants'), PANTS.map((c) => swatch('pants', c, same(now.pants || PANTS[0], c))));
  const reset = el('button', 'btn btn--sm', tr('drawer.wear.reset')); reset.type = 'button'; reset.disabled = !s.wear;
  reset.addEventListener('click', () => { save(s, null); redraw(); });
  box.append(reset, el('p', 'dr-note', tr('drawer.wear.note')));
  return box;
}
