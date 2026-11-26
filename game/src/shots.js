// Gullwing — shot states: the ?shot=<name>&seed=<n> URL hook that parks the
// game in a fixed, readable pose for a screenshot. Each shot freezes the clock,
// the aircraft and the camera, so the frame is deterministic and the HUD, the
// world and the story all read at a glance.

import { MISSIONS } from './config.js';
import { createMission, flash } from './missions.js';
import { groundHeightAt } from './terrain.js';
import { missionAnchors } from './terrain.js';

const A = missionAnchors();

/** Read the shot request from the page URL, if any. */
export function readShot() {
  const q = new URLSearchParams(window.location.search);
  const name = q.get('shot');
  if (!name) return null;
  return { name, seed: Number(q.get('seed') ?? 1) };
}

const T = 118; // the frozen world clock every shot shares

/** Park the game in one of the named shots. Returns nothing; mutates state. */
export function setupShot(state, name) {
  state.mode = 'fly';
  state.t = T;
  const ms = makeMs(state, name);
  placePlane(state, name, ms);
  placeCam(state, name, ms);
  if (name === 'win' || name === 'lose') state.mode = 'end';
  if (name === 'title') state.mode = 'title';
  if (name === 'cockpit') state.view = 'cockpit';
  else state.view = 'chase';
}

function makeMs(state, name) {
  if (name === 'title') { state.ms = null; return null; }
  const id = name === 'ring' ? 'rings' : name === 'canyon' || name === 'lose' ? 'valley' : 'runway';
  const fuel = name === 'ring' ? 0.58 : name === 'canyon' ? 0.52 : 0.94;
  const ms = createMission(id, fuel);
  ms.time = T % 50;
  state.ms = ms;
  if (name === 'takeoff') {
    ms.score = 0;
    flash(ms, 'Throttle up — rotate at 46 m/s', 6);
  }
  if (name === 'ring') {
    ms.rings = 1;
    ms.score = 200;
    flash(ms, 'Ring 1 of 6 — +200', 8);
  }
  if (name === 'canyon') {
    ms.checkpoints = 1;
    ms.lowTime = 31;
    ms.score = 150 + 62;
    flash(ms, 'Checkpoint 1 of 5 — +150', 8);
  }
  if (name === 'cockpit') {
    ms.done.takeoff = true;
    ms.done.cpA = true;
    ms.doneCp = [true, true];
    ms.score = 100 + 150 * 2;
    flash(ms, 'Final approach — green zone', 8);
  }
  if (name === 'win') {
    ms.done.checkpoints = true;
    ms.done.lowflight = true;
    ms.checkpoints = 5;
    ms.status = 'won';
    ms.lowTime = 92;
    const lowBonus = Math.round(ms.lowTime * 2);
    ms.score = 150 * 5 + lowBonus + 60;
    ms.fuelLeft = 0.31;
    ms.endInfo = {
      score: ms.score,
      grade: 'A',
      fuelBonus: 60,
      lines: [`Pass made. Low-flight bonus: +${lowBonus}.`, 'Fuel left: 31% (+60)'],
    };
  }
  if (name === 'lose') {
    ms.status = 'lost';
    ms.reason = 'The Gullwing is down. That was a hard one.';
    ms.score = 310;
    ms.fuelLeft = 0.42;
    ms.endInfo = { score: ms.score, grade: 'C', fuelBonus: 0, lines: [ms.reason, 'Fuel left: 42% (+0)'] };
  }
  return ms;
}

function velToward(pos, target, speed) {
  const dx = target.x - pos.x, dy = target.y - pos.y, dz = target.z - pos.z;
  const l = Math.hypot(dx, dy, dz) || 1;
  return {
    v: { x: (dx / l) * speed, y: (dy / l) * speed, z: (dz / l) * speed },
    yaw: Math.atan2(dz, dx),
    pitch: Math.asin(Math.max(-0.9, Math.min(0.9, dy / l))),
  };
}

