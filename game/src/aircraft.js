// Gullwing — the aircraft: a light single-engine plane with a small but
// characterful flight model. Thrust, quadratic drag, lift that collapses at
// the stall, bank-coordinated turning, stall warning, fuel and damage.

import { FLIGHT, GROUND } from './config.js';

/** Body axes from attitude (yaw, pitch, roll are radians; roll unused for axes). */
export function axes(ac) {
  const cy = Math.cos(ac.yaw), sy = Math.sin(ac.yaw);
  const cp = Math.cos(ac.pitch), sp = Math.sin(ac.pitch);
  return {
    fwd: { x: cp * cy, y: sp, z: cp * sy },
    right: { x: -sy, y: 0, z: cy },
    up: { x: -cy * sp, y: cp, z: -sy * sp },
  };
}

/** A brand-new aircraft at a mission start point. */
export function createAircraft(init) {
  return {
    pos: { x: init.x, y: init.y + GROUND.gearDrop, z: init.z },
    vel: { x: Math.cos(init.heading) * init.speed, y: 0, z: Math.sin(init.heading) * init.speed },
    yaw: init.heading,
    pitch: init.pitch ?? 0,
    roll: init.roll ?? 0,
    throttle: init.throttle ?? 0,
    fuel: init.fuel ?? 1,
    health: 1,
    engineDead: false,
    onGround: init.speed === 0,
    prop: 0, // propeller spin phase
  };
}

export function airSpeed(ac) {
  return Math.hypot(ac.vel.x, ac.vel.y, ac.vel.z);
}

export function forwardSpeed(ac) {
  const f = axes(ac).fwd;
  return ac.vel.x * f.x + ac.vel.y * f.y + ac.vel.z * f.z;
}

