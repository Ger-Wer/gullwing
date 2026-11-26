// Gullwing — missions: objective state machines, scoring and the win/lose
// logic. Each sortie is a list of objective ids; updateMission() watches the
// aircraft and flips objectives, adds score and raises the end state.

import { MISSIONS, SCORE } from './config.js';
import { onRunway, inGreenZone, missionAnchors } from './terrain.js';
import { airSpeed } from './aircraft.js';

const A = missionAnchors();

/** Start a mission by id ('runway' | 'rings' | 'valley'). */
export function createMission(id, fuel) {
  const def = MISSIONS.find((m) => m.id === id);
  const ms = {
    def,
    status: 'flying', // flying | won | lost
    score: 0,
    time: 0,
    fuelLeft: fuel,
    done: Object.fromEntries(def.objectives.map((o) => [o.id, false])),
    rings: 0,
    checkpoints: 0,
    lowTime: 0,
    flash: null,        // {text, until}
    flashUntil: 0,
    reason: null,       // lose reason text
    precision: null,    // 0..1 touchdown quality
    fuelOutAt: null,
    endInfo: null,      // filled on finish: {score, grade, lines}
  };
  flash(ms, `${def.name} — ${def.brief}`, 6);
  return ms;
}

/** Show a HUD banner for a few seconds. */
export function flash(ms, text, secs = 3) {
  ms.flash = text;
  ms.flashUntil = ms.time + secs;
}

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function norm3(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Advance the mission state. Returns the event string, if any ('objective', 'won', 'lost'). */
export function updateMission(ms, ac, dt, groundHeight) {
  ms.time += dt;
  if (ms.flash && ms.time > ms.flashUntil) ms.flash = null;
  if (ms.status !== 'flying') return null;

  let event = null;

  if (ms.def.id === 'runway') updateRunway(ms, ac, dt, groundHeight);
  else if (ms.def.id === 'rings') updateRings(ms, ac);
  else if (ms.def.id === 'valley') updateValley(ms, ac, dt, groundHeight);

  // --- common lose conditions -------------------------------------------------
  if (ms.status === 'flying' && ac.crashed) {
    finishLost(ms, 'The Gullwing is down. ' + (ac.crashVy > 12 ? 'That was a hard one.' : 'Read the terrain next time.'));
    event = 'lost';
  }
  if (ms.status === 'flying' && ac.engineDead) {
    if (ms.fuelOutAt == null) {
      ms.fuelOutAt = ms.time;
      flash(ms, 'FUEL EXHAUSTED — glide to a landing', 5);
    } else if (ms.time - ms.fuelOutAt > 40) {
      finishLost(ms, 'Out of fuel, and the glide is over.');
      event = 'lost';
    }
  }
  return event;
}

// ---- Sortie 1: take off, loop the bay, land back ------------------------------
function updateRunway(ms, ac, dt, groundHeight) {
  if (!ms.done.takeoff && ac.liftedOff) {
    ms.done.takeoff = true;
    ms.score += 100;
    flash(ms, 'Wheels up — +100. Loop the two checkpoints over the bay.', 4);
    return;
  }
  if (ms.done.takeoff && !ms.done.cpA) {
    const cps = A.checkpoints;
    const hits = cps.map((c) => dist3(ac.pos, c) < 170);
    for (let i = 0; i < cps.length; i++) {
      if (hits[i] && !ms.doneCp?.[i]) {
        (ms.doneCp ??= [])[i] = true;
        ms.score += SCORE.checkpoint;
        flash(ms, `Checkpoint ${i + 1} — +${SCORE.checkpoint}`, 2.5);
      }
    }
    if (hits.every(Boolean)) {
      ms.done.cpA = true;
      flash(ms, 'Bay loop complete. Turn for home and put her in the green.', 4);
    }
  }
  if (ms.done.takeoff && ac.landed) {
    if (onRunway(ac.pos.x, ac.pos.z)) {
      // Precision: 1 at dead centre of the green, fading to 0 at the green edge.
      const c = 0; // runway centre is x = (x0+x1)/2 = 0
      const off = Math.abs(ac.pos.x - c);
      const green = inGreenZone(ac.pos.x);
      ms.precision = green ? Math.max(0, 1 - off / 420) : Math.max(0, 0.5 - off / 900);
      const bonus = Math.round(SCORE.precisionPerfect * (ms.precision ?? 0));
      ms.score += bonus;
      ms.done.land = true;
      finishWon(ms, green ? 'In the green. Textbook approach.' : 'On the runway. A long way from the green, though.');
    } else {
      finishLost(ms, 'Down, but not on the runway. The grass at Kestrel Bay is for golf.');
    }
  }
}

// ---- Sortie 2: thread the six rings in order ----------------------------------
function updateRings(ms, ac) {
  const rings = A.rings;
  const next = rings[ms.rings];
  if (!next) return;
  const d = dist3(ac.pos, next);
  if (d < next.r + 14) {
    ms.rings++;
    ms.score += SCORE.ring;
    if (ms.rings >= rings.length) {
      ms.done.rings = true;
      finishWon(ms, 'All six rings. The bay is yours.');
    } else {
      flash(ms, `Ring ${ms.rings} of ${rings.length} — +${SCORE.ring}`, 2.5);
    }
  }
}

// ---- Sortie 3: the pass, low and fast ------------------------------------------
function updateValley(ms, ac, dt, groundHeight) {
  const cps = A.pass;
  if (ac.pos.x < cps[cps.length - 1].x + 500) {
    const agl = ac.pos.y - (groundHeight(ac.pos.x, ac.pos.z) + 1.3);
    if (agl < 150 && agl > 5) ms.lowTime += dt;
  }
  const next = cps[ms.checkpoints];
  if (next && dist3(ac.pos, next) < 190) {
    ms.checkpoints++;
    ms.score += SCORE.checkpoint;
    if (ms.checkpoints >= cps.length) {
      ms.done.checkpoints = true;
      const lowBonus = Math.round(ms.lowTime * SCORE.lowFlightPerSec);
      ms.score += lowBonus;
      ms.done.lowflight = ms.lowTime > 45;
      finishWon(ms, `Pass made. Low-flight bonus: +${lowBonus}.`);
    } else {
      flash(ms, `Checkpoint ${ms.checkpoints} of ${cps.length} — +${SCORE.checkpoint}`, 2.5);
    }
  }
}

// ---- endings --------------------------------------------------------------------
function gradeFor(score) {
  let g = 'D';
  for (const [min, letter] of SCORE.grades) if (score >= min) g = letter;
  return g;
}

function finishCommon(ms, lines) {
  const fuelBonus = Math.round(ms.fuelLeft * 100 * SCORE.fuelLeftPct);
  ms.score += fuelBonus;
  ms.endInfo = {
    score: ms.score,
    grade: gradeFor(ms.score),
    fuelBonus,
    lines: [...lines, `Fuel left: ${Math.round(ms.fuelLeft * 100)}% (+${fuelBonus})`],
  };
}

function finishWon(ms, line) {
  ms.status = 'won';
  finishCommon(ms, [line]);
}

function finishLost(ms, line) {
  ms.status = 'lost';
  ms.reason = line;
  finishCommon(ms, [line]);
}

/** Progress text for the HUD: what the pilot still has to do. */
export function objectiveLine(ms) {
  if (ms.status !== 'flying') return '';
  const d = ms.done;
  if (ms.def.id === 'runway') {
    if (!d.takeoff) return 'Rotate at 46+ m/s, hold the nose up';
    if (!d.cpA) return 'Thread the two bay checkpoints';
    return 'Approach RWY 09 — land in the green';
  }
  if (ms.def.id === 'rings') return `Ring ${ms.rings + 1} of ${A.rings.length} — fly the glowing ring`;
  return `Pass checkpoint ${ms.checkpoints + 1} of ${A.pass.length} — stay low`;
}

export function ringProgress(ms) {
  return ms.def.id === 'rings' ? `${ms.rings}/${A.rings.length}` : null;
}

export function currentRing(ms) {
  if (ms.def.id !== 'rings') return null;
  return A.rings[ms.rings] ?? null;
}

export function currentCheckpoint(ms) {
  if (ms.def.id === 'runway' && ms.done.takeoff && !ms.done.cpA) return A.checkpoints;
  if (ms.def.id === 'valley') return A.pass[ms.checkpoints] ?? null;
  return null;
}

/** World-space targets the renderer should draw: rings + active markers. */
export function drawTargets(ms, ac) {
  const out = [];
  if (ms.status !== 'flying') return out;
  if (ms.def.id === 'rings') {
    for (let i = ms.rings; i < A.rings.length; i++) {
      const r = A.rings[i];
      const prev = A.rings[i - 1];
      const next = A.rings[i + 1];
      // Face the ring along the direction the pilot flies through it.
      const n = next ? norm3({ x: next.x - r.x, y: next.y - r.y, z: next.z - r.z })
        : prev ? norm3({ x: r.x - prev.x, y: r.y - prev.y, z: r.z - prev.z })
        : { x: 1, y: 0, z: 0 };
      out.push({ kind: 'ring', ...r, n, active: i === ms.rings });
    }
  }
  if (ms.def.id === 'runway' && ms.done.takeoff && !ms.done.cpA) {
    for (const c of A.checkpoints) out.push({ kind: 'checkpoint', ...c, done: ms.doneCp?.[A.checkpoints.indexOf(c)] });
  }
  if (ms.def.id === 'valley') {
    const c = A.pass[ms.checkpoints];
    if (c) out.push({ kind: 'checkpoint', ...c });
  }
  void ac;
  return out;
}
