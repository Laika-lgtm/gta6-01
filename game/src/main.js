// Vice Point — game bootstrap and main loop.
// Wires every module together: renderer, world, city, Ray, cars, traffic,
// police, combat, HUD, minimap and sound. Owns the game state (money, wanted
// level, mission chain, save), the start screen flow, entering and exiting
// cars, the Mara Voss mission chain, the wanted/police/busted systems, and
// the screenshot modes from shots.js.
//
// Stage 2 systems live here: a full 0-5 wanted level (crimes raise it, hiding
// and swapping cars lower it), a police fleet that grows with the heat and
// caps at 34 m/s so the player can escape, BUSTED (a $100 fine, mission fail
// on the escape job, respawn at a safe point), the three-job Mara Voss chain
// ($250 -> $550 -> $950 -> $1,550), the F-key punch, and Esc pause.

import * as THREE from 'three';
import { CAR_DEFS, MISSIONS, START, WANTED, CITY } from './config.js';
import { createRng, seedFromUrl } from './random.js';
import { createRenderer, createCamera } from './render.js';
import { buildWorld } from './world.js';
import { buildCity } from './city.js';
import { createPlayer, updatePlayer, updatePlayerCamera } from './player.js';
import {
  spawnStreetCars,
  spawnTraffic,
  spawnPolice,
  spawnPoliceUnit,
  spawnHelicopter,
  nearestCar,
  updateDriving,
  updateTraffic,
  updatePoliceChase,
  updatePoliceLights,
  updateHelicopter,
  updateCarCamera,
  updateChaseCamera,
} from './vehicles.js';
import { createCombat, tryPunch, updateCombat, knockDownPed, PUNCH } from './combat.js';
import { createInput, readMoveIntent, readDriveIntent, wasPressed, drainMouse, injectKey } from './input.js';
import { createAudio } from './audio.js';
import { createHud, saveGame, loadGame } from './hud.js';
import { createMinimap } from './minimap.js';
import { shotFromUrl, applyShotMode } from './shots.js';

const canvas = document.getElementById('game-canvas');
const { renderer } = createRenderer(canvas);
const camera = createCamera();
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffc98a, 220, 700);

const seed = seedFromUrl();
const world = buildWorld(scene);
const city = buildCity(scene, seed);
const colliders = city.colliders;

const input = createInput(canvas);
const audio = createAudio();
const hud = createHud(document);
const minimap = createMinimap(document.getElementById('minimap'));
const combat = createCombat(scene);

const state = {
  started: false,
  paused: false,
  shotMode: null,
  money: START.money,
  wanted: 0,
  missionIndex: 0,
  missionsDone: [],
  missionNote: '',
  health: 100,
  inCar: false,
  carName: '',
  speed: 0,
  x: START.position.x,
  z: START.position.z,
  heading: START.heading,
  time: 0,
  frames: 0,
  lastCrimeAt: -1e9,
  decayTimer: 0,
  carSwapAt: -1e9,
  lastDrivenCarId: '',
  bustedCount: 0,
};

const player = createPlayer(scene, START);
const streetCars = spawnStreetCars(scene, seed);
const traffic = spawnTraffic(scene, seed);
let currentCar = null;
// The police fleet: 0-4 Interceptors, sized to the wanted level.
const policeUnits = [];
let policeChaseActive = false;
let heli = null;
let heliActive = false;
let missionToastShown = false;
let bustedTimer = 0;
let lastRamAt = -1e9;

// Mission runtime: the escape job (Heat) is armed a moment after it starts,
// and re-arms a few seconds after a failed attempt.
const missionState = {
  heatArmed: false,
  heatSeen: false,
  heatDelay: 0,
  retryTimer: 0,
  wrongCarToast: 0,
};

