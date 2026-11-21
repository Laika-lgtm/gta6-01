// Vice Point — entry point: boot, game loop, game state, save.
// Ray Delgado walks and drives through a procedural Vice City, steals cars,
// dodges the VCPD wanted system and runs Mara Voss's three-job chain.
// The animate loop is wrapped try/finally so endFrame() — render, HUD,
// minimap — always runs, even if one update throws.

import * as THREE from 'three';
import { GAME_TITLE, SAVE_KEY, GAME_VERSION, CITY, PLAYER, CAR_DEFS, POLICE_DEF, WANTED, MISSIONS, START, GARAGE, RESPECT, HELI, WEAPONS } from './config.js';
import { buildWorld } from './world.js';
import { buildCity } from './city.js';
import { createPlayer, updatePlayer, updatePlayerCamera } from './player.js';
import { createRenderer, createCamera } from './render.js';
import { createHud, saveGame, loadGame } from './hud.js';
import { createMinimap } from './minimap.js';
import { createInput, readMoveIntent, readDriveIntent, wasPressed, drainMouse, injectKey } from './input.js';
import { createAudio } from './audio.js';
import { createCombat, tryPunch, updateCombat, knockDownPed, PUNCH } from './combat.js';
import { createWeapons, cycleWeapon, selectWeapon, tryShoot, updateWeapons, createWeaponFx, updateWeaponFx, shootTracer, refillAmmo } from './weapons.js';
import { createGarage, garageBuyPrice } from './garage.js';
import { createRoadblock, smashRoadblock, removeRoadblock } from './roadblock.js';
import { seedFromUrl } from './random.js';
import {
  createStreetCars, createTraffic, createPedestrians, updateTraffic, updatePedestrians,
  ensurePoliceCount, despawnPolice, nearestPoliceDistance, updatePolice,
  createHeli, updateHeli, damageHeli, driveCar, nearestCar,
  createTailTarget, updateTailTarget, spawnStreetCar,
} from './vehicles.js';
import { shotModeFromUrl, stageShotMode, createMara, createBeam, currentMarker } from './shots.js';

const canvas = document.getElementById('game-canvas');
const { renderer } = createRenderer(canvas);
const camera = createCamera();
// ?lowfx=1 disables shadows for slow software renderers (headless playtest).
if (new URLSearchParams(window.location.search).get('lowfx') === '1') {
  renderer.shadowMap.enabled = false;
}
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x1a2436, 120, 700);

const seed = seedFromUrl();
const { sun, sea } = buildWorld(scene);
const city = buildCity(scene, seed);
const colliders = city.colliders;

const player = createPlayer(scene, START);
const cars = createStreetCars(scene);
const traffic = createTraffic(scene, seed, 8);
const pedestrians = createPedestrians(scene, seed, 10);
const police = [];
const heli = createHeli(scene);
const mara = createMara(scene);
const beam = createBeam(scene, mara.x, mara.z);
const garage = createGarage(scene);
const tailTarget = createTailTarget(scene);
const weaponFx = createWeaponFx(scene);
const weapons = createWeapons();

const hud = createHud(document);
const minimap = createMinimap(document.getElementById('minimap'));
const input = createInput(canvas);
const audio = createAudio();
const combat = createCombat(scene);

const shotMode = shotModeFromUrl();

// --- Game state -------------------------------------------------------------
const state = {
  started: false,
  paused: false,
  busted: false,
  money: START.money,
  wanted: 0,
  missionIndex: 0,
  missionsDone: [],
  health: PLAYER.maxHealth,
  inCar: false,
  car: null,
  carName: '',
  speed: 0,
  x: START.position.x,
  z: START.position.z,
  heading: START.heading,
  missionNote: '',
  time: 0,
  frames: 0,
  bustedTimer: 0,
  retryTimer: 0,
  hiddenTimer: 0,
  lastCrimeTime: -999,
  lastSwapTime: -999,
  lastCar: null,
  escapeArmed: false,
  missionFailed: false,
  lostCops: false, // true once every unit has been outrun past 120 m: no respawn until a new crime
  lostCopsAt: -999, // game time the fleet was fully lost; the window lasts 20 s, then the fleet returns
  ramCooldown: 0,
  shoveCooldown: 0, // seconds until the next police-car shove can fire
  crimeCooldown: 0, // seconds until the next witnessed shot can add heat
  saveTimer: 0,
  shotFraming: null,
  // --- Stage 4 ---
  respect: 0,
  garageCars: [], // def ids of cars parked in the garage
  garageBuys: 0, // how many cars Ray has bought (cycles the showroom)
  lastGarageDecay: -999,
  missionTimer: 0, // countdown for 'timed' jobs
  surveyStep: 0, // photo spots snapped for 'survey' jobs
  heistPhase: 0, // 0 = reach the bank, 1 = lose the heat
  roadblock: null,
  lastRoadblockAt: -999,
  roadblocksUsed: 0, // barricades laid this job (cap 3: a dodge gets re-laid,
  // a smash ends them — one barricade per job let the signature moment
  // silently vanish when the player was shoved past it)
  roadblockSmashed: false, // once smashed, the VCPD stops barricading
};

