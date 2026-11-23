// Vice Point — game bootstrap and main loop, round 8 stage 3 final.
// Wires the procedural city, Ray on foot, the six-car fleet, street
// traffic, sidewalk crowds, the wanted system with its PD Interceptors,
// the Air One helicopter and the stage-3 roadblock, Mara Voss's eight-job
// three-act chain, close combat, the HUD with its live round minimap and
// the procedural sound bank — plus the stage-4 systems: the three-person
// crew with real gameplay perks, district standing and respect, twelve
// hidden caches, the Docks export dock, three street races, the pistol/SMG
// weapon wheel, two procedural radio stations and the Old Town garage. The
// frame is split in two: updateGame() does the simulation, endFrame()
// always renders — update runs inside try/finally so a bad frame can never
// swallow the render. Stage 3 adds deterministic screenshot staging
// (?shot=chase|mission|drive|street, seed 8) via shots.js: each mode stages
// a live scene and locks the camera for it.
import * as THREE from 'three';
import { CITY_HALF, PLAYER_START, START_CASH, SAVE_KEY, CARS } from './config.js';
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
import { Crew } from './crew.js';
import { Standing, Respect } from './standing.js';
import { Caches } from './collectibles.js';
import { ExportPoint, EXPORT_SPOT } from './export.js';
import { Races } from './races.js';
import { Arsenal } from './weapons.js';
import { Radio } from './radio.js';
import { Garage, GARAGE_SPOT, REPAINT_COST, REPAIR_COST, PAINTS } from './garage.js';
import { applyShot, isShotName, SHOT_SEED } from './shots.js';

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
// Remember where every car started: exports and the garage send cars home.
for (const car of fleet.list) car.home = { x: car.pos.x, z: car.pos.z, heading: car.heading };
const traffic = new Traffic(scene);
const peds = new Pedestrians(scene);
const hud = new Hud();
const sounds = new SoundBank();
const combat = new Combat(sounds);
const police = new Police(scene);
const wanted = new Wanted((n) => hud.setWanted(n));
const missions = new MissionChain(scene, hud, sounds);
const crew = new Crew();
const standing = new Standing();
const respect = new Respect();
const caches = new Caches(scene);
const exportPoint = new ExportPoint(scene);
const races = new Races(scene, hud);
const arsenal = new Arsenal(scene, sounds);
const radio = new Radio(sounds);
const garage = new Garage();

let cash = START_CASH;
let driving = null;
let started = false;
let paused = false;
let garageOpen = false;
let camYaw = PLAYER_START.yaw;
let camPitch = 0.32;
let camDist = 8;
let gameTime = 0;
let saveTimer = 0;
let lastCrashHeat = -10;
let bustedLock = false;
let shotName = null;    // ?shot= mode, or null for normal play
let shotCamLock = false; // staging holds the camera angle fixed
let snapCamera = false;  // next placeCamera() jumps instead of lerping
const keys = new Set();
// Car integrity 0..100 per car id. Crashes chip it; under 30 the car loses
// its top fifth of speed. Bima halves every hit and patches it for free.
const carHp = new Map();
for (const car of fleet.list) carHp.set(car.def.id, 100);

// --- screenshot staging (?shot=) -------------------------------------------
// Deterministic staging lives in shots.js; main.js only hands it the live
// objects and the few setters that touch module-private state.
function hideStart() {
  document.getElementById('start').style.display = 'none';
  started = true;
}
function setShot(name) { shotName = name; }
function setCamera(yaw, pitch, dist, lock) {
  camYaw = yaw;
  camPitch = pitch;
  camDist = dist;
  shotCamLock = !!lock;
  snapCamera = true;
}
function putInCar(id, x, z, heading, speed) {
  const car = fleet.list.find((c) => c.def.id === id);
  if (!car) return false;
  if (driving && driving !== car) driving.occupied = false;
  car.pos.set(x, 0, z);
  car.heading = heading;
  car.speed = speed || 0;
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = heading;
  car.occupied = true;
  driving = car;
  walker.group.visible = false;
  return true;
}
function putOnFoot(x, z) {
  if (driving) { driving.occupied = false; driving = null; }
  walker.group.visible = true;
  walker.pos.set(x, 0, z);
  walker.group.position.copy(walker.pos);
  sounds.setEngine(false, 0);
}
function buildShotCtx() {
  return {
    walker, fleet, traffic, peds, wanted, police, missions, crew, hud,
    hideStart, setShot, setCamera, putInCar, putOnFoot,
    setCash(n) { cash = n; hud.setCash(n); },
  };
}

