// Keyboard and mouse input. Held keys give a movement direction; one-shot
// presses (enter/exit car, punch, pause, mute) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost and
// never counted twice. The mouse orbits the camera once the pointer is
// locked.
export const ACTION_ENTER = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_PUNCH = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let lookDX = 0;
  let lookDY = 0;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'KeyE') actions |= ACTION_ENTER;
    else if (event.code === 'KeyF') actions |= ACTION_PUNCH;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions |= ACTION_PAUSE;
    else if (event.code === 'KeyM') actions |= ACTION_MUTE;
    else if (event.code === 'Enter' || event.code === 'Space') actions |= ACTION_CONFIRM;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
  });
  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement === canvas) {
      lookDX += event.movementX;
      lookDY += event.movementY;
    }
  });
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  });

  return {
    /** Movement state for this frame: booleans the player/car read. */
    move() {
      const any = (set) => [...held].some((c) => set.has(c));
      return {
        forward: any(FORWARD),
        back: any(BACK),
        left: any(LEFT),
        right: any(RIGHT),
        shift: held.has('ShiftLeft') || held.has('ShiftRight'),
        brake: held.has('Space'),
      };
    },
    /** Mouse look accumulated since the last call, in pixels. */
    takeLook() {
      const out = { dx: lookDX, dy: lookDY };
      lookDX = 0;
      lookDY = 0;
      return out;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