// Restore a save, except in screenshot modes (those must be deterministic).
if (!shotMode) {
  const saved = loadGame();
  if (saved) {
    state.money = saved.money;
    state.missionIndex = Math.min(saved.missionIndex, MISSIONS.length);
    state.missionsDone = saved.missionsDone || [];
    state.x = saved.x;
    state.z = saved.z;
    state.heading = saved.heading;
    state.wanted = saved.wanted || 0;
    state.respect = saved.respect || 0;
    state.garageCars = saved.garageCars || [];
    state.garageBuys = saved.garageBuys || 0;
    weapons.weapon = saved.weapon || 'fists';
    weapons.ammo = saved.ammo || { pistol: 24, smg: 60 };
    player.x = saved.x;
    player.z = saved.z;
    player.heading = saved.heading;
    player.group.position.set(saved.x, 0, saved.z);
    // Re-arm the loaded job without re-paying its opening heat: an escape
    // reloads armed only if the save still had stars; a timed job gets a
    // fresh clock; survey and heist restart their first phase.
    const loaded = MISSIONS[state.missionIndex];
    if (loaded) {
      if (loaded.type === 'escape') {
        state.escapeArmed = state.wanted > 0;
      } else if (loaded.type === 'timed') {
        state.missionTimer = loaded.timeLimit;
      } else if (loaded.type === 'survey') {
        state.surveyStep = 0;
      } else if (loaded.type === 'heist') {
        state.heistPhase = 0;
      }
    }
  }
}

// --- Wanted -----------------------------------------------------------------
function addWanted(n, why) {
  if (n <= 0) return;
  const before = state.wanted;
  state.wanted = Math.min(WANTED.maxStars, state.wanted + n);
  state.lastCrimeTime = state.time;
  state.hiddenTimer = 0;
  // A fresh crime brings the cops back: the "lost them" window closes.
  state.lostCops = false;
  state.lostCopsAt = -999;
  nextPoliceSpawnAt = 0;
  if (state.wanted > before) {
    audio.wantedSting();
    hud.showToast(why ? `Wanted ★${state.wanted} — ${why}` : `Wanted level ${state.wanted}`);
  }
}

function nearestPolice() {
  return nearestPoliceDistance(police, state.x, state.z);
}

let nextPoliceSpawnAt = 0;

function updateWanted(dt) {
  const target = WANTED.policeCountByStars[state.wanted] || 0;
  // Despawn units that fell far behind; they only respawn after a delay, so
  // outrunning the cops really does open a window to cool off. Once the whole
  // fleet is gone the player has properly lost them: no respawn at all until
  // a new crime, so the 12 s decay ticks can actually run.
  for (let i = police.length - 1; i >= 0; i--) {
    const d = Math.hypot(police[i].x - state.x, police[i].z - state.z);
    if (d > WANTED.policeDespawnRadius) {
      scene.remove(police[i].group);
      police.splice(i, 1);
      nextPoliceSpawnAt = Math.max(nextPoliceSpawnAt, state.time + 8);
      // The whole fleet outrun: the player has properly lost them — but
      // only for a 20 s window. That is long enough for one star to decay
      // (12 s while hidden) yet the fleet comes back afterwards, so a
      // fast launch can never switch the chase off for good: before this
      // fix the Neon Coupe (accel 18) opened a >120 m gap before the
      // Interceptors reached 34 m/s, the fleet despawned, and `lostCops`
      // stayed true forever — the escape mission could never be chased.
      if (police.length === 0 && !state.lostCops) {
        state.lostCops = true;
        state.lostCopsAt = state.time;
      }
    }
  }
  // The lost-them window expires after 20 s of game time: the fleet is back
  // on the beat (the 8 s respawn delay above is already spent by then, so
  // the next line respawns immediately at the reduced wanted level).
  if (state.lostCops && state.time - state.lostCopsAt >= 20) {
    state.lostCops = false;
    state.lostCopsAt = -999;
  }
  if (state.wanted > 0 && state.time >= nextPoliceSpawnAt && !state.lostCops) {
    ensurePoliceCount(police, scene, target, state.x, state.z, colliders);
  } else if (state.wanted === 0 && police.length > 0) {
    despawnPolice(police, scene);
  }
  // Decay: only while hidden — no police within 90 m and no crime for 15 s —
  // then one star every 12 s.
  if (state.wanted > 0) {
    const near = nearestPolice();
    const quietFor = state.time - state.lastCrimeTime;
    if (near > WANTED.hideRadius && quietFor >= WANTED.crimeMemorySeconds) {
      state.hiddenTimer += dt;
      if (state.hiddenTimer >= WANTED.decaySeconds) {
        state.wanted -= 1;
        state.hiddenTimer = 0;
        hud.showToast(state.wanted === 0 ? 'You lost them — heat is off' : `Heat cooling off — ★${state.wanted}`);
      }
    } else {
      state.hiddenTimer = 0;
    }
  }
  updateHeli(
    heli, dt, state.x, state.z, state.wanted >= WANTED.heliAtStars, state.time,
    (from, to) => shootTracer(weaponFx, from, to),
    () => audio.heliWarning(),
  );
}