// --- car damage ------------------------------------------------------------
function damageCar(base) {
  if (!driving) return;
  const mult = crew.damageMult();
  const hp = Math.max(0, (carHp.get(driving.def.id) ?? 100) - base * mult);
  carHp.set(driving.def.id, hp);
  if (hp <= 0) hud.setHint('Your car is wrecked — get to the garage (G) or call Bima (B)');
}
function repairCar(free) {
  if (!driving) { hud.setHint('Get in a car first — nothing to repair on foot'); return false; }
  if (!free) return false;
  carHp.set(driving.def.id, 100);
  crew.repairs++;
  sounds.blip(880, 0.12);
  hud.setHint('Bima patched the car up — good as new');
  return true;
}

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
      crew: crew.serialize(),
      standing: standing.serialize(),
      respect: respect.serialize(),
      caches: caches.serialize(),
      garage: garage.serialize(),
      arsenal: arsenal.serialize(),
      radio: radio.serialize(),
      races: races.serialize(),
      exportStats: exportPoint.serialize(),
      carHp: Object.fromEntries(carHp),
    }));
    return true;
  } catch { return false; }
}
function applyPaint(car, idx) {
  const colour = PAINTS[idx];
  if (colour === undefined) return;
  car.mesh.traverse((m) => {
    if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === car.def.color) {
      m.material = m.material.clone();
      m.material.color.setHex(colour);
    }
  });
  car.def = { ...car.def, color: colour };
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (typeof s.cash === 'number') cash = s.cash;
    if (s.pos) { walker.pos.set(s.pos.x, 0, s.pos.z); walker.group.position.copy(walker.pos); }
    if (typeof s.wanted === 'number') wanted.setLevel(s.wanted);
    if (typeof s.missionStage === 'number' && s.missionStage >= 0 && s.missionStage <= 9) {
      missions.stage = s.missionStage;
      if (typeof s.missionPhase === 'string') missions.phase = s.missionPhase;
      missions._placeMara();
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
    crew.restore(s.crew);
    standing.restore(s.standing);
    respect.restore(s.respect);
    caches.restore(s.caches);
    garage.restore(s.garage);
    arsenal.restore(s.arsenal);
    radio.restore(s.radio);
    races.restore(s.races);
    exportPoint.restore(s.exportStats);
    if (s.carHp) for (const [id, hp] of Object.entries(s.carHp)) carHp.set(id, hp);
    // Repaints bought last session live on the fleet again.
    for (const car of fleet.list) {
      const idx = garage.paintIdx[car.def.id];
      if (typeof idx === 'number') applyPaint(car, idx);
    }
    document.getElementById('saveNote').textContent = 'Save found — welcome back, Ray.';
    return true;
  } catch { return false; }
}
loadSave();
hud.setCash(cash);
hud.setWanted(wanted.level);
hud.setObjective(missions.targetLabel);
hud.setCrew(crew.label());
hud.setRespect(respect.label());
hud.setCaches(caches.count, caches.total);
hud.setWeapon(arsenal.label());
hud.setRadio(radio.current.name);
hud.setStanding(standing.summary());
hud.setHint('WASD walk · Shift run · E enter car · F punch · find Mara at Pier 9');

// Screenshot staging runs after the save load so it always wins: a staged
// frame is a fixed scene, never a leftover save. The seed must match
// SHOT_SEED exactly, or the param is ignored and the game opens normally.
{
  const params = new URLSearchParams(location.search);
  const shotParam = params.get('shot');
  const seedParam = Number(params.get('seed'));
  if (shotParam && isShotName(shotParam) && (Number.isNaN(seedParam) || seedParam === SHOT_SEED)) {
    applyShot(shotParam, buildShotCtx());
  }
}