// A low-poly pedestrian crowd: simple figures strolling the sidewalks.
const pedestrians = [];
{
  const rng = createRng(seed + 271);
  const shirtColors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181, 0xaa96da];
  for (let i = 0; i < 14; i++) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: shirtColors[i % shirtColors.length], roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.85 });
    const legs = new THREE.MeshStandardMaterial({ color: 0x333a4a, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.65, 0.3), shirt);
    body.position.y = 1.1;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
    head.position.y = 1.62;
    group.add(head);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), legs);
    legL.position.set(-0.13, 0.38, 0);
    group.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.13;
    group.add(legR);
    const half = (CITY.blocksX - 1) / 2;
    const bx = (Math.floor(rng() * CITY.blocksX) - half) * CITY.blockSize;
    const bz = (Math.floor(rng() * CITY.blocksZ) - half) * CITY.blockSize;
    group.position.set(bx + (rng() - 0.5) * 24, 0, bz + (rng() - 0.5) * 24);
    scene.add(group);
    const baseSpeed = 1.1 + rng() * 0.7;
    pedestrians.push({
      group, legL, legR,
      x: group.position.x, z: group.position.z,
      heading: rng() * Math.PI * 2,
      speed: baseSpeed,
      baseSpeed,
      phase: rng() * 6,
      wander: 0,
      down: false,
      downTimer: 0,
      flee: 0,
    });
  }
}

// Mission marker: a glowing beacon column + floating diamond at the target.
// Escape missions have no marker (null on purpose) — the beacon hides.
const markerGroup = new THREE.Group();
{
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  markerGroup.add(beam);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.4),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xcc9900, emissiveIntensity: 1.2 }),
  );
  diamond.position.y = 6;
  diamond.name = 'mission-diamond';
  markerGroup.add(diamond);
  scene.add(markerGroup);
}

function updateMissionMarker(time) {
  const mission = MISSIONS[state.missionIndex];
  // Guard the null target: escape missions carry marker: null, and an
  // unguarded read here used to throw every frame and brick the mission.
  if (!mission || !mission.marker) {
    markerGroup.visible = false;
    return;
  }
  markerGroup.visible = true;
  markerGroup.position.set(mission.marker.x, 0, mission.marker.z);
  const diamond = markerGroup.getObjectByName('mission-diamond');
  if (diamond) {
    diamond.rotation.y = time * 1.5;
    diamond.position.y = 6 + Math.sin(time * 2) * 0.6;
  }
}

// --- Wanted level -----------------------------------------------------------
// Distance to the nearest Interceptor, or Infinity when none is hunting.
function nearestPoliceDist() {
  let best = Infinity;
  for (const unit of policeUnits) {
    const d = Math.hypot(unit.x - state.x, unit.z - state.z);
    if (d < best) best = d;
  }
  return best;
}

// Keep the fleet at the size the wanted level asks for.
const FLEET_OFFSETS = [[40, 30], [-40, 30], [30, -40], [-30, -40]];
function syncPoliceFleet() {
  const wantedCount = WANTED.policeCountByStars[state.wanted] || 0;
  while (policeUnits.length < wantedCount) {
    const off = FLEET_OFFSETS[policeUnits.length % FLEET_OFFSETS.length];
    policeUnits.push(spawnPoliceUnit(scene, state.x, state.z, off[0], off[1]));
  }
  while (policeUnits.length > wantedCount) {
    const unit = policeUnits.pop();
    scene.remove(unit.mesh);
  }
  if (wantedCount === 0) policeChaseActive = false;
}

function spawnPoliceChase() {
  syncPoliceFleet();
  if (policeUnits.length === 0) return;
  // Lead unit on a road line behind the player, never inside a building.
  const lead = policeUnits[0];
  lead.x = Math.round((state.x + 40) / CITY.blockSize) * CITY.blockSize;
  lead.z = state.z + 30;
  lead.speed = 20;
  lead.mesh.position.set(lead.x, 0, lead.z);
  policeChaseActive = true;
}

function launchHelicopter() {
  if (!heli) heli = spawnHelicopter(scene);
  heli.group.visible = true;
  heliActive = true;
}

function setWanted(stars, quiet) {
  const before = state.wanted;
  state.wanted = Math.max(0, Math.min(WANTED.maxStars, stars));
  if (state.wanted >= 2 && before < 2) {
    syncPoliceFleet();
    policeChaseActive = true;
    if (!quiet) {
      audio.wantedSting();
      hud.showToast('The VCPD is on you!');
    }
  } else {
    syncPoliceFleet();
    if (state.wanted < 2) policeChaseActive = false;
  }
  if (state.wanted >= WANTED.heliAtStars && !heliActive) launchHelicopter();
  if (state.wanted < WANTED.heliAtStars) {
    heliActive = false;
    if (heli) heli.group.visible = false;
  }
}

