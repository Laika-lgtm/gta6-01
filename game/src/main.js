// Vice Point — game bootstrap and main loop. Wires the procedural city, Ray
// on foot, the six-car fleet, the HUD with its live minimap and the
// procedural sound bank together; runs the start screen, pointer-lock mouse
// look, the chase camera (which never sinks into a building) and the
// localStorage save used by later stages.
import * as THREE from 'three';
import { CITY_HALF, PLAYER_START, START_CASH, SAVE_KEY, districtAt } from './config.js';
import { buildCity } from './city.js';
import { Walker } from './player.js';
import { CarFleet } from './cars.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';

const errBox = document.getElementById('err');
window.addEventListener('error', (e) => { errBox.textContent = 'ERR: ' + e.message; });

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);

const { colliders, buildingCount, palmCount } = buildCity(scene);
const walker = new Walker(scene, PLAYER_START);
const fleet = new CarFleet(scene);
const hud = new Hud();
const sounds = new SoundBank();

const OBJECTIVE = { x: 40, z: 330, label: 'Meet your contact at Pier 9' };
let cash = START_CASH;
let driving = null;
let started = false;
let camYaw = PLAYER_START.yaw;
let camPitch = 0.32;
let camDist = 8;
const keys = new Set();

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.cash === 'number') cash = s.cash;
    if (s.pos) { walker.pos.set(s.pos.x, 0, s.pos.z); walker.group.position.copy(walker.pos); }
    if (s.objectiveDone) OBJECTIVE.label = 'Job done — cruise Vice Point, more work coming';
    document.getElementById('saveNote').textContent = 'Save found — welcome back, Ray.';
  } catch { /* corrupt save: start fresh */ }
}
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash, pos: { x: walker.pos.x, z: walker.pos.z },
      objectiveDone: OBJECTIVE.label.startsWith('Job done'),
    }));
  } catch { /* storage unavailable: play on without saving */ }
}
loadSave();
hud.setCash(cash);
hud.setObjective(OBJECTIVE.label);
hud.setHint('WASD walk · Shift run · E enter car · click to look');

document.getElementById('startBtn').addEventListener('click', () => {
  sounds.unlock();
  sounds.blip(880, 0.12, 'sine', 0.15);
  document.getElementById('start').style.display = 'none';
  lockPointer();
  started = true;
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && started) hud.setHint('Click the game to look around again');
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  camYaw -= e.movementX * 0.0028;
  camPitch = Math.max(0.05, Math.min(1.1, camPitch + e.movementY * 0.0022));
});
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyE' && started) toggleCar();
  if (e.code === 'KeyM') { sounds.muted = !sounds.muted; }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
function lockPointer() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* pointer lock unavailable (headless): mouse look stays off */ }
}
canvas.addEventListener('click', () => { if (started) lockPointer(); });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function toggleCar() {
  if (driving) {
    const car = driving;
    driving = null;
    car.occupied = false;
    walker.group.visible = true;
    walker.pos.set(car.pos.x + Math.sin(car.heading + Math.PI / 2) * 2.4, 0, car.pos.z + Math.cos(car.heading + Math.PI / 2) * 2.4);
    walker.group.position.copy(walker.pos);
    sounds.setEngine(false, 0);
    sounds.blip(330, 0.1);
    hud.setHint('WASD walk · Shift run · E enter car');
    return;
  }
  const car = fleet.nearest(walker.pos);
  if (!car) { hud.setHint('No car close enough — walk up to one and press E'); return; }
  car.occupied = true;
  driving = car;
  walker.group.visible = false;
  sounds.blip(520, 0.09);
  setTimeout(() => sounds.blip(780, 0.09), 90);
  hud.setHint(car.def.name + ' — W/S drive · A/D steer · Space handbrake · E get out');
}

function insideBuilding(x, z, pad = 1.2) {
  for (const c of colliders) {
    if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return true;
  }
  return false;
}

function placeCamera(target) {
  // Chase camera: pull in step by step until the line of sight is clear of
  // buildings, so the view never clips through a tower.
  let dist = camDist;
  const want = new THREE.Vector3();
  for (let tries = 0; tries < 12; tries++) {
    want.set(
      target.x - Math.sin(camYaw) * Math.cos(camPitch) * dist,
      target.y + 2.2 + Math.sin(camPitch) * dist,
      target.z - Math.cos(camYaw) * Math.cos(camPitch) * dist,
    );
    if (!insideBuilding(want.x, want.z, 0.8) && want.y > 1.2) break;
    dist *= 0.78;
    if (dist < 2.2) break;
  }
  camera.position.lerp(want, 0.35);
  camera.lookAt(target.x, target.y + 1.6, target.z);
}

let last = performance.now();
let saveTimer = 0;
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!started) {
    // Idle attract mode behind the start screen: slow orbit over the Strip.
    const t = now * 0.00008;
    camera.position.set(Math.sin(t) * 130, 70, Math.cos(t) * 130 - 20);
    camera.lookAt(0, 8, 0);
    renderer.render(scene, camera);
    return;
  }
  let speedKmh = 0;
  if (driving) {
    speedKmh = fleet.drive(driving, dt, keys, colliders, sounds);
    camYaw += (driving.heading + Math.PI - camYaw) * 0.02;
  } else {
    walker.update(dt, keys, camYaw, colliders, sounds);
    sounds.setEngine(false, 0);
  }
  const focus = driving ? driving.pos : walker.pos;
  placeCamera(focus);
  hud.drawMinimap(focus, driving ? driving.heading : camYaw, fleet.list, OBJECTIVE);
  hud.setSpeed(speedKmh, !!driving);
  if (!driving && Math.hypot(walker.pos.x - OBJECTIVE.x, walker.pos.z - OBJECTIVE.z) < 9
      && !OBJECTIVE.label.startsWith('Job done')) {
    OBJECTIVE.label = 'Job done — cruise Vice Point, more work coming';
    hud.setObjective(OBJECTIVE.label);
    cash += 150;
    hud.setCash(cash);
    sounds.blip(660, 0.12);
    setTimeout(() => sounds.blip(990, 0.18), 130);
    saveGame();
  }
  saveTimer += dt;
  if (saveTimer > 5) { saveTimer = 0; saveGame(); }
  renderer.render(scene, camera);
}
window.__vp = { walker, fleet, get driving() { return driving; }, get cash() { return cash; } };
requestAnimationFrame(tick);
console.log('[vice-point] r8 stage1 ready: buildings=' + buildingCount + ' palms=' + palmCount + ' cars=' + fleet.list.length);