// --- Cars -------------------------------------------------------------------
function setInCar(car) {
  state.inCar = true;
  state.car = car;
  state.carName = car.def.name;
  player.group.visible = false;
}

function enterCar(car) {
  // Stealing in front of a cop is a crime.
  if (nearestPolice() < WANTED.stealSeenRadius) addWanted(1, 'car stolen in front of the cops');
  car.stolen = true;
  car.parked = false;
  // Swapping to a different car while wanted sheds one star (20 s cooldown).
  if (state.wanted > 0 && state.lastCar && state.lastCar !== car
    && state.time - state.lastSwapTime >= WANTED.carSwapDecaySeconds) {
    state.wanted = Math.max(0, state.wanted - 1);
    state.lastSwapTime = state.time;
    hud.showToast('New wheels — one star off the heat');
  }
  state.lastCar = car;
  setInCar(car);
  audio.uiClick();
  hud.showToast(`Stole the ${car.def.name}`);
}

function exitCar() {
  if (!state.car) return;
  const car = state.car;
  car.speed *= 0.4;
  // Step out on the driver's side, clear of buildings.
  const px = car.x - Math.cos(car.heading) * 2.6;
  const pz = car.z + Math.sin(car.heading) * 2.6;
  const fixed = { x: px, z: pz };
  player.x = fixed.x;
  player.z = fixed.z;
  player.heading = car.heading;
  player.group.position.set(player.x, 0, player.z);
  player.group.visible = true;
  state.inCar = false;
  state.car = null;
  state.carName = '';
  state.speed = 0;
}

// --- Missions ---------------------------------------------------------------
function currentMission() {
  return MISSIONS[state.missionIndex] || null;
}

// A job's opening beat, run when it becomes current: timed jobs get their
// clock, escape jobs open hot, heists start at the bank. Called from
// advanceMission and from the debug setMission hook — never from load (a
// reload re-arms without re-paying the opening heat; see the load block).
function startMission(i) {
  const mission = MISSIONS[i];
  if (!mission) return;
  state.missionTimer = 0;
  state.surveyStep = 0;
  state.heistPhase = 0;
  state.missionFailed = false;
  state.missionNote = '';
  state.roadblocksUsed = 0;
  state.roadblockSmashed = false;
  if (mission.type === 'timed') {
    state.missionTimer = mission.timeLimit;
  } else if (mission.type === 'escape') {
    addWanted(mission.startWanted || 2, `${mission.title} drew the cops`);
    state.escapeArmed = true;
  }
}

function addRespect(n) {
  state.respect = Math.min(RESPECT.max, state.respect + n);
}

// A job is gated while respect is below its minRespect: the HUD says so and
// the objective will not complete. Respect only grows, so a gated job is
// never a dead end — finish other work, shoot down Air One, smash a block.
function respectGate(mission) {
  if (mission.minRespect && state.respect < mission.minRespect) {
    state.missionNote = `Needs Respect ${mission.minRespect} — earn it first`;
    return true;
  }
  state.missionNote = '';
  return false;
}

function advanceMission() {
  const mission = currentMission();
  if (!mission) return;
  state.money += mission.reward;
  state.missionsDone.push(mission.id);
  state.missionNote = '';
  state.missionFailed = false;
  addRespect(RESPECT.perMission);
  refillAmmo(weapons);
  audio.missionChime();
  hud.showToast(`${mission.title} done — +$${mission.reward} · Respect ${state.respect}`);
  // Advance FIRST, then save: saving before the increment wrote the old
  // missionIndex to disk, so a reload within 5 s (before the next autosave)
  // replayed the just-finished job — and paid its reward a second time.
  state.missionIndex += 1;
  saveGame(state);
  startMission(state.missionIndex);
}

