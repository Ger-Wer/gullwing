// Gullwing — camera: a smooth chase camera, a cockpit camera, and the
// 3-D to screen projection every renderer uses. Screen space: x right, y down.

import { FOCAL, VIEW_W, VIEW_H } from './config.js';
import { axes, airSpeed } from './aircraft.js';

/** New camera sitting at the world origin. */
export function makeCamera() {
  return { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, roll: 0, shake: 0 };
}

/** Chase view: hang up and back of the wings, easing toward the aircraft. */
export function followChase(cam, ac, dt) {
  const a = axes(ac);
  const f = a.fwd, u = a.up;
  const back = 24 + airSpeed(ac) * 0.05;
  const tx = ac.pos.x - f.x * back + u.x * 5.2;
  const ty = ac.pos.y - f.y * back + u.y * 5.2;
  const tz = ac.pos.z - f.z * back + u.z * 5.2;
  const k = 1 - Math.exp(-5.5 * dt);
  cam.pos.x += (tx - cam.pos.x) * k;
  cam.pos.y += (ty - cam.pos.y) * k;
  cam.pos.z += (tz - cam.pos.z) * k;
  cam.yaw += shortestAngle(ac.yaw - cam.yaw) * Math.min(1, 7 * dt);
  cam.pitch += (ac.pitch * 0.92 - cam.pitch) * Math.min(1, 5 * dt);
  cam.roll += (ac.roll - cam.roll) * Math.min(1, 5 * dt);
}

/** Cockpit view: from the pilot's seat, nose on the nose. */
export function setCockpit(cam, ac) {
  const a = axes(ac);
  const u = a.up, f = a.fwd;
  cam.pos.x = ac.pos.x + u.x * 0.55 + f.x * 0.9;
  cam.pos.y = ac.pos.y + u.y * 0.55 + f.y * 0.9;
  cam.pos.z = ac.pos.z + u.z * 0.55 + f.z * 0.9;
  cam.yaw = ac.yaw;
  cam.pitch = ac.pitch + 0.02;
  cam.roll = ac.roll;
}

export function addShake(cam, amount) {
  cam.shake = Math.min(1.6, cam.shake + amount);
}

export function decayShake(cam, dt) {
  cam.shake = Math.max(0, cam.shake - dt * 2.2);
}

/** Camera basis: fwd, right, up (world vectors). */
export function cameraBasis(cam) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const f = { x: cp * cy, y: sp, z: cp * sy };
  const r = { x: -sy, y: 0, z: cy };
  const u = { x: -cy * sp, y: cp, z: -sy * sp };
  return { f, r, u };
}

/**
 * Project a world point to screen. Returns null when behind the camera.
 * `s` is the on-screen scale: pixels per metre at that depth.
 * Screen space: x right, y down; a point below the camera has y > H/2.
 */
export function project(cam, p, W = VIEW_W, H = VIEW_H) {
  const { f, r, u } = cameraBasis(cam);
  const dx = p.x - cam.pos.x;
  const dy = p.y - cam.pos.y;
  const dz = p.z - cam.pos.z;
  const vz = dx * f.x + dy * f.y + dz * f.z;
  if (vz < 0.35) return null;
  const vx = dx * r.x + dy * r.y + dz * r.z;
  const vdown = -(dx * u.x + dy * u.y + dz * u.z); // positive = below camera
  const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
  // A positive aircraft roll (right wing down) tilts the horizon up on the right.
  const vx2 = vx * cr + vdown * sr;
  const vdown2 = -vx * sr + vdown * cr;
  const s = FOCAL / vz;
  const jx = cam.shake ? (Math.random() - 0.5) * cam.shake * 9 : 0;
  const jy = cam.shake ? (Math.random() - 0.5) * cam.shake * 9 : 0;
  return {
    x: W / 2 + vx2 * s + jx,
    y: H / 2 + vdown2 * s + jy,
    d: vz,
    s,
  };
}

/** World points to view space ({vx right, vdown down, vz forward}). */
export function viewPoints(cam, pts) {
  const { f, r, u } = cameraBasis(cam);
  return pts.map((p) => {
    const dx = p.x - cam.pos.x;
    const dy = p.y - cam.pos.y;
    const dz = p.z - cam.pos.z;
    return {
      vz: dx * f.x + dy * f.y + dz * f.z,
      vx: dx * r.x + dy * r.y + dz * r.z,
      vdown: -(dx * u.x + dy * u.y + dz * u.z),
    };
  });
}

/** Sutherland–Hodgman clip of a view-space polygon against the near plane. */
export function clipNear(viewPts, near = 0.35) {
  const out = [];
  for (let i = 0; i < viewPts.length; i++) {
    const a = viewPts[i];
    const b = viewPts[(i + 1) % viewPts.length];
    const aIn = a.vz >= near;
    const bIn = b.vz >= near;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (near - a.vz) / (b.vz - a.vz);
      out.push({
        vx: a.vx + (b.vx - a.vx) * t,
        vdown: a.vdown + (b.vdown - a.vdown) * t,
        vz: near,
      });
    }
  }
  return out;
}

/** Project a view-space point (after clipping) to screen, with roll and shake. */
export function projectView(cam, vp, W = VIEW_W, H = VIEW_H) {
  const s = FOCAL / vp.vz;
  const cr = Math.cos(cam.roll), sr = Math.sin(cam.roll);
  const vx2 = vp.vx * cr + vp.vdown * sr;
  const vdown2 = -vp.vx * sr + vp.vdown * cr;
  const jx = cam.shake ? (Math.random() - 0.5) * cam.shake * 9 : 0;
  const jy = cam.shake ? (Math.random() - 0.5) * cam.shake * 9 : 0;
  return { x: W / 2 + vx2 * s + jx, y: H / 2 + vdown2 * s + jy, d: vp.vz, s };
}

/** Shortest signed angle from a to b (radians). */
export function shortestAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
