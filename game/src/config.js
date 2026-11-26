// Gullwing — shared constants: world scale, flight model, palette, mission data.
// Everything the other modules need in one place so tuning stays in one file.

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const FOCAL = 620; // camera focal length in px (vertical fov ~ 61 deg)

// ---- flight model (meters, seconds, SI) -------------------------------------
export const FLIGHT = {
  stallSpeed: 30,     // m/s; lift collapses below this
  rotateSpeed: 38,    // m/s; nose lifts for takeoff at/above this
  cruiseSpeed: 52,    // m/s; trimmed speed at full throttle, level
  maxSpeed: 92,       // m/s; hard ceiling from drag
  takeoffSpeed: 46,   // m/s needed to leave the runway
  thrust: 15.5,       // m/s^2 at full throttle
  dragK: 2.4e-4,      // quadratic drag coefficient (per m)
  liftK: 0.62,        // lift coefficient at reference speed
  refSpeed: 52,       // m/s reference speed for lift
  sinkStall: 9.5,     // m/s sink rate when fully stalled
  pitchRate: 1.05,    // rad/s at control input, full authority
  rollRate: 1.7,      // rad/s at full control
  maxBank: 1.25,      // rad; roll authority clamp
  fuelPerSecIdle: 0.0016,   // full-tank fraction burned per second, engine idling
  fuelPerSecThrottle: 0.0034, // extra fraction per second at full throttle
  fuelReservePct: 0.07,    // reserve fuel, HUD flashes below this
};

// ---- ground ------------------------------------------------------------------
export const GROUND = {
  gearDrop: 1.3,        // m from wing plane to wheels
  safeTouch: 2.2,       // m/s vertical speed that is a clean touchdown
  roughTouch: 4.5,      // m/s above this a ground contact is a hard landing
  crashTouch: 7.0,      // m/s above this a ground contact destroys the plane
};

// ---- world layout (world is meters, +x east, +z south, +y up) ----------------
export const WORLD = {
  seed: 1337,           // terrain seed; screenshot states pin their own seed
  cell: 80,             // terrain grid cell, m
  fieldRadius: 2600,    // m; flat airfield plateau around the origin
  runway: { x0: -1300, x1: 1300, halfW: 22.5, heading: 0 }, // heading 0 = pointing +x (090)
  town: { cx: 620, cz: -920, size: 760, blocks: 11, pitch: 62 },
  lake: { cx: -1150, cz: 1750, r: 780 },
  bayLine: 2150,        // x + slope*z beyond this is open bay
  baySlope: 0.42,
  mountainStart: -2100, // west of here the range rises
  passZ: 2450,          // canyon pass centre line (Valley Thread flies through it)
  passHalfW: 430,
  waterLevel: 0,
  cloudAlt: 900,
};

// ---- palette (golden hour over the bay) --------------------------------------
export const PALETTE = {
  skyTop: '#2c4a7a',
  skyMid: '#7d86b8',
  skyLow: '#e8b26b',
  sun: '#ffd98a',
  sunGlow: 'rgba(255, 190, 96, 0.55)',
  haze: 'rgba(226, 190, 140, 0.16)',
  waterDeep: '#1d4f66',
  waterShallow: '#3f8b96',
  waterGlint: 'rgba(255, 214, 140, 0.5)',
  sand: '#d9c08b',
  grassA: '#6d8f52',
  grassB: '#7fa05c',
  rockA: '#8a7a63',
  rockB: '#6f6353',
  snow: '#e8ecef',
  runway: '#3a3f47',
  runwayEdge: '#c9cdd4',
  marking: '#dfe3e8',
  apron: '#565b63',
  buildingA: '#a89684',
  buildingB: '#8f7f70',
  buildingSide: '#6e6156',
  ring: '#7ef0d8',
  ringGlow: 'rgba(126, 240, 216, 0.8)',
  checkpoint: '#ffc35c',
  hudAmber: '#ffcf6e',
  hudCyan: '#8fe8ff',
  hudGreen: '#9ff2b0',
  hudRed: '#ff7a6e',
  panelDark: '#101521',
  panelMid: '#1b2333',
  planeBody: '#e8e4d8',
  planeBlue: '#2f6f9f',
  planeShade: '#b8b2a2',
  glass: '#274b63',
};

// ---- missions ----------------------------------------------------------------
// Each mission: name, brief line, setup (where the plane starts) and a list of
// objective descriptors; missions.js turns them into live state.
export const MISSIONS = [
  {
    id: 'runway',
    name: 'SORTIE 1 — RUNWAY 09',
    brief: 'Take off from RWY 09, loop the two checkpoints over Kestrel Bay, land back on the green.',
    start: { x: -1150, y: 0, z: 10, heading: 0, speed: 0 },
    fuel: 1.0,
    objectives: [
      { id: 'takeoff', text: 'Take off from RWY 09 (hold nose up past 46 m/s)' },
      { id: 'cpA', text: 'Pass the two bay checkpoints in any order' },
      { id: 'land', text: 'Land on RWY 09, touching down inside the green zone' },
    ],
  },
  {
    id: 'rings',
    name: 'SORTIE 2 — RING RUN',
    brief: 'Thread all six rings before the fuel is gone. Rings pay 200 apiece.',
    start: { x: 260, y: 260, z: 300, heading: 0.35, speed: 46 },
    fuel: 0.8,
    objectives: [
      { id: 'rings', text: 'Thread all six glowing rings in order' },
    ],
  },
  {
    id: 'valley',
    name: 'SORTIE 3 — VALLEY THREAD',
    brief: 'Run the mountain pass at low level. Stay under 150 m for the low-flight bonus.',
    start: { x: -3350, y: 120, z: 2450, heading: 0, speed: 44 },
    fuel: 0.66,
    objectives: [
      { id: 'checkpoints', text: 'Reach the five pass checkpoints' },
      { id: 'lowflight', text: 'Bonus: keep under 150 m AGL through the pass' },
    ],
  },
];

// ---- scoring -----------------------------------------------------------------
export const SCORE = {
  checkpoint: 150,
  ring: 200,
  lowFlightPerSec: 2,   // points per second under 150 m AGL in the pass
  precisionPerfect: 500, // dead-centre touchdown
  fuelLeftPct: 3,        // points per percent of fuel left at mission end
  grades: [[0, 'D'], [400, 'C'], [900, 'B'], [1500, 'A'], [2300, 'S']],
};

// ---- control map (key -> code) ------------------------------------------------
export const CONTROLS = [
  ['Throttle', 'W / S'],
  ['Pitch', 'Up / Down (or I / K)'],
  ['Roll', 'Left / Right (or A / D)'],
  ['Camera', 'C (chase / cockpit)'],
  ['Brakes (on ground)', 'SPACE'],
  ['Mute', 'M'],
  ['Mission / restart', 'Enter'],
  ['Back to title', 'ESC'],
];
