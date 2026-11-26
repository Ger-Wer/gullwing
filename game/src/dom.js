// Gullwing — the words of the game, as DOM text over the canvas.
// The screenshot tool renders DOM text cleanly but garbles canvas fillText,
// so every letter lives here: the HUD, the cockpit gauges' numbers, the
// title and end screens. The canvas (hud.js, cockpit.js, render.js) draws
// only shapes. The overlay is a 1280x720 box that main.js scales to the
// window exactly the way the renderer scales the canvas, so the words sit
// on the shapes they belong to.
import { VIEW_W, VIEW_H, PALETTE, MISSIONS, CONTROLS, FLIGHT, WORLD } from './config.js';
import { airSpeed } from './aircraft.js';
import { objectiveLine } from './missions.js';
import { project } from './camera.js';

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const TITLE_FONT = '"Arial Narrow", Arial, sans-serif';

function makeDiv(parent, style) {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'absolute',
    margin: '0',
    padding: '0',
    whiteSpace: 'nowrap',
    fontFamily: MONO,
    pointerEvents: 'none',
    ...style,
  });
  parent.appendChild(el);
  return el;
}

function setText(el, text) {
  const s = text ?? '';
  if (el.textContent !== s) el.textContent = s;
}

function show(el, on) {
  const d = on ? 'block' : 'none';
  if (el.style.display !== d) el.style.display = d;
}

