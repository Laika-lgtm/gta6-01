// Rendering only: the WebGL renderer, the third-person camera rig, the sun
// and the fog that gives Vice Point its hazy afternoon light. No game rules
// live here — the camera just follows whatever the player module reports,
// and it never passes through a building: the line from the look target to
// the camera is clipped against the building boxes before it is used.
import * as THREE from 'three';
import { PALETTE } from './config.js';

export function createRenderer(canvas, initialColliders = []) {
  // The building boxes arrive after the city is built; the camera clips
  // against whatever set is current.
  let colliders = initialColliders;
  function setColliders(next) {
    colliders = next;
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 180, 520);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a6a4a, 0.9));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // How far along the target-to-camera segment the view stays clear: 1
  // means the whole line is open. A building box the segment enters pulls
  // the camera in to just before the wall.
  function clearFraction(from, to) {
    let best = 1;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    for (const c of colliders) {
      const minY = c.minY ?? 0;
      const maxY = c.maxY ?? 60;
      let t0 = 0;
      let t1 = 1;
      let ok = true;
      const axes = [
        [from.x, dx, c.minX, c.maxX],
        [from.y, dy, minY, maxY],
        [from.z, dz, c.minZ, c.maxZ],
      ];
      for (const [origin, dir, lo, hi] of axes) {
        if (Math.abs(dir) < 1e-9) {
          if (origin < lo || origin > hi) { ok = false; break; }
        } else {
          let a = (lo - origin) / dir;
          let b = (hi - origin) / dir;
          if (a > b) { const tmp = a; a = b; b = tmp; }
          if (a > t0) t0 = a;
          if (b < t1) t1 = b;
          if (t0 > t1) { ok = false; break; }
        }
      }
      if (ok && t0 >= 0 && t0 < best) best = t0;
    }
    return best;
  }

  // Third-person chase camera: behind and above the target, looking slightly
  // ahead of it, with a soft lag so fast turns feel weighty, not sickening.
  // The desired spot is pulled in toward the target whenever a building
  // stands between them, so the camera never clips through a wall.
  const offset = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const desired = new THREE.Vector3();
  function updateCamera(target, yaw, distance, height, dt) {
    lookAt.set(target.x + Math.sin(yaw) * 4, target.y + 1.6, target.z + Math.cos(yaw) * 4);
    desired.set(
      target.x - Math.sin(yaw) * distance,
      target.y + height,
      target.z - Math.cos(yaw) * distance,
    );
    const clear = clearFraction(lookAt, desired);
    if (clear < 1) {
      // Stop just short of the wall, but never closer than 2.5 m or the
      // camera ends up inside the player's head.
      const pull = Math.max(0.12, clear - 0.06);
      desired.lerpVectors(lookAt, desired, Math.max(pull, 2.5 / distance));
    }
    if (desired.y < 1.2) desired.y = 1.2;
    const lag = dt > 0 ? 1 - Math.exp(-8 * dt) : 1;
    camera.position.lerp(desired, lag);
    camera.lookAt(lookAt);
    offset.copy(camera.position).sub(lookAt);
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, sun, setColliders, updateCamera, render };
}