function checkMissions() {
  if (state.busted) return;
  const mission = currentMission();
  if (!mission) return;
  if (mission.type === 'reach') {
    if (mission.marker && Math.hypot(state.x - mission.marker.x, state.z - mission.marker.z) < 7) {
      if (!respectGate(mission)) advanceMission();
    }
  } else if (mission.type === 'timed') {
    if (mission.marker && Math.hypot(state.x - mission.marker.x, state.z - mission.marker.z) < 7) {
      if (!respectGate(mission)) advanceMission();
    }
  } else if (mission.type === 'tail') {
    if (Math.hypot(state.x - tailTarget.x, state.z - tailTarget.z) < 9) {
      if (!respectGate(mission)) advanceMission();
    }
  } else if (mission.type === 'survey') {
    // All three spots snapped but the gate held: keep checking, so the job
    // completes the moment respect is earned — no need to re-snap a spot.
    if (state.surveyStep >= mission.markers.length) {
      if (!respectGate(mission)) advanceMission();
      return;
    }
    const spot = mission.markers && mission.markers[state.surveyStep];
    if (spot && Math.hypot(state.x - spot.x, state.z - spot.z) < 8) {
      state.surveyStep += 1;
      audio.missionChime();
      if (state.surveyStep >= mission.markers.length) {
        if (!respectGate(mission)) advanceMission();
      } else {
        hud.showToast(`Photo ${state.surveyStep} of ${mission.markers.length} snapped`);
      }
    }
  } else if (mission.type === 'escape') {
    // Escape has NO marker (null on purpose) — the stars are the objective.
    if (state.escapeArmed && state.wanted === 0) {
      state.escapeArmed = false;
      advanceMission();
    }
  } else if (mission.type === 'heist') {
    if (state.heistPhase === 0) {
      if (mission.marker && Math.hypot(state.x - mission.marker.x, state.z - mission.marker.z) < 7) {
        if (respectGate(mission)) return;
        state.heistPhase = 1;
        addWanted(mission.startWanted || 3, 'The bank job drew every cop in Vice Point');
        state.escapeArmed = true;
        state.missionFailed = false;
        hud.showToast('The vault is open — now lose them!');
      }
    } else if (state.escapeArmed && state.wanted === 0) {
      state.escapeArmed = false;
      advanceMission();
    }
  } else if (mission.type === 'getaway') {
    if (state.inCar && state.car && state.car.def.id === mission.carId
      && mission.marker && Math.hypot(state.x - mission.marker.x, state.z - mission.marker.z) < 9) {
      advanceMission();
    } else if (!state.inCar || !state.car || state.car.def.id !== mission.carId) {
      state.missionNote = 'Steal the Neon Coupe first';
    } else {
      state.missionNote = '';
    }
  }
}

// The live objective marker: survey jobs point at the next photo spot, a
// heist in its escape phase has no marker (the stars are the objective),
// everything else uses the mission's own marker.
function currentMarkerObj() {
  const mission = currentMission();
  if (!mission) return null;
  if (mission.type === 'survey') {
    return (mission.markers && mission.markers[state.surveyStep]) || null;
  }
  if (mission.type === 'heist' && state.heistPhase === 1) return null;
  return mission.marker || null;
}

// --- Busted -----------------------------------------------------------------
function doBusted() {
  state.busted = true;
  state.bustedTimer = 0;
  state.retryTimer = 5; // automatic retry after 5 s
  const mission = currentMission();
  if (mission && mission.type === 'escape') {
    // Busted during Heat: the escape FAILED — it does not complete.
    state.escapeArmed = false;
    state.missionFailed = true;
  } else if (mission && mission.type === 'heist' && state.heistPhase === 1) {
    // Busted mid-getaway: the vault run FAILED, back to the escape phase.
    state.escapeArmed = false;
    state.missionFailed = true;
  } else if (mission && mission.type === 'timed') {
    // Busted on a timed drop: the clock restarts on retry.
    state.missionFailed = true;
  }
  state.money = Math.max(0, state.money - WANTED.bustedFine);
  state.health = PLAYER.maxHealth;
  if (state.inCar) exitCar();
  state.wanted = 0;
  despawnPolice(police, scene);
  // Respawn on foot at a safe spot.
  player.x = START.position.x;
  player.z = START.position.z;
  player.heading = START.heading;
  player.group.position.set(player.x, 0, player.z);
  player.group.visible = true;
  state.x = player.x;
  state.z = player.z;
  audio.bustedSting();
  hud.showGameOver(`Fine: $${WANTED.bustedFine} — the VCPD took their cut.`);
  saveGame(state);
}

function retryAfterBusted() {
  hud.hideGameOver();
  state.busted = false;
  state.retryTimer = 0;
  const mission = currentMission();
  if (mission && mission.type === 'escape' && state.missionFailed) {
    // Automatic escape retry: the job restarts with its opening heat.
    state.missionFailed = false;
    addWanted(mission.startWanted || 2, `${mission.title} is back on — lose them this time`);
    state.escapeArmed = true;
    hud.showToast(`${mission.title} — lose the cops!`);
  } else if (mission && mission.type === 'heist' && state.missionFailed && state.heistPhase === 1) {
    // Heist retry: back to the escape phase with three stars on your tail.
    state.missionFailed = false;
    addWanted(mission.startWanted || 3, 'The bank job is back on — lose them this time');
    state.escapeArmed = true;
    hud.showToast('The Big Heist — lose the cops!');
  } else if (mission && mission.type === 'timed' && state.missionFailed) {
    // Timed retry: a fresh clock.
    state.missionFailed = false;
    state.missionTimer = mission.timeLimit;
    hud.showToast('The Drop — beat the clock!');
  }
}

// --- Combat -----------------------------------------------------------------
function onPunchHit(hit) {
  if (hit.kind === 'pedestrian') {
    addWanted(PUNCH.pedWanted, 'you punched someone');
  } else if (hit.kind === 'police') {
    addWanted(PUNCH.policeWanted, 'you punched a cop');
  }
}

