// Vice Point — game bootstrap and main loop, stage 2. Wires the procedural
// city, Ray on foot, the six-car fleet, street traffic, sidewalk crowds,
// the wanted system with its PD Interceptors, Mara Voss's three-job Act 1
// chain, close combat, the HUD with its live round minimap and the
// procedural sound bank. The frame is split in two: updateGame() does the
// simulation, endFrame() always renders — update runs inside try/finally
// so a bad frame can never swallow the render.
import * as THREE from 'three';
import { CITY_HALF, PLAYER_START, START_CASH, SAVE_KEY } from './config.js';
import { buildCity } from './city.js';
import { Walker } from './player.js';
import { CarFleet } from './cars.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Wanted } from './wanted.js';
import { Police, POLICE_STATION, BUSTED_FINE } from './police.js';
import { MissionChain } from './missions.js';
import { Combat } from './combat.js';

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
const traffic = new Traffic(scene);
const peds = new Pedestrians(scene);
const hud = new Hud();
const sounds = new SoundBank();
const combat = new Combat(sounds);
const police = new Police(scene);
const wanted = new Wanted((n) => hud.setWanted(n));
const missions = new MissionChain(scene, hud, sounds);

let cash = START_CASH;
let driving = null;
let started = false;
let paused = false;
let camYaw = PLAYER_START.yaw;
let camPitch = 0.32;
let camDist = 8;
let gameTime = 0;
let saveTimer = 0;
let lastCrashHeat = -10;
let bustedLock = false;
const keys = new Set();

// --- save / load -----------------------------------------------------------
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash,
      pos: { x: walker.pos.x, z: walker.pos.z },
      wanted: wanted.level,
      missionStage: missions.stage,
      missionPhase: missions.phase,
      drivingCar: driving ? driving.def.id : null,
      carPos: driving ? { x: driving.pos.x, z: driving.pos.z } : null,
    }));
    return true;
  } catch { return false; }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (typeof s.cash === 'number') cash = s.cash;
    if (s.pos) { walker.pos.set(s.pos.x, 0, s.pos.z); walker.group.position.copy(walker.pos); }
    if (typeof s.wanted === 'number') wanted.setLevel(s.wanted);
    if (typeof s.missionStage === 'number' && s.missionStage >= 0 && s.missionStage <= 4) {
      missions.stage = s.missionStage;
      if (typeof s.missionPhase === 'string') missions.phase = s.missionPhase;
      missions._syncHud();
    }
    if (s.drivingCar) {
      const car = fleet.list.find((c) => c.def.id === s.drivingCar);
      if (car) {
        if (s.carPos) car.pos.set(s.carPos.x, 0, s.carPos.z);
        car.occupied = true;
        driving = car;
        walker.group.visible = false;
      }
    }
    document.getElementById('saveNote').textContent = 'Save found — welcome back, Ray.';
    return true;
  } catch { return false; }
}
loadSave();
hud.setCash(cash);
hud.setWanted(wanted.level);
hud.setObjective(missions.targetLabel);
hud.setHint('WASD walk · Shift run · E enter car · F punch · find Mara at Pier 9');

// --- missions wiring -------------------------------------------------------
missions.onReward = (amount) => { cash += amount; hud.setCash(cash); saveGame(); };
missions.onHeat = (stars) => { wanted.setLevel(stars); };

// --- input -----------------------------------------------------------------
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
document.getElementById('dialog').addEventListener('click', () => hud.advanceDialog());
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (!started) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { togglePause(); return; }
  if (paused) return;
  if (e.code === 'KeyE') {
    if (hud.dialogShown) { hud.advanceDialog(); return; }
    toggleCar();
  }
  if (e.code === 'KeyF' && !e.repeat) punch();
  if (e.code === 'KeyM') { sounds.muted = !sounds.muted; if (sounds.muted) sounds.sirenStop(); }
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

function togglePause() {
  paused = !paused;
  const el = document.getElementById('pause');
  el.style.display = paused ? 'flex' : 'none';
  if (!paused) hud.setHint(driving ? 'W/S drive · A/D steer · Space handbrake · E get out' : 'WASD walk · Shift run · E enter car · F punch');
}

