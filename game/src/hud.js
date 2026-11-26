// Gullwing — the heads-up display: the lit instrument strip (speed, altitude,
// heading tape, fuel, damage), mission banners, warnings, and the title and
// end-of-sortie screens.

import { VIEW_W, VIEW_H, PALETTE, MISSIONS } from './config.js';
import { FLIGHT } from './config.js';

/** Top banners: mission panel on the left, score panel on the right.
 * Text lives in the DOM overlay (dom.js); the canvas draws only shapes. */
export function drawTop(ctx, ms, t) {
  if (!ms) return;
  ctx.save();
  // Mission panel, top-left; score panel, top-right.
  panel(ctx, 14, 12, 560, 58);
  const w = 210;
  panel(ctx, VIEW_W - w - 14, 12, w, 58);
  ctx.restore();
  void t;
}

/** Bottom instrument strip (chase view): fuel bar, damage bar, heading tape.
 * Numbers and labels live in the DOM overlay (dom.js). */
export function drawBottom(ctx, ms, ac, agl, t) {
  ctx.save();
  const w = 680, h = 66, x = VIEW_W / 2 - w / 2, y = VIEW_H - h - 14;
  panel(ctx, x, y, w, h, 12);

  // Heading tape.
  drawHeadingTape(ctx, x + 250, y + 10, 220, 46, ac.yaw);

  // Fuel.
  const fx = x + w - 216;
  const fw = 120, low = ac.fuel < FLIGHT.fuelReservePct;
  const blink = low && Math.floor(t * 3) % 2 === 0;
  bar(ctx, fx, y + 26, fw, 12, ac.fuel, blink ? PALETTE.hudRed : low ? PALETTE.hudRed : ac.fuel < 0.25 ? PALETTE.hudAmber : PALETTE.hudGreen);
  // Damage.
  if (ac.health < 1) {
    bar(ctx, fx, y + 58, fw, 6, ac.health, PALETTE.hudRed);
  }
  ctx.restore();
  void ms;
  void agl;
}

/** The compass ribbon: ticks every 15 degrees. Letters live in the DOM. */
function drawHeadingTape(ctx, x, y, w, h, yaw) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const degPerPx = 0.6;
  const headDeg = ((yaw * 180) / Math.PI) % 360;
  const start = Math.floor((headDeg - w / 2 / degPerPx) / 15) * 15;
  for (let d = start; d <= headDeg + w / 2 / degPerPx + 15; d += 15) {
    const px = x + w / 2 + ((d - headDeg) / degPerPx);
    if (px < x - 10 || px > x + w + 10) continue;
    const major = d % 90 === 0;
    const mid = d % 45 === 0;
    ctx.strokeStyle = major ? 'rgba(255,207,110,0.95)' : mid ? 'rgba(143,232,255,0.8)' : 'rgba(143,232,255,0.45)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(px, y + h - 6);
    ctx.lineTo(px, y + (major ? h - 22 : mid ? h - 16 : h - 11));
    ctx.stroke();
  }
  // Centre caret.
  ctx.fillStyle = PALETTE.hudGreen;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + h - 4);
  ctx.lineTo(x + w / 2 - 5, y + h + 2);
  ctx.lineTo(x + w / 2 + 5, y + h + 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Stall and engine warnings. The words live in the DOM overlay (dom.js);
 * the canvas draws nothing here. Kept as an export: main.js still calls it. */
export function drawWarnings(ctx, ac, t) {
  void ctx;
  void ac;
  void t;
}

/** Crosshair: a quiet reticle in the chase view. */
export function drawReticle(ctx, t) {
  ctx.save();
  ctx.translate(VIEW_W / 2, VIEW_H / 2);
  ctx.strokeStyle = 'rgba(143,232,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of [[-22, 0, -10, 0], [10, 0, 22, 0], [0, -22, 0, -10], [0, 10, 0, 22]]) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  void t;
  ctx.restore();
}

// ---- title screen ---------------------------------------------------------------

/** The title: the dim wash and the sortie panels. Words live in the DOM. */
export function drawTitle(ctx, sel, best, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 24, 0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Sortie list panels.
  let y = 268;
  MISSIONS.forEach((m, i) => {
    const active = i === sel;
    const w = active ? 620 : 560;
    panel(ctx, VIEW_W / 2 - w / 2, y - 18, w, 44, active ? 10 : 0, active ? 0.85 : 0.35);
    y += 56;
  });
  ctx.restore();
  void best;
  void t;
}

// ---- end of sortie -----------------------------------------------------------------

/** The debrief: dim wash and the panel. Words live in the DOM overlay. */
export function drawEnd(ctx, ms, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 12, 24, 0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const w = 560, h = 330, x = VIEW_W / 2 - w / 2, y = VIEW_H / 2 - h / 2 - 10;
  panel(ctx, x, y, w, h, 14, 0.92);
  ctx.restore();
  void ms;
  void t;
}

// ---- small drawing helpers ---------------------------------------------------------

/** A dark rounded panel with a thin lit edge. */
export function panel(ctx, x, y, w, h, radius = 8, alpha = 0.72) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(10, 14, 26, 0.78)';
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(126, 240, 216, 0.35)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius);
  ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

