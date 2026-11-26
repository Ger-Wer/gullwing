// Gullwing — main: the game loop, the state machine (title / fly / end),
// keyboard and mouse wiring, sound, and the render order for each view.
// This is the only file index.html loads; the other modules do one job each.

import { VIEW_W, VIEW_H, MISSIONS } from './config.js';
import { makeCamera, followChase, setCockpit, addShake, decayShake } from './camera.js';
import { createAircraft, stepAircraft, airSpeed } from './aircraft.js';
import { createMission, updateMission, drawTargets } from './missions.js';
import { groundHeightAt, onRunway, inGreenZone } from './terrain.js';
import { drawSky, drawClouds, drawWater, drawWorld, drawAircraft, drawTargets as drawTargetsWorld } from './render.js';
import { drawTop, drawBottom, drawWarnings, drawReticle, drawTitle, drawEnd } from './hud.js';
import { drawCockpit } from './cockpit.js';
import { createOverlay } from './dom.js';
import { makeInput, applyThrottle } from './input.js';
import { makeAudio } from './audio.js';
import { readShot, setupShot } from './shots.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');

// DOM text overlay: every letter lives here (canvas fillText garbles under
// the screenshot tool). It scales exactly like the canvas below.
const overlay = createOverlay();
overlay.fit();

/** Fit the 1280x720 stage into the window, letterboxed. */
function fitCanvas() {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = `${VIEW_W * s}px`;
  canvas.style.height = `${VIEW_H * s}px`;
  canvas.style.left = `${(window.innerWidth - VIEW_W * s) / 2}px`;
  canvas.style.top = `${(window.innerHeight - VIEW_H * s) / 2}px`;
  canvas.style.position = 'fixed';
  overlay.fit();
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const input = makeInput();
input.attach(canvas);
const audio = makeAudio();

// ---- game state ----------------------------------------------------------------
const state = {
  mode: 'title',
  t: 0,
  sel: 0,
  best: 0,
  ms: null,
  ac: null,
  cam: makeCamera(),
  view: 'chase',
  shot: readShot(),
  muted: false,
  lastScore: 0,
  wasAirborne: false,
  prevCrash: false,
};

// Title camera: a slow arc over the bay and the airfield.
state.cam.pos = { x: 2650, y: 520, z: -2350 };
state.cam.yaw = Math.atan2(2350, -2650);
state.cam.pitch = -0.12;

function announce(text) {
  statusEl.textContent = text;
}

function startMission(i) {
  const def = MISSIONS[i];
  state.ms = createMission(def.id, def.fuel);
  state.ac = createAircraft({ ...def.start, fuel: def.fuel });
  state.mode = 'fly';
  state.view = 'chase';
  state.lastScore = 0;
  state.prevCrash = false;
  state.wasAirborne = false;
  // Seat the chase camera instantly behind the nose.
  const ac = state.ac;
  state.cam.pos = {
    x: ac.pos.x - Math.cos(ac.yaw) * 26,
    y: ac.pos.y + 6,
    z: ac.pos.z - Math.sin(ac.yaw) * 26,
  };
  state.cam.yaw = ac.yaw;
  state.cam.pitch = 0;
  state.cam.roll = 0;
  announce(`${def.name}. ${def.brief}`);
}

// ---- input edges ----------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (state.shot) return;
  if (state.mode === 'title') {
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ArrowLeft') state.sel = (state.sel + MISSIONS.length - 1) % MISSIONS.length;
    if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ArrowRight') state.sel = (state.sel + 1) % MISSIONS.length;
    if (e.code === 'Digit1') state.sel = 0;
    if (e.code === 'Digit2') state.sel = 1;
    if (e.code === 'Digit3') state.sel = 2;
    if (e.code === 'Enter' || e.code === 'Space') startMission(state.sel);
    if (e.code === 'KeyM') toggleMute();
  } else if (state.mode === 'fly') {
    if (e.code === 'KeyC') { state.view = state.view === 'chase' ? 'cockpit' : 'chase'; audio.tick(); }
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'Escape') { state.mode = 'title'; state.ms = null; state.ac = null; announce('Sortie list.'); }
    if (e.code === 'Enter' && state.ms && state.ms.status !== 'flying') startMission(MISSIONS.findIndex((m) => m.id === state.ms.def.id));
  } else if (state.mode === 'end') {
    if (e.code === 'Enter') startMission(MISSIONS.findIndex((m) => m.id === state.ms.def.id));
    if (e.code === 'Escape') { state.mode = 'title'; state.ms = null; state.ac = null; announce('Sortie list.'); }
    if (e.code === 'KeyM') toggleMute();
  }
});

function toggleMute() {
  state.muted = !state.muted;
  audio.setMuted(state.muted);
  announce(state.muted ? 'Muted.' : 'Sound on.');
}

// ---- simulation ------------------------------------------------------------------
function stepFly(dt) {
  const ms = state.ms, ac = state.ac;
  const cmd = input.command(!ac.onGround);
  applyThrottle(ac, cmd, dt);
  const ground = (x, z) => groundHeightAt(x, z);
  const wasCrashed = ac.crashed;
  stepAircraft(ac, cmd, dt, ground);

  // Camera.
  if (state.view === 'chase') followChase(state.cam, ac, dt);
  else setCockpit(state.cam, ac);
  decayShake(state.cam, dt);
  if (ac.bump) { addShake(state.cam, ac.bump * 0.5); ac.bump = Math.max(0, ac.bump - dt * 1.5); }
  if (ac.crashed && !wasCrashed) {
    addShake(state.cam, 1.6);
    audio.thud();
  }
  // Lift-off chime.
  if (ac.liftedOff && !state.wasAirborne) {
    state.wasAirborne = true;
    audio.good();
  }

  // Mission.
  const ev = updateMission(ms, ac, dt, ground);
  if (ms.score > state.lastScore) audio.good();
  state.lastScore = ms.score;
  if (ev === 'won') {
    state.mode = 'end';
    state.best = Math.max(state.best, ms.endInfo.score);
    audio.fanfare();
    announce(`Sortie complete. Score ${ms.endInfo.score}, grade ${ms.endInfo.grade}.`);
  } else if (ev === 'lost') {
    state.mode = 'end';
    state.best = Math.max(state.best, ms.endInfo.score);
    audio.dirge();
    announce(`Sortie lost. ${ms.reason}`);
  }
}

