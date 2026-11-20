// Vice Point — the game loop. Renderer, third-person player (Ray Delgado),
// car enter/exit and driving, chase camera, HUD, live circular minimap,
// start screen, pause, localStorage save and the deterministic screenshot
// mode (?shot=cover|drive|mission|city). The city, traffic and missions
// live in their own modules; this file wires them together.

import * as THREE from 'three';
import { buildCity } from './city.js';
import { makeCar, driveCar, resolveCircleCollision } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { MissionManager, MISSIONS } from './missions.js';
import { PoliceManager } from './police.js';
import { SoundEngine, RADIO_CHANNELS } from './audio.js';
import { WeaponManager } from './weapons.js';
import { HeliManager } from './heli.js';
import { GarageManager } from './garage.js';

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
const missions = new MissionManager(scene, { hotel: city.hotelSpot });
const sound = new SoundEngine();
const police = new PoliceManager(scene, sound);
police.colliders = city.colliders;
const weapons = new WeaponManager(scene, sound);
const heli = new HeliManager(scene, city.buildings);

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
  return { group, speed: 0, yaw: spot.yaw, color: spot.color, parked: false };
});
const garage = new GarageManager(scene, cars, (i) => {
  const m = missions.current();
  return Boolean(m && m.kind === 'getaway' && m.carIndex === i && missions.index === 2);
});

// ---------------------------------------------------------------- state
const state = {
  started: false,
  paused: false,
  cinematic: false,
  cash: 250, // Ray starts the Mara Voss chain with $250 in his pocket.
  respect: 0, // Grows with finished jobs, falls with busts; gates jobs 7-8.
  inCar: false,
  carIndex: -1,
  yaw: Math.PI,
  vy: 0,
  grounded: true,
  camYaw: Math.PI,
  camPitch: 0.32,
  aiming: false, // right mouse held: over-shoulder aim, pitch can go up
  wheelOpen: false,
  mouseX: 0,
  mouseY: 0,
  walkPhase: 0,
  stepAcc: 0,
  time: 0,
  saveTimer: 0,
  moveSpeed: 0,
  punchTimer: 0,
  punchCooldown: 0,
  lastTrafficHit: -10,
  lastPedHit: -10,
  lastPoliceHit: -10,
  lastMissionIndex: 0,
  prevWanted: 0,
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
      respect: state.respect,
      wanted: police.wanted,
      mission: missions.serialize(),
      garage: garage.serialize(),
      weapons: weapons.serialize(),
      radio: sound.radioChannel,
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
  state.cash = data.cash ?? 250;
  state.respect = data.respect ?? 0;
  missions.restore(data.mission);
  garage.restore(data.garage);
  weapons.restore(data.weapons);
  if (typeof data.radio === 'number') sound.radioChannel = data.radio;
  // Spawn any wanted police around the player, not around the origin.
  police.anchor.x = player.position.x;
  police.anchor.z = player.position.z;
  if (typeof data.wanted === 'number') police.setWanted(data.wanted);
  player.rotation.y = state.yaw;
  state.camYaw = state.yaw;
}

// ---------------------------------------------------------------- HUD
const hud = $('hud');
const cashValue = $('cashValue');
const respectValue = $('respectValue');
const missionTitle = $('missionTitle');
const missionText = $('missionText');
const missionDist = $('missionDist');
const speedBox = $('speedBox');
const speedValue = $('speedValue');
const weaponBox = $('weaponBox');
const weaponValue = $('weaponValue');
const radioBox = $('radioBox');
const radioValue = $('radioValue');
const hintBox = $('hintBox');
const toastEl = $('toast');
const minimap = $('minimap');
const mapCtx = minimap.getContext('2d');
const wantedEl = $('wantedBox');
const crosshairEl = $('crosshair');
const wheelEl = $('weaponWheel');
let toastTimer = 0;
let lastCash = -1;
let lastMissionKey = '';
let lastHint = '';
let lastWanted = -1;
let lastWeaponKey = '';
let lastRadioKey = '';
let lastRespectKey = '';