// A crime: raise the heat and remember when it happened (fresh crimes stall
// the decay). `reason` shows as a toast when given.
function addWanted(n, reason) {
  if (n <= 0) return;
  state.lastCrimeAt = state.time;
  state.decayTimer = 0;
  setWanted(state.wanted + n);
  if (reason) hud.showToast(reason);
}

// --- Missions ---------------------------------------------------------------
function activateMission() {
  missionState.heatArmed = false;
  missionState.heatSeen = false;
  missionState.heatDelay = 0;
  missionState.retryTimer = 0;
  missionState.wrongCarToast = 0;
  state.missionNote = '';
  const mission = MISSIONS[state.missionIndex];
  if (mission && mission.type === 'escape') missionState.heatDelay = 1.2;
}

function startHeat() {
  missionState.heatArmed = true;
  missionState.heatSeen = false;
  state.missionNote = '';
  if (state.wanted < 2) setWanted(2);
  spawnPoliceChase();
  hud.showToast('The cops are onto you — lose them!');
  audio.wantedSting();
}

function failMission() {
  missionState.heatArmed = false;
  missionState.retryTimer = 5;
  state.missionNote = 'Failed — the heat will be back';
  hud.showToast('Mission failed: Heat');
}

function completeMission() {
  const mission = MISSIONS[state.missionIndex];
  if (!mission) return;
  state.money += mission.reward;
  state.missionsDone.push(mission.id);
  hud.showToast(`${mission.title} complete! +$${mission.reward}`);
  audio.missionChime();
  state.missionIndex += 1;
  if (state.missionIndex < MISSIONS.length) {
    activateMission();
  } else {
    state.missionNote = '';
    hud.showToast("Mara's chain complete — free roam!");
  }
  saveGame(state);
}

// --- Busted -----------------------------------------------------------------
function busted() {
  bustedTimer = 0;
  const fine = WANTED.bustedFine;
  state.money = Math.max(0, state.money - fine);
  state.bustedCount += 1;
  const mission = MISSIONS[state.missionIndex];
  const escapeFailed = !!mission && mission.type === 'escape' && missionState.heatArmed;
  if (escapeFailed) failMission();
  // Respawn on foot at a safe point, heat cleared, health restored.
  currentCar = null;
  state.inCar = false;
  state.carName = '';
  state.speed = 0;
  state.health = 100;
  player.x = START.position.x;
  player.z = START.position.z;
  player.heading = START.heading;
  player.group.visible = true;
  player.group.position.set(player.x, 0, player.z);
  state.x = player.x;
  state.z = player.z;
  setWanted(0, true);
  audio.bustedSting();
  hud.showGameOver(escapeFailed
    ? `Fined $${fine}. Mission failed: Heat — the heat will be back.`
    : `Fined $${fine}.`);
  state.started = false;
  saveGame(state);
}

// --- Cars -------------------------------------------------------------------
function enterCar(car, silent) {
  currentCar = car;
  state.inCar = true;
  state.carName = car.def.name;
  player.group.visible = false;
  if (!silent) {
    hud.showToast(`You stole the ${car.def.name}!`);
    audio.uiClick();
    const seen = nearestPoliceDist() < WANTED.stealSeenRadius;
    if (seen) {
      // Caught in the act: straight to two stars.
      setWanted(Math.max(state.wanted, 2));
      hud.showToast('The cops saw you steal that car!');
    } else if (state.wanted < 1) {
      setWanted(1);
    } else if (state.lastDrivenCarId && state.lastDrivenCarId !== car.def.id
      && state.time - state.carSwapAt > WANTED.carSwapDecaySeconds) {
      // New wheels while hot: shed a star (once per cooldown).
      state.carSwapAt = state.time;
      setWanted(state.wanted - 1);
      hud.showToast('New wheels — less heat');
    }
    state.lastCrimeAt = state.time;
  }
  state.lastDrivenCarId = car.def.id;
}

function exitCar() {
  if (!currentCar) return;
  const car = currentCar;
  currentCar = null;
  state.inCar = false;
  state.carName = '';
  state.speed = 0;
  player.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.4;
  player.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.4;
  player.heading = car.heading;
  player.group.visible = true;
  player.group.position.set(player.x, 0, player.z);
  audio.uiClick();
}