// --- cars ------------------------------------------------------------------
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
    hud.setHint('WASD walk · Shift run · E enter car · F punch');
    return;
  }
  const car = fleet.nearest(walker.pos);
  if (!car) { hud.setHint('No car close enough — walk up to one and press E'); return; }
  // Stealing in plain sight is a crime; nobody around, nobody knows.
  const seenByCop = police.nearestDistTo(walker.pos) < 80;
  const seenByPed = !!peds.nearest(walker.pos, 18);
  car.occupied = true;
  driving = car;
  walker.group.visible = false;
  sounds.blip(520, 0.09);
  setTimeout(() => sounds.blip(780, 0.09), 90);
  if (seenByCop || seenByPed) {
    wanted.commit(1);
    hud.setHint('Someone saw you steal that ' + car.def.name + '!');
  } else {
    hud.setHint(car.def.name + ' — W/S drive · A/D steer · Space handbrake · E get out');
  }
}

// --- combat ----------------------------------------------------------------
function punch() {
  if (driving) return;
  const res = combat.punch(walker.pos, walker.yaw, peds, police, (n) => wanted.commit(n));
  if (res === 'ped') hud.setHint('You decked a pedestrian — the law noticed');
  else if (res === 'police') hud.setHint('You swung at a cop!');
}

// --- busted ----------------------------------------------------------------
function doBusted(kind) {
  if (bustedLock) return;
  bustedLock = true;
  const wasEscape = missions.bustedDuringEscape();
  const fine = Math.min(cash, BUSTED_FINE);
  cash -= fine;
  hud.setCash(cash);
  wanted.setLevel(0);
  sounds.sirenStop();
  sounds.busted();
  police.clearAll();
  if (driving) { driving.occupied = false; driving = null; }
  walker.group.visible = true;
  walker.pos.set(POLICE_STATION.x, 0, POLICE_STATION.z);
  walker.group.position.copy(walker.pos);
  sounds.setEngine(false, 0);
  missions.onBusted();
  hud.setHint('BUSTED' + (kind === 'pinned' ? ' — the cops boxed your car in' : ' — the cops grabbed you')
    + ' · $' + fine + ' fine · dropped at the Old Town station'
    + (wasEscape ? ' · Mara’s escape job FAILED — lose the heat again' : ''));
  missions._syncHud();
  saveGame();
  setTimeout(() => { bustedLock = false; }, 500);
}