// --- missions wiring -------------------------------------------------------
missions.onReward = (amount) => { cash += amount; hud.setCash(cash); saveGame(); };
missions.onHeat = (stars) => { wanted.setLevel(stars); };
missions.onMissionComplete = (no, districts) => {
  for (const d of districts || []) standing.gain(d, 1);
  respect.add(no === 8 ? 12 : 8);
  hud.setRespect(respect.label());
  hud.setStanding(standing.summary());
  hud.setHint(`Job ${no} done — standing up in ${(districts || []).join(', ')} · respect ${respect.score}`);
};
missions.onRecruit = (id) => {
  crew.recruit(id);
  hud.setCrew(crew.label());
  sounds.blip(990, 0.15);
};

// --- caches / races / export wiring ----------------------------------------
caches.onCollect = (index, districtId, amount) => {
  cash += amount;
  hud.setCash(cash);
  standing.gain(districtId, 1);
  respect.add(1);
  hud.setCaches(caches.count, caches.total);
  hud.setRespect(respect.label());
  hud.setStanding(standing.summary());
  hud.setHint(`Cache ${caches.count}/${caches.total} cracked — +$${amount} · ${districtId} standing up`);
  sounds.blip(1170, 0.15);
  saveGame();
};
races.onWin = (race, time, finishDistrict) => {
  cash += race.reward;
  hud.setCash(cash);
  standing.gain(finishDistrict, 1);
  respect.add(6);
  hud.setRespect(respect.label());
  hud.setStanding(standing.summary());
  hud.setHint(`${race.name} WON in ${time.toFixed(1)}s — +$${race.reward} · respect up`);
  sounds.blip(990, 0.2);
  setTimeout(() => sounds.blip(1320, 0.25), 140);
  saveGame();
};

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
document.getElementById('g-close').addEventListener('click', () => closeGarage());
document.getElementById('g-buy').addEventListener('click', () => garageBuy());
document.getElementById('g-paint').addEventListener('click', () => garagePaint());
document.getElementById('g-repair').addEventListener('click', () => garageRepair());
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
  if (e.code === 'KeyX' && !e.repeat) shoot();
  if (e.code === 'KeyQ' && !e.repeat) {
    hud.showWheel(arsenal.toggleWheel(), arsenal.current);
    hud.setWeapon(arsenal.label());
  }
  if (e.code === 'Digit1' && !e.repeat) { arsenal.select('pistol'); hud.showWheel(arsenal.wheelOpen, arsenal.current); hud.setWeapon(arsenal.label()); }
  if (e.code === 'Digit2' && !e.repeat) { arsenal.select('smg'); hud.showWheel(arsenal.wheelOpen, arsenal.current); hud.setWeapon(arsenal.label()); }
  if (e.code === 'KeyR' && !e.repeat) {
    const st = radio.nextStation();
    hud.setRadio(st.name);
    hud.setHint('Radio: ' + st.name);
  }
  if (e.code === 'KeyC' && !e.repeat) {
    const def = crew.cycle();
    hud.setCrew(crew.label());
    hud.setHint(def ? `${def.name} rides with you — ${def.perk}` : 'Nobody riding shotgun right now');
  }
  if (e.code === 'KeyK' && !e.repeat) {
    if (crew.useJam(missions.stage)) {
      police.clearAll();
      sounds.sirenStop();
      hud.setHint("Kiko blacked out the PD — 20 seconds, go dark and go fast");
    } else if (crew.active === 'kiko') {
      hud.setHint('Kiko already spent her jam on this job');
    } else {
      hud.setHint('Kiko the hacker is not riding with you (C to pick crew)');
    }
  }
  if (e.code === 'KeyB' && !e.repeat) {
    if (crew.bimaActive) repairCar(true);
    else hud.setHint("Bima the mechanic isn't riding — no field repair (C to pick crew)");
  }
  if (e.code === 'KeyG' && !e.repeat) {
    if (garageOpen) closeGarage();
    else if (nearGarage()) openGarage();
    else hud.setHint('The garage is in Old Town — look for the lock-up at (-150, 110)');
  }
  if (e.code === 'KeyV' && !e.repeat) tryExport();
  if (e.code === 'KeyY' && !e.repeat) {
    const focus = driving ? driving.pos : walker.pos;
    const i = races.nearStart(focus);
    if (i >= 0 && races.start(i)) hud.setHint(`${races.current.name} — go! Beat ${races.current.target}s`);
    else if (races.racing) hud.setHint('Already racing — finish it!');
    else hud.setHint('No race start here — find a start pad (Strip, Beach, Airport)');
  }
  if (e.code === 'KeyT' && !e.repeat) {
    hud.setStanding(standing.summary());
    hud.toggleStanding();
  }
  if (e.code === 'KeyM') { sounds.muted = !sounds.muted; if (sounds.muted) sounds.sirenStop(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
function lockPointer() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* pointer lock unavailable (headless): mouse look stays off */ }
}
canvas.addEventListener('click', () => {
  if (started) {
    lockPointer();
    if (!paused && !driving) shoot();
  }
});
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

