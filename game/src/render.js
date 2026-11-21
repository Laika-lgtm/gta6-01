// Rendering only: the WebGL renderer, the third-person camera rig, the sun
// and the fog that gives Vice Point its hazy afternoon light. No game rules
// live here — the camera just follows whatever the player module reports.
import * as THREE from 'three';
import { PALETTE } from './config.js';

export function createRenderer(canvas) {
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

  // Third-person chase camera: behind and above the target, looking slightly
  // ahead of it, with a soft lag so fast turns feel weighty, not sickening.
  const offset = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const desired = new THREE.Vector3();
  function updateCamera(target, yaw, distance, height, dt) {
    const back = distance;
    desired.set(
      target.x - Math.sin(yaw) * back,
      target.y + height,
      target.z - Math.cos(yaw) * back,
    );
    const lag = 1 - Math.exp(-8 * dt);
    camera.position.lerp(desired, lag);
    lookAt.set(target.x + Math.sin(yaw) * 4, target.y + 1.6, target.z + Math.cos(yaw) * 4);
    camera.lookAt(lookAt);
    offset.copy(camera.position).sub(lookAt);
  }

  function render() {
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, sun, updateCamera, render };
}