// A bullet landed. Witnessed crime costs heat (throttled: one star per
// 2.5 s no matter how fast the SMG cycles); a downed heli pays $500.
function onShootHit(hit) {
  if (hit.kind === 'pedestrian') {
    knockDownPed(hit.target);
    if (nearestPolice() < WANTED.witnessRadius && state.crimeCooldown <= 0) {
      addWanted(1, 'you shot someone in front of the cops');
      state.crimeCooldown = 2.5;
    }
  } else if (hit.kind === 'police') {
    const unit = hit.target;
    unit.speed = Math.max(0, unit.speed - 8);
    unit.shotsTaken += 1;
    if (unit.shotsTaken >= 3 && !unit.disabled) {
      unit.disabled = true;
      unit.disableTimer = 8;
      hud.showToast('Interceptor disabled');
    }
    if (state.crimeCooldown <= 0) {
      addWanted(1, 'you shot a cop');
      state.crimeCooldown = 2.5;
    }
  } else if (hit.kind === 'heli') {
    if (damageHeli(heli)) {
      state.money += HELI.downReward;
      addRespect(RESPECT.heliDown);
      hud.showToast(`Air One down — +$${HELI.downReward} · Respect ${state.respect}`);
      if (state.crimeCooldown <= 0) {
        addWanted(1, 'you shot down Air One');
        state.crimeCooldown = 2.5;
      }
      saveGame(state);
    }
  }
}

// --- Garage -----------------------------------------------------------------
function garageDistance() {
  return Math.hypot(state.x - GARAGE.x, state.z - GARAGE.z);
}

function useGarage() {
  if (garageDistance() > GARAGE.radius) return;
  if (state.inCar && state.car) {
    // Store the car you drove in: it leaves the street, joins the garage
    // stock, and laying low sheds a star.
    const car = state.car;
    const name = car.def.name;
    exitCar();
    scene.remove(car.group);
    const idx = cars.indexOf(car);
    if (idx >= 0) cars.splice(idx, 1);
    state.garageCars.push(car.def.id);
    if (state.wanted > 0) {
      state.wanted = Math.max(0, state.wanted - 1);
      hud.showToast(`Stored the ${name} — one star off the heat`);
    } else {
      hud.showToast(`Stored the ${name} in the garage`);
    }
    audio.uiClick();
    saveGame(state);
    return;
  }
  if (state.garageCars.length > 0) {
    // Take the most recently stored car back out.
    const id = state.garageCars.pop();
    const def = CAR_DEFS.find((d) => d.id === id) || CAR_DEFS[0];
    const car = spawnStreetCar(scene, def, GARAGE.x - 15, GARAGE.z, -Math.PI / 2);
    cars.push(car);
    player.x = car.x;
    player.z = car.z;
    player.group.position.set(car.x, 0, car.z);
    state.x = car.x;
    state.z = car.z;
    setInCar(car);
    hud.showToast(`Took the ${def.name} out of the garage`);
    audio.uiClick();
    saveGame(state);
    return;
  }
  // Nothing stored: buy a fresh car from the showroom (respect discounts it).
  const price = garageBuyPrice(state.respect);
  if (state.money < price) {
    hud.showToast(`Need $${price} to buy a ride`);
    return;
  }
  state.money -= price;
  const def = CAR_DEFS[state.garageBuys % CAR_DEFS.length];
  state.garageBuys += 1;
  const car = spawnStreetCar(scene, def, GARAGE.x - 15, GARAGE.z, -Math.PI / 2);
  cars.push(car);
  player.x = car.x;
  player.z = car.z;
  player.group.position.set(car.x, 0, car.z);
  state.x = car.x;
  state.z = car.z;
  setInCar(car);
  hud.showToast(`Bought the ${def.name} for $${price}`);
  audio.uiClick();
  saveGame(state);
}

// --- Roadblocks ---------------------------------------------------------------
// During a roadblock escape job at 3+ stars, the VCPD barricades the road
// ahead of Ray (one block at a time, re-laid every 25 s). The block is
// placed 45 m ahead along the player's heading, snapped to the nearest road
// line so it always sits on drivable asphalt.
const ROAD_LINES = [-126, -84, -42, 0, 42, 84, 126];

function roadblockJobActive() {
  const mission = currentMission();
  if (!mission || !mission.roadblocks) return false;
  if (mission.type === 'escape') return state.escapeArmed;
  if (mission.type === 'heist') return state.heistPhase === 1 && state.escapeArmed;
  return false;
}

function maybeSpawnRoadblock() {
  if (!roadblockJobActive() || state.wanted < 3 || state.roadblock) return;
  if (state.roadblocksUsed >= 3 || state.roadblockSmashed) return;
  if (state.time - state.lastRoadblockAt < 25) return;
  const ahead = 45;
  const ax = state.x + Math.sin(state.heading) * ahead;
  const az = state.z + Math.cos(state.heading) * ahead;
  const snap = (v) => ROAD_LINES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  let x = ax;
  let z = az;
  if (Math.abs(x - snap(x)) < Math.abs(z - snap(z))) x = snap(x);
  else z = snap(z);
  x = Math.max(-140, Math.min(140, x));
  z = Math.max(-140, Math.min(140, z));
  state.roadblock = createRoadblock(scene, x, z, state.heading);
  state.lastRoadblockAt = state.time;
  state.roadblocksUsed += 1;
  hud.showToast('Roadblock ahead — smash through or go around!');
}