// --- garage ----------------------------------------------------------------
function nearGarage() {
  const focus = driving ? driving.pos : walker.pos;
  return Math.hypot(focus.x - GARAGE_SPOT.x, focus.z - GARAGE_SPOT.z) < 14;
}
function garageCar() {
  if (driving) return driving;
  return fleet.nearest(walker.pos, 7);
}
function garageInfoText() {
  const car = garageCar();
  const discount = standing.garageDiscount();
  const lines = [
    `Old Town standing ${standing.level('oldtown')}/5${discount > 0 ? ' — 20% discount active!' : ''}`,
    `Owned: ${garage.owned.size ? [...garage.owned].join(', ') : 'none yet'}`,
  ];
  if (car) {
    const hp = carHp.get(car.def.id) ?? 100;
    lines.push(`Here now: ${car.def.name} — ${garage.isOwned(car.def.id) ? 'YOURS' : 'for sale $' + garage.priceFor(car.def.id, discount)} · integrity ${Math.round(hp)}%`);
  } else {
    lines.push('No car here — drive one in or walk up to one nearby.');
  }
  lines.push('Repaint $50 · Repair $30');
  return lines.join('\n');
}
function openGarage() {
  garageOpen = true;
  // The mouse is pointer-locked to the canvas while driving, and a locked
  // pointer routes every click to the canvas — the panel's buttons would
  // be unclickable. Release the lock while the garage is open.
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showGarage(true, garageInfoText());
}
function closeGarage() {
  garageOpen = false;
  hud.showGarage(false);
  lockPointer(); // back to driving; the close click is a user gesture
}
function garageBuy() {
  const car = garageCar();
  if (!car) { hud.showGarage(true, garageInfoText() + '\nNo car here to buy.'); return; }
  const res = garage.buy(car.def.id, cash, standing.garageDiscount());
  if (!res.ok) {
    hud.showGarage(true, garageInfoText() + `\nCan't buy: ${res.reason}${res.price ? ' — $' + res.price : ''}.`);
    return;
  }
  cash -= res.price;
  hud.setCash(cash);
  car.pos.set(GARAGE_SPOT.x, 0, GARAGE_SPOT.z);
  car.mesh.position.copy(car.pos);
  hud.showGarage(true, garageInfoText() + `\n${car.def.name} is yours now — $${res.price}. Parked in the garage.`);
  saveGame();
}
function garagePaint() {
  const car = garageCar();
  if (!car) { hud.showGarage(true, garageInfoText() + '\nNo car here to repaint.'); return; }
  if (cash < REPAINT_COST) { hud.showGarage(true, garageInfoText() + '\nNot enough cash for a repaint ($50).'); return; }
  cash -= REPAINT_COST;
  hud.setCash(cash);
  garage.repaint(car);
  hud.showGarage(true, garageInfoText() + '\nFresh paint — looking sharp.');
  saveGame();
}
function garageRepair() {
  const car = garageCar();
  if (!car) { hud.showGarage(true, garageInfoText() + '\nNo car here to repair.'); return; }
  if (cash < REPAIR_COST) { hud.showGarage(true, garageInfoText() + '\nNot enough cash for a repair ($30).'); return; }
  cash -= REPAIR_COST;
  hud.setCash(cash);
  carHp.set(car.def.id, 100);
  garage.repairsPaid++;
  hud.showGarage(true, garageInfoText() + '\nPatched up — integrity 100%.');
  saveGame();
}