function addRespect(n) {
  state.respect = Math.max(0, state.respect + n);
}

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
  if (police.wanted !== lastWanted) {
    lastWanted = police.wanted;
    let stars = '';
    for (let i = 0; i < 5; i++) {
      stars += i < police.wanted ? '★' : '<span class="off">★</span>';
    }
    wantedEl.innerHTML = stars;
  }
  const m = missions.current();
  const key = m ? `${m.id}:${missions.locked ? 'locked' : 'open'}:${missions.stage}` : 'done';
  if (key !== lastMissionKey) {
    lastMissionKey = key;
    if (m) {
      if (missions.locked) {
        missionTitle.textContent = `LOCKED — NEED ${m.respect} RESPECT`;
        missionText.textContent = `${m.title} is waiting: finish jobs, drop Interceptors and Air One to earn respect.`;
      } else {
        missionTitle.textContent = `MISSION ${missions.index + 1}/${MISSIONS.length} — ${m.title}`;
        missionText.textContent = m.text;
      }
    } else {
      missionTitle.textContent = 'FREE ROAM';
      missionText.textContent = 'Vice Point is yours. Earn cash, borrow cars, own the streets.';
    }
  }
  // The escape job has a null target by design — never read m.target for
  // it. Distance is measured to the beacon marker instead, which the
  // mission manager keeps valid for every job kind.
  if (m && m.kind === 'escape') {
    missionDist.textContent = 'Lose the cops — stay out of sight until the heat clears';
  } else if (m && m.kind === 'timed') {
    const px = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
    const pz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
    const d = Math.round(Math.hypot(px - missions.markerPos.x, pz - missions.markerPos.z));
    missionDist.textContent = `${Math.max(0, Math.ceil(missions.timeLeft))}s left — ${d} m to marker`;
  } else if (m && m.kind === 'chase') {
    const px = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
    const pz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
    const d = Math.round(Math.hypot(px - missions.markerPos.x, pz - missions.markerPos.z));
    missionDist.textContent = `Stay on the pink coupe — ${d} m`;
  } else if (m && m.kind === 'sabotage') {
    if (missions.holdTimer > 0) {
      missionDist.textContent = `Planting… ${missions.holdTimer.toFixed(1)}s / ${m.hold}s — hold still!`;
    } else {
      const px = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
      const pz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
      const d = Math.round(Math.hypot(px - missions.markerPos.x, pz - missions.markerPos.z));
      missionDist.textContent = `${d} m to the warehouse gate — hold still to plant`;
    }
  } else if (m && m.kind === 'heist') {
    const px = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
    const pz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
    const d = Math.round(Math.hypot(px - missions.markerPos.x, pz - missions.markerPos.z));
    missionDist.textContent = missions.stage === 0
      ? `Grab the cash — ${d} m to the bank`
      : `Run! ${d} m to the pier — lose the heat on the way`;
  } else if (m) {
    const px = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
    const pz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
    missionDist.textContent = `${Math.round(Math.hypot(px - missions.markerPos.x, pz - missions.markerPos.z))} m to marker`;
  } else {
    missionDist.textContent = '';
  }
  // Weapon + ammo, radio station, respect + garage stash.
  const w = weapons.current();
  const ammo = w.ammo === Infinity ? '∞' : weapons.ammoLeft();
  const wKey = `${w.id}:${ammo}`;
  if (wKey !== lastWeaponKey) {
    lastWeaponKey = wKey;
    weaponValue.textContent = `${w.name} · ${ammo}`;
  }
  if (!wheelEl.classList.contains('hidden')) {
    $('wheelPistol').classList.toggle('active', weapons.index === 0);
    $('wheelSmg').classList.toggle('active', weapons.index === 1);
  }
  const rKey = state.inCar ? `in:${sound.radioChannel}` : 'out';
  if (rKey !== lastRadioKey) {
    lastRadioKey = rKey;
    if (state.inCar) {
      radioBox.classList.remove('hidden');
      radioValue.textContent = `♪ ${RADIO_CHANNELS[sound.radioChannel].name}`;
    } else {
      radioBox.classList.add('hidden');
    }
  }
  const respectKey = `${state.respect}:${garage.stored.length}`;
  if (respectKey !== lastRespectKey) {
    lastRespectKey = respectKey;
    respectValue.textContent = `RESPECT ${state.respect} · GARAGE ${garage.stored.length}`;
  }
  if (state.inCar) {
    speedBox.classList.remove('hidden');
    speedValue.textContent = Math.round(Math.abs(cars[state.carIndex].speed) * 2.237);
  } else {
    speedBox.classList.add('hidden');
  }
  crosshairEl.classList.toggle('aim', state.aiming);
  let hint = 'WASD move · drag mouse to look · SHIFT run · SPACE jump · E enter car · F punch · Q weapons · R radio · M mute';
  if (state.inCar) hint = 'WASD drive · E exit car · Q weapons · R radio · G garage · M mute · ESC pause';
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
  // Police Interceptors: flashing blue dots while the heat is on.
  if (police.wanted > 0) {
    g.fillStyle = Math.floor(state.time * 4) % 2 === 0 ? '#2a6bff' : '#ff2a2a';
    for (const p of police.police) {
      g.beginPath();
      g.arc(toX(p.group.position.x), toY(p.group.position.z), 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Air One: a white ringed dot while the heli is overhead.
  if (heli.active && heli.position) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(toX(heli.position.x), toY(heli.position.z), 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ff2a2a';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(toX(heli.position.x), toY(heli.position.z), 8, 0, Math.PI * 2);
    g.stroke();
  }
  // The pink coupe Ray is tailing.
  if (missions.current() && missions.current().kind === 'chase') {
    g.fillStyle = '#ff5da2';
    g.beginPath();
    g.arc(toX(missions.chaseCar.position.x), toY(missions.chaseCar.position.z), 5, 0, Math.PI * 2);
    g.fill();
  }
  // The beach garage: a small yellow square.
  g.fillStyle = '#ffd166';
  g.fillRect(toX(garage.spot.x) - 4, toY(garage.spot.z) - 4, 8, 8);
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
  if (e.code === 'KeyF' && state.started && !state.paused) tryPunch();
  if (e.code === 'KeyM') {
    sound.setMuted(!sound.muted);
    showToast(sound.muted ? 'Sound muted' : 'Sound on');
  }
  if (e.code === 'Escape' && state.started) togglePause();
  if (e.code === 'KeyQ' && state.started && !state.paused) {
    state.wheelOpen = true;
    wheelEl.classList.remove('hidden');
  }
  if ((e.code === 'Digit1' || e.code === 'Digit2') && state.started && !state.paused) {
    const i = e.code === 'Digit1' ? 0 : 1;
    if (weapons.switchTo(i)) showToast(`Weapon: ${weapons.current().name}`);
  }
  if (e.code === 'KeyR' && state.started && !state.paused) {
    showToast(`Radio: ${sound.cycleRadio()}`);
  }
  if (e.code === 'KeyG' && state.started && !state.paused) tryGarage();
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  // Releasing Q picks the weapon under the mouse: left half pistol,
  // right half SMG; the wheel hides again.
  if (e.code === 'KeyQ' && state.wheelOpen) {
    state.wheelOpen = false;
    wheelEl.classList.add('hidden');
    const dx = (state.mouseX || window.innerWidth / 2) - window.innerWidth / 2;
    if (weapons.switchTo(dx < 0 ? 0 : 1)) showToast(`Weapon: ${weapons.current().name}`);
  }
});

let mouseHeld = false;
let downX = 0;
let downY = 0;
let downTime = 0;

renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastPX = e.clientX;
  lastPY = e.clientY;
  downX = e.clientX;
  downY = e.clientY;
  downTime = performance.now();
  if (e.button === 2) state.aiming = true;
  else if (e.button === 0) mouseHeld = true;
});
window.addEventListener('pointermove', (e) => {
  state.mouseX = e.clientX;
  state.mouseY = e.clientY;
  if (!dragging) return;
  state.camYaw -= (e.clientX - lastPX) * 0.005;
  // Aiming lets the pitch swing up so Ray can shoot at Air One.
  const minPitch = state.aiming ? -1.2 : 0.06;
  state.camPitch = Math.max(minPitch, Math.min(1.15, state.camPitch + (e.clientY - lastPY) * 0.004));
  lastPX = e.clientX;
  lastPY = e.clientY;
});
window.addEventListener('pointerup', (e) => {
  dragging = false;
  if (e.button === 2) state.aiming = false;
  if (e.button === 0) {
    mouseHeld = false;
    // A click (not a drag) fires the current weapon.
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (moved < 6 && performance.now() - downTime < 600) tryShoot();
  }
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- car enter/exit
function nearestCar(maxDist) {
  let best = null;
  let bestD = maxDist;
  cars.forEach((car, i) => {
    if (car.parked) return; // stored in the garage: not on the street
    const d = Math.hypot(car.group.position.x - player.position.x, car.group.position.z - player.position.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// Fire the current weapon along the camera's forward direction. The
// weapon manager lock-ons to the nearest target in the cone and reports
// the hit; this function owns what a hit means in the world.
function tryShoot() {
  if (!state.started || state.paused || shot) return;
  const origin = new THREE.Vector3();
  if (state.inCar) {
    const car = cars[state.carIndex];
    origin.set(car.group.position.x, 1.4, car.group.position.z);
  } else {
    origin.set(player.position.x, player.position.y + 1.4, player.position.z);
  }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const targets = {
    police: police.police.map((p) => ({ x: p.group.position.x, z: p.group.position.z })),
    peds: traffic.peds.filter((p) => p.down <= 0)
      .map((p) => ({ x: p.group.position.x, z: p.group.position.z })),
    heli: heli.active && heli.position
      ? { x: heli.position.x, y: heli.position.y, z: heli.position.z, active: true }
      : null,
  };
  const res = weapons.fire(origin, dir, targets);
  if (!res) return;
  if (res.dry) {
    showToast('SMG is dry — back to the pistol');
    return;
  }
  if (!res.hit) return;
  if (res.hit === 'police') {
    const outcome = police.damagePolice(res.index, res.damage);
    if (outcome === 'destroyed') {
      addRespect(3);
      showToast('Interceptor down! +3 respect');
    }
  } else if (res.hit === 'ped') {
    const ped = traffic.peds.filter((p) => p.down <= 0)[res.index];
    if (ped) {
      traffic.knockDown(ped);
      police.addWanted(1);
      showToast('You shot a pedestrian — the cops are coming');
    }
  } else if (res.hit === 'heli') {
    const outcome = heli.damage(res.damage);
    if (outcome === 'falling') showToast('Air One is going down!');
  }
}

// G at the beach garage: store the car Ray is driving, or take the last
// stored car back out. Anywhere else, G does nothing.
function tryGarage() {
  const px = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
  const pz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
  if (!garage.inZone(px, pz)) return;
  if (state.inCar) {
    const result = garage.store(state.carIndex);
    if (!result) return;
    showToast(result.msg);
    if (result.ok) {
      const car = cars[state.carIndex];
      player.position.set(car.group.position.x + 2.4, 0, car.group.position.z);
      state.yaw = car.yaw;
      player.rotation.y = state.yaw;
      state.inCar = false;
      state.carIndex = -1;
      player.visible = true;
      sound.stopEngine();
      sound.setRadioActive(false);
      saveGame();
    }
  } else {
    const car = garage.retrieve();
    if (car) {
      showToast('Car retrieved from the garage');
      saveGame();
    } else {
      showToast('Garage is empty');
    }
  }
}

function tryEnterExitCar() {
  if (!state.inCar) {
    const i = nearestCar(3.6);
    if (i === null) return;
    state.inCar = true;
    state.carIndex = i;
    player.visible = false;
    sound.startEngine();
    const done = missions.checkEnterCar(i);
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
  addRespect(10);
  sound.jingle();
  showToast(`Mission complete — ${m.title} · +$${m.reward} · +10 respect`);
  saveGame();
}

// Called whenever a mission becomes current: fresh start, loaded save,
// mission completion, or a failed escape job restarting.
function onMissionStart(m) {
  if (!m) return;
  // Respect gate: a locked job waits until Ray earns enough respect.
  if (!missions.beginCurrent(state.respect)) {
    showToast(`Need ${m.respect} respect to start ${m.title}`);
    return;
  }
  if (m.kind === 'escape' || m.kind === 'hotpickup') {
    // The Heat job and the hot pickup both start hot: two stars, two
    // Interceptors on Ray.
    police.anchor.x = player.position.x;
    police.anchor.z = player.position.z;
    police.setWanted(Math.max(police.wanted, 2));
    showToast(m.kind === 'escape' ? 'The cops are on you — lose them!' : 'The heat is on — pick him up!');
  }
}

// Combat: F throws a punch on foot. A pedestrian in front goes down and
// the wanted level goes up; whiffing at the air costs nothing.
function tryPunch() {
  if (!state.started || state.paused || state.inCar) return;
  if (state.punchCooldown > 0) return;
  state.punchCooldown = 0.5;
  state.punchTimer = 0.35;
  sound.punch();
  const fx = Math.sin(state.yaw);
  const fz = Math.cos(state.yaw);
  const ped = traffic.nearestPed(
    player.position.x + fx * 1.2,
    player.position.z + fz * 1.2,
    2.2,
  );
  if (ped) {
    traffic.knockDown(ped);
    police.addWanted(1);
    showToast('You decked a pedestrian — the cops are coming');
  }
}

// Busted: a $100 fine, the wanted level cleared, and Ray dropped back at
// a safe spot. A bust during the Heat job fails the job (no reward, no
// completion); during any other job the job itself is untouched.
function onBusted() {
  const failed = missions.failCurrent();
  state.cash = Math.max(0, state.cash - police.fine);
  addRespect(-15);
  police.clearWanted();
  sound.busted();
  sound.stopEngine();
  sound.setRadioActive(false);
  if (state.inCar) {
    state.inCar = false;
    state.carIndex = -1;
    player.visible = true;
  }
  player.position.set(city.spawnPoint.x, 0, city.spawnPoint.z);
  player.position.y = 0;
  state.vy = 0;
  state.grounded = true;
  state.yaw = city.spawnPoint.yaw;
  player.rotation.y = state.yaw;
  state.camYaw = state.yaw;
  showToast(failed ? 'BUSTED — mission failed · -$100 fine' : 'BUSTED — $100 fine');
  if (failed) onMissionStart(missions.current());
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
    state.cash = 250;
    state.respect = 0;
    police.clearWanted();
    missions.restore({ index: 0, done: [], stage: 0 });
    garage.reset();
    weapons.restore({ index: 0, ammo: [-1, 270] });
    sound.radioChannel = 0;
  }
  state.lastMissionIndex = missions.index;
  onMissionStart(missions.current());
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
    info.textContent = `Saved game: $${(save.cash | 0).toLocaleString('en-US')} · ${done}/${MISSIONS.length} missions done`;
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
    missions.restore({ index: 1, done: ['pickup'] });
    state.cash = 550;
  } else if (name === 'mission') {
    missions.restore({ index: 1, done: ['pickup'] });
    state.cash = 550;
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
    missions.restore({ index: 1, done: ['pickup'] });
    state.cash = 550;
  }
  // Screenshot scenes never start the Heat job: no police, no wanted
  // level, and the escape timer stays frozen for a stable frame.
  state.lastMissionIndex = missions.index;
}
if (shot) {
  try { sound.init(); } catch (_e) { /* headless: no gesture, audio stays suspended */ }
  applyShot(shot);
}

// ---------------------------------------------------------------- per-frame updates
function updatePlayer(dt, colliders) {
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
    const solved = resolveCircleCollision(nx, nz, 0.6, colliders);
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
  // Punch: the right arm snaps forward and back over 0.35 s.
  if (state.punchTimer > 0) {
    state.punchTimer -= dt;
    const p = 1 - Math.max(0, state.punchTimer) / 0.35;
    player.userData.arms[1].rotation.x = -Math.sin(p * Math.PI) * 1.5;
  }
  if (state.punchCooldown > 0) state.punchCooldown -= dt;
  state.moveSpeed = len > 0.01 ? speed : 0;
}

function updateCar(dt, colliders) {
  const car = cars[state.carIndex];
  const input = {
    forward: (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0),
    steer: (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0),
  };
  driveCar(car, input, dt, colliders);
  sound.setEngine(Math.abs(car.speed) / 27, input.forward !== 0 ? 1 : 0);
  state.moveSpeed = Math.abs(car.speed);
  // Camera eases behind the car.
  let diff = car.yaw - state.camYaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  state.camYaw += diff * Math.min(1, 2.2 * dt);
}

// Segment-vs-building test for the chase camera: how far along the ray
// from the target (tx,ty,tz) in unit direction (dx,dy,dz) can the camera
// go before it enters a building? Returns maxT when the way is clear.
function cameraClearDistance(tx, ty, tz, dx, dy, dz, maxT) {
  let nearest = maxT;
  for (const b of city.buildings) {
    const minX = b.x - b.w / 2;
    const maxX = b.x + b.w / 2;
    const minY = 0;
    const maxY = b.h;
    const minZ = b.z - b.d / 2;
    const maxZ = b.z + b.d / 2;
    let tmin = 0;
    let tmax = maxT;
    // Slab test, one axis at a time; a miss on any axis rules the box out.
    const axes = [
      [tx, dx, minX, maxX],
      [ty, dy, minY, maxY],
      [tz, dz, minZ, maxZ],
    ];
    let miss = false;
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { miss = true; break; }
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { miss = true; break; }
      }
    }
    if (!miss && tmin > 0 && tmin < nearest) nearest = tmin;
  }
  return nearest;
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
  if (state.aiming) {
    // Over-shoulder aim: the camera sits close and looks along the
    // view direction, so a negative pitch actually aims up at Air One.
    const v = new THREE.Vector3(
      Math.sin(state.camYaw) * cp,
      -sp,
      Math.cos(state.camYaw) * cp,
    );
    const eye = new THREE.Vector3(tx - v.x * 5, Math.max(1.0, ty - v.y * 5), tz - v.z * 5);
    camera.position.copy(eye);
    camera.lookAt(eye.x + v.x * 12, eye.y + v.y * 12, eye.z + v.z * 12);
    return;
  }
  // Direction from the target out to where the camera wants to be.
  const ox = -Math.sin(state.camYaw) * cp * dist;
  const oy = sp * dist + height * 0.4;
  const oz = -Math.cos(state.camYaw) * cp * dist;
  const len = Math.hypot(ox, oy, oz) || 1;
  // Pull the camera in just short of the first building the ray hits, so
  // it never ends up inside one. Never closer than 2 m, so it cannot sit
  // inside Ray's head either.
  const clear = cameraClearDistance(tx, ty, tz, ox / len, oy / len, oz / len, len);
  const use = Math.max(2, Math.min(len, clear * 0.95));
  camera.position.set(
    tx + (ox / len) * use,
    ty + (oy / len) * use,
    tz + (oz / len) * use,
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
  try {
    if (state.started && !state.paused) {
      // Roadblock barricades count as solid for driving and walking.
      const colliders = police.blockColliders.length > 0
        ? city.colliders.concat(police.blockColliders)
        : city.colliders;
      if (state.inCar) updateCar(dt, colliders);
      else updatePlayer(dt, colliders);
      const px = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
      const pz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
      // Mission progress (frozen in screenshot scenes for a stable frame).
      if (!shot) {
        const done = missions.checkReach(px, pz, state.inCar);
        if (done) onMissionComplete(done);
        else {
          const escaped = missions.updateEscape(dt, police.wanted);
          if (escaped) onMissionComplete(escaped);
        }
        // A new mission becoming current starts its own setup (Heat goes hot).
        if (missions.index !== state.lastMissionIndex) {
          state.lastMissionIndex = missions.index;
          onMissionStart(missions.current());
        }
        // Respect-gated jobs unlock the moment Ray earns enough respect.
        if (missions.locked && missions.tryUnlock(state.respect)) {
          showToast(`${missions.current().title} unlocked — respect ${state.respect}`);
          onMissionStart(missions.current());
        }
        // Timed, chase, sabotage and heist progress lives here.
        const prog = missions.updateMission(dt, { px, pz, inCar: state.inCar });
        if (prog) {
          if (prog.completed) onMissionComplete(prog.completed);
          else if (prog.failed) {
            showToast('Too slow — the drop failed. Try again!');
            missions.retryCurrent();
          }
        }
        // One-shot side effects: the heist grab brings the heat, the
        // sabotage trips an alarm.
        const ev = missions.takeStageEvent();
        if (ev) {
          if (ev.type === 'heist-grab') {
            police.anchor.x = px;
            police.anchor.z = pz;
            police.setWanted(4);
            showToast('Cash grabbed — Air One is inbound!');
          } else if (ev.type === 'sabotage-done') {
            police.addWanted(1);
          }
        }
      }
      missions.updateBeacon(cars.map((c) => ({ x: c.group.position.x, z: c.group.position.z })), px, pz);
      missions.update(state.time);
      traffic.update(dt, state.time, state.inCar
        ? { x: cars[state.carIndex].group.position.x, z: cars[state.carIndex].group.position.z }
        : null);
      // Air One: overhead from 4 stars, keeping the heat on.
      police.heliActive = heli.active;
      const heliDown = heli.update(dt, px, pz, police.wanted);
      if (heliDown === 'down') {
        addRespect(10);
        showToast('Air One is down! +10 respect');
      }
      // Holding the mouse down keeps an automatic weapon firing.
      if (mouseHeld) tryShoot();
      weapons.update(dt);
      // The radio only plays in the car.
      sound.setRadioActive(state.inCar);
      // Wanted: collisions with traffic and pedestrians, then the police.
      if (state.inCar) {
        const car = cars[state.carIndex];
        const cx = car.group.position.x;
        const cz = car.group.position.z;
        if (state.time - state.lastTrafficHit > 1.5) {
          for (const tcar of traffic.cars) {
            if (Math.hypot(tcar.group.position.x - cx, tcar.group.position.z - cz) < 3.6) {
              state.lastTrafficHit = state.time;
              police.addWanted(1);
              car.speed *= 0.4;
              tcar.speed = 0;
              tcar.wait = 1.5;
              sound.punch();
              showToast('You hit a car — wanted level up');
              break;
            }
          }
        }
        if (state.time - state.lastPedHit > 1.0) {
          const ped = traffic.nearestPed(cx, cz, 2.4);
          if (ped) {
            state.lastPedHit = state.time;
            traffic.knockDown(ped);
            police.addWanted(2);
            car.speed *= 0.6;
            showToast('You hit a pedestrian — wanted level up');
          }
        }
        if (state.time - state.lastPoliceHit > 2) {
          for (const p of police.police) {
            if (Math.hypot(p.group.position.x - cx, p.group.position.z - cz) < 3.6) {
              state.lastPoliceHit = state.time;
              police.addWanted(1);
              car.speed *= 0.5;
              showToast('You rammed a police car — wanted level up');
              break;
            }
          }
        }
      }
      police.anchor.x = px;
      police.anchor.z = pz;
      const bust = police.update(dt, {
        px,
        pz,
        playerSpeed: state.moveSpeed,
        inCar: state.inCar,
        playerCar: state.inCar ? cars[state.carIndex] : null,
        colliders,
        heading: state.inCar ? cars[state.carIndex].yaw : state.yaw,
      });
      if (bust === 'busted') onBusted();
      else if (state.prevWanted >= 2 && police.wanted === 0) {
        // The heat cooled off on its own: Ray laid low, and the
        // streets noticed.
        addRespect(2);
        showToast('You laid low — +2 respect');
      }
      state.prevWanted = police.wanted;
      state.saveTimer += dt;
      if (state.saveTimer > 20) {
        state.saveTimer = 0;
        saveGame();
      }
      updateHud();
      drawMinimap();
    }
  } finally {
    // The frame always ends: even if an update throws, the camera and the
    // render still run, so one bad frame never freezes the game.
    updateCamera(dt);
    renderer.render(scene, camera);
  }
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
  police,
  traffic,
  cars,
  player,
  scene,
  city,
  sound,
  weapons,
  heli,
  garage,
  THREE,
  teleport(x, z) {
    player.position.set(x, 0, z);
  },
  // Move the car Ray is driving (no-op on foot) — the playtest drives the
  // pickup drop-off this way; the reach check itself stays real.
  teleportCar(x, z) {
    if (!state.inCar) return;
    const car = cars[state.carIndex];
    car.group.position.set(x, 0, z);
    car.speed = 0;
  },
  setWanted(n) {
    police.anchor.x = player.position.x;
    police.anchor.z = player.position.z;
    police.setWanted(n);
  },
  // Put a police car right next to the player (busted / chase tests).
  setPolicePos(i, x, z) {
    const p = police.police[i];
    if (!p) return;
    p.group.position.set(x, 0, z);
    p.speed = 0;
  },
  // Restart a mission from its top (heat-fail retry test): restores the
  // mission state and runs the same start logic a real completion runs.
  debugStartMission(index, cash) {
    const done = [];
    for (let i = 0; i < index; i++) done.push(MISSIONS[i].id);
    missions.restore({ index, done, stage: 0 });
    if (typeof cash === 'number') state.cash = cash;
    state.lastMissionIndex = index;
    onMissionStart(missions.current());
  },
  punch() {
    tryPunch();
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
  // Aim the chase camera at a world point (shooting tests).
  aimAt(x, z) {
    const ox = state.inCar ? cars[state.carIndex].group.position.x : player.position.x;
    const oz = state.inCar ? cars[state.carIndex].group.position.z : player.position.z;
    state.camYaw = Math.atan2(x - ox, z - oz);
  },
  setAim(on) {
    state.aiming = on;
  },
  setPitch(v) {
    state.camPitch = v;
  },
  shoot() {
    tryShoot();
  },
  setRespect(n) {
    state.respect = n;
  },
};
