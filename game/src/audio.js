// Gullwing — sound: all of it synthesized with WebAudio, no files. A two-voice
// engine that follows the throttle, a wind noise that grows with airspeed,
// and little beeps for checkpoints, rings, crashes and the finish.

/** Create the audio engine. The context starts on the first user gesture. */
export function makeAudio() {
  let ctx = null;
  let engineOscA = null, engineOscB = null, engineGain = null, engineFilter = null;
  let windGain = null;
  let muted = false;
  let running = false;

  function ensure() {
    if (ctx) return true;
    if (muted) return false;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    // Engine: two detuned saws through a lowpass, gain from throttle.
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOscA = ctx.createOscillator();
    engineOscA.type = 'sawtooth';
    engineOscA.frequency.value = 55;
    engineOscB = ctx.createOscillator();
    engineOscB.type = 'sawtooth';
    engineOscB.frequency.value = 55 * 1.5 + 0.7;
    engineOscA.connect(engineFilter);
    engineOscB.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOscA.start();
    engineOscB.start();
    // Wind: looped white noise through a bandpass, gain from airspeed.
    const len = ctx.sampleRate * 1.2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    src.connect(bp);
    bp.connect(windGain);
    windGain.connect(ctx.destination);
    src.start();
    return true;
  }

  return {
    /** Call on any keydown/click; the browser needs a gesture. */
    unlock() {
      if (muted) return;
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(m) {
      muted = m;
      if (m && engineGain) engineGain.gain.value = 0;
      if (m && windGain) windGain.gain.value = 0;
    },
    isMuted: () => muted,
    /** Per-frame: engine and wind follow throttle and speed. */
    update(throttle, speed, airborne, engineDead) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      if (!running) { running = true; }
      const on = airborne && !engineDead;
      const rpm = 52 + throttle * 78;
      engineOscA.frequency.setTargetAtTime(rpm, t, 0.08);
      engineOscB.frequency.setTargetAtTime(rpm * 1.5 + 0.7, t, 0.08);
      engineFilter.frequency.setTargetAtTime(240 + throttle * 420, t, 0.1);
      engineGain.gain.setTargetAtTime(on ? 0.05 + throttle * 0.1 : 0.004, t, 0.09);
      windGain.gain.setTargetAtTime(Math.min(0.16, Math.max(0, (speed - 18) / 260)), t, 0.15);
    },
    /** A short sine beep. */
    beep(freq = 880, dur = 0.09, gain = 0.12, type = 'sine') {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    /** Two rising beeps: checkpoint / ring passed. */
    good() { this.beep(740, 0.08); setTimeout(() => this.beep(1108, 0.12), 90); },
    /** A dull impact. */
    thud() {
      if (!ensure() || muted) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    },
    /** A short fanfare for a finished sortie. */
    fanfare() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.16, 0.14), i * 140));
    },
    /** A descending two-note dirge for a lost one. */
    dirge() {
      [392, 311, 233].forEach((f, i) => setTimeout(() => this.beep(f, 0.22, 0.14, 'triangle'), i * 220));
    },
    /** Throttle lever tick for the HUD. */
    tick() { this.beep(1600, 0.02, 0.03, 'square'); },
  };
}