// --- export ----------------------------------------------------------------
function tryExport() {
  if (!driving) { hud.setHint('Drive a stolen car to the Docks export crane, then press V'); return; }
  if (!exportPoint.near(driving.pos)) {
    hud.setHint('Export dock is at the far Docks (-268, -252) — drive the car there');
    return;
  }
  const car = driving;
  const price = exportPoint.sell(car.def.id);
  cash += price;
  hud.setCash(cash);
  standing.gain('docks', 1);
  respect.add(3);
  hud.setRespect(respect.label());
  hud.setStanding(standing.summary());
  // The car ships out and comes home to its parking spot.
  car.occupied = false;
  car.pos.set(car.home.x, 0, car.home.z);
  car.heading = car.home.heading;
  car.speed = 0;
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = car.heading;
  driving = null;
  walker.group.visible = true;
  walker.pos.set(EXPORT_SPOT.x + 6, 0, EXPORT_SPOT.z + 4);
  walker.group.position.copy(walker.pos);
  sounds.setEngine(false, 0);
  sounds.blip(990, 0.2);
  hud.setHint(`${car.def.name} exported — +$${price} · Docks standing up · total exports ${exportPoint.exports}`);
  saveGame();
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

function shoot() {
  if (driving) { hud.setHint("Can't shoot while driving — get out first"); return; }
  const res = arsenal.shoot(walker.pos, walker.yaw, peds, police);
  hud.setWeapon(arsenal.label());
  if (res === 'ped') {
    wanted.commit(1);
    hud.setHint('You shot a pedestrian — the law noticed');
  } else if (res === 'police') {
    wanted.commit(1);
    hud.setHint('You dropped a cop — every cruiser in the city heard that');
  } else if (res === 'empty') {
    hud.setHint('Out of ammo — the SMG is dry');
  } else if (res === 'reloading') {
    hud.setHint('Reloading…');
  }
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
  if (races.racing) { races._stop(); hud.setRace(''); }
  if (driving) { driving.occupied = false; driving = null; }
  walker.group.visible = true;
  walker.pos.set(POLICE_STATION.x, 0, POLICE_STATION.z);
  walker.group.position.copy(walker.pos);
  sounds.setEngine(false, 0);
  missions.onBusted();
  hud.setHint('BUSTED' + (kind === 'pinned' ? ' — the cops boxed your car in' : ' — the cops grabbed you')
    + ' · $' + fine + ' fine · dropped at the Old Town station'
    + (wasEscape ? ' · Mara’s escape job FAILED — back to the start of the job' : ''));
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
  if (snapCamera) {
    camera.position.copy(want);
    snapCamera = false;
  } else {
    camera.position.lerp(want, 0.35);
  }
  camera.lookAt(target.x, target.y + 1.6, target.z);
}

// --- per-frame simulation --------------------------------------------------
function updateGame(dt) {
  gameTime += dt;
  combat.update(dt);
  crew.update(dt);
  radio.update(dt);
  arsenal.update(dt);
  // Screenshot staging drives itself: hold W so the staged CAR keeps
  // moving toward the lens without any input device. On-foot staging
  // (street) does NOT hold W — Ray would walk away from his staged crowd
  // and end up in an empty plaza before the shutter fires.
  if (shotName === 'chase' || shotName === 'drive') keys.add('KeyW');
  let speedKmh = 0;
  const focus = driving ? driving.pos : walker.pos;

  if (driving) {
    speedKmh = fleet.drive(driving, dt, keys, colliders, sounds);
    // A wrecked car loses its top fifth of speed.
    const hp = carHp.get(driving.def.id) ?? 100;
    if (hp < 30) {
      driving.speed = Math.max(-driving.def.top * 0.45, Math.min(driving.def.top * 0.8, driving.speed));
    }
    // The driving camera eases behind the car — unless staging locked it.
    if (!shotCamLock) camYaw += (driving.heading + Math.PI - camYaw) * 0.02;
  } else {
    walker.update(dt, keys, camYaw, colliders, sounds);
    if (combat.swing > 0) walker.armR.rotation.x = combat.armAngle();
    sounds.setEngine(false, 0);
  }

  traffic.update(dt, colliders, driving, walker.pos, !driving, (rel) => {
    sounds.crash(rel / 10);
    damageCar(8);
    if (rel > 8 && gameTime - lastCrashHeat > 2) {
      lastCrashHeat = gameTime;
      wanted.commit(1);
      hud.setHint('You smashed into traffic — the cops noticed');
    }
  });
  peds.update(dt, colliders, traffic.list, driving, walker.pos, !driving, (speed) => {
    sounds.crash(1);
    damageCar(8);
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
  // Dara rides along: the heat bleeds off on double time.
  wanted.update(dt * crew.wantedDtMult(), hidden);

  if (crew.jamming) {
    // Kiko's blackout: no cruisers spawn, none chase, no siren.
    sounds.sirenStop();
  } else {
    police.onRam = (closing) => { sounds.crash(closing / 10); damageCar(6); };
    const playerSpeed = driving ? Math.abs(driving.speed) : walker.speed;
    const playerHeading = driving ? driving.heading : walker.yaw;
    police.update(dt, wanted.level, focus, driving, !driving, playerSpeed, colliders, (kind) => doBusted(kind), playerHeading);
    if (police.active > 0) sounds.sirenStart();
    else sounds.sirenStop();
  }

  missions.update(dt, {
    playerPos: focus,
    driving: !!driving,
    car: driving,
    fleet,
    wanted: wanted.level,
  });
  // Mara waits at the current job's opening spot, and nowhere else.
  {
    const spot = missions.maraSpot;
    missions.mara.visible = !!spot;
    if (spot) missions.mara.position.set(spot.x, 0, spot.z);
  }

  caches.update(dt, focus);
  if (races.racing) {
    const res = races.update(dt, focus, !!driving);
    if (res === 'win') hud.setHint('Race won!');
    else if (res === 'lose') hud.setHint('Race lost — the rival took it. Y to run it again.');
  }

  placeCamera(focus);
  const gt = missions.stealCar(fleet);
  let mapObj = missions.target;
  if (!mapObj && races.racing) {
    const race = races.current;
    mapObj = race ? race.checkpoints[races.checkpoint] : null;
  }
  if (!mapObj && gt && missions.target === null) mapObj = { x: gt.pos.x, z: gt.pos.z };
  const nearCache = caches.nearestUnfound(focus, 45);
  const raceCp = races.racing && races.current ? races.current.checkpoints[races.checkpoint] : null;
  hud.drawMinimap(focus, driving ? driving.heading : camYaw, fleet.list, mapObj, {
    traffic: traffic.list,
    police: police.units,
    peds: peds.list,
    cache: nearCache ? { x: nearCache.group.position.x, z: nearCache.group.position.z } : null,
    race: raceCp,
  });
  hud.setSpeed(speedKmh, !!driving);
  hud.setCrew(crew.label());
  hud.setWeapon(arsenal.label());
  hud.setCaches(caches.count, caches.total);

  saveTimer += dt;
  if (saveTimer > 5) { saveTimer = 0; saveGame(); }
}

function endFrame() {
  renderer.render(scene, camera);
}

let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
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
  crew, standing, respect, caches, exportPoint, races, arsenal, radio, garage,
  get driving() { return driving; },
  get cash() { return cash; },
  get paused() { return paused; },
  get gameTime() { return gameTime; },
  get shot() { return shotName; },
  get shotSeed() { return SHOT_SEED; },
  get heli() { return police.heliUp; },
  get roadblock() { return police.roadblockUp; },
  get carHp() { return Object.fromEntries(carHp); },
  saveGame,
  state() {
    return {
      cash, wanted: wanted.level, stage: missions.stage, phase: missions.phase,
      x: +(driving ? driving.pos.x : walker.pos.x).toFixed(1),
      z: +(driving ? driving.pos.z : walker.pos.z).toFixed(1),
      driving: driving ? driving.def.id : null,
      police: police.active, heli: police.heliUp, roadblock: police.roadblockUp,
      traffic: traffic.list.length, peds: peds.list.length,
      maraVisible: missions.mara.visible,
      respect: respect.score, respectTitle: respect.title,
      caches: caches.count, cachesTotal: caches.total,
      crewActive: crew.active, crewRecruited: crew.recruitedList.map((c) => c.id),
      standing: standing.summary().map((s) => `${s.id}:${s.level}`).join(','),
      race: races.racing ? { id: races.current.id, cp: races.checkpoint, t: +races.elapsed.toFixed(1) } : null,
      raceWins: { ...races.wins },
      weapon: arsenal.current, mag: arsenal.mag[arsenal.current],
      radio: radio.current.id, radioSwitches: radio.switches,
      exports: exportPoint.exports, exportedEarned: exportPoint.earned,
      garageOwned: [...garage.owned],
      carHp: driving ? carHp.get(driving.def.id) : null,
      jamLeft: +crew.jamLeft.toFixed(1),
      wantedCalm: +wanted.calmFor.toFixed(1), wantedCool: +wanted.coolTimer.toFixed(1),
      shot: shotName, gameTime: +gameTime.toFixed(2),
      camYaw: +camYaw.toFixed(2), camPitch: +camPitch.toFixed(2), camDist: +camDist.toFixed(2),
      objective: missions.targetLabel,
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
    setMission(stage, phase) { missions.stage = stage; missions.phase = phase; missions._placeMara(); missions._syncHud(); },
    advanceDialog() { hud.advanceDialog(); },
    enterCar(id) {
      const car = fleet.list.find((c) => c.def.id === id);
      if (!car) return false;
      if (driving) { driving.occupied = false; }
      car.pos.set(walker.pos.x + 2, 0, walker.pos.z);
      car.mesh.position.copy(car.pos);
      car.occupied = true;
      driving = car;
      walker.group.visible = false;
      return true;
    },
    exitCar() { if (driving) toggleCar(); },
    giveCrew(id) { crew.recruit(id); crew.select(id); hud.setCrew(crew.label()); return crew.active; },
    setStanding(id, level) { standing.xp[id] = Math.max(0, Math.min(10, level * 2)); hud.setStanding(standing.summary()); },
    setRespect(n) { respect.restore(n); hud.setRespect(respect.label()); },
    startRace(i) { return races.start(i); },
    collectCache(i) { return caches.collectAt(i); },
    setCarHp(n) { if (driving) carHp.set(driving.def.id, n); return driving ? carHp.get(driving.def.id) : null; },
    damageCar(n) { damageCar(n); return driving ? carHp.get(driving.def.id) : null; },
    setCamera(yaw, pitch, dist, lock) { setCamera(yaw, pitch, dist, lock); },
    putInCar(id, x, z, heading, speed) { return putInCar(id, x, z, heading, speed); },
    putOnFoot(x, z) { putOnFoot(x, z); },
    spawnRoadblock(x, z, heading) { police.spawnRoadblockAt(x, z, heading); return police.roadblockUp; },
    clearRoadblock() { police.removeRoadblock(); return police.roadblockUp; },
    stageShot(name) { return applyShot(name, buildShotCtx()); },
    startGame() { hideStart(); },
  },
};
requestAnimationFrame(tick);
console.log('[vice-point] r8 stage3-final ready: buildings=' + buildingCount + ' palms=' + palmCount
  + ' cars=' + fleet.list.length + ' traffic=' + traffic.list.length + ' peds=' + peds.list.length
  + ' caches=' + caches.total + ' races=3 crew=3 shots=4 heli=air-one roadblock=3stars');
