// Vice Point — game bootstrap and main loop.
// Wires every module together: renderer, world, city, Ray, cars, traffic,
// police, HUD, minimap and sound. Owns the game state (money, wanted level,
// mission, save), the start screen flow, entering and exiting cars, mission
// completion, and the screenshot modes from shots.js.

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
  spawnHelicopter,
  nearestCar,
  updateDriving,
  updateTraffic,
  updatePoliceChase,
  updateHelicopter,
  updateCarCamera,
  updateChaseCamera,
} from './vehicles.js';
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

const state = {
  started: false,
  shotMode: null,
  money: START.money,
  wanted: 0,
  missionIndex: 0,
  missionsDone: [],
  health: 100,
  inCar: false,
  carName: '',
  speed: 0,
  x: START.position.x,
  z: START.position.z,
  heading: START.heading,
  time: 0,
  frames: 0,
};

const player = createPlayer(scene, START);
const streetCars = spawnStreetCars(scene, seed);
const traffic = spawnTraffic(scene, seed);
let currentCar = null;
let police = null;
let heli = null;
let policeChaseActive = false;
let heliActive = false;
let missionToastShown = false;

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
    pedestrians.push({
      group, legL, legR,
      x: group.position.x, z: group.position.z,
      heading: rng() * Math.PI * 2,
      speed: 1.1 + rng() * 0.7,
      phase: rng() * 6,
      wander: 0,
    });
  }
}

// Mission marker: a glowing beacon column + floating diamond at the target.
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
  if (!mission) {
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

function spawnPoliceChase() {
  if (!police) police = spawnPolice(scene);
  // Spawn on a road line behind the player, never inside a building.
  police.x = Math.round((state.x + 40) / CITY.blockSize) * CITY.blockSize;
  police.z = state.z + 30;
  police.speed = 20;
  policeChaseActive = true;
}

function launchHelicopter() {
  if (!heli) heli = spawnHelicopter(scene);
  heliActive = true;
}

function enterCar(car, silent) {
  currentCar = car;
  state.inCar = true;
  state.carName = car.def.name;
  player.group.visible = false;
  if (!silent) {
    hud.showToast(`You stole the ${car.def.name}!`);
    audio.uiClick();
    if (state.wanted < 1) setWanted(1);
  }
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

function setWanted(stars) {
  const before = state.wanted;
  state.wanted = Math.max(0, Math.min(WANTED.maxStars, stars));
  if (state.wanted >= 2 && before < 2) {
    spawnPoliceChase();
    audio.wantedSting();
    hud.showToast('The VCPD is on you!');
  }
  if (state.wanted >= 4 && !heliActive) launchHelicopter();
  if (state.wanted === 0) policeChaseActive = false;
}

function completeMission() {
  const mission = MISSIONS[state.missionIndex];
  if (!mission) return;
  state.money += mission.reward;
  state.missionsDone.push(mission.id);
  hud.showToast(`${mission.title} complete! +$${mission.reward}`);
  audio.missionChime();
  state.missionIndex = (state.missionIndex + 1) % MISSIONS.length;
  saveGame(state);
}

function startGame() {
  audio.unlock();
  state.started = true;
  hud.hideStart();
  hud.hideGameOver();
  audio.uiClick();
}

function gameOver() {
  state.started = false;
  hud.showGameOver();
  saveGame(state);
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
}

const shot = shotFromUrl();
const gameApi = {
  state, player, cars: streetCars, traffic,
  enterCar, spawnPoliceChase, spawnHelicopter: launchHelicopter,
  get police() { return police; },
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
  streetCars,
  traffic,
  pedestrians,
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
  // Live pursuit state, for the playtest and for later stages.
  get policeActive() { return policeChaseActive; },
  get heliActive() { return heliActive; },
  get police() { return police; },
  get heli() { return heli; },
};

const clock = new THREE.Clock();
let saveTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // clamp: SwiftShader runs slow
  state.time += dt;
  state.frames += 1;

  if (state.started) {
    const mouse = drainMouse(input);
    if (wasPressed(input, 'Enter') && !state.shotMode) startGame();
    if (wasPressed(input, 'KeyE') && !state.shotMode) {
      if (state.inCar) exitCar();
      else {
        const car = nearestCar(streetCars, player.x, player.z, 5);
        if (car) enterCar(car, false);
      }
    }
    if (wasPressed(input, 'KeyM')) {
      hud.showToast('Map: follow the yellow diamond');
    }

    if (state.inCar && currentCar) {
      const intent = readDriveIntent(input);
      // In chase shot mode the car keeps rolling on its own for the frame.
      if (state.shotMode === 'chase' && intent.throttle === 0) intent.throttle = 1;
      updateDriving(currentCar, intent, dt, colliders, [...streetCars, ...traffic, ...(police ? [police] : [])]);
      state.speed = currentCar.speed;
      state.x = currentCar.x;
      state.z = currentCar.z;
      player.x = currentCar.x;
      player.z = currentCar.z;
      player.heading = currentCar.heading;
      updateCarCamera(currentCar, camera, mouse, colliders);
      if (state.shotMode === 'chase') updateChaseCamera(currentCar, police, camera);
      audio.updateEngine(Math.abs(currentCar.speed) / currentCar.def.topSpeed, true);
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

    // Mission arrival check.
    const mission = MISSIONS[state.missionIndex];
    if (mission && Math.hypot(state.x - mission.marker.x, state.z - mission.marker.z) < 6) {
      completeMission();
    }

    // Police chase.
    if (policeChaseActive && police) {
      const dist = updatePoliceChase(police, state.x, state.z, dt, colliders, [...streetCars, ...traffic]);
      if (dist < 4.5 && state.inCar) {
        state.health -= 12 * dt;
        if (state.health <= 0) gameOver();
      }
      if (dist > WANTED.policeDespawnRadius && state.wanted < 2) policeChaseActive = false;
    }
    if (heliActive && heli) updateHelicopter(heli, state.x, state.z, dt, state.time);

    // Traffic and pedestrians keep the city alive.
    updateTraffic(traffic, dt, city.span);
    for (const ped of pedestrians) {
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
    hud.render(state);
    minimap.draw({
      x: state.x, z: state.z, heading: player.heading,
      buildings: city.buildings, cars: [...streetCars, ...traffic],
      police: policeChaseActive ? police : null,
      missionIndex: state.missionIndex,
    }, state.time);
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

  updateMissionMarker(state.time);
  renderer.render(scene, camera);

  if (state.frames === 30) {
    window.__VICE_READY__ = true;
  }
}

animate();
