// Vice Point — keyboard and mouse input.
// One object owns every key and pointer state the game reads. WASD moves,
// Shift runs, E enters/exits a car, mouse drag orbits the third-person camera
// (pointer lock when available, drag fallback when it is not).

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    keys,
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    pointerLocked: false,
    // Edge-triggered actions, consumed once by the game loop each frame.
    pressed: new Set(),
  };

  function keyName(event) {
    return event.code;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(keyName(event));
    state.pressed.add(keyName(event));
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(keyName(event));
  });
  window.addEventListener('blur', () => {
    keys.clear();
  });

  canvas.addEventListener('mousedown', (event) => {
    state.mouseDown = true;
    if (canvas.requestPointerLock) {
      try {
        const p = canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        // Pointer lock is a nicety; drag-to-look still works without it.
      }
    }
    event.preventDefault();
  });
  window.addEventListener('mouseup', () => {
    state.mouseDown = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.pointerLocked = document.pointerLockElement === canvas;
  });
  window.addEventListener('mousemove', (event) => {
    if (state.pointerLocked) {
      state.mouseDX += event.movementX;
      state.mouseDY += event.movementY;
    } else if (state.mouseDown) {
      state.mouseDX += event.movementX;
      state.mouseDY += event.movementY;
    }
  });

  return state;
}

// Movement intent in camera space: forward/strafe in [-1, 1], run flag.
export function readMoveIntent(input) {
  const k = input.keys;
  const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  return {
    forward,
    strafe,
    run: k.has('ShiftLeft') || k.has('ShiftRight'),
  };
}

// Driving intent: throttle [-1, 1] and steering [-1, 1].
export function readDriveIntent(input) {
  const k = input.keys;
  const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  const steer = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
  return { throttle, steer, brake: k.has('Space') };
}

// True once when the key was pressed since the last frame; clears itself.
export function wasPressed(input, code) {
  const hit = input.pressed.has(code);
  if (hit) input.pressed.delete(code);
  return hit;
}

// Drain this frame's mouse deltas (pixels) and reset them to zero.
export function drainMouse(input) {
  const dx = input.mouseDX;
  const dy = input.mouseDY;
  input.mouseDX = 0;
  input.mouseDY = 0;
  return { dx, dy };
}

// Test hooks: let the headless playtest drive the game without a real keyboard.
export function injectKey(input, code, down) {
  if (down) {
    input.keys.add(code);
    input.pressed.add(code);
  } else {
    input.keys.delete(code);
  }
}