/** One physics step. input: {throttle:-1|0|1, pitch:-1|0|1, roll:-1|0|1, brake:bool}. */
export function stepAircraft(ac, input, dt, groundAt) {
  if (ac.onGround && ac.grounded) {
    stepOnGround(ac, input, dt);
    return;
  }

  const f = axes(ac).fwd;
  const r = axes(ac).right;
  const u = axes(ac).up;
  const v = airSpeed(ac);

  // --- control surfaces -----------------------------------------------------
  const authority = Math.min(1, v / (FLIGHT.cruiseSpeed * 0.9));
  if (input.pitch !== 0) ac.pitch += input.pitch * FLIGHT.pitchRate * authority * dt;
  else ac.pitch -= ac.pitch * 0.35 * dt; // gentle trim back to level
  ac.pitch = Math.max(-0.9, Math.min(1.05, ac.pitch));

  if (input.roll !== 0) ac.roll += input.roll * FLIGHT.rollRate * authority * dt;
  else ac.roll -= ac.roll * 0.9 * dt; // self-coordinating wing
  ac.roll = Math.max(-FLIGHT.maxBank, Math.min(FLIGHT.maxBank, ac.roll));

  // Coordinated turn from bank, plus a touch of direct yaw at low speed.
  const turnRate = (9.81 * Math.tan(ac.roll)) / Math.max(v, 24);
  ac.yaw += turnRate * dt + input.roll * 0.25 * (1 - authority) * dt;

  // --- forces ----------------------------------------------------------------
  const thrust = ac.engineDead ? 0 : ac.throttle * FLIGHT.thrust;
  const drag = FLIGHT.dragK * v * v;

  const stallT = FLIGHT.stallSpeed;
  let liftFactor = Math.min(1, Math.pow(v / (FLIGHT.refSpeed * 0.86), 2));
  if (v < stallT) liftFactor *= Math.pow(v / stallT, 1.6); // hard collapse near stall
  // Lift accelerates the plane toward its body-up axis; level flight balances
  // gravity at the reference speed, so the scale is 9.81 * liftFactor * (v/vRef)^2.
  const lift = 9.81 * liftFactor * (v / FLIGHT.refSpeed) * (v / FLIGHT.refSpeed);

  ac.vel.x += (f.x * (thrust - drag) + u.x * lift) * dt;
  ac.vel.y += (f.y * (thrust - drag) + u.y * lift - 9.81) * dt;
  ac.vel.z += (f.z * (thrust - drag) + u.z * lift) * dt;

  // Sideslip decay: the wing weathervanes velocity toward the nose, so a turn
  // felt through the controls is a smooth coordinated arc, not a slide.
  const fwdSp = forwardSpeed(ac);
  const keep = Math.exp(-1.6 * dt);
  ac.vel.x = f.x * fwdSp + (ac.vel.x - f.x * fwdSp) * keep;
  ac.vel.y = f.y * fwdSp + (ac.vel.y - f.y * fwdSp) * keep;
  ac.vel.z = f.z * fwdSp + (ac.vel.z - f.z * fwdSp) * keep;

  // --- integrate position ----------------------------------------------------
  ac.pos.x += ac.vel.x * dt;
  ac.pos.y += ac.vel.y * dt;
  ac.pos.z += ac.vel.z * dt;

  // --- stall sink: when lift is gone the nose drops and the plane falls ------
  if (v < stallT * 0.82 && ac.pitch > 0.05) {
    ac.pitch -= 1.1 * dt;
    ac.roll += Math.sign(ac.roll || 1) * 0.7 * dt;
  }

  // --- fuel ------------------------------------------------------------------
  if (!ac.engineDead) {
    ac.fuel -= (FLIGHT.fuelPerSecIdle + ac.throttle * FLIGHT.fuelPerSecThrottle) * dt;
    if (ac.fuel <= 0) {
      ac.fuel = 0;
      ac.engineDead = true;
      ac.engineDeadAt = ac.clock ?? 0;
    }
  }

  // --- prop spin ---------------------------------------------------------------
  ac.prop += (6 + ac.throttle * 46) * dt;

  // --- ground contact ----------------------------------------------------------
  const g = groundAt(ac.pos.x, ac.pos.z);
  const floor = g + GROUND.gearDrop;
  if (ac.pos.y <= floor) {
    ac.pos.y = floor;
    const vy = ac.vel.y;
    if (vy < -GROUND.crashTouch || ac.health <= 0) {
      ac.onGround = true;
      ac.crashed = true;
      ac.crashVy = Math.abs(vy);
      ac.vel.x *= 0.2; ac.vel.y = 0; ac.vel.z *= 0.2;
    } else {
      ac.health = Math.max(0, ac.health - Math.max(0, -vy - GROUND.safeTouch) / 14);
      ac.vel.y = Math.max(0, vy * -0.12);
      if (vy < -GROUND.roughTouch) ac.bump = 0.4; // camera shake on a hard touch
      ac.vel.x *= Math.exp(-2.2 * dt);
      ac.vel.z *= Math.exp(-2.2 * dt);
      if (ac.pitch < 0.12 && v < FLIGHT.cruiseSpeed) {
        // Settled: a proper touchdown (the mission code checks where).
        if (v < 14) {
          ac.onGround = true;
          ac.landed = true;
        }
      }
      ac.pitch = Math.max(ac.pitch, 0);
      ac.roll = 0;
    }
  }
}

/** Rolling on the deck: friction, brakes, takeoff rotation. */
function stepOnGround(ac, input, dt) {
  const f = axes(ac).fwd;
  const v = forwardSpeed(ac);
  const braking = input.brake && !input.pitch;
  const fr = (braking ? 3.2 : 0.55);
  const thrust = ac.engineDead ? 0 : ac.throttle * FLIGHT.thrust;
  let nv = v + (thrust - fr * Math.sign(v || 1) * (v > 0.5 ? 1 : 0)) * dt;
  nv = Math.max(0, nv);
  ac.vel = { x: f.x * nv, y: 0, z: f.z * nv };
  ac.pos.x += ac.vel.x * dt;
  ac.pos.z += ac.vel.z * dt;

  ac.fuel -= FLIGHT.fuelPerSecIdle * (0.4 + ac.throttle) * dt;
  ac.prop += (4 + ac.throttle * 40) * dt;

  // Steering on the ground follows the roll input.
  if (Math.abs(v) > 2) ac.yaw += input.roll * 0.55 * Math.min(1, v / 20) * dt;

  // Rotation: past takeoff speed, pull the nose up.
  if (input.pitch > 0 && nv >= FLIGHT.takeoffSpeed) {
    ac.onGround = false;
    ac.pitch = 0.14;
    ac.vel.y = 2.2;
    ac.liftedOff = true;
  }
}