export function createOverlay() {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${VIEW_W}px`,
    height: `${VIEW_H}px`,
    transformOrigin: '0 0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '2',
  });
  document.body.appendChild(overlay);

  // ---- top bar (fly / end): mission, objective, score, clock, flash ----
  const topName = makeDiv(overlay, { left: '28px', top: '7px', fontSize: '13px', fontWeight: '600', color: PALETTE.hudAmber });
  const topObj = makeDiv(overlay, { left: '28px', top: '27px', width: '530px', fontSize: '12px', color: PALETTE.hudCyan, whiteSpace: 'normal', lineHeight: '15px' });
  const topScore = makeDiv(overlay, { right: '30px', top: '0px', fontSize: '20px', fontWeight: '700', color: PALETTE.hudAmber });
  const topClock = makeDiv(overlay, { right: '30px', top: '35px', fontSize: '11px', color: 'rgba(143,232,255,0.8)' });
  const flash = makeDiv(overlay, {
    left: '640px', top: '84px', transform: 'translateX(-50%)', fontSize: '15px', fontWeight: '600',
    color: PALETTE.hudGreen, background: 'rgba(10,14,26,0.78)', border: '1px solid rgba(126,240,216,0.35)',
    borderRadius: '8px', padding: '8px 22px',
  });

  // ---- bottom strip (chase view) ----
  const spdLabel = makeDiv(overlay, { left: '318px', top: '648px', fontSize: '10px', color: 'rgba(143,232,255,0.6)' });
  spdLabel.textContent = 'SPD m/s';
  const spdVal = makeDiv(overlay, { left: '318px', top: '658px', fontSize: '26px', fontWeight: '700', color: PALETTE.hudCyan });
  const vsVal = makeDiv(overlay, { left: '386px', top: '670px', fontSize: '14px', fontWeight: '700' });
  const aglLabel = makeDiv(overlay, { left: '428px', top: '648px', fontSize: '10px', color: 'rgba(143,232,255,0.6)' });
  aglLabel.textContent = 'AGL m';
  const aglVal = makeDiv(overlay, { left: '428px', top: '658px', fontSize: '26px', fontWeight: '700', color: PALETTE.hudCyan });
  const hdgVal = makeDiv(overlay, { left: '660px', top: '635px', fontSize: '13px', fontWeight: '700', color: PALETTE.hudGreen, transform: 'translateX(-50%)' });
  const tapeLetters = [];
  for (let i = 0; i < 8; i++) {
    tapeLetters.push(makeDiv(overlay, { top: '650px', fontSize: '12px', fontWeight: '700', color: PALETTE.hudAmber, transform: 'translateX(-50%)' }));
  }
  const fuelLabel = makeDiv(overlay, { left: '764px', top: '648px', fontSize: '10px', color: 'rgba(143,232,255,0.6)' });
  fuelLabel.textContent = 'FUEL';
  const fuelPct = makeDiv(overlay, { left: '892px', top: '666px', fontSize: '10px', color: 'rgba(143,232,255,0.7)' });
  const hullLabel = makeDiv(overlay, { left: '764px', top: '684px', fontSize: '10px', color: 'rgba(255,122,110,0.7)' });
  hullLabel.textContent = 'HULL';

  // ---- warnings (chase + cockpit) ----
  const warn = makeDiv(overlay, {
    left: '640px', top: '270px', transform: 'translate(-50%,-50%)',
    fontSize: '22px', fontWeight: '800', color: PALETTE.hudRed,
    textShadow: `0 0 18px ${PALETTE.hudRed}`,
  });

  // ---- title screen ----
  const titleName = makeDiv(overlay, {
    left: '640px', top: '76px', transform: 'translateX(-50%)', fontFamily: TITLE_FONT,
    fontSize: '74px', fontWeight: '800', color: PALETTE.hudCyan,
    textShadow: '0 0 26px rgba(126,240,216,0.5)', letterSpacing: '10px',
  });
  titleName.textContent = 'G U L L W I N G';
  const titleSub = makeDiv(overlay, { left: '640px', top: '167px', transform: 'translateX(-50%)', fontSize: '19px', fontWeight: '600', color: PALETTE.hudAmber });
  titleSub.textContent = 'COASTAL SORTIES · KESTREL BAY AIRFIELD';
  const titleTag = makeDiv(overlay, { left: '640px', top: '197px', transform: 'translateX(-50%)', fontSize: '13px', color: 'rgba(223,227,232,0.75)' });
  titleTag.textContent = 'a light-plane flight game built for the make.fun best flight game bounty';
  const titleBest = makeDiv(overlay, { left: '640px', top: '234px', transform: 'translateX(-50%)', fontSize: '12px', color: 'rgba(255,207,110,0.85)' });
  const sortieName = [], sortieBrief = [];
  for (let i = 0; i < MISSIONS.length; i++) {
    sortieName.push(makeDiv(overlay, { left: '640px', top: `${250 + i * 56}px`, transform: 'translateX(-50%)', fontSize: '15px', fontWeight: '700' }));
    sortieBrief.push(makeDiv(overlay, { left: '640px', top: `${272 + i * 56}px`, transform: 'translateX(-50%)', fontSize: '11px' }));
  }
  const controlLines = [];
  CONTROLS.forEach(([k, v], i) => {
    const col = i < 4 ? 60 : 430;
    const row = i % 4;
    const key = makeDiv(overlay, { left: `${col}px`, top: `${598 + row * 20}px`, fontSize: '12px', color: 'rgba(143,232,255,0.75)' });
    key.textContent = k;
    const val = makeDiv(overlay, { left: `${col + 150}px`, top: `${598 + row * 20}px`, fontSize: '12px', color: 'rgba(223,227,232,0.6)' });
    val.textContent = v;
    controlLines.push(key, val);
  });
  const titlePrompt = makeDiv(overlay, { left: '640px', top: '686px', transform: 'translateX(-50%)', fontSize: '14px', fontWeight: '700', color: PALETTE.hudAmber });
  titlePrompt.textContent = 'ENTER — FLY THE HIGHLIGHTED SORTIE';

  // ---- end screen ----
  const endTitle = makeDiv(overlay, {
    left: '640px', top: '205px', transform: 'translateX(-50%)', fontFamily: TITLE_FONT,
    fontSize: '40px', fontWeight: '800',
  });
  const endReason = makeDiv(overlay, { left: '640px', top: '269px', width: '470px', transform: 'translateX(-50%)', fontSize: '13px', color: 'rgba(223,227,232,0.85)', whiteSpace: 'normal', textAlign: 'center', lineHeight: '18px' });
  const endGrade = makeDiv(overlay, { left: '480px', top: '325px', transform: 'translateX(-50%)', fontSize: '56px', fontWeight: '800', color: PALETTE.hudAmber });
  const endScore = makeDiv(overlay, { left: '550px', top: '341px', fontSize: '30px', fontWeight: '700', color: PALETTE.hudCyan });
  const endScoreLabel = makeDiv(overlay, { left: '552px', top: '379px', fontSize: '11px', color: 'rgba(143,232,255,0.6)' });
  endScoreLabel.textContent = 'TOTAL SCORE';
  const endLines = [];
  for (let i = 0; i < 3; i++) {
    endLines.push(makeDiv(overlay, { left: '640px', top: `${405 + i * 18}px`, transform: 'translateX(-50%)', fontSize: '12px', color: 'rgba(223,227,232,0.7)' }));
  }
  const endPrompt = makeDiv(overlay, { left: '640px', top: '479px', transform: 'translateX(-50%)', fontSize: '13px', fontWeight: '700', color: PALETTE.hudAmber });
  endPrompt.textContent = 'ENTER — FLY AGAIN      ESC — SORTIE LIST';

  // ---- cockpit gauges ----
  const panelTop = VIEW_H * 0.60;
  const cy = panelTop + (VIEW_H - panelTop) * 0.52;
  const gr = Math.min(74, (VIEW_H - panelTop) * 0.30);
  const gaugeDefs = [
    { x: 210, y: cy, r: gr, min: 0, max: 100, tick: 10, majorEvery: 1, a0: -225, a1: 45 },
    { x: VIEW_W / 2 - 130, y: cy, r: gr, min: 0, max: 2000, tick: 100, majorEvery: 2, a0: -225, a1: 45 },
    { x: VIEW_W / 2 + 130, y: cy, r: gr, min: 0, max: 360, tick: 30, majorEvery: 3, a0: -90, a1: 270 },
    { x: VIEW_W - 210, y: cy, r: gr * 0.82, min: -60, max: 60, tick: 15, majorEvery: 1, a0: -225, a1: 45, tint: 'rgba(143,232,255,0.8)' },
    { x: 100, y: cy, r: 44, min: 0, max: 2800, tick: 700, majorEvery: 1, a0: -225, a1: 45 },
  ];
  const tickNums = [];
  for (const g of gaugeDefs) {
    for (let v = g.min; v <= g.max + 0.001; v += g.tick) {
      const major = Math.abs(v / g.tick - Math.round(v / g.tick)) < 1e-6 && (Math.round(v / g.tick) % g.majorEvery === 0);
      if (!major) continue;
      const f = (v - g.min) / (g.max - g.min);
      const a = ((g.a0 + (g.a1 - g.a0) * f) * Math.PI) / 180;
      const el = makeDiv(overlay, {
        left: `${g.x + Math.cos(a) * g.r * 0.56}px`,
        top: `${g.y + Math.sin(a) * g.r * 0.56}px`,
        transform: 'translate(-50%,-50%)',
        fontSize: `${Math.max(8, g.r * 0.16)}px`, fontWeight: '600',
        color: g.tint ?? 'rgba(223,227,232,0.9)',
      });
      el.textContent = String(Math.round(v));
      tickNums.push(el);
    }
  }
  // Gauge captions sit BELOW each dial: the top tick numbers live at the
  // same radius the old canvas labels used, so a caption above the dial
  // would print on top of the numbers.
  const gaugeLabels = [
    ['AIRSPEED', 210, cy + gr * 1.32], ['ALTITUDE', VIEW_W / 2 - 130, cy + gr * 1.32],
    ['HEADING', VIEW_W / 2 + 130, cy + gr * 1.32], ['TURN', VIEW_W - 210, cy + gr * 0.82 * 1.32],
    ['ENGINE', 100, cy + 44 + 58 + 16],
  ];
  const gaugeLabelEls = [];
  for (const [text, x, y] of gaugeLabels) {
    const el = makeDiv(overlay, { left: `${x}px`, top: `${y}px`, transform: 'translate(-50%,-50%)', fontSize: '9px', fontWeight: '600', color: 'rgba(223,227,232,0.55)' });
    el.textContent = text;
    gaugeLabelEls.push(el);
  }
  const spdRead = makeDiv(overlay, { left: '210px', top: `${cy + gr * 0.52}px`, transform: 'translate(-50%,-50%)', fontSize: '15px', fontWeight: '700', color: PALETTE.hudCyan });
  const spdSub = makeDiv(overlay, { left: '210px', top: `${cy + gr * 0.52 + 10}px`, transform: 'translate(-50%,-50%)', fontSize: '8px', fontWeight: '600', color: 'rgba(223,227,232,0.65)' });
  spdSub.textContent = 'm/s';
  const altRead = makeDiv(overlay, { left: `${VIEW_W / 2 - 130}px`, top: `${cy + gr * 0.52}px`, transform: 'translate(-50%,-50%)', fontSize: '15px', fontWeight: '700', color: PALETTE.hudCyan });
  const altSub = makeDiv(overlay, { left: `${VIEW_W / 2 - 130}px`, top: `${cy + gr * 0.52 + 10}px`, transform: 'translate(-50%,-50%)', fontSize: '8px', fontWeight: '600', color: 'rgba(223,227,232,0.65)' });
  const hdgLetters = [];
  for (const name of ['N', 'E', 'S', 'W']) {
    const el = makeDiv(overlay, { fontSize: `${gr * 0.24}px`, fontWeight: '700', transform: 'translate(-50%,-50%)' });
    el.textContent = name;
    el.style.color = name === 'N' ? PALETTE.hudGreen : PALETTE.hudAmber;
    hdgLetters.push(el);
  }
  const fuelWord = makeDiv(overlay, { left: `${VIEW_W - 90}px`, top: `${cy + 55 + 16 - 10}px`, transform: 'translateX(-50%)', fontSize: '10px', fontWeight: '600', color: 'rgba(223,227,232,0.8)' });
  fuelWord.textContent = 'FUEL';
  const fuelVal = makeDiv(overlay, { left: `${VIEW_W - 90}px`, top: `${cy + 55 + 28 - 10}px`, transform: 'translateX(-50%)', fontSize: '10px', fontWeight: '600', color: 'rgba(223,227,232,0.8)' });
  const thrWord = makeDiv(overlay, { left: '100px', top: `${cy + 44 + 58 - 10}px`, transform: 'translateX(-50%)', fontSize: '10px', fontWeight: '600', color: 'rgba(223,227,232,0.8)' });
  thrWord.textContent = 'THROTTLE';
  const lamps = [];
  for (const [text, color] of [['STALL', PALETTE.hudRed], ['FUEL LOW', PALETTE.hudAmber], ['ENGINE', PALETTE.hudRed], ['GREEN', PALETTE.hudGreen]]) {
    const el = makeDiv(overlay, {
      width: '92px', height: '22px', fontSize: '11px', fontWeight: '700', textAlign: 'center',
      lineHeight: '22px', color, background: 'rgba(20,26,40,0.55)',
      border: '1px solid rgba(223,227,232,0.25)',
    });
    el.textContent = text;
    lamps.push(el);
  }

  // ---- runway number, painted on the asphalt ----
  const rwyNum = makeDiv(overlay, {
    fontFamily: TITLE_FONT, fontWeight: '700', color: PALETTE.marking,
    transform: 'translate(-50%,-50%)',
  });

  const groups = {
    top: [topName, topObj, topScore, topClock],
    bottom: [spdLabel, spdVal, vsVal, aglLabel, aglVal, hdgVal, ...tapeLetters, fuelLabel, fuelPct, hullLabel],
    warn: [warn],
    title: [titleName, titleSub, titleTag, titleBest, ...sortieName, ...sortieBrief, ...controlLines, titlePrompt],
    end: [endTitle, endReason, endGrade, endScore, endScoreLabel, ...endLines, endPrompt],
    cockpit: [...tickNums, ...gaugeLabelEls, spdRead, spdSub, altRead, altSub, ...hdgLetters, fuelWord, fuelVal, thrWord, ...lamps],
    runway: [rwyNum],
  };
  function setGroup(name, on) {
    for (const el of groups[name]) show(el, on);
  }

  /** Refresh every word from the live state; called once per frame. */
  function update(s) {
    const inFly = s.mode === 'fly' && s.ms && s.ac;
    const inCockpit = inFly && s.view === 'cockpit';
    const inChase = inFly && s.view === 'chase';
    setGroup('top', s.mode === 'fly' && !!s.ms);
    setGroup('bottom', inChase);
    setGroup('cockpit', inCockpit);
    setGroup('title', s.mode === 'title');
    setGroup('end', s.mode === 'end' && !!s.ms);
    show(flash, !!(s.ms && s.ms.flash && s.mode === 'fly'));
    if (s.ms && s.ms.flash) setText(flash, s.ms.flash);

    if (s.ms) {
      setText(topName, s.ms.def.name);
      setText(topObj, objectiveLine(s.ms));
      setText(topScore, String(s.ms.score).padStart(5, '0'));
      const m = Math.floor(s.ms.time / 60), sec = Math.floor(s.ms.time % 60);
      setText(topClock, `T+${m}:${String(sec).padStart(2, '0')}   SCORE`);
    }

    let warnText = '';
    if (inFly && !s.ac.onGround && !s.ac.crashed) {
      const v = airSpeed(s.ac);
      if (v < FLIGHT.stallSpeed + 2.5 && !s.ac.engineDead && Math.floor(s.t * 2.5) % 2 === 0) warnText = 'STALL';
      else if (s.ac.engineDead) warnText = 'ENGINE DEAD — GLIDE';
    }
    setGroup('warn', warnText !== '');
    setText(warn, warnText);

    if (inChase) {
      const ac = s.ac, vs = ac.vel.y;
      setText(spdVal, String(Math.round(airSpeed(ac))));
      setText(vsVal, (vs > 0 ? '▲ ' : vs < 0 ? '▼ ' : '· ') + Math.abs(Math.round(vs)));
      vsVal.style.color = vs > 0.5 ? PALETTE.hudGreen : vs < -0.5 ? PALETTE.hudRed : 'rgba(143,232,255,0.5)';
      setText(aglVal, String(Math.max(0, Math.round(s.agl))));
      aglVal.style.color = s.agl < 60 && !ac.onGround ? PALETTE.hudAmber : PALETTE.hudCyan;
      const headDeg = ((ac.yaw * 180) / Math.PI) % 360;
      setText(hdgVal, String(Math.round(((headDeg % 360) + 360) % 360)).padStart(3, '0') + '°');
      // Heading tape letters (canvas tape: x 550..770, y 650..696, 0.6 deg/px).
      const tx = 550, tw = 220, degPerPx = 0.6;
      const start = Math.floor((headDeg - tw / 2 / degPerPx) / 15) * 15;
      let li = 0;
      for (let d = start; d <= headDeg + tw / 2 / degPerPx + 15; d += 15) {
        if (d % 90 !== 0) continue;
        const px = tx + tw / 2 + ((d - headDeg) / degPerPx);
        if (px < tx - 10 || px > tx + tw + 10 || li >= tapeLetters.length) continue;
        const el = tapeLetters[li++];
        el.style.left = `${px}px`;
        setText(el, ['N', 'E', 'S', 'W'][Math.round((((d % 360) + 360) % 360) / 90)]);
        show(el, true);
      }
      for (; li < tapeLetters.length; li++) show(tapeLetters[li], false);
      const low = ac.fuel < FLIGHT.fuelReservePct;
      const blink = low && Math.floor(s.t * 3) % 2 === 0;
      setText(fuelPct, `${Math.round(ac.fuel * 100)}%`);
      fuelPct.style.color = blink || low ? PALETTE.hudRed : 'rgba(143,232,255,0.7)';
      show(hullLabel, ac.health < 1);
    }

    if (s.mode === 'title') {
      const bob = Math.sin(s.t * 1.4) * 3;
      titleName.style.top = `${76 + bob}px`;
      titleSub.style.top = `${167 + bob}px`;
      titleTag.style.top = `${197 + bob}px`;
      titlePrompt.style.opacity = String(0.6 + Math.sin(s.t * 3) * 0.4);
      show(titleBest, s.best > 0);
      setText(titleBest, `BEST SCORE ${s.best}`);
      MISSIONS.forEach((mm, i) => {
        const active = i === s.sel;
        sortieName[i].style.color = active ? PALETTE.hudGreen : 'rgba(223,227,232,0.7)';
        sortieName[i].style.fontSize = active ? '15px' : '13px';
        sortieName[i].style.fontWeight = active ? '700' : '400';
        setText(sortieName[i], `${i + 1}   ${mm.name}`);
        sortieBrief[i].style.color = active ? 'rgba(143,232,255,0.85)' : 'rgba(223,227,232,0.4)';
        setText(sortieBrief[i], mm.brief);
      });
    }

    if (s.mode === 'end' && s.ms) {
      const won = s.ms.status === 'won';
      endTitle.style.color = won ? PALETTE.hudGreen : PALETTE.hudRed;
      endTitle.style.textShadow = won ? '0 0 22px rgba(159,242,176,0.5)' : '0 0 22px rgba(255,122,110,0.5)';
      setText(endTitle, won ? 'SORTIE COMPLETE' : 'SORTIE LOST');
      setText(endReason, s.ms.reason ?? s.ms.endInfo?.lines[0] ?? '');
      setText(endGrade, s.ms.endInfo?.grade ?? '–');
      setText(endScore, String(s.ms.endInfo?.score ?? 0).padStart(5, '0'));
      (s.ms.endInfo?.lines ?? []).forEach((ln, i) => {
        if (i < endLines.length) setText(endLines[i], ln);
      });
      for (let i = (s.ms.endInfo?.lines ?? []).length; i < endLines.length; i++) setText(endLines[i], '');
      endPrompt.style.opacity = String(0.6 + Math.sin(s.t * 3) * 0.4);
    }

    if (inCockpit) {
      const ac = s.ac;
      setText(spdRead, String(Math.round(airSpeed(ac))));
      setText(altRead, String(Math.round(Math.max(0, ac.pos.y))));
      setText(altSub, `AGL ${Math.max(0, Math.round(s.agl))}`);
      const hx = VIEW_W / 2 + 130, hy = cy;
      const cards = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
      cards.forEach(([name, d], i) => {
        const a = ((d - 90) * Math.PI) / 180 + ac.yaw;
        hdgLetters[i].style.left = `${hx + Math.cos(a) * gr * 0.55}px`;
        hdgLetters[i].style.top = `${hy + Math.sin(a) * gr * 0.55}px`;
      });
      setText(fuelVal, `${Math.round(ac.fuel * 100)}%`);
      const lampDefs = [
        !ac.onGround && airSpeed(ac) < FLIGHT.stallSpeed + 2.5,
        ac.fuel < FLIGHT.fuelReservePct && !ac.engineDead,
        ac.engineDead,
        s.overGreen,
      ];
      const lampColors = [PALETTE.hudRed, PALETTE.hudAmber, PALETTE.hudRed, PALETTE.hudGreen];
      const total = 4 * 92 + 3 * 12;
      lamps.forEach((el, i) => {
        const on = lampDefs[i];
        const blink = on && Math.floor(s.t * 3) % 2 === 0;
        el.style.left = `${VIEW_W / 2 - total / 2 + i * (92 + 12)}px`;
        el.style.top = `${cy - gr - 26 - 11}px`;
        el.style.color = on ? lampColors[i] : 'rgba(223,227,232,0.3)';
        el.style.boxShadow = on && !blink ? `0 0 14px ${lampColors[i]}` : 'none';
        el.style.opacity = on && blink ? '0.2' : '1';
      });
    }

    // Runway number, painted on the asphalt when the strip is in view.
    let showRwy = false;
    if (inFly && s.cam) {
      const np = project(s.cam, { x: -950, y: 0.09, z: 0 });
      if (np && np.d < 1800) {
        showRwy = true;
        rwyNum.style.left = `${np.x}px`;
        rwyNum.style.top = `${np.y}px`;
        rwyNum.style.fontSize = `${Math.max(9, 24 * np.s)}px`;
        rwyNum.style.opacity = String(Math.min(0.9, 2600 / np.d));
      }
    }
    show(rwyNum, showRwy);
    setText(rwyNum, '09');
  }

  return {
    element: overlay,
    /** Scale the 1280x720 overlay to the window, exactly like the canvas. */
    fit() {
      const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
      const x = (window.innerWidth - VIEW_W * scale) / 2;
      const y = (window.innerHeight - VIEW_H * scale) / 2;
      overlay.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    },
    update,
  };
}