// --- Combat -----------------------------------------------------------------
function onPunchHit(hit) {
  if (hit.kind === 'pedestrian') {
    addWanted(PUNCH.pedWanted, 'You punched a pedestrian!');
  } else if (hit.kind === 'police') {
    addWanted(PUNCH.policeWanted, 'You punched a cop!');
  }
}

function doPunch() {
  const res = tryPunch(combat, player, pedestrians, policeUnits, onPunchHit);
  if (res.swung) audio.punchThud(res.hit);
  return res;
}

function startGame() {
  audio.unlock();
  state.started = true;
  state.paused = false;
  state.health = 100;
  bustedTimer = 0;
  hud.hideStart();
  hud.hideGameOver();
  hud.hidePause();
  audio.uiClick();
}

// --- Boot: restore a save, apply a shot mode, or show the start screen -----
const saved = loadGame();
if (saved) {
  state.money = saved.money;
  state.missionIndex = saved.missionIndex;
  state.missionsDone = saved.missionsDone;
  state.wanted = saved.wanted;
  player.x = saved.x;
  player.z = saved.z;
  player.heading = saved.heading;
  player.group.position.set(player.x, 0, player.z);
  if (saved.wanted >= 2) setWanted(saved.wanted, true);
  const mission = MISSIONS[state.missionIndex];
  if (mission && mission.type === 'escape') missionState.heatDelay = 1.2;
}

const shot = shotFromUrl();
const gameApi = {
  state, player, cars: streetCars, traffic,
  enterCar, spawnPoliceChase, spawnHelicopter: launchHelicopter,
  get police() { return policeUnits[0] || null; },
  get policeUnits() { return policeUnits; },
  get heli() { return heli; },
};
if (shot) {
  hud.hideStart();
  applyShotMode(gameApi, shot);
} else {
  hud.showStart();
}

// Expose a small test API for the headless playtest.
window.__VICE__ = {
  state,
  player,
  camera,
  streetCars,
  traffic,
  pedestrians,
  colliders,
  audio,
  injectKey: (code, down) => injectKey(input, code, down),
  startGame,
  enterNearestCar: () => {
    const car = nearestCar(streetCars, player.x, player.z, 6);
    if (car) enterCar(car, false);
    return !!car;
  },
  setWanted,
  completeMission,
  saveGame: () => saveGame(state),
  loadGame,
  punch: doPunch,
  busted,
  setPaused: (paused) => {
    if (!state.started) return;
    state.paused = !!paused;
    if (state.paused) hud.showPause();
    else hud.hidePause();
  },
  // Live pursuit state, for the playtest and for later stages.
  get policeActive() { return policeChaseActive; },
  get heliActive() { return heliActive; },
  get police() { return policeUnits[0] || null; },
  get policeUnits() { return policeUnits; },
  get heli() { return heli; },
  get missionState() { return missionState; },
  get paused() { return state.paused; },
  get bustedTimer() { return bustedTimer; },
};

