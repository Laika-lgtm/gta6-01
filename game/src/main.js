// Vice Point — the game loop. Renderer, third-person player (Ray Delgado),
// car enter/exit and driving, chase camera, HUD, live circular minimap,
// start screen, pause, localStorage save and the deterministic screenshot
// mode (?shot=cover|drive|mission|city). The city, traffic and missions
// live in their own modules; this file wires them together.

import * as THREE from 'three';
import { buildCity } from './city.js';
import { makeCar, driveCar, resolveCircleCollision } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { MissionManager } from './missions.js';
import { SoundEngine } from './audio.js';

const SAVE_KEY = 'vicepoint-save-v1';
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- setup
const app = $('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
const city = buildCity(scene);
const traffic = createTraffic(scene);
const missions = new MissionManager(scene);
const sound = new SoundEngine();

// ---------------------------------------------------------------- player
function makePlayer() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5f });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2e8f86 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xd83a2e });
  const legGeo = new THREE.BoxGeometry(0.22, 0.8, 0.24);
  legGeo.translate(0, -0.4, 0);
  const legs = [];
  for (const lx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(legGeo, jeans);
    leg.position.set(lx, 0.82, 0);
    leg.castShadow = true;
    g.add(leg);
    legs.push(leg);
  }
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34), shirt);
  torso.position.y = 1.18;
  torso.castShadow = true;
  g.add(torso);
  const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.2);
  armGeo.translate(0, -0.31, 0);
  const arms = [];
  for (const ax of [-0.41, 0.41]) {
    const arm = new THREE.Mesh(armGeo, shirt);
    arm.position.set(ax, 1.48, 0);
    arm.castShadow = true;
    g.add(arm);
    arms.push(arm);
  }
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), capMat);
  cap.position.y = 1.94;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.22), capMat);
  brim.position.set(0, 1.9, 0.28);
  g.add(brim);
  g.userData.legs = legs;
  g.userData.arms = arms;
  return g;
}

const player = makePlayer();
scene.add(player);

// ---------------------------------------------------------------- cars
const cars = city.carSpots.map((spot) => {
  const group = makeCar(spot.color);
  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.yaw;
  scene.add(group);
  return { group, speed: 0, yaw: spot.yaw, color: spot.color };
});

// ---------------------------------------------------------------- state
const state = {
  started: false,
  paused: false,
  cinematic: false,
  cash: 0,
  inCar: false,
  carIndex: -1,
  yaw: Math.PI,
  vy: 0,
  grounded: true,
  camYaw: Math.PI,
  camPitch: 0.32,
  walkPhase: 0,
  stepAcc: 0,
  time: 0,
  saveTimer: 0,
};
player.position.set(city.spawnPoint.x, 0, city.spawnPoint.z);
player.rotation.y = state.yaw;

// ---------------------------------------------------------------- save
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      x: player.position.x,
      z: player.position.z,
      yaw: state.yaw,
      cash: state.cash,
      mission: missions.serialize(),
    }));
  } catch (_e) { /* storage unavailable: the game still plays */ }
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

function applySave(data) {
  if (!data) return;
  player.position.set(data.x ?? city.spawnPoint.x, 0, data.z ?? city.spawnPoint.z);
  state.yaw = data.yaw ?? Math.PI;
  state.cash = data.cash | 0;
  missions.restore(data.mission);
  player.rotation.y = state.yaw;
  state.camYaw = state.yaw;
}

// ---------------------------------------------------------------- HUD
const hud = $('hud');
const cashValue = $('cashValue');
const missionTitle = $('missionTitle');
const missionText = $('missionText');
const missionDist = $('missionDist');
const speedBox = $('speedBox');
const speedValue = $('speedValue');
const hintBox = $('hintBox');
const toastEl = $('toast');
const minimap = $('minimap');
const mapCtx = minimap.getContext('2d');
let toastTimer = 0;
let lastCash = -1;
let lastMissionKey = '';
let lastHint = '';

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3600);
}

