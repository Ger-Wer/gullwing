// Gullwing — deterministic random: mulberry32 PRNG plus 2-D value noise.
// The terrain, the city and every screenshot state come from these, so a
// fixed seed always gives the same world and the same frame.

/** Mulberry32: small fast seeded PRNG, returns a function giving [0,1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash lattice coordinates into a stable [0,1) value (no state). */
function latticeHash(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothstep for blends. */
export function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise on an integer lattice, output [0,1). */
export function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = latticeHash(ix, iz, seed);
  const b = latticeHash(ix + 1, iz, seed);
  const c = latticeHash(ix, iz + 1, seed);
  const d = latticeHash(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** Fractal brownian motion: `octaves` layers of value noise, output [0,1). */
export function fbm(x, z, seed, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq, seed + i * 101) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / total;
}

/** Ridge noise (1 - |2n-1|) sharpened, for mountain crests, [0,1]. */
export function ridge(x, z, seed, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise(x * freq, z * freq, seed + 7700 + i * 101);
    const r = Math.pow(1 - Math.abs(2 * n - 1), 2.2);
    sum += r * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / total;
}
