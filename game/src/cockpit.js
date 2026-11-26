// Gullwing — the cockpit: a lit instrument panel drawn in front of the
// windshield — airspeed, altimeter, heading indicator, turn indicator, fuel
// and engine gauges, plus annunciator lamps. This is the "instruments lit"
// view; the chase view carries the same data as the HUD strip.

import { VIEW_W, VIEW_H, PALETTE } from './config.js';
import { FLIGHT } from './config.js';
import { airSpeed } from './aircraft.js';

/** Paint the whole cockpit: frame, panel and every gauge. */
export function drawCockpit(ctx, ac, agl, t, overGreen) {
  const panelTop = VIEW_H * 0.60;
  // Windshield frame: top band and A-pillars.
  ctx.save();
  ctx.fillStyle = '#0c111c';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(VIEW_W, 0);
  ctx.lineTo(VIEW_W, 26);
  ctx.quadraticCurveTo(VIEW_W / 2, 54, 0, 26);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(150, 0);
  ctx.lineTo(30, panelTop + 40);
  ctx.lineTo(0, panelTop + 60);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(VIEW_W, 0);
  ctx.lineTo(VIEW_W - 150, 0);
  ctx.lineTo(VIEW_W - 30, panelTop + 40);
  ctx.lineTo(VIEW_W, panelTop + 60);
  ctx.closePath();
  ctx.fill();
  // Glass glint.
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#cfe8ff';
  ctx.beginPath();
  ctx.moveTo(VIEW_W * 0.25, 0);
  ctx.lineTo(VIEW_W * 0.45, 0);
  ctx.lineTo(VIEW_W * 0.2, panelTop);
  ctx.lineTo(VIEW_W * 0.05, panelTop);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Dashboard.
  ctx.save();
  const g = ctx.createLinearGradient(0, panelTop, 0, VIEW_H);
  g.addColorStop(0, '#232c3d');
  g.addColorStop(0.12, PALETTE.panelMid);
  g.addColorStop(1, PALETTE.panelDark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, panelTop + 60);
  ctx.quadraticCurveTo(VIEW_W / 2, panelTop - 26, VIEW_W, panelTop + 60);
  ctx.lineTo(VIEW_W, VIEW_H);
  ctx.lineTo(0, VIEW_H);
  ctx.closePath();
  ctx.fill();
  // Panel lip highlight.
  ctx.strokeStyle = 'rgba(126,240,216,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, panelTop + 60);
  ctx.quadraticCurveTo(VIEW_W / 2, panelTop - 26, VIEW_W, panelTop + 60);
  ctx.stroke();

  const cy = panelTop + (VIEW_H - panelTop) * 0.52;
  const r = Math.min(74, (VIEW_H - panelTop) * 0.30);
  drawAirspeedGauge(ctx, 210, cy, r, ac);
  drawAltimeter(ctx, VIEW_W / 2 - 130, cy, r, ac, agl);
  drawHeadingIndicator(ctx, VIEW_W / 2 + 130, cy, r, ac);
  drawTurnGauge(ctx, VIEW_W - 210, cy, r * 0.82, ac);
  drawFuelGauge(ctx, VIEW_W - 90, cy, ac);
  drawEngineGauge(ctx, 100, cy, ac);
  drawAnnunciators(ctx, VIEW_W / 2, cy - r - 26, ac, overGreen, t);
  ctx.restore();
}

/** A lit circular gauge: ticks, arc, needle, digital readout. */
function gaugeBase(ctx, x, y, r, opts) {
  ctx.save();
  // Bezel.
  const bg = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 1.18);
  bg.addColorStop(0, PALETTE.panelDark);
  bg.addColorStop(1, '#05070c');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.18, 0, Math.PI * 2);
  ctx.fill();
  // Face.
  const fg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r);
  fg.addColorStop(0, '#2b3548');
  fg.addColorStop(1, '#121724');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(126,240,216,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const a0 = opts.a0 ?? -225, a1 = opts.a1 ?? 45;
  // Ticks. Numbers live in the DOM overlay (dom.js).
  for (let v = opts.min; v <= opts.max + 0.001; v += opts.tick) {
    const f = (v - opts.min) / (opts.max - opts.min);
    const a = ((a0 + (a1 - a0) * f) * Math.PI) / 180;
    const major = Math.abs(v / opts.tick - Math.round(v / opts.tick)) < 1e-6 && (Math.round(v / opts.tick) % opts.majorEvery === 0);
    const r0 = r * (major ? 0.74 : 0.82);
    ctx.strokeStyle = opts.tint ?? 'rgba(223,227,232,0.85)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  // Value arc.
  const vf = (opts.value - opts.min) / (opts.max - opts.min);
  const va = ((a0 + (a1 - a0) * Math.max(0, Math.min(1, vf))) * Math.PI) / 180;
  ctx.strokeStyle = opts.arc ?? PALETTE.hudCyan;
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.98, (a0 * Math.PI) / 180, va);
  ctx.stroke();
  ctx.restore();
  return { a0, a1, x, y, r };
}