function updateRoadblock(dt) {
  const block = state.roadblock;
  if (!block) return;
  block.timer -= dt;
  const dist = Math.hypot(state.x - block.x, state.z - block.z);
  if (block.timer <= 0 || dist > 70) {
    // Cleared unbroken — the player dodged it or was shoved past it. The
    // VCPD re-lays the barricade after the 25 s throttle (roadblocksUsed
    // caps the re-lays at 3 per job); a smash never re-lays.
    if (!block.broken) state.lastRoadblockAt = state.time;
    removeRoadblock(scene, block);
    state.roadblock = null;
    return;
  }
  // Ramming the block at speed shoves it aside: heat up, respect up, and
  // the road is open. The car powers through at 18 m/s or more — the old
  // form halved the speed on top of driveCar's collision penalty, so the
  // car nearly stopped in front of the closing fleet (0.7 m/s in the
  // diagnostic) and a cop inside 3.5 m could BUST a stationary Ray.
  if (!block.broken && state.inCar && state.car) {
    for (const unit of block.cars) {
      if (Math.hypot(state.car.x - unit.x, state.car.z - unit.z) < 4.5
        && Math.abs(state.speed) > 8) {
        smashRoadblock(block);
        state.roadblockSmashed = true;
        state.car.speed = Math.max(state.car.speed, 18);
        addRespect(RESPECT.roadblockSmash);
        addWanted(1, 'you smashed through a roadblock');
        hud.showToast(`Smashed the roadblock! · Respect ${state.respect}`);
        break;
      }
    }
  }
}

// --- Per-frame update -------------------------------------------------------
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();

