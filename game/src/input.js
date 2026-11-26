// Gullwing — input: keyboard (throttle, pitch, roll, brakes, camera, menus)
// plus mouse: click to focus, wheel for throttle. Returns a per-frame command
// struct the flight model understands.

/** Live keyboard state. Attach to a canvas with attachInput(canvas, api). */
export function makeInput() {
  const keys = new Set();
  let throttle = 0; // 0..1, changed by W/S or the wheel

  const api = {
    keys,
    getThrottle: () => throttle,
    setThrottle: (v) => { throttle = Math.max(0, Math.min(1, v)); },
    press(code) { keys.add(code); },
    release(code) { keys.delete(code); },
    /** The flight model's command for this frame. */
    command(airborne) {
      const k = keys;
      const pitch = (k.has('ArrowUp') || k.has('KeyI') ? 1 : 0) + (k.has('ArrowDown') || k.has('KeyK') ? -1 : 0);
      const roll = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) + (k.has('ArrowLeft') || k.has('KeyA') ? -1 : 0);
      const tdir = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        throttleDir: tdir,
        brake: k.has('Space'),
      };
    },
    /** True once while a key goes down (for menus). */
    consume(code) {
      if (keys.has(code)) { keys.delete(code); return true; }
      return false;
    },
  };

  function attach(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      keys.add(e.code);
      canvas.focus?.();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => keys.clear());
    canvas.addEventListener('mousedown', () => canvas.focus?.());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      api.setThrottle(throttle - Math.sign(e.deltaY) * 0.05);
    }, { passive: false });
  }

  return { ...api, attach };
}

/** Apply throttle ramping from the command onto the aircraft. */
export function applyThrottle(ac, cmd, dt) {
  if (cmd.throttleDir !== 0) {
    ac.throttle = Math.max(0, Math.min(1, ac.throttle + cmd.throttleDir * 0.55 * dt));
  }
}