function needle(ctx, x, y, r, angleDeg, color) {
  const a = (angleDeg * Math.PI) / 180;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(a) * r * 0.18, y - Math.sin(a) * r * 0.18);
  ctx.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Airspeed indicator, 0–100 m/s with a red arc past the ceiling. */
function drawAirspeedGauge(ctx, x, y, r, ac) {
  const v = airSpeed(ac);
  const base = gaugeBase(ctx, x, y, r, { min: 0, max: 100, value: v, tick: 10, majorEvery: 1, label: 'SPD' });
  // Redline.
  const a0 = base.a0, a1 = base.a1;
  const ra = ((a0 + (a1 - a0) * (FLIGHT.maxSpeed / 100)) * Math.PI) / 180;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,122,110,0.9)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.98, ra, (a1 * Math.PI) / 180);
  ctx.stroke();
  needle(ctx, x, y, r, a0 + (a1 - a0) * (v / 100), PALETTE.hudCyan);
  ctx.restore();
  readout(ctx, x, y + r * 0.52, String(Math.round(v)), 'm/s');
  label(ctx, x, y - r * 0.55, 'AIRSPEED');
}

/** Altimeter: 0–2000 m, long needle in hundreds, short in tens. */
function drawAltimeter(ctx, x, y, r, ac, agl) {
  const h = Math.max(0, ac.pos.y);
  const base = gaugeBase(ctx, x, y, r, { min: 0, max: 2000, value: h, tick: 100, majorEvery: 2, label: 'ALT' });
  const a0 = base.a0, a1 = base.a1;
  const f = Math.min(1, h / 2000);
  needle(ctx, x, y, r, a0 + (a1 - a0) * f, PALETTE.hudAmber);
  // Second needle, one revolution per 200 m.
  const f2 = (h % 200) / 200;
  needle(ctx, x, y, r, a0 + (a1 - a0) * f2, 'rgba(223,227,232,0.75)');
  readout(ctx, x, y + r * 0.52, String(Math.round(h)), `AGL ${Math.max(0, Math.round(agl))}`);
  label(ctx, x, y - r * 0.55, 'ALTITUDE');
}