function update(dt) {
  const mouse = drainMouse(input);

  if (wasPressed(input, 'Escape') && state.started && !state.busted) {
    state.paused = !state.paused;
    if (state.paused) hud.showPause();
    else hud.hidePause();
  }
  if (!state.started) {
    if (wasPressed(input, 'Enter')) startGame();
    return;
  }
  if (state.paused) return;

  // Game time only advances while actually playing: it used to tick at the
  // top of update(), so Esc pause left the clock running (decay timers,
  // spawn delays and the lostCops window all read this clock).
  state.time += dt;
  state.ramCooldown = Math.max(0, state.ramCooldown - dt);
  state.shoveCooldown = Math.max(0, state.shoveCooldown - dt);
  state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);

  // Timed jobs: the clock runs out, Mara hands Ray a fresh one — no fail
  // screen, just a lost attempt and a note in the record.
  const liveMission = currentMission();
  if (liveMission && liveMission.type === 'timed' && !state.busted) {
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      state.missionFailed = true;
      state.missionTimer = liveMission.timeLimit;
      hud.showToast('Too slow — Mara gives you another shot');
    }
  }

  if (state.busted) {
    state.retryTimer -= dt;
    if (state.retryTimer <= 0) retryAfterBusted();
    else if (wasPressed(input, 'Enter')) retryAfterBusted();
    return;
  }

  if (wasPressed(input, 'KeyM')) {
    const m = currentMission();
    hud.showToast(m ? `${m.title}: ${m.objective}` : 'All jobs done — free roam');
  }

  // --- Punch (F, unarmed) / shoot (F, armed) ---
  if (wasPressed(input, 'KeyF') && !state.inCar) {
    if (weapons.weapon === 'fists') {
      const res = tryPunch(combat, player, pedestrians, police, onPunchHit);
      audio.punchThud(res.hit);
    } else {
      const res = tryShoot(weapons, weaponFx, player, { pedestrians, police, heli }, onShootHit);
      if (res.fired) audio.gunshot();
      else if (res.empty) hud.showToast('Out of ammo — finish a job to restock');
    }
  }
  updateCombat(combat, player, dt);
  updateWeapons(weapons, dt);
  updateWeaponFx(weaponFx, dt);

  // --- Weapon wheel: Q cycles, 1/2/3 pick directly ---
  if (wasPressed(input, 'KeyQ')) {
    cycleWeapon(weapons);
    const w = WEAPONS[weapons.weapon];
    hud.showToast(weapons.weapon === 'fists' ? 'FISTS' : `${w.name} · ${weapons.ammo[weapons.weapon]} rounds`);
    audio.uiClick();
  }
  if (wasPressed(input, 'Digit1')) {
    selectWeapon(weapons, 'fists');
    hud.showToast('FISTS');
    audio.uiClick();
  }
  if (wasPressed(input, 'Digit2')) {
    selectWeapon(weapons, 'pistol');
    hud.showToast(`PISTOL · ${weapons.ammo.pistol} rounds`);
    audio.uiClick();
  }
  if (wasPressed(input, 'Digit3')) {
    selectWeapon(weapons, 'smg');
    hud.showToast(`SMG · ${weapons.ammo.smg} rounds`);
    audio.uiClick();
  }

  // --- Radio (R): cycle stations, in-car only ---
  if (wasPressed(input, 'KeyR') && state.inCar) {
    const name = audio.nextStation();
    hud.showToast(`♪ ${name}`);
  }

  // --- Garage (G): store / retrieve / buy near the lot ---
  if (wasPressed(input, 'KeyG')) useGarage();

  // --- Enter / exit car (E) ---
  if (wasPressed(input, 'KeyE')) {
    if (state.inCar) {
      exitCar();
    } else {
      const car = nearestCar([...cars, ...traffic], player.x, player.z, 3.6);
      if (car) enterCar(car);
    }
  }

  // --- Move ---
  if (state.inCar && state.car) {
    const drive = readDriveIntent(input);
    // Roadblock units are solid: the player pushes against them, never
    // through them — unless the ram check below smashes the block first.
    const others = [...cars, ...traffic, ...police].filter((c) => c !== state.car);
    if (state.roadblock) others.push(...state.roadblock.cars);
    driveCar(state.car, drive, dt, colliders, others);
    state.x = state.car.x;
    state.z = state.car.z;
    state.heading = state.car.heading;
    state.speed = state.car.speed;
    // Ramming a pedestrian at speed is a crime.
    for (const ped of pedestrians) {
      if (ped.down) continue;
      if (Math.hypot(ped.x - state.x, ped.z - state.z) < 2.4 && Math.abs(state.speed) > 3) {
        knockDownPed(ped);
        if (state.ramCooldown <= 0) {
          addWanted(1, 'you ran someone over');
          state.ramCooldown = 3;
        }
      }
    }
    // Ramming a police car at speed is a crime too.
    for (const unit of police) {
      if (Math.hypot(unit.x - state.x, unit.z - state.z) < 3.4 && Math.abs(state.speed) > 5
        && state.ramCooldown <= 0) {
        addWanted(1, 'you rammed a police car');
        state.ramCooldown = 3;
      }
    }
    // Shoving an Interceptor aside: holding the throttle into a cop car
    // shoves it off the player's line instead of wedging the car against
    // it. A head-on spawn used to pin the car at 0.6 m/s forever — the unit
    // stops at its 2.8 m standoff and never yields, while driveCar's push-out
    // kept halving the player's speed every frame. (Coasting into a cop
    // does not shove: stop and you get busted.)
    if (drive.throttle > 0 && state.shoveCooldown <= 0) {
      for (const unit of police) {
        if (unit.disabled) continue;
        if (Math.hypot(unit.x - state.car.x, unit.z - state.car.z) < 4.5) {
          const fx = Math.sin(state.car.heading);
          const fz = Math.cos(state.car.heading);
          const rx = fz; // right vector, perpendicular to the car's forward
          const rz = -fx;
          const lat = (unit.x - state.car.x) * rx + (unit.z - state.car.z) * rz;
          const side = lat >= 0 ? 1 : -1;
          unit.x += rx * side * 4.5;
          unit.z += rz * side * 4.5;
          unit.speed *= 0.5;
          unit.group.position.set(unit.x, 0, unit.z);
          state.shoveCooldown = 1;
          break;
        }
      }
    }
  } else {
    const intent = readMoveIntent(input);
    updatePlayer(player, intent, mouse, dt, colliders);
    state.x = player.x;
    state.z = player.z;
    state.heading = player.heading;
    state.speed = player.speed;
    audio.footstep(player.moving, intent.run, dt);
  }

  // --- World life ---
  updateTraffic(traffic, dt, colliders);
  updatePedestrians(pedestrians, dt, colliders, state.x, state.z);
  updateTailTarget(tailTarget, dt, colliders);
  tailTarget.beacon.visible = !!liveMission && liveMission.type === 'tail';
  updatePolice(police, dt, state.x, state.z, state.inCar ? state.car : null, colliders, state.time, Math.abs(state.speed));
  updateWanted(dt);
  maybeSpawnRoadblock();
  updateRoadblock(dt);

  // Laying low at the garage sheds a star (30 s cooldown, so one visit is
  // one star — the lot is a breather, not a heat switch).
  if (state.wanted > 0 && garageDistance() < GARAGE.radius + 2
    && state.time - state.lastGarageDecay >= GARAGE.decayCooldown) {
    state.wanted -= 1;
    state.lastGarageDecay = state.time;
    hud.showToast(state.wanted === 0 ? 'Laying low at the garage — heat is off' : `Laying low — ★${state.wanted}`);
  }

  // --- Busted? Cornered by a cop at a standstill for 1.5 s. ---
  // (Not in shot mode: the staged chase must stay a chase, not a game over.)
  if (state.wanted > 0 && !shotMode) {
    const near = nearestPolice();
    const slow = Math.abs(state.speed) < 1.5;
    if (near < 3.5 && slow) {
      state.bustedTimer += dt;
      if (state.bustedTimer >= WANTED.bustedTime) doBusted();
    } else {
      state.bustedTimer = 0;
    }
  } else {
    state.bustedTimer = 0;
  }

  checkMissions();

  // --- Camera ---
  if (state.shotFraming) {
    const [cx, cy, cz] = state.shotFraming.cam;
    const [lx, ly, lz] = state.shotFraming.look;
    camera.position.set(cx, cy, cz);
    camera.lookAt(lx, ly, lz);
  } else if (state.inCar && state.car) {
    const fx = Math.sin(state.car.heading);
    const fz = Math.cos(state.car.heading);
    camPos.set(state.car.x - fx * 9.5, 3.6, state.car.z - fz * 9.5);
    camera.position.lerp(camPos, 1 - Math.exp(-6 * dt));
    camTarget.set(state.car.x + fx * 8, 1.4, state.car.z + fz * 8);
    camera.lookAt(camTarget);
  } else {
    updatePlayerCamera(player, camera, colliders);
  }

  // --- Sound ---
  audio.updateEngine(state.inCar ? Math.min(1, Math.abs(state.speed) / 38) : 0, state.inCar);
  audio.updateSiren(state.wanted >= 2, nearestPolice(), state.time);
  audio.updateRadio(dt, state.inCar);
  if (sea) sea.position.y = -0.4 + Math.sin(state.time * 0.5) * 0.05;

  // --- Autosave ---
  state.saveTimer += dt;
  if (state.saveTimer > 5) {
    state.saveTimer = 0;
    saveGame(state);
  }
}

