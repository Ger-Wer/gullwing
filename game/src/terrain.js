// Gullwing — the world: Kestrel Bay. A seeded heightfield with a flat airfield
// plateau at the origin, a town beside it, a lake to the south, the western
// mountain range with a pass, and the bay to the east. Also exposes the town's
// building boxes and the runway surface used by the renderer.

import { WORLD } from './config.js';
import { fbm, ridge, smoothstep, makeRng } from './random.js';

const S = WORLD.seed;

/** Ground height (m) at world x,z. Water sits at y=0; this may go below. */
export function terrainHeightAt(x, z) {
  const dField = Math.hypot(x, z);
  const flat = 1 - smoothstep(WORLD.fieldRadius * 0.62, WORLD.fieldRadius * 1.35, dField);

  // Rolling hills, growing away from the airfield.
  const hills = (fbm(x * 0.00042, z * 0.00042, S, 4) - 0.42) * 340;

  // Western range: ridged noise that rises the further west.
  const westMask = smoothstep(WORLD.mountainStart, WORLD.mountainStart - 2600, x);
  const crests = ridge(x * 0.00035, z * 0.00035, S, 5) * 980 + fbm(x * 0.0011, z * 0.0011, S + 5, 3) * 140;
  // The pass: a soft gap carved across the range at passZ.
  const passCarve = Math.exp(-Math.pow((z - WORLD.passZ) / WORLD.passHalfW, 2)) * 0.86;
  const mountains = crests * westMask * (1 - passCarve);

  let h = hills * (1 - flat) + mountains * (1 - flat * 0.85);

  // The bay: an east-southeast shoreline beyond bayLine.
  const shore = x + WORLD.baySlope * z;
  const inBay = smoothstep(WORLD.bayLine - 500, WORLD.bayLine + 650, shore);
  const depth = 30 + (shore - WORLD.bayLine) * 0.02;
  h = h * (1 - inBay) + (-depth) * inBay;

  // Kestrel Lake: a shallow bowl south-west of the airfield.
  const dLake = Math.hypot(x - WORLD.lake.cx, z - WORLD.lake.cz);
  const lake = smoothstep(WORLD.lake.r, WORLD.lake.r * 0.35, dLake);
  if (lake > 0) h = Math.min(h, -7 * lake);

  // Town plateau: the settlement wants firm, flat ground.
  const dTown = Math.hypot(x - WORLD.town.cx, z - WORLD.town.cz);
  const townFlat = smoothstep(WORLD.town.size, WORLD.town.size * 0.4, dTown);
  h = h * (1 - townFlat * 0.94) + 2.5 * townFlat * 0.94;

  // The airfield itself is dead flat at zero.
  h = h * (1 - flat) + 0 * flat;
  // Never let hills poke up inside the runway box.
  if (Math.abs(z) < WORLD.runway.halfW + 90 && x > WORLD.runway.x0 - 120 && x < WORLD.runway.x1 + 120) {
    h = Math.min(h, 1.5);
  }
  return h;
}

/** Height of flyable ground (terrain or water surface, whichever is higher). */
export function groundHeightAt(x, z) {
  const h = terrainHeightAt(x, z);
  return h < WORLD.waterLevel ? WORLD.waterLevel : h;
}

/** One town building: centre, half-extents and height (m). */
export function townBuildings() {
  const t = WORLD.town;
  const rng = makeRng(S + 991);
  const list = [];
  for (let i = 0; i < t.blocks; i++) {
    for (let j = 0; j < t.blocks; j++) {
      if (rng() < 0.16) continue; // plazas and empty lots
      const cx = t.cx + (i - (t.blocks - 1) / 2) * t.pitch;
      const cz = t.cz + (j - (t.blocks - 1) / 2) * t.pitch;
      const h = terrainHeightAt(cx, cz);
      if (h < 0 || h > 9) continue;
      const tall = rng();
      const height = tall > 0.93 ? 46 + rng() * 34 : 8 + rng() * 26;
      const w = 26 + rng() * 14;
      const d = 26 + rng() * 14;
      list.push({ x: cx, z: cz, w, d, h: Math.max(h, 2), height });
    }
  }
  return list;
}

/** Is a world point on the paved runway? (used by landing logic) */
export function onRunway(x, z) {
  const r = WORLD.runway;
  return x >= r.x0 && x <= r.x1 && Math.abs(z) <= r.halfW;
}

/** Distance to the runway centreline in metres (along-track). */
export function runwayLongitudinal(x) {
  const r = WORLD.runway;
  return Math.min(x - r.x0, r.x1 - x, Math.abs(x - (r.x0 + r.x1) / 2));
}

/** Landable zone: the central green of the runway. */
export function inGreenZone(x) {
  const r = WORLD.runway;
  const c = (r.x0 + r.x1) / 2;
  return Math.abs(x - c) <= 420;
}

/** Precomputed cloud puffs: {x, y, z, r, a} drifting east with time. */
export function cloudField(count = 26) {
  const rng = makeRng(S + 421);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: -5200 + rng() * 10400,
      y: WORLD.cloudAlt + rng() * 650,
      z: -4800 + rng() * 9600,
      r: 260 + rng() * 520,
      a: 0.35 + rng() * 0.4,
      drift: 1.5 + rng() * 2.5,
    });
  }
  return out;
}

/** Ring / checkpoint anchor points for the missions (world coords). */
export function missionAnchors() {
  return {
    checkpoints: [ // Sortie 1: loop over the bay
      { x: 1750, y: 240, z: 420 },
      { x: 2450, y: 300, z: -780 },
    ],
    rings: [ // Sortie 2: a line of rings out over the bay
      { x: 900, y: 260, z: 420, r: 46 },
      { x: 1520, y: 330, z: 880, r: 46 },
      { x: 2250, y: 300, z: 460, r: 42 },
      { x: 2950, y: 380, z: -150, r: 42 },
      { x: 2550, y: 430, z: -950, r: 38 },
      { x: 1700, y: 360, z: -1450, r: 38 },
    ],
    pass: [ // Sortie 3: checkpoints along the canyon
      { x: -2750, y: 90, z: 2450 },
      { x: -2150, y: 120, z: 2430 },
      { x: -1500, y: 150, z: 2460 },
      { x: -900, y: 130, z: 2440 },
      { x: -350, y: 110, z: 2450 },
    ],
  };
}