/** Push the live state into the DOM text overlay. */
function updateOverlay() {
  const ac = state.ac;
  const agl = ac ? Math.max(0, ac.pos.y - groundHeightAt(ac.pos.x, ac.pos.z) - 1.3) : 0;
  const overGreen = !!ac && onRunway(ac.pos.x, ac.pos.z) && inGreenZone(ac.pos.x);
  overlay.update({
    mode: state.mode, view: state.view, t: state.t, sel: state.sel, best: state.best,
    ms: state.ms, ac, agl, overGreen, cam: state.cam,
  });
}

// ---- render ------------------------------------------------------------------------
function renderWorldScene(t) {
  const cam = state.cam;
  drawSky(ctx, cam);
  drawClouds(ctx, cam, t);
  drawWater(ctx, cam);
  drawWorld(ctx, cam, t);
  if (state.ms && state.ms.status === 'flying') {
    drawTargetsWorld(ctx, cam, t, drawTargets(state.ms, state.ac));
  }
}

function renderFly(t) {
  const ms = state.ms, ac = state.ac;
  renderWorldScene(t);
  const agl = Math.max(0, ac.pos.y - groundHeightAt(ac.pos.x, ac.pos.z) - 1.3);
  if (state.view === 'chase') {
    drawAircraft(ctx, state.cam, ac, t);
    drawReticle(ctx, t);
    drawTop(ctx, ms, t);
    drawBottom(ctx, ms, ac, agl, t);
    drawWarnings(ctx, ac, t);
  } else {
    const overGreen = onRunway(ac.pos.x, ac.pos.z) && inGreenZone(ac.pos.x);
    drawCockpit(ctx, ac, agl, t, overGreen);
    drawTop(ctx, ms, t);
    drawWarnings(ctx, ac, t);
  }
  audio.update(ac.throttle, airSpeed(ac), !ac.onGround, ac.engineDead);
}

function renderTitle(t) {
  // Slow arc over the bay.
  state.cam.yaw += 0.00022;
  renderWorldScene(t);
  drawTitle(ctx, state.sel, state.best, t);
}

function renderEnd(t) {
  renderWorldScene(t);
  if (state.ac) drawAircraft(ctx, state.cam, state.ac, t);
  drawEnd(ctx, state.ms, t);
}

// ---- the loop -------------------------------------------------------------------------
let last = performance.now();
let firstShotFrame = true;

function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state.shot) {
    // Frozen shot state: render the same frame, then signal readiness.
    renderShot();
    updateOverlay();
    if (firstShotFrame) {
      firstShotFrame = false;
      window.__shotReady = true;
    }
    requestAnimationFrame(frame);
    return;
  }

  state.t += dt;
  if (state.mode === 'title') renderTitle(state.t);
  else if (state.mode === 'fly') { stepFly(dt); if (state.mode === 'fly') renderFly(state.t); else renderEnd(state.t); }
  else renderEnd(state.t);
  updateOverlay();
  requestAnimationFrame(frame);
}

function renderShot() {
  const t = state.t;
  if (state.mode === 'title') { drawTitleFrame(t); return; }
  renderFlyStatic(t);
}

function drawTitleFrame(t) {
  renderWorldScene(t);
  drawTitle(ctx, 0, 0, t);
}

function renderFlyStatic(t) {
  const ms = state.ms, ac = state.ac;
  const params = new URLSearchParams(location.search);
  const noHud = params.get('nohud') === '1';
  const hudPart = params.get('hud'); // debug: bottom|top|ret|warn|cockpit-top
  const doHud = (part) => !noHud && (!hudPart || hudPart === part);
  renderWorldScene(t);
  const agl = Math.max(0, ac.pos.y - groundHeightAt(ac.pos.x, ac.pos.z) - 1.3);
  if (state.view === 'chase' && ac) {
    drawAircraft(ctx, state.cam, ac, t);
    if (doHud('ret')) drawReticle(ctx, t);
    if (doHud('top')) drawTop(ctx, ms, t);
    if (doHud('bottom')) drawBottom(ctx, ms, ac, agl, t);
    if (doHud('warn')) drawWarnings(ctx, ac, t);
  } else if (state.view === 'cockpit') {
    const overGreen = onRunway(ac.pos.x, ac.pos.z) && inGreenZone(ac.pos.x);
    drawCockpit(ctx, ac, agl, t, overGreen);
    if (doHud('top')) drawTop(ctx, ms, t);
  }
  if (state.mode === 'end' && doHud('top')) drawEnd(ctx, ms, t);
}

// ---- boot --------------------------------------------------------------------------------
if (state.shot) {
  // setupShot parks the aircraft, camera, mission and clock for the shot.
  setupShot(state, state.shot.name);
}
requestAnimationFrame(frame);
announce('Gullwing ready. Choose a sortie.');