// Render + HUD + minimap. Runs in the finally block, so it always runs.
function endFrame() {
  renderer.render(scene, camera);
  const mission = currentMission();
  hud.render(
    {
      started: state.started,
      money: state.money,
      wanted: state.wanted,
      missionIndex: state.missionIndex,
      missionNote: state.missionNote,
      inCar: state.inCar,
      speed: state.speed,
      carName: state.carName,
      health: state.health,
      x: state.x,
      z: state.z,
      respect: state.respect,
      weapon: weapons.weapon,
      ammo: weapons.weapon === 'fists' ? null : weapons.ammo[weapons.weapon],
      radioStation: audio.stationName(),
      missionTimer: state.missionTimer,
      surveyStep: state.surveyStep,
      heistPhase: state.heistPhase,
    },
    {
      marker: currentMarkerObj(),
      cameraYaw: state.inCar && state.car ? state.car.heading - Math.PI : player.cameraYaw,
    },
  );
  minimap.draw(
    {
      buildings: city.buildings,
      cars: [...cars, ...traffic],
      police,
      x: state.x,
      z: state.z,
      heading: state.heading,
      missionIndex: state.missionIndex,
      marker: currentMarkerObj(),
      garage: { x: GARAGE.x, z: GARAGE.z },
      roadblock: state.roadblock,
      tailTarget,
    },
    state.time,
  );
  state.frames += 1;
}

// --- Start ------------------------------------------------------------------
function startGame() {
  if (state.started) return;
  state.started = true;
  hud.hideStart();
  audio.unlock();
  audio.uiClick();
}

canvas.addEventListener('click', () => {
  audio.unlock();
  if (!state.started) startGame();
});
window.addEventListener('keydown', () => audio.unlock(), { once: true });

// --- Shot modes -------------------------------------------------------------
if (shotMode) {
  state.started = true;
  hud.hideStart();
  const G = {
    state, player, cars, traffic, pedestrians, police, heli, mara, beam,
    scene, colliders, setInCar,
  };
  stageShotMode(shotMode, G);
  // In shot mode the world still ticks (traffic, heli rotor, strobe) but the
  // staged pose is held: freeze the staged car in place.
  if (shotMode === 'chase') {
    // Keep the pursuit posed: police hold their closing speed.
    for (const unit of police) unit.speed = 30;
  }
}

// --- Debug / playtest handle ------------------------------------------------
window.__vp = {
  state, player, cars, traffic, pedestrians, police, heli, mara,
  weapons, tailTarget, garage, audio, city, missions: MISSIONS,
  version: GAME_VERSION,
  title: GAME_TITLE,
  debug: {
    tp(x, z) {
      player.x = x;
      player.z = z;
      player.group.position.set(x, 0, z);
      state.x = x;
      state.z = z;
      if (state.inCar && state.car) {
        state.car.x = x;
        state.car.z = z;
        state.car.speed = 0;
        state.car.group.position.set(x, 0, z);
      }
    },
    setWanted(n) {
      state.wanted = n;
      state.lastCrimeTime = state.time - 20;
      state.hiddenTimer = 0;
    },
    setMoney(n) {
      state.money = n;
    },
    setRespect(n) {
      state.respect = Math.max(0, Math.min(RESPECT.max, n));
    },
    giveAmmo() {
      refillAmmo(weapons);
    },
    setMissionTimer(n) {
      state.missionTimer = n;
    },
    enterCarById(id) {
      const car = cars.find((c) => c.def.id === id);
      if (!car) return false;
      player.x = car.x;
      player.z = car.z;
      player.group.position.set(car.x, 0, car.z);
      state.x = car.x;
      state.z = car.z;
      enterCar(car);
      return true;
    },
    setMission(i) {
      // Drop any live roadblock first: it belongs to the old job.
      if (state.roadblock) {
        removeRoadblock(scene, state.roadblock);
        state.roadblock = null;
      }
      state.missionIndex = i;
      state.missionNote = '';
      state.escapeArmed = false;
      state.missionFailed = false;
      startMission(i);
    },
    key(code, down) {
      injectKey(input, code, down);
    },
  },
};

// --- Main loop --------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  try {
    update(dt);
  } finally {
    endFrame();
  }
}

if (!shotMode) hud.showStart();
animate();
