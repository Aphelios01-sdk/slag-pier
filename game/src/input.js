export function createInput(dom, onLockChange) {
  const keys = Object.create(null);
  const mouse = { dx: 0, dy: 0, down: false, locked: false };
  function onKey(e, down) {
    keys[e.code] = down;
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  dom.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.down = true;
    if (!mouse.locked) dom.requestPointerLock?.();
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
  window.addEventListener('mousemove', (e) => {
    if (!mouse.locked) return;
    mouse.dx += e.movementX;
    mouse.dy += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    mouse.locked = document.pointerLockElement === dom;
    onLockChange?.(mouse.locked);
  });
  return {
    keys, mouse,
    requestLock() { dom.requestPointerLock?.(); },
    consumeMouse() {
      const out = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = 0; mouse.dy = 0;
      return out;
    },
    pressed(code) { return !!keys[code]; },
  };
}