function updateHud() {
  if (state.cash !== lastCash) {
    cashValue.textContent = state.cash.toLocaleString('en-US');
    lastCash = state.cash;
  }
  const m = missions.current();
  const key = m ? m.id : 'done';
  if (key !== lastMissionKey) {
    lastMissionKey = key;
    if (m) {
      missionTitle.textContent = `MISSION ${missions.index + 1}/3 — ${m.title}`;
      missionText.textContent = m.text;
    } else {
      missionTitle.textContent = 'FREE ROAM';
      missionText.textContent = 'Vice Point is yours. Earn cash, borrow cars, own the streets.';
    }
  }
  if (m && m.target) {
    const px = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
    const pz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
    missionDist.textContent = `${Math.round(Math.hypot(px - m.target.x, pz - m.target.z))} m to marker`;
  } else {
    missionDist.textContent = '';
  }
  if (state.inCar) {
    speedBox.classList.remove('hidden');
    speedValue.textContent = Math.round(Math.abs(cars[state.carIndex].speed) * 2.237);
  } else {
    speedBox.classList.add('hidden');
  }
  let hint = 'WASD move · drag mouse to look · SHIFT run · SPACE jump · E enter car · M mute';
  if (state.inCar) hint = 'WASD drive · E exit car · M mute · ESC pause';
  else if (nearestCar(3.6)) hint = 'Press E to get in the car';
  if (hint !== lastHint) {
    hintBox.textContent = hint;
    lastHint = hint;
  }
}