const clock = new THREE.Clock();
let saveTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // clamp: SwiftShader runs slow
  state.time += dt;
  state.frames += 1;

  try {
    if (state.started) {
      const mouse = drainMouse(input);
      if (wasPressed(input, 'Enter') && !state.shotMode) startGame();
      if (wasPressed(input, 'Escape')) {
        state.paused = !state.paused;
        if (state.paused) hud.showPause();
        else hud.hidePause();
      }

      if (!state.paused) {
        if (wasPressed(input, 'KeyE') && !state.shotMode) {
          if (state.inCar) exitCar();
          else {
            const car = nearestCar(streetCars, player.x, player.z, 5);
            if (car) enterCar(car, false);
          }
        }
        if (wasPressed(input, 'KeyF') && !state.inCar) doPunch();
        if (wasPressed(input, 'KeyM')) {
          hud.showToast('Map: follow the yellow diamond');
        }

        if (state.inCar && currentCar) {
          const intent = readDriveIntent(input);
          // In chase shot mode the car keeps rolling on its own for the frame.
          if (state.shotMode === 'chase' && intent.throttle === 0) intent.throttle = 1;
          updateDriving(currentCar, intent, dt, colliders, [...streetCars, ...traffic, ...policeUnits]);
          // Shot modes hold their staged speed so the frame stays composed:
          // the Neon Coupe (top 38) would otherwise outrun the 34 m/s
          // Interceptor in the cover shot, and the drive shot would decay
          // to a crawl with no throttle input.
          if (state.shotMode === 'chase') currentCar.speed = 26;
          if (state.shotMode === 'drive') currentCar.speed = 18;
          state.speed = currentCar.speed;
          state.x = currentCar.x;
          state.z = currentCar.z;
          player.x = currentCar.x;
          player.z = currentCar.z;
          player.heading = currentCar.heading;
          updateCarCamera(currentCar, camera, mouse, colliders);
          if (state.shotMode === 'chase') updateChaseCamera(currentCar, policeUnits[0] || null, camera);
          audio.updateEngine(Math.abs(currentCar.speed) / currentCar.def.topSpeed, true);
          // Running down a pedestrian is a crime — and they go down.
          for (const ped of pedestrians) {
            if (ped.down) continue;
            if (Math.hypot(ped.x - currentCar.x, ped.z - currentCar.z) < 2.4) {
              knockDownPed(ped);
              addWanted(1, 'You hit a pedestrian!');
              audio.punchThud(true);
            }
          }
        } else {
          const intent = readMoveIntent(input);
          updatePlayer(player, intent, mouse, dt, colliders);
          state.x = player.x;
          state.z = player.z;
          state.speed = player.speed;
          updatePlayerCamera(player, camera, colliders);
          audio.updateEngine(0, false);
          audio.footstep(player.moving, intent.run, dt);
        }
        updateCombat(combat, player, dt);

        // Mission logic: reach / escape / getaway.
        const mission = MISSIONS[state.missionIndex];
        if (mission) {
          if (mission.type === 'escape') {
            if (!missionState.heatArmed) {
              if (missionState.retryTimer > 0) {
                missionState.retryTimer -= dt;
                if (missionState.retryTimer <= 0) startHeat();
              } else if (missionState.heatDelay > 0) {
                missionState.heatDelay -= dt;
                if (missionState.heatDelay <= 0) startHeat();
              }
            } else {
              if (state.wanted >= 2) missionState.heatSeen = true;
              if (missionState.heatSeen && state.wanted === 0) completeMission();
            }
          } else if (mission.marker) {
            const dist = Math.hypot(state.x - mission.marker.x, state.z - mission.marker.z);
            if (dist < 6) {
              if (mission.type === 'getaway') {
                if (state.inCar && currentCar && currentCar.def.id === mission.carId) {
                  completeMission();
                } else if (state.time - missionState.wrongCarToast > 4) {
                  missionState.wrongCarToast = state.time;
                  hud.showToast('Wrong car — Mara wants the Neon Coupe!');
                }
              } else {
                completeMission();
              }
            }
          }
        }

        // Wanted decay: only while hidden (no police near) and quiet (no
        // fresh crime) — one star per decay window, then the chase ends.
        if (state.wanted > 0) {
          const nearest = nearestPoliceDist();
          const hidden = nearest > WANTED.hideRadius;
          const quiet = state.time - state.lastCrimeAt > WANTED.crimeMemorySeconds;
          if (hidden && quiet) {
            state.decayTimer += dt;
            if (state.decayTimer >= WANTED.decaySeconds) {
              state.decayTimer = 0;
              setWanted(state.wanted - 1);
              if (state.wanted === 0) hud.showToast('You lost the cops!');
            }
          } else {
            state.decayTimer = 0;
          }
        }

        // Police chase: every unit hunts, lights flash, siren wails.
        let nearestPolice = Infinity;
        if (policeChaseActive && policeUnits.length > 0) {
          for (const unit of policeUnits) {
            const dist = updatePoliceChase(unit, state.x, state.z, dt, colliders, [...streetCars, ...traffic, ...policeUnits]);
            updatePoliceLights(unit, state.time);
            if (dist < nearestPolice) nearestPolice = dist;
            // Ramming a cop car at speed is a crime (3 s cooldown).
            if (state.inCar && dist < 3 && Math.abs(state.speed) > 8 && state.time - lastRamAt > 3) {
              lastRamAt = state.time;
              addWanted(1, 'You rammed a cop car!');
            }
          }
          // Busted: cornered by a unit while slow (in a car) or on foot.
          if (nearestPolice < 4.5 && state.inCar && Math.abs(state.speed) < 2.5) {
            bustedTimer += dt;
          } else if (nearestPolice < 3.2 && !state.inCar) {
            bustedTimer += dt * 1.6;
          } else {
            bustedTimer = Math.max(0, bustedTimer - dt * 2);
          }
          if (bustedTimer >= WANTED.bustedTime) busted();
          if (nearestPolice > WANTED.policeDespawnRadius && state.wanted < 2) policeChaseActive = false;
        }
        audio.updateSiren(policeChaseActive && policeUnits.length > 0,
          nearestPolice === Infinity ? 200 : nearestPolice, state.time);
        if (heliActive && heli) updateHelicopter(heli, state.x, state.z, dt, state.time);

        // Traffic and pedestrians keep the city alive.
        updateTraffic(traffic, dt, city.span);
        for (const ped of pedestrians) {
          if (ped.down) {
            ped.downTimer -= dt;
            if (ped.downTimer <= 0) {
              ped.down = false;
              ped.group.rotation.x = 0;
              ped.flee = 4;
            }
            ped.group.position.set(ped.x, 0, ped.z);
            continue;
          }
          if (ped.flee > 0) {
            ped.flee -= dt;
            const dx = ped.x - state.x;
            const dz = ped.z - state.z;
            const d = Math.hypot(dx, dz) || 1;
            ped.x += (dx / d) * 4.5 * dt;
            ped.z += (dz / d) * 4.5 * dt;
            ped.heading = Math.atan2(dx, dz);
            ped.phase += dt * 10;
            ped.legL.rotation.x = Math.sin(ped.phase) * 0.6;
            ped.legR.rotation.x = -Math.sin(ped.phase) * 0.6;
            ped.group.position.set(ped.x, 0, ped.z);
            ped.group.rotation.y = ped.heading;
            continue;
          }
          ped.wander -= dt;
          if (ped.wander <= 0) {
            ped.heading += (Math.random() - 0.5) * 2.4;
            ped.wander = 2 + Math.random() * 3;
          }
          const nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
          const nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
          if (Math.abs(nx) < 130 && Math.abs(nz) < 130) {
            ped.x = nx;
            ped.z = nz;
          } else {
            ped.heading += Math.PI;
          }
          ped.phase += dt * 6;
          ped.legL.rotation.x = Math.sin(ped.phase) * 0.5;
          ped.legR.rotation.x = -Math.sin(ped.phase) * 0.5;
          ped.group.position.set(ped.x, 0, ped.z);
          ped.group.rotation.y = ped.heading;
        }

        // Neon signs flicker gently.
        for (const neon of city.neonMeshes) {
          neon.material.opacity = 0.92 + Math.sin(state.time * 3 + neon.position.x) * 0.08;
        }
        // Sea shimmer.
        world.sea.position.y = -0.4 + Math.sin(state.time * 0.6) * 0.08;

        // Autosave every 20 seconds.
        saveTimer += dt;
        if (saveTimer > 20) {
          saveTimer = 0;
          saveGame(state);
        }

        // HUD + minimap.
        const activeMission = MISSIONS[state.missionIndex];
        hud.render(state, {
          cameraYaw: player.cameraYaw,
          marker: activeMission && activeMission.marker ? activeMission.marker : null,
        });
        minimap.draw({
          x: state.x, z: state.z, heading: player.heading,
          buildings: city.buildings, cars: [...streetCars, ...traffic],
          police: policeUnits,
          missionIndex: state.missionIndex,
        }, state.time);
      } else {
        // Paused: freeze the world, silence the engine and the siren.
        audio.updateEngine(0, false);
        audio.updateSiren(false, 0, state.time);
      }
    } else {
      // Start screen: slow orbit over the city.
      const t = state.time * 0.08;
      camera.position.set(Math.sin(t) * 120, 55, Math.cos(t) * 120);
      camera.lookAt(0, 8, 0);
      for (const neon of city.neonMeshes) {
        neon.material.opacity = 0.92 + Math.sin(state.time * 3 + neon.position.x) * 0.08;
      }
      if (wasPressed(input, 'Enter')) startGame();
    }
  } finally {
    // The frame always ends: marker, render, ready flag — even if an update
    // above threw, so one bad frame can never freeze the game.
    endFrame();
  }
}

// One frame's close-out: mission beacon, the render, and the ready flag the
// playtest and the screenshot script wait for.
function endFrame() {
  updateMissionMarker(state.time);
  renderer.render(scene, camera);
  if (state.frames === 30) {
    window.__VICE_READY__ = true;
  }
}

animate();
