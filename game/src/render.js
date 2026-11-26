// Gullwing — world rendering: sky with a low sun, drifting clouds, the bay
// water, the heightfield terrain with the town and runway drawn as sorted
// quads, the mission rings and the aircraft itself.

import { FOCAL, VIEW_W, VIEW_H, WORLD, PALETTE } from './config.js';
import { terrainHeightAt, townBuildings, cloudField } from './terrain.js';
import { project, viewPoints, clipNear, projectView } from './camera.js';
import { axes } from './aircraft.js';
import { valueNoise } from './random.js';

const BUILDINGS = townBuildings();
const CLOUDS = cloudField();
// Terrain tessellation: fine cells near the camera so the ground reads as
// continuous ground, not flat tiles; coarser cells toward the horizon.
// (cell, radius, inner skip) — each layer is a ring around the camera.
const LAYERS = [
  [30, 420, 0],
  [60, 1080, 420],
  [120, 2400, 1080],
  [256, 2600, 2400],
];

// ---- sky ---------------------------------------------------------------------

const SUN_DIR = norm({ x: 0.62, y: -0.24, z: 0.55 }); // low, over the bay

function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Paint the sky: a vertical gradient whose horizon follows the camera pitch. */
export function drawSky(ctx, cam) {
  const horizon = VIEW_H / 2 + FOCAL * Math.tan(cam.pitch) * 0.98;
  const g = ctx.createLinearGradient(0, -200, 0, VIEW_H + 200);
  const t = Math.min(1, Math.max(0, (horizon) / VIEW_H));
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(Math.max(0.02, t - 0.38), PALETTE.skyMid);
  g.addColorStop(Math.min(0.98, t - 0.02), PALETTE.skyLow);
  g.addColorStop(1, PALETTE.haze);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Sun disc and glow (effectively at infinity: a fixed angular size).
  const sp = project(cam, { x: cam.pos.x + SUN_DIR.x * 9000, y: cam.pos.y + SUN_DIR.y * 9000, z: cam.pos.z + SUN_DIR.z * 9000 });
  if (sp) {
    const rad = 34;
    const glow = ctx.createRadialGradient(sp.x, sp.y, rad * 0.2, sp.x, sp.y, rad * 5);
    glow.addColorStop(0, PALETTE.sunGlow);
    glow.addColorStop(1, 'rgba(255,190,96,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sp.x - rad * 5, sp.y - rad * 5, rad * 10, rad * 10);
    ctx.fillStyle = PALETTE.sun;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Soft cloud puffs, drifting slowly east with world time. */
export function drawClouds(ctx, cam, t) {
  for (const c of CLOUDS) {
    const cx = c.x + c.drift * t;
    const p = project(cam, { x: cx, y: c.y, z: c.z });
    if (!p || p.d < 80) continue;
    const r = c.r * p.s * 0.55;
    if (r < 4 || p.x < -r * 3 || p.x > VIEW_W + r * 3 || p.y < -r * 3 || p.y > VIEW_H + r * 3) continue;
    const g = ctx.createRadialGradient(p.x, p.y, r * 0.1, p.x, p.y, r);
    g.addColorStop(0, `rgba(255, 244, 224, ${c.a})`);
    g.addColorStop(0.65, `rgba(255, 240, 220, ${c.a * 0.5})`);
    g.addColorStop(1, 'rgba(255, 240, 220, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r, r * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- water -------------------------------------------------------------------

/** The bay: one big quad at water level, shaded toward the horizon. */
export function drawWater(ctx, cam) {
  const ext = 4200;
  const c = cam.pos;
  const world = [
    { x: c.x - ext, y: 0, z: c.z - ext },
    { x: c.x + ext, y: 0, z: c.z - ext },
    { x: c.x + ext, y: 0, z: c.z + ext },
    { x: c.x - ext, y: 0, z: c.z + ext },
  ];
  const pts = clipNear(viewPoints(cam, world)).map((vp) => projectView(cam, vp));
  if (pts.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  const yTop = Math.min(...pts.map((p) => p.y));
  const yBot = Math.max(...pts.map((p) => p.y));
  const g = ctx.createLinearGradient(0, yTop, 0, yBot);
  g.addColorStop(0, PALETTE.waterShallow);
  g.addColorStop(0.25, PALETTE.waterDeep);
  g.addColorStop(1, '#123c52');
  ctx.fillStyle = g;
  ctx.fill();
  // Sun glint on the water: a warm streak toward the sun's bearing.
  const sp = project(cam, { x: c.x + SUN_DIR.x * 9000, y: 0.01, z: c.z + SUN_DIR.z * 9000 });
  if (sp && sp.y > yTop - 40) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    const g2 = ctx.createLinearGradient(0, yTop, 0, VIEW_H);
    g2.addColorStop(0, PALETTE.waterGlint);
    g2.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    const w = Math.min(VIEW_W * 0.5, sp.s * 900);
    ctx.moveTo(sp.x, yTop);
    ctx.lineTo(sp.x + w, VIEW_H);
    ctx.lineTo(sp.x - w, VIEW_H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ---- terrain -----------------------------------------------------------------

function terrainColor(h, slope, x, z) {
  const P = PALETTE;
  let c;
  if (h < 0.35) c = mix(P.sand, P.waterShallow, 0.25);
  else if (h < 2.4) c = P.sand;
  else if (h < 70) c = mix(P.grassA, P.grassB, valueNoise(x * 0.008, z * 0.008, 7));
  else if (h < 150) c = mix(P.grassB, P.rockA, (h - 70) / 80);
  else if (h < 260) c = P.rockA;
  else c = mix(P.rockA, P.snow, Math.min(1, (h - 260) / 140));
  const shade = 1 - Math.min(0.42, slope * 0.055);
  return shadeColor(c, shade);
}

function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function shadeColor(rgbStr, k) {
  const m = rgbStr.match(/\d+/g);
  return `rgb(${Math.round(m[0] * k)},${Math.round(m[1] * k)},${Math.round(m[2] * k)})`;
}
function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

/** Build the frame's list of terrain/building/runway quads, far first. */
function worldQuads(cam, t) {
  const quads = [];
  for (const [cell, radius, innerSkip] of LAYERS) addTerrainLayer(quads, cam, cell, radius, innerSkip);
  addTown(quads, cam);
  addRunway(quads, cam, t);
  quads.sort((a, b) => b.depth - a.depth);
  return quads;
}

function addTerrainLayer(quads, cam, cell, radius, innerSkip) {
  const n = Math.ceil(radius / cell);
  const hs = [];
  for (let iz = -n; iz <= n; iz++) {
    const row = [];
    for (let ix = -n; ix <= n; ix++) {
      const x = cam.pos.x + ix * cell;
      const z = cam.pos.z + iz * cell;
      row.push(terrainHeightAt(x, z));
    }
    hs.push(row);
  }
  for (let iz = -n; iz < n; iz++) {
    for (let ix = -n; ix < n; ix++) {
      const cx = cam.pos.x + (ix + 0.5) * cell;
      const cz = cam.pos.z + (iz + 0.5) * cell;
      if (Math.hypot(cx - cam.pos.x, cz - cam.pos.z) < innerSkip) continue;
      const i0 = ix + n, i1 = iz + n;
      const h00 = hs[i1][i0], h10 = hs[i1][i0 + 1], h01 = hs[i1 + 1][i0], h11 = hs[i1 + 1][i0 + 1];
      if (h00 < -1.2 && h10 < -1.2 && h01 < -1.2 && h11 < -1.2) continue; // seafloor under the bay
      const world = [
        { x: cam.pos.x + ix * cell, y: h00, z: cam.pos.z + iz * cell },
        { x: cam.pos.x + (ix + 1) * cell, y: h10, z: cam.pos.z + iz * cell },
        { x: cam.pos.x + (ix + 1) * cell, y: h11, z: cam.pos.z + (iz + 1) * cell },
        { x: cam.pos.x + ix * cell, y: h01, z: cam.pos.z + (iz + 1) * cell },
      ];
      const clipped = clipNear(viewPoints(cam, world));
      if (clipped.length < 3) continue;
      const ps = clipped.map((vp) => projectView(cam, vp));
      // Cells at arm's length blow up to screen-filling quads; the ground
      // right under the camera is behind the view anyway.
      if (Math.min(...ps.map((p) => p.d)) < 6) continue;
      const sx = ps[0].x + ps[1].x + ps[2].x + (ps[3] ? ps[3].x : ps[2].x);
      const sy = ps[0].y + ps[1].y + ps[2].y + (ps[3] ? ps[3].y : ps[2].y);
      if (sx < -400 || sx > VIEW_W * 2 + 400 || sy < -400 || sy > VIEW_H * 2 + 400) continue;
      const h = (h00 + h10 + h11 + h01) / 4;
      const slope = (Math.abs(h10 - h00) + Math.abs(h11 - h01)) / (2 * cell);
      quads.push({ pts: ps, depth: ps.reduce((s, p) => s + p.d, 0) / ps.length, fill: terrainColor(h, slope, cx, cz) });
    }
  }
}

function addTown(quads, cam) {
  for (const b of BUILDINGS) {
    const d = Math.hypot(b.x - cam.pos.x, b.z - cam.pos.z);
    if (d > 2400) continue;
    const x0 = b.x - b.w, x1 = b.x + b.w, z0 = b.z - b.d, z1 = b.z + b.d;
    const y0 = b.h, y1 = b.h + b.height;
    const faces = [
      { pts: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], fill: PALETTE.buildingA }, // roof
      { pts: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], fill: PALETTE.buildingSide }, // north
      { pts: [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], fill: PALETTE.buildingB }, // east
      { pts: [[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]], fill: PALETTE.buildingSide }, // south
      { pts: [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], fill: PALETTE.buildingB }, // west
    ];
    for (const face of faces) {
      const ps = face.pts.map((p) => project(cam, { x: p[0], y: p[1], z: p[2] }));
      if (ps.some((p) => !p)) continue;
      const depth = (ps[0].d + ps[1].d + ps[2].d + ps[3].d) / 4;
      if (depth > 2400) continue;
      quads.push({ pts: ps, depth, fill: face.fill });
    }
  }
}

/** The runway: asphalt cells plus painted markings, as thin bright quads. */
function addRunway(quads, cam, t) {
  const r = WORLD.runway;
  const cx = (r.x0 + r.x1) / 2;
  const cell = 100;
  const n = Math.ceil(Math.abs(cx - cam.pos.x) / cell) + 18;
  for (let ix = -n; ix < n; ix++) {
    const x0 = cx + ix * cell, x1 = x0 + cell;
    if (x0 > r.x1 || x1 < r.x0) continue;
    const px0 = Math.max(x0, r.x0), px1 = Math.min(x1, r.x1);
    const on = px1 - px0 > 4 && Math.abs(cam.pos.z) < 1600;
    if (!on) continue;
    const p00 = project(cam, { x: px0, y: 0.08, z: -r.halfW });
    const p10 = project(cam, { x: px1, y: 0.08, z: -r.halfW });
    const p11 = project(cam, { x: px1, y: 0.08, z: r.halfW });
    const p01 = project(cam, { x: px0, y: 0.08, z: r.halfW });
    if (!p00 || !p10 || !p11 || !p01) continue;
    quads.push({ pts: [p00, p10, p11, p01], depth: (p00.d + p10.d + p11.d + p01.d) / 4, fill: PALETTE.runway });
  }
  // Centreline dashes.
  for (let x = r.x0 + 60; x < r.x1 - 60; x += 90) {
    addStrip(quads, cam, x, x + 45, -1.1, 1.1, PALETTE.marking, 0.85);
  }
  // Threshold bars at both ends.
  for (const [x, s] of [[r.x0 + 8, 1], [r.x1 - 53, -1]]) {
    for (let i = 0; i < 5; i++) {
      const z0 = -r.halfW + 5 + i * 8.6, z1 = z0 + 4.4;
      addStrip(quads, cam, x, x + 45, z0, z1, PALETTE.marking, 0.9);
    }
  }
  // The green zone: two bright side lines and a centre bar.
  addStrip(quads, cam, -420, 420, -r.halfW + 2.5, -r.halfW + 4.5, PALETTE.hudGreen, 0.9);
  addStrip(quads, cam, -420, 420, r.halfW - 4.5, r.halfW - 2.5, PALETTE.hudGreen, 0.9);
  // The runway number '09' is painted by the DOM overlay (dom.js): canvas
  // fillText garbles under the screenshot tool.
}

function addStrip(quads, cam, x0, x1, z0, z1, fill, a) {
  const p00 = project(cam, { x: x0, y: 0.1, z: z0 });
  const p10 = project(cam, { x: x1, y: 0.1, z: z0 });
  const p11 = project(cam, { x: x1, y: 0.1, z: z1 });
  const p01 = project(cam, { x: x0, y: 0.1, z: z1 });
  if (!p00 || !p10 || !p11 || !p01) return;
  quads.push({ pts: [p00, p10, p11, p01], depth: (p00.d + p10.d + p11.d + p01.d) / 4 - 0.5, fill, a });
}

/** Draw all world quads. */
export function drawWorld(ctx, cam, t) {
  for (const q of worldQuads(cam, t)) {
    ctx.globalAlpha = q.a ?? 1;
    ctx.fillStyle = q.fill;
    ctx.beginPath();
    ctx.moveTo(q.pts[0].x, q.pts[0].y);
    for (let i = 1; i < q.pts.length; i++) ctx.lineTo(q.pts[i].x, q.pts[i].y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- rings and checkpoints -----------------------------------------------------

/** Draw mission targets: glowing rings (Sortie 2) and beacons (1 & 3). */
export function drawTargets(ctx, cam, t, targets) {
  const sorted = [...targets].sort((a, b) => {
    const pa = project(cam, a), pb = project(cam, b);
    return (pb?.d ?? 0) - (pa?.d ?? 0);
  });
  for (const tg of sorted) {
    const c = project(cam, { x: tg.x, y: tg.y, z: tg.z });
    if (!c) continue;
    if (tg.kind === 'ring') drawRing(ctx, cam, c, tg, t);
    else drawCheckpoint(ctx, cam, c, tg, t);
  }
}

function ringBasis(tg) {
  // Ring face normal: along the direction the pilot should fly through it.
  let n = tg.n ?? { x: 1, y: 0, z: 0 };
  const l = Math.hypot(n.x, n.y, n.z) || 1;
  n = { x: n.x / l, y: n.y / l, z: n.z / l };
  let up = Math.abs(n.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const u1 = norm3(cross3(up, n));
  const u2 = norm3(cross3(n, u1));
  return { u1, u2 };
}
function cross3(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function norm3(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function drawRing(ctx, cam, c, tg, t) {
  const { u1, u2 } = ringBasis(tg);
  const pulse = tg.active ? 1 + Math.sin(t * 4) * 0.035 : 1;
  const R = tg.r * pulse;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pts.push(project(cam, {
      x: tg.x + (u1.x * Math.cos(a) + u2.x * Math.sin(a)) * R,
      y: tg.y + (u1.y * Math.cos(a) + u2.y * Math.sin(a)) * R,
      z: tg.z + (u1.z * Math.cos(a) + u2.z * Math.sin(a)) * R,
    }));
  }
  if (pts.some((p) => !p)) return;
  ctx.save();
  ctx.lineJoin = 'round';
  if (tg.active) {
    ctx.shadowColor = PALETTE.ringGlow;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = PALETTE.ring;
    ctx.lineWidth = Math.max(2.5, 0.9 * c.s);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= 40; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // Inner ghost ring so it reads at a glance.
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, 0.25 * c.s);
    const ir = R * 0.55;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const p = project(cam, {
        x: tg.x + (u1.x * Math.cos(a) + u2.x * Math.sin(a)) * ir,
        y: tg.y + (u1.y * Math.cos(a) + u2.y * Math.sin(a)) * ir,
        z: tg.z + (u1.z * Math.cos(a) + u2.z * Math.sin(a)) * ir,
      });
      if (!p) break;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  } else {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = PALETTE.ring;
    ctx.lineWidth = Math.max(1.5, 0.5 * c.s);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= 40; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCheckpoint(ctx, cam, c, tg, t) {
  const bob = Math.sin(t * 2.4) * 4;
  const p = project(cam, { x: tg.x, y: tg.y + bob, z: tg.z });
  if (!p) return;
  ctx.save();
  ctx.shadowColor = PALETTE.checkpoint;
  ctx.shadowBlur = 16;
  ctx.fillStyle = tg.done ? 'rgba(159,242,176,0.9)' : PALETTE.checkpoint;
  const s = Math.max(5, 1.6 * p.s);
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.PI / 4 + t * 0.9);
  ctx.fillRect(-s, -s, s * 2, s * 2);
  ctx.restore();
  // Ground beam under the beacon.
  const g = project(cam, { x: tg.x, y: 0, z: tg.z });
  if (g) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = PALETTE.checkpoint;
    ctx.lineWidth = Math.max(1, 0.5 * c.s);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(g.x, g.y);
    ctx.stroke();
    ctx.restore();
  }
}

// ---- the aircraft --------------------------------------------------------------

/** Local (m): x forward, y up, z right. One entry per drawn face. */
const WING = [
  [1.0, 0.30, 0.55], [1.7, 0.02, 3.1], [2.4, 0.42, 7.7],
  [0.7, 0.46, 7.7], [-0.1, 0.16, 3.1], [-0.5, 0.34, 0.55],
];
const FUSE_TOP = [
  [4.5, 0.12, 0], [3.4, 0.42, 0.34], [1.2, 0.5, 0.55], [-1.5, 0.46, 0.5],
  [-4.5, 0.52, 0.3], [-4.5, 0.52, -0.3], [-1.5, 0.46, -0.5], [1.2, 0.5, -0.55],
  [3.4, 0.42, -0.34],
];
const TAIL = [[-3.1, 0.5, 0], [-4.8, 1.62, 0], [-4.8, 0.5, 0]];
const HORIZ = [[-3.5, 0.52, -0.25], [-4.85, 0.6, -2.3], [-4.85, 0.6, 0.25], [-3.5, 0.5, 0.25]];

function toWorld(ac, lp) {
  const a = axes(ac);
  return {
    x: ac.pos.x + a.fwd.x * lp[0] + a.up.x * lp[1] + a.right.x * lp[2],
    y: ac.pos.y + a.fwd.y * lp[0] + a.up.y * lp[1] + a.right.y * lp[2],
    z: ac.pos.z + a.fwd.z * lp[0] + a.up.z * lp[1] + a.right.z * lp[2],
  };
}

function face(ctx, cam, ac, local, fill, alpha = 1) {
  const ps = local.map((lp) => project(cam, toWorld(ac, lp)));
  if (ps.some((p) => !p)) return null;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(ps[0].x, ps[0].y);
  for (let i = 1; i < ps.length; i++) ctx.lineTo(ps[i].x, ps[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  const d = ps.reduce((s, p) => s + p.d, 0) / ps.length;
  return d;
}

/** Draw the Gullwing: gull-wing light plane, prop spinning, gear down. */
export function drawAircraft(ctx, cam, ac, t) {
  const a = axes(ac);
  const P = PALETTE;

  // Faces with a draw order tuned for a chase camera (far to near).
  const faces = [];
  // Opposite wing first (farther when banking is mild).
  const wingL = WING.map(([x, y, z]) => [x, y, -z]);
  faces.push(() => face(ctx, cam, ac, wingL, P.planeShade));
  faces.push(() => face(ctx, cam, ac, HORIZ, P.planeShade));
  faces.push(() => face(ctx, cam, ac, TAIL, P.planeBlue));
  // Fuselage top.
  faces.push(() => face(ctx, cam, ac, FUSE_TOP, P.planeBody));
  // Fuselage side slivers (the cheatline).
  faces.push(() => face(ctx, cam, ac, [[4.3, 0.0, 0.3], [0.5, 0.28, 0.56], [-2.0, 0.26, 0.5], [-4.4, 0.34, 0.3], [-4.4, 0.42, 0.3], [-2.0, 0.4, 0.5], [0.5, 0.42, 0.56], [4.3, 0.14, 0.3]], P.planeBlue, 0.9));
  // Canopy.
  const cp = project(cam, toWorld(ac, [1.8, 0.56, 0]));
  if (cp) {
    ctx.save();
    ctx.fillStyle = P.glass;
    ctx.beginPath();
    ctx.ellipse(cp.x, cp.y, Math.max(1.5, 1.15 * cp.s), Math.max(1, 0.5 * cp.s), Math.atan2(Math.sin(ac.yaw + ac.roll), Math.cos(ac.yaw + ac.roll)), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#cfe8ff';
    ctx.beginPath();
    ctx.ellipse(cp.x - cp.s * 0.15, cp.y - cp.s * 0.15, Math.max(1, 0.7 * cp.s), Math.max(0.7, 0.28 * cp.s), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Near wing last on top.
  faces.push(() => face(ctx, cam, ac, WING, P.planeBody));
  for (const fn of faces) fn();

  // Landing gear.
  for (const [gx, gy, gz, main] of [[1.5, -0.55, 1.15, true], [1.5, -0.55, -1.15, true], [-4.2, -0.35, 0, false]]) {
    const g = project(cam, toWorld(ac, [gx, gy, gz]));
    if (!g) continue;
    if (main) {
      const s = project(cam, toWorld(ac, [gx + 0.3, 0, gz * 0.55]));
      if (s) {
        ctx.strokeStyle = P.planeShade;
        ctx.lineWidth = Math.max(1, 0.12 * g.s);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(g.x, g.y);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#20242c';
    ctx.beginPath();
    ctx.arc(g.x, g.y, Math.max(1.2, (main ? 0.34 : 0.2) * g.s), 0, Math.PI * 2);
    ctx.fill();
  }

  // Propeller: a blurred disc plus two blades at the spin phase.
  const nose = project(cam, toWorld(ac, [4.55, 0.1, 0]));
  if (nose) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#dfe6ee';
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a2 = (i / 20) * Math.PI * 2;
      const wp = toWorld(ac, [4.55, 0.1 + Math.cos(a2) * 2.4, Math.sin(a2) * 2.4]);
      const p = project(cam, wp);
      if (!p) break;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    for (const k of [0, Math.PI]) {
      const ang = ac.prop + k;
      const bx = 4.55, by = 0.1 + Math.cos(ang) * 2.35, bz = Math.sin(ang) * 2.35;
      const p1 = project(cam, toWorld(ac, [4.5, 0.1 + Math.cos(ang) * 0.4, Math.sin(ang) * 0.4]));
      const p2 = project(cam, toWorld(ac, [bx, by, bz]));
      if (!p1 || !p2) continue;
      ctx.strokeStyle = 'rgba(40,46,58,0.85)';
      ctx.lineWidth = Math.max(1, 0.16 * p2.s);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }
  void t;
}
