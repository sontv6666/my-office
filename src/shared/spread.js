// Labels that would cover each other on screen, moved apart — pure, no DOM.
// From Munder Difflin's resolveBubbleOverlaps: the label lowest on screen keeps
// its place, each one above it moves up just clear of what it hits. Computed
// from the original rects every time, so the same scene gives the same answer
// (no frame-to-frame jitter).

/** rects: [{ id, x, y, w, h }] (y = top, screen px) → Map(id → px to move up, ≥ 0). */
export function spreadUp(rects, gap = 4) {
  const items = rects.map((r) => ({ ...r, y0: r.y }));
  items.sort((a, b) => (b.y + b.h) - (a.y + a.h) || a.x - b.x || String(a.id).localeCompare(String(b.id)));
  const placed = [];
  for (const r of items) {
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;
      for (const p of placed) {
        const hit = r.x < p.x + p.w && p.x < r.x + r.w && r.y < p.y + p.h + gap && p.y < r.y + r.h + gap;
        if (hit) { r.y = p.y - r.h - gap; moved = true; }
      }
      if (!moved) break;
    }
    placed.push(r);
  }
  return new Map(items.map((r) => [r.id, Math.max(0, Math.round(r.y0 - r.y))]));
}

/**
 * Chips pinned along the edges of a W×H stage: keep them inside, out of the
 * `avoid` rects (e.g. the camera toolbar), and apart from each other.
 * chips: [{ id, x, y, w, h }] centred positions → Map(id → { x, y }).
 */
export function placeEdgeChips(chips, W, H, { avoid = [], gap = 6, margin = 8 } = {}) {
  const out = new Map();
  const taken = [...avoid];
  const order = [...chips].sort((a, b) => a.y - b.y || a.x - b.x || String(a.id).localeCompare(String(b.id)));
  const clampX = (x, w) => Math.min(W - margin - w / 2, Math.max(margin + w / 2, x));
  const clampY = (y, h) => Math.min(H - margin - h / 2, Math.max(margin + h / 2, y));
  for (const c of order) {
    let x = clampX(c.x, c.w), y = clampY(c.y, c.h);
    for (let pass = 0; pass < 24; pass++) {
      const box = { x: x - c.w / 2, y: y - c.h / 2, w: c.w, h: c.h };
      const hit = taken.find((t) => box.x < t.x + t.w + gap && t.x < box.x + box.w + gap && box.y < t.y + t.h + gap && t.y < box.y + box.h + gap);
      if (!hit) break;
      y = clampY(hit.y - gap - c.h / 2, c.h);   // move up, above what it hit
      if (y - c.h / 2 < margin) { y = clampY(c.y, c.h); x = clampX(hit.x - gap - c.w / 2, c.w); }   // no room above: step left
    }
    out.set(c.id, { x: Math.round(x), y: Math.round(y) });
    taken.push({ x: x - c.w / 2, y: y - c.h / 2, w: c.w, h: c.h });
  }
  return out;
}
