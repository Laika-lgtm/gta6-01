// Vice Point — entry point: boot, game loop, game state, save.
// Ray Delgado walks and drives through a procedural Vice City, steals cars,
// dodges the VCPD wanted system and runs Mara Voss's three-job chain.
// The animate loop is wrapped try/finally so endFrame() — render, HUD,
// minimap — always runs, even if one update throws.

import * as THREE from 'three';
import { GAME_TITLE, SAVE_KEY, GAME_VERSION, CITY, PLAYER, CAR_DEFS, POLICE_DEF, WANTED, MISSIONS, START } from './config.js';
import { buildWorld } from './world.js';
import { buildCity } from './city.js';
import { createPlayer, updatePlayer, updatePlayerCamera } from './player.js';
import { createRenderer, createCamera } from './render.js';
import { createHud, saveGame, loadGame } from './hud.js';
import { createMinimap } from './minimap.js';
import { createInput, readMoveIntent, readDriveIntent, wasPressed, drainMouse, injectKey } from './input.js';
import { createAudio } from './audio.js';
import { createCombat, tryPunch, updateCombat, knockDownPed, PUNCH } from './combat.js';
import { seedFromUrl } from './random.js';
import {
  createStreetCars, createTraffic, createPedestrians, updateTraffic, updatePedestrians,
  ensurePoliceCount, despawnPolice, nearestPoliceDistance, updatePolice,
  createHeli, updateHeli, driveCar, nearestCar,
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
  saveTimer: 0,
  shotFraming: null,
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
    player.x = saved.x;
    player.z = saved.z;
    player.heading = saved.heading;
    player.group.position.set(saved.x, 0, saved.z);
    if (state.missionIndex < MISSIONS.length && MISSIONS[state.missionIndex].type === 'escape') {
      state.escapeArmed = state.wanted > 0;
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
  updateHeli(heli, dt, state.x, state.z, state.wanted >= WANTED.heliAtStars, state.time);
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

function advanceMission() {
  const mission = currentMission();
  if (!mission) return;
  state.money += mission.reward;
  state.missionsDone.push(mission.id);
  state.missionNote = '';
  audio.missionChime();
  hud.showToast(`${mission.title} done — +$${mission.reward}`);
  // Advance FIRST, then save: saving before the increment wrote the old
  // missionIndex to disk, so a reload within 5 s (before the next autosave)
  // replayed the just-finished job — and paid its reward a second time.
  state.missionIndex += 1;
  saveGame(state);
  const next = currentMission();
  if (next && next.type === 'escape') {
    // Heat starts hot: two stars on your tail the moment the job begins.
    addWanted(2, 'Mara’s package drew the cops');
    state.escapeArmed = true;
    state.missionFailed = false;
  }
}

function checkMissions() {
  if (state.busted) return;
  const mission = currentMission();
  if (!mission) return;
  if (mission.type === 'reach') {
    if (mission.marker && Math.hypot(state.x - mission.marker.x, state.z - mission.marker.z) < 7) {
      advanceMission();
    }
  } else if (mission.type === 'escape') {
    // Escape has NO marker (null on purpose) — the stars are the objective.
    if (state.escapeArmed && state.wanted === 0) {
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
    // Automatic Heat retry: the job restarts with two stars on your tail.
    state.missionFailed = false;
    addWanted(2, 'Heat is back on — lose them this time');
    state.escapeArmed = true;
    hud.showToast('Heat — lose the cops!');
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

  // --- Punch (F) ---
  if (wasPressed(input, 'KeyF') && !state.inCar) {
    const res = tryPunch(combat, player, pedestrians, police, onPunchHit);
    audio.punchThud(res.hit);
  }
  updateCombat(combat, player, dt);

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
    const others = [...cars, ...traffic, ...police].filter((c) => c !== state.car);
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
  updatePolice(police, dt, state.x, state.z, state.inCar ? state.car : null, colliders, state.time, Math.abs(state.speed));
  updateWanted(dt);

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
    },
    {
      marker: mission ? mission.marker : null,
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
      state.missionIndex = i;
      state.missionNote = '';
      state.escapeArmed = false;
      state.missionFailed = false;
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