function plane(state, pos, speed, yaw, pitch, throttle, fuel, extra = {}) {
  state.ac = {
    pos: { ...pos },
    vel: { x: Math.cos(yaw) * speed, y: Math.sin(pitch) * speed, z: Math.sin(yaw) * Math.cos(pitch) * speed },
    yaw, pitch, roll: extra.roll ?? 0,
    throttle, fuel: fuel ?? 1,
    health: extra.health ?? 1,
    engineDead: false,
    onGround: extra.onGround ?? false,
    prop: 4.2,
    crashed: false,
    landed: false,
    bump: 0,
  };
  Object.assign(state.ac, extra);
}

function placePlane(state, name, ms) {
  if (name === 'title') { state.ac = null; return; }
  const g = (x, z) => groundHeightAt(x, z);
  if (name === 'takeoff') {
    plane(state, { x: -620, y: g(-620, 4) + 1.3, z: 4 }, 40, 0, 0.015, 0.84, 0.94, { onGround: true });
  } else if (name === 'ring') {
    const pos = { x: 1330, y: 305, z: 690 };
    const { v, yaw, pitch } = velToward(pos, A.rings[1], 52);
    plane(state, pos, 52, yaw, pitch, 0.72, 0.58, { roll: 0.06, ...v });
    state.ac.vel = v;
  } else if (name === 'canyon') {
    const pos = { x: -2480, y: g(-2480, 2450) + 78, z: 2450 };
    const { v, yaw, pitch } = velToward(pos, A.pass[1], 46);
    plane(state, pos, 46, yaw, pitch, 0.6, 0.52, { roll: -0.05, ...v });
    state.ac.vel = v;
  } else if (name === 'cockpit') {
    const pos = { x: 1120, y: 108, z: 6 };
    plane(state, pos, 50, Math.PI, -0.055, 0.55, 0.4, {
      vel: { x: -50, y: -2.7, z: 0 },
    });
  } else if (name === 'win') {
    plane(state, { x: -120, y: 90, z: 2300 }, 44, 0.2, 0.02, 0.5, 0.31);
  } else if (name === 'lose') {
    const p = { x: -2050, y: g(-2050, 2620) + 1.3, z: 2620 };
    plane(state, p, 0, 0.4, -0.08, 0, 0.42, { onGround: true, crashed: true, crashVy: 14, health: 0, roll: 0.5 });
  }
}

function placeCam(state, name) {
  const cam = state.cam;
  if (name === 'title') {
    const pos = { x: 2650, y: 520, z: -2350 };
    const d = { x: -pos.x, y: -pos.y + 40, z: -pos.z };
    const l = Math.hypot(d.x, d.y, d.z);
    cam.pos = { ...pos };
    cam.yaw = Math.atan2(d.z, d.x);
    cam.pitch = Math.asin(d.y / l) + 0.05;
    cam.roll = 0;
    return;
  }
  const ac = state.ac;
  const f = { x: Math.cos(ac.pitch) * Math.cos(ac.yaw), y: Math.sin(ac.pitch), z: Math.cos(ac.pitch) * Math.sin(ac.yaw) };
  const u = { x: -Math.cos(ac.yaw) * Math.sin(ac.pitch), y: Math.cos(ac.pitch), z: -Math.sin(ac.yaw) * Math.sin(ac.pitch) };
  if (name === 'cockpit') {
    cam.pos = { x: ac.pos.x + u.x * 0.55 + f.x * 0.9, y: ac.pos.y + u.y * 0.55 + f.y * 0.9, z: ac.pos.z + u.z * 0.55 + f.z * 0.9 };
    cam.yaw = ac.yaw;
    cam.pitch = ac.pitch + 0.02;
    cam.roll = ac.roll;
    return;
  }
  const back = 24 + (ac.vel ? 2 : 0) * 0.05;
  cam.pos = { x: ac.pos.x - f.x * back + u.x * 5.2, y: ac.pos.y - f.y * back + u.y * 5.2, z: ac.pos.z - f.z * back + u.z * 5.2 };
  cam.yaw = ac.yaw;
  cam.pitch = ac.pitch * 0.92;
  cam.roll = ac.roll;
  cam.shake = 0;
}