/** Heading indicator: a rotating compass card under a fixed nose symbol. */
function drawHeadingIndicator(ctx, x, y, r, ac) {
  gaugeBase(ctx, x, y, r, { min: 0, max: 360, value: (ac.yaw * 180) / Math.PI, tick: 30, majorEvery: 3, label: 'HDG', a0: -90, a1: 270 });
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.94, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(((ac.yaw * 180) / Math.PI) * Math.PI / 180);
  // Compass card ticks. Letters live in the DOM overlay (dom.js).
  for (let d = 0; d < 360; d += 30) {
    const a = (d * Math.PI) / 180;
    ctx.strokeStyle = d % 90 === 0 ? PALETTE.hudAmber : 'rgba(223,227,232,0.6)';
    ctx.lineWidth = d % 90 === 0 ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
    ctx.lineTo(Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed nose symbol.
  ctx.save();
  ctx.fillStyle = PALETTE.hudGreen;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.34);
  ctx.lineTo(x - r * 0.09, y - r * 0.16);
  ctx.lineTo(x + r * 0.09, y - r * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(159,242,176,0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.34);
  ctx.lineTo(x, y - r * 0.9);
  ctx.stroke();
  ctx.restore();
  label(ctx, x, y - r * 0.55, 'HEADING');
}

/** Turn coordinator: a small bank pointer under an aircraft glyph. */
function drawTurnGauge(ctx, x, y, r, ac) {
  gaugeBase(ctx, x, y, r, { min: -60, max: 60, value: ac.roll * 57.3, tick: 15, majorEvery: 1, label: 'TURN', tint: 'rgba(143,232,255,0.8)' });
  ctx.save();
  const f = Math.max(0, Math.min(1, (ac.roll * 57.3 + 60) / 120));
  const a0 = -225, a1 = 45;
  const a = (a0 + (a1 - a0) * f) * Math.PI / 180;
  // Fixed horizon line.
  ctx.strokeStyle = 'rgba(223,227,232,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y);
  ctx.lineTo(x + r * 0.6, y);
  ctx.stroke();
  // Aircraft glyph rotating with the bank.
  ctx.translate(x, y - r * 0.34);
  ctx.rotate(ac.roll);
  ctx.fillStyle = PALETTE.hudCyan;
  ctx.fillRect(-r * 0.34, -r * 0.03, r * 0.68, r * 0.06);
  ctx.fillRect(-r * 0.09, -r * 0.14, r * 0.18, r * 0.28);
  ctx.restore();
  label(ctx, x, y - r * 0.55, 'TURN');
  void a;
}

/** Fuel gauge: a vertical bar with an amber reserve band. */
function drawFuelGauge(ctx, x, y, ac) {
  const h = 110, w = 26;
  ctx.save();
  ctx.fillStyle = '#05070c';
  ctx.fillRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8);
  ctx.strokeStyle = 'rgba(126,240,216,0.4)';
  ctx.strokeRect(x - w / 2 - 3.5, y - h / 2 - 3.5, w + 7, h + 7);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  const frac = Math.max(0, Math.min(1, ac.fuel));
  const fh = frac * h;
  const low = ac.fuel < FLIGHT.fuelReservePct;
  ctx.fillStyle = low ? PALETTE.hudRed : frac < 0.25 ? PALETTE.hudAmber : PALETTE.hudGreen;
  ctx.fillRect(x - w / 2, y + h / 2 - fh, w, fh);
  // Reserve band.
  ctx.fillStyle = 'rgba(255,207,110,0.35)';
  ctx.fillRect(x - w / 2, y + h / 2 - FLIGHT.fuelReservePct * h - 2, w, 3);
  ctx.restore();
}

/** Engine: RPM dial and throttle position. */
function drawEngineGauge(ctx, x, y, ac) {
  const r = 44;
  gaugeBase(ctx, x, y, r, { min: 0, max: 2800, value: 620 + ac.throttle * 2050, tick: 700, majorEvery: 1, label: 'RPM' });
  const a0 = -225, a1 = 45;
  const f = (620 + ac.throttle * 2050) / 2800;
  needle(ctx, x, y, r, a0 + (a1 - a0) * f, PALETTE.hudAmber);
  // Throttle lever.
  ctx.save();
  ctx.strokeStyle = 'rgba(223,227,232,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y + r + 14);
  ctx.lineTo(x, y + r + 44);
  ctx.stroke();
  const ly = y + r + 14 + (1 - ac.throttle) * 26;
  ctx.fillStyle = PALETTE.hudCyan;
  ctx.beginPath();
  ctx.arc(x, ly, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  label(ctx, x, y - r * 0.55, 'ENGINE');
}

/** Annunciator lamps: STALL, FUEL, GREEN (over the green zone). */
function drawAnnunciators(ctx, x, y, ac, overGreen, t) {
  const items = [
    { text: 'STALL', on: !ac.onGround && airSpeed(ac) < FLIGHT.stallSpeed + 2.5, color: PALETTE.hudRed },
    { text: 'FUEL LOW', on: ac.fuel < FLIGHT.fuelReservePct && !ac.engineDead, color: PALETTE.hudAmber },
    { text: 'ENGINE', on: ac.engineDead, color: PALETTE.hudRed },
    { text: 'GREEN', on: overGreen, color: PALETTE.hudGreen },
  ];
  ctx.save();
  const w = 92, gap = 12;
  const total = items.length * w + (items.length - 1) * gap;
  let lx = x - total / 2;
  // Lamp boxes only; the words live in the DOM overlay (dom.js).
  for (const it of items) {
    const blink = it.on && Math.floor(t * 3) % 2 === 0;
    ctx.fillStyle = it.on ? (blink ? 'rgba(20,26,40,0.2)' : 'rgba(20,26,40,0.55)') : 'rgba(20,26,40,0.55)';
    ctx.fillRect(lx, y - 11, w, 22);
    ctx.strokeStyle = 'rgba(223,227,232,0.25)';
    ctx.strokeRect(lx + 0.5, y - 10.5, w - 1, 21);
    lx += w + gap;
  }
  ctx.restore();
}

function readout(ctx, x, y, value, sub) {
  // Digital window only; the digits live in the DOM overlay (dom.js).
  ctx.save();
  ctx.fillStyle = 'rgba(5,7,12,0.9)';
  const w = 64;
  ctx.fillRect(x - w / 2, y - 11, w, 24);
  ctx.strokeStyle = 'rgba(126,240,216,0.35)';
  ctx.strokeRect(x - w / 2 + 0.5, y - 10.5, w - 1, 23);
  ctx.restore();
  void value;
  void sub;
}

function label(ctx, x, y, text) {
  // Gauge captions live in the DOM overlay (dom.js).
  void ctx;
  void x;
  void y;
  void text;
}