// --- camera ----------------------------------------------------------------
function insideBuilding(x, z, pad = 1.2) {
  for (const c of colliders) {
    if (x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return true;
  }
  return false;
}

function placeCamera(target) {
  // Chase camera: pull in step by step until the line of sight is clear of
  // buildings — check both the camera spot and the midpoint of the sight
  // line, so the view never clips through a tower from any angle.
  let dist = camDist;
  const want = new THREE.Vector3();
  for (let tries = 0; tries < 16; tries++) {
    want.set(
      target.x - Math.sin(camYaw) * Math.cos(camPitch) * dist,
      target.y + 2.2 + Math.sin(camPitch) * dist,
      target.z - Math.cos(camYaw) * Math.cos(camPitch) * dist,
    );
    const midX = (target.x + want.x) / 2;
    const midZ = (target.z + want.z) / 2;
    if (!insideBuilding(want.x, want.z, 0.8) && !insideBuilding(midX, midZ, 0.8) && want.y > 1.2) break;
    dist *= 0.72;
    if (dist < 1.8) break;
  }
  camera.position.lerp(want, 0.35);
  camera.lookAt(target.x, target.y + 1.6, target.z);
}

// --- per-frame simulation --------------------------------------------------
function updateGame(dt) {
  gameTime += dt;
  combat.update(dt);
  let speedKmh = 0;
  const focus = driving ? driving.pos : walker.pos;

  if (driving) {
    speedKmh = fleet.drive(driving, dt, keys, colliders, sounds);
    camYaw += (driving.heading + Math.PI - camYaw) * 0.02;
  } else {
    walker.update(dt, keys, camYaw, colliders, sounds);
    if (combat.swing > 0) walker.armR.rotation.x = combat.armAngle();
    sounds.setEngine(false, 0);
  }

  traffic.update(dt, colliders, driving, walker.pos, !driving, (rel) => {
    sounds.crash(rel / 10);
    if (rel > 8 && gameTime - lastCrashHeat > 2) {
      lastCrashHeat = gameTime;
      wanted.commit(1);
      hud.setHint('You smashed into traffic — the cops noticed');
    }
  });
  peds.update(dt, colliders, traffic.list, driving, walker.pos, !driving, (speed) => {
    sounds.crash(1);
    if (gameTime - lastCrashHeat > 2) {
      lastCrashHeat = gameTime;
      wanted.commit(1);
      hud.setHint('You ran someone over!');
    }
  });
  // Fast police cruisers scatter the sidewalk crowds.
  for (const u of police.units) {
    if (u.speed > 8) peds.scareFrom(u.pos.x, u.pos.z, 10);
  }

  const hidden = police.nearestDistTo(focus) > 50;
  wanted.update(dt, hidden);

  police.onRam = (closing) => sounds.crash(closing / 10);
  const playerSpeed = driving ? Math.abs(driving.speed) : walker.speed;
  police.update(dt, wanted.level, focus, driving, !driving, playerSpeed, colliders, (kind) => doBusted(kind));
  if (police.active > 0) sounds.sirenStart();
  else sounds.sirenStop();

  missions.update(dt, {
    playerPos: focus,
    driving: !!driving,
    car: driving,
    fleet,
    wanted: wanted.level,
  });
  // Mara rides with Ray once she is picked up.
  missions.mara.visible = !(missions.stage >= 2 || (missions.stage === 1 && missions.phase === 'drive'));

  placeCamera(focus);
  const gt = missions.getawayCar(fleet);
  const mapObj = missions.target
    || (missions.stage === 3 && missions.phase === 'steal' && gt ? { x: gt.pos.x, z: gt.pos.z } : null);
  hud.drawMinimap(focus, driving ? driving.heading : camYaw, fleet.list, mapObj, {
    traffic: traffic.list,
    police: police.units,
    peds: peds.list,
  });
  hud.setSpeed(speedKmh, !!driving);

  saveTimer += dt;
  if (saveTimer > 5) { saveTimer = 0; saveGame(); }
}

function endFrame() {
  renderer.render(scene, camera);
}

let last = performance.now();
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
  if (paused) { endFrame(); return; }
  try {
    updateGame(dt);
  } finally {
    endFrame(); // the render always runs, even if a frame's update throws
  }
}

window.__vp = {
  walker, fleet, traffic, peds, wanted, police, missions, combat,
  get driving() { return driving; },
  get cash() { return cash; },
  get paused() { return paused; },
  get gameTime() { return gameTime; },
  saveGame,
  state() {
    return {
      cash, wanted: wanted.level, stage: missions.stage, phase: missions.phase,
      x: +(driving ? driving.pos.x : walker.pos.x).toFixed(1),
      z: +(driving ? driving.pos.z : walker.pos.z).toFixed(1),
      driving: driving ? driving.def.id : null,
      police: police.active, traffic: traffic.list.length, peds: peds.list.length,
      maraVisible: missions.mara.visible,
    };
  },
  debug: {
    teleport(x, z) {
      if (driving) { driving.pos.x = x; driving.pos.z = z; driving.mesh.position.copy(driving.pos); }
      walker.pos.set(x, 0, z);
      walker.group.position.copy(walker.pos);
    },
    setWanted(n) { wanted.setLevel(n); },
    setCash(n) { cash = n; hud.setCash(n); },
    setMission(stage, phase) { missions.stage = stage; missions.phase = phase; missions._syncHud(); },
    advanceDialog() { hud.advanceDialog(); },
  },
};
requestAnimationFrame(tick);
console.log('[vice-point] r8 stage2 ready: buildings=' + buildingCount + ' palms=' + palmCount
  + ' cars=' + fleet.list.length + ' traffic=' + traffic.list.length + ' peds=' + peds.list.length);