// ---------------------------------------------------------------- minimap
function drawMinimap() {
  const S = 368;
  const scale = 1.35; // px per metre; ~270 m across the circle
  const cx = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
  const cz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
  const g = mapCtx;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  g.clip();
  const toX = (wx) => S / 2 + (wx - cx) * scale;
  const toY = (wz) => S / 2 + (wz - cz) * scale;
  // Sea, sand, city ground.
  g.fillStyle = '#1e7fa8';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#e8d5a3';
  g.fillRect(0, toY(150), S, S);
  g.fillStyle = '#7d838a';
  g.fillRect(0, 0, S, Math.max(0, toY(150)));
  // Roads.
  g.fillStyle = '#33363b';
  for (const c of [-100, -50, 0, 50, 100]) {
    g.fillRect(toX(c) - 7 * scale, 0, 14 * scale, S);
    g.fillRect(0, toY(c) - 7 * scale, S, 14 * scale);
  }
  // Buildings in range.
  g.fillStyle = '#4a4f57';
  for (const b of city.colliders) {
    const x0 = toX(b.minX);
    const y0 = toY(b.minZ);
    const w = (b.maxX - b.minX) * scale;
    const h = (b.maxZ - b.minZ) * scale;
    if (x0 > S || y0 > S || x0 + w < 0 || y0 + h < 0) continue;
    g.fillRect(x0, y0, w, h);
  }
  // Pier.
  g.fillStyle = '#8a6a44';
  g.fillRect(toX(-6), toY(191), 12 * scale, 74 * scale);
  // Drivable + traffic cars.
  for (const car of cars) {
    g.fillStyle = `#${car.color.toString(16).padStart(6, '0')}`;
    g.beginPath();
    g.arc(toX(car.group.position.x), toY(car.group.position.z), 4.5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#c9c2b4';
  for (const tcar of traffic.cars) {
    g.beginPath();
    g.arc(toX(tcar.group.position.x), toY(tcar.group.position.z), 3.5, 0, Math.PI * 2);
    g.fill();
  }
  // Mission marker: a pulsing diamond, or an edge arrow when far away.
  if (missions.current()) {
    const mx = missions.markerPos.x;
    const mz = missions.markerPos.z;
    const dx = mx - cx;
    const dz = mz - cz;
    const dist = Math.hypot(dx, dz);
    const pulse = 6 + Math.sin(state.time * 4) * 2;
    g.fillStyle = '#ffd166';
    if (dist * scale < S / 2 - 14) {
      const x = toX(mx);
      const y = toY(mz);
      g.beginPath();
      g.moveTo(x, y - pulse);
      g.lineTo(x + pulse, y);
      g.lineTo(x, y + pulse);
      g.lineTo(x - pulse, y);
      g.closePath();
      g.fill();
    } else {
      const a = Math.atan2(dx, dz);
      const ex = S / 2 + Math.sin(a) * (S / 2 - 18);
      const ey = S / 2 + Math.cos(a) * (S / 2 - 18);
      g.save();
      g.translate(ex, ey);
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(7, 7);
      g.lineTo(-7, 7);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
  // Player arrow, pointing along the facing yaw.
  const yaw = state.inCar ? cars[state.carIndex].yaw : state.yaw;
  g.save();
  g.translate(S / 2, S / 2);
  g.rotate(yaw);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#081420';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -11);
  g.lineTo(8, 9);
  g.lineTo(-8, 9);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  g.restore();
  // Compass ring.
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  g.stroke();
}

// ---------------------------------------------------------------- input
const keys = {};
let dragging = false;
let lastPX = 0;
let lastPY = 0;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'KeyE' && state.started && !state.paused) tryEnterExitCar();
  if (e.code === 'KeyM') {
    sound.setMuted(!sound.muted);
    showToast(sound.muted ? 'Sound muted' : 'Sound on');
  }
  if (e.code === 'Escape' && state.started) togglePause();
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastPX = e.clientX;
  lastPY = e.clientY;
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  state.camYaw -= (e.clientX - lastPX) * 0.005;
  state.camPitch = Math.max(0.06, Math.min(1.15, state.camPitch + (e.clientY - lastPY) * 0.004));
  lastPX = e.clientX;
  lastPY = e.clientY;
});
window.addEventListener('pointerup', () => {
  dragging = false;
});

// ---------------------------------------------------------------- car enter/exit
function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  cars.forEach((car, i) => {
    const d = Math.hypot(car.group.position.x - player.position.x, car.group.position.z - player.position.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

function tryEnterExitCar() {
  if (!state.inCar) {
    const i = nearestCar(3.6);
    if (i === null) return;
    state.inCar = true;
    state.carIndex = i;
    player.visible = false;
    sound.startEngine();
    const done = missions.checkEnterCar();
    if (done) onMissionComplete(done);
  } else {
    const car = cars[state.carIndex];
    const rx = Math.cos(car.yaw);
    const rz = -Math.sin(car.yaw);
    player.position.set(car.group.position.x + rx * 2.4, 0, car.group.position.z + rz * 2.4);
    state.yaw = car.yaw;
    player.rotation.y = state.yaw;
    state.inCar = false;
    state.carIndex = -1;
    player.visible = true;
    sound.stopEngine();
    saveGame();
  }
}

function onMissionComplete(m) {
  state.cash += m.reward;
  sound.jingle();
  showToast(`Mission complete — ${m.title} · +$${m.reward}`);
  saveGame();
}

// ---------------------------------------------------------------- screens
function startGame(save) {
  sound.init();
  sound.ui();
  if (save) applySave(save);
  else {
    player.position.set(city.spawnPoint.x, 0, city.spawnPoint.z);
    state.yaw = city.spawnPoint.yaw;
    state.cash = 0;
    missions.restore({ index: 0, done: [] });
  }
  state.started = true;
  state.paused = false;
  state.inCar = false;
  state.carIndex = -1;
  player.visible = true;
  player.rotation.y = state.yaw;
  state.camYaw = state.yaw;
  $('startScreen').classList.add('hidden');
  $('pauseScreen').classList.add('hidden');
  hud.classList.remove('hidden');
}

function togglePause() {
  state.paused = !state.paused;
  $('pauseScreen').classList.toggle('hidden', !state.paused);
  if (state.paused) saveGame();
}

$('btnNew').addEventListener('click', () => startGame(null));
$('btnContinue').addEventListener('click', () => startGame(loadSave()));
$('btnResume').addEventListener('click', () => togglePause());
$('btnQuit').addEventListener('click', () => {
  saveGame();
  state.started = false;
  state.paused = false;
  sound.stopEngine();
  $('pauseScreen').classList.add('hidden');
  hud.classList.add('hidden');
  $('startScreen').classList.remove('hidden');
  refreshStartScreen();
});

function refreshStartScreen() {
  const save = loadSave();
  const btn = $('btnContinue');
  const info = $('saveInfo');
  if (save) {
    btn.classList.remove('hidden');
    const done = save.mission && Array.isArray(save.mission.done) ? save.mission.done.length : 0;
    info.textContent = `Saved game: $${(save.cash | 0).toLocaleString('en-US')} · ${done}/3 missions done`;
  } else {
    btn.classList.add('hidden');
    info.textContent = '';
  }
}
refreshStartScreen();

// ---------------------------------------------------------------- screenshot mode
const shot = new URLSearchParams(window.location.search).get('shot');
function applyShot(name) {
  state.started = true;
  state.cinematic = false;
  $('startScreen').classList.add('hidden');
  hud.classList.remove('hidden');
  if (name === 'cover') {
    // From the sand looking north: the VICE sign on the front-rank
    // southern building ahead (clear sightline over the sand), red car and
    // beacon on the road beyond it.
    player.position.set(0, 0, 170);
    state.yaw = Math.PI;
    player.rotation.y = state.yaw;
    state.camYaw = Math.PI;
    state.camPitch = 0.12;
    const coverCar = cars[0];
    coverCar.group.position.set(8, 0, 150);
    coverCar.group.rotation.y = Math.PI;
    coverCar.yaw = Math.PI;
  } else if (name === 'drive') {
    const car = cars[0];
    car.group.position.set(8, 0, 40);
    car.group.rotation.y = Math.PI;
    car.yaw = Math.PI;
    car.speed = 11;
    state.inCar = true;
    state.carIndex = 0;
    player.visible = false;
    state.camYaw = Math.PI;
    state.camPitch = 0.26;
    missions.restore({ index: 1, done: ['wheels'] });
    state.cash = 150;
  } else if (name === 'mission') {
    missions.restore({ index: 1, done: ['wheels'] });
    state.cash = 150;
    // On the pier itself, beacon and PIER 9 sign just ahead, no empty sand.
    player.position.set(0, 0, 198);
    state.yaw = 0;
    player.rotation.y = 0;
    state.camYaw = 0;
    state.camPitch = 0.3;
  } else if (name === 'city') {
    state.cinematic = true;
    player.position.set(6, 0, 96);
    state.yaw = Math.PI;
    player.rotation.y = state.yaw;
    missions.restore({ index: 1, done: ['wheels'] });
    state.cash = 150;
  }
}
if (shot) {
  try { sound.init(); } catch (_e) { /* headless: no gesture, audio stays suspended */ }
  applyShot(shot);
}

// ---------------------------------------------------------------- per-frame updates
function updatePlayer(dt) {
  const run = keys.ShiftLeft || keys.ShiftRight;
  const fwd = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const strafe = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const fx = Math.sin(state.camYaw);
  const fz = Math.cos(state.camYaw);
  const rx = -Math.cos(state.camYaw);
  const rz = Math.sin(state.camYaw);
  let mx = fx * fwd + rx * strafe;
  let mz = fz * fwd + rz * strafe;
  const len = Math.hypot(mx, mz);
  const speed = run ? 9.5 : 5;
  if (len > 0.01) {
    mx /= len;
    mz /= len;
    const targetYaw = Math.atan2(mx, mz);
    let diff = targetYaw - state.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    state.yaw += Math.max(-12 * dt, Math.min(12 * dt, diff));
    player.rotation.y = state.yaw;
    let nx = player.position.x + mx * speed * dt;
    let nz = player.position.z + mz * speed * dt;
    nx = Math.max(-164, Math.min(164, nx));
    // The pier is walkable: past the sand, z may run out to the pier end.
    const onPier = Math.abs(player.position.x) < 5.5;
    nz = Math.max(-164, Math.min(onPier ? 262 : 196, nz));
    const solved = resolveCircleCollision(nx, nz, 0.6, city.colliders);
    player.position.x = solved.x;
    player.position.z = solved.z;
    state.walkPhase += speed * dt * 1.9;
    state.stepAcc += speed * dt;
    if (state.stepAcc > 1.9) {
      state.stepAcc = 0;
      sound.footstep(run);
    }
  }
  if (keys.Space && state.grounded) {
    state.vy = 8.5;
    state.grounded = false;
  }
  if (!state.grounded) {
    state.vy -= 22 * dt;
    player.position.y += state.vy * dt;
    if (player.position.y <= 0) {
      player.position.y = 0;
      state.vy = 0;
      state.grounded = true;
    }
  }
  const swing = len > 0.01 ? Math.sin(state.walkPhase) * 0.6 : 0;
  player.userData.legs[0].rotation.x = swing;
  player.userData.legs[1].rotation.x = -swing;
  player.userData.arms[0].rotation.x = -swing * 0.7;
  player.userData.arms[1].rotation.x = swing * 0.7;
}

function updateCar(dt) {
  const car = cars[state.carIndex];
  const input = {
    forward: (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0),
    steer: (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0),
  };
  driveCar(car, input, dt, city.colliders);
  sound.setEngine(Math.abs(car.speed) / 27, input.forward !== 0 ? 1 : 0);
  // Camera eases behind the car.
  let diff = car.yaw - state.camYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  state.camYaw += diff * Math.min(1, 2.2 * dt);
}

function updateCamera(dt) {
  if (state.cinematic) {
    camera.position.set(72, 62, 216);
    camera.lookAt(0, 8, -30);
    return;
  }
  const target = state.inCar
    ? cars[state.carIndex].group.position
    : player.position;
  const dist = state.inCar ? 10.5 : 7.5;
  const height = state.inCar ? 3.4 : 2.4;
  const cp = Math.cos(state.camPitch);
  const sp = Math.sin(state.camPitch);
  const tx = target.x;
  const ty = target.y + (state.inCar ? 1.6 : 1.7);
  const tz = target.z;
  camera.position.set(
    tx - Math.sin(state.camYaw) * cp * dist,
    ty + sp * dist + height * 0.4,
    tz - Math.cos(state.camYaw) * cp * dist,
  );
  camera.lookAt(tx, ty, tz);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let firstFrame = true;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!state.paused) state.time += dt;
  if (state.started && !state.paused) {
    if (state.inCar) updateCar(dt);
    else updatePlayer(dt);
    // Mission progress.
    const px = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
    const pz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
    const done = missions.checkReach(px, pz);
    if (done) onMissionComplete(done);
    missions.updateBeacon(cars.map((c) => ({ x: c.group.position.x, z: c.group.position.z })), px, pz);
    missions.update(state.time);
    traffic.update(dt, state.time);
    state.saveTimer += dt;
    if (state.saveTimer > 20) {
      state.saveTimer = 0;
      saveGame();
    }
    updateHud();
    drawMinimap();
  }
  updateCamera(dt);
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__vp = window.__vp || {};
    window.__vp.ready = true;
  }
}
animate();

// Debug / playtest handle: no gameplay effect, only inspection. Note the
// first animate() call already ran above and may have marked ready on the
// placeholder object, so keep that flag instead of resetting it.
window.__vp = {
  ready: Boolean(window.__vp && window.__vp.ready),
  state,
  missions,
  cars,
  player,
  scene,
  THREE,
  teleport(x, z) {
    player.position.set(x, 0, z);
  },
  enterCar(i) {
    const car = cars[i];
    player.position.set(car.group.position.x + 2, 0, car.group.position.z);
    tryEnterExitCar();
  },
  exitCar() {
    if (state.inCar) tryEnterExitCar();
  },
  setShot(name) {
    applyShot(name);
  },
};
