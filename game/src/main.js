// Vice Point boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// The game moves between four screens: title, play, paused and over.
// Stealing a car raises the wanted level; the police answer it; getting
// caught means a $100 fine and, on an escape mission, a failed mission.
// Mara Voss's eight missions chain in order — Pickup $300, Heat Escape
// $400, Getaway Car $600, The Drop $800 (75 s), Tail the Mark $1,100,
// The Survey $1,500 (respect 20), Roadblock Run $1,700, The Big Heist
// $1,900 (respect 30) — on a $250 start, so the chain ends at $8,550.
// Ray carries fists, a pistol (24) and an SMG (60); Air One can be shot
// down for $500; roadblocks guard escape missions at wanted 3+; three
// radio stations play only in a car; a garage hides cars and sheds heat.
//
// ?seed=N fixes the city. ?shot=chase|mission|drive|street (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import {
  CAR, CITY, GARAGE, GETAWAY_CAR_INDEX, HEIST_ESCAPE_TARGET, MARK_CAR_INDEX,
  MISSION_TARGETS, MISSIONS, PLAYER, POLICE, RADIO_STATIONS, RESPECT, STEP,
} from './config.js';
import { createRenderer } from './render.js';
import { createWorld } from './world.js';
import { createCity } from './city.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import {
  ACTION_CONFIRM, ACTION_ENTER, ACTION_GARAGE, ACTION_MUTE, ACTION_PAUSE,
  ACTION_PUNCH, ACTION_RADIO, ACTION_WEAPON_1, ACTION_WEAPON_2,
  ACTION_WEAPON_3, ACTION_WEAPON_NEXT, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { applyShotHud, stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const BUSTED_FINE = 100;
const TAIL_NEEDED = 25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CITY.seed;

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const world = createWorld(renderer.scene);
const city = createCity(renderer.scene);
// The camera needs the building boxes so it can stay out of the walls.
renderer.setColliders(city.colliders);
const player = createPlayer(renderer.scene, city.colliders);
const vehicles = createVehicles(renderer.scene, city.colliders);
const pedestrians = createPedestrians(renderer.scene);
const hud = createHud();
const minimap = createMinimap();
const audio = createAudio();
const input = createInput(canvas);

const game = {
  player,
  vehicles,
  pedestrians,
  driving: null,
  missionIndex: 0,
  // The getaway and heist missions have two legs. Every other mission is
  // a single leg.
  missionPhase: 0,
  lastPoliceDistance: null,
  lastHotToast: -10,
  // The Drop's countdown, in seconds of game time; null off the mission.
  missionTimeLeft: null,
  // Tail the Mark: seconds of clean tailing banked, out of TAIL_NEEDED.
  tailProgress: 0,
  tailSpottedTimer: 0,
  // The garage: ownership, the car stashed inside, and the hide cooldown.
  garageOwned: false,
  garageCar: null,
  garageCooldown: 0,
  // Radio station index while driving; -1 means the radio is off.
  radioStation: 0,
  // Lost-cops clock: 20 s out of sight and a star decays — then the fleet
  // returns, respawning back on Ray's tail.
  lostTimer: 0,
  lastRoadblockToast: -10,
  camera: {
    snapTo(x, z, yaw, distance = 11, height = 5.5) {
      renderer.camera.position.set(x - Math.sin(yaw) * distance, height, z - Math.cos(yaw) * distance);
      renderer.camera.lookAt(x + Math.sin(yaw) * 4, 1.6, z + Math.cos(yaw) * 4);
    },
  },
};

// The mission beacon: a pink light pillar and a pulsing ring on the ground
// at the current objective, so the player can find it from anywhere.
const beaconBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.4, 1.4, 70, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xff4d8d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
);
beaconBeam.position.y = 35;
const beaconRing = new THREE.Mesh(
  new THREE.RingGeometry(4, 6, 32),
  new THREE.MeshBasicMaterial({ color: 0xff4d8d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
);
beaconRing.rotation.x = -Math.PI / 2;
beaconRing.position.y = 0.15;
const beacon = new THREE.Group();
beacon.add(beaconBeam);
beacon.add(beaconRing);
renderer.scene.add(beacon);

// Air One's warning-shot tracer: a red line from the heli to Ray, shown
// for a beat when a warning shot lands.
const tracerGeo = new THREE.BufferGeometry();
tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const tracer = new THREE.Line(
  tracerGeo,
  new THREE.LineBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.9 }),
);
tracer.visible = false;
tracer.frustumCulled = false;
renderer.scene.add(tracer);
let tracerTimer = 0;

let screen = 'title';
let time = 0;
let lastNow = 0;
let lastFootstep = 0;

function currentMission() {
  return MISSIONS[game.missionIndex % MISSIONS.length] ?? null;
}

/** True when the current mission's respect gate is satisfied. */
function gateOpen(mission) {
  return !mission || !mission.respect || player.state.respect >= mission.respect;
}

/**
 * Where the current objective is. The getaway mission's first leg points
 * at the getaway car itself, the tail points at the mark, the heist's
 * second leg points at the safehouse; every other leg points at a fixed
 * target. Returns null when there is no objective to point at — callers
 * must handle that, never assume a target exists.
 */
function missionTarget() {
  const mission = currentMission();
  if (!mission) return null;
  if (mission.type === 'getaway' && game.missionPhase === 0) {
    const car = vehicles.cars[GETAWAY_CAR_INDEX];
    if (!car) return null;
    return { x: car.x, z: car.z };
  }
  if (mission.type === 'tail') {
    const car = vehicles.cars[MARK_CAR_INDEX];
    if (!car) return null;
    return { x: car.x, z: car.z };
  }
  if (mission.type === 'heist' && game.missionPhase === 1) {
    return HEIST_ESCAPE_TARGET;
  }
  return MISSION_TARGETS[game.missionIndex % MISSION_TARGETS.length] ?? null;
}

/** The HUD line for the current leg; null means the mission's own text. */
function missionText() {
  const mission = currentMission();
  if (!mission) return null;
  if (!gateOpen(mission)) {
    return `Mara Voss: that job needs respect ${mission.respect} — you're at ${player.state.respect}. Steal cars, lose the heat, shoot down Air One.`;
  }
  if (mission.type === 'getaway' && game.missionPhase === 0) {
    return 'Mara Voss: steal the gold getaway car on Coral Way.';
  }
  if (mission.type === 'getaway' && game.missionPhase === 1) {
    return 'Mara Voss: drive the getaway car to the marina drop.';
  }
  if (mission.type === 'timed') {
    return `Mara Voss: run the package across town — ${Math.ceil(game.missionTimeLeft ?? mission.timeLimit)} seconds, no excuses.`;
  }
  if (mission.type === 'tail') {
    return `Mara Voss: follow the mark. Stay close, never get spotted — ${Math.floor(game.tailProgress)}/${TAIL_NEEDED}s.`;
  }
  if (mission.type === 'heist' && game.missionPhase === 0) {
    return 'Mara Voss: crack the vault on Ocean Drive. Then get out clean.';
  }
  if (mission.type === 'heist' && game.missionPhase === 1) {
    return 'Mara Voss: the vault is cracked — lose the cops and reach the safehouse!';
  }
  return null;
}

/** Entry effects for a mission that has just become current. */
function startMission(index) {
  const mission = MISSIONS[index % MISSIONS.length];
  if (!mission) return;
  game.missionTimeLeft = mission.type === 'timed' ? mission.timeLimit : null;
  game.tailProgress = 0;
  game.tailSpottedTimer = 0;
  if (mission.type === 'tail') {
    const spot = vehicles.snapToRoad(player.state.x + 30, player.state.z + 10);
    vehicles.startMark(spot.x, spot.z);
    hud.toast('Tail the mark — stay in the gold zone, don\'t get spotted.');
    hud.announce('Tail the mark. Follow him without being spotted.');
  }
  if (mission.type === 'escape') {
    // The heat is the mission: an escape starts with the cops already
    // on you, three stars deep.
    player.state.wanted = 3;
    hud.toast("Mara Voss: the heat is on! Lose them and reach the safehouse.");
    hud.announce('Escape. Wanted level three. Reach the safehouse.');
  }
  if (mission.type === 'heist') {
    hud.toast("Mara Voss: the vault job. Respect 30 — don't blow it.");
  }
  if (!gateOpen(mission)) {
    hud.toast(`That job needs respect ${mission.respect}. Raise it first.`);
    hud.announce(`Mission locked. Needs respect ${mission.respect}.`);
  }
}

function updateBeacon() {
  const target = missionTarget();
  if (!target) {
    beacon.visible = false;
    return;
  }
  beacon.visible = true;
  beacon.position.set(target.x, 0, target.z);
  const pulse = 1 + Math.sin(time * 3) * 0.12;
  beaconRing.scale.set(pulse, pulse, 1);
  beaconBeam.material.opacity = 0.22 + Math.sin(time * 3) * 0.08;
}

function hudState() {
  const driving = game.driving;
  return {
    money: player.state.money,
    wanted: player.state.wanted,
    respect: player.state.respect,
    weapon: player.state.weapon,
    ammo: player.state.ammo[player.state.weapon] ?? 0,
    radioStation: driving ? RADIO_STATIONS[game.radioStation % RADIO_STATIONS.length].name : null,
    missionTimeLeft: game.missionTimeLeft,
    garageOwned: game.garageOwned,
    missionIndex: game.missionIndex,
    missionText: missionText(),
    health: player.state.health,
    speed: driving ? driving.speed : player.state.speed,
    driving: Boolean(driving),
    carName: driving ? driving.name : null,
    x: player.state.x,
    z: player.state.z,
  };
}

function minimapState() {
  const policeInfo = { x: vehicles.police.x, z: vehicles.police.z };
  return {
    player: { x: player.state.x, z: player.state.z, yaw: player.state.yaw },
    cars: vehicles.cars.map((c) => ({ x: c.x, z: c.z })),
    peds: pedestrians.peds.map((p) => ({ x: p.x, z: p.z })),
    police: policeInfo,
    heli: { x: vehicles.heli.position.x, z: vehicles.heli.position.z },
    wanted: player.state.wanted,
    missionTarget: missionTarget(),
    garage: { x: GARAGE.x, z: GARAGE.z },
    garageOwned: game.garageOwned,
    roadblock: game.roadblock ?? { active: false, x: 0, z: 0 },
    mark: {
      x: vehicles.cars[MARK_CAR_INDEX].x,
      z: vehicles.cars[MARK_CAR_INDEX].z,
      active: vehicles.markState.active,
    },
  };
}

function completeMission(mission) {
  player.state.money += mission.pay;
  player.addRespect(RESPECT.perMission);
  hud.toast(`Mission complete: ${mission.title} — +$${mission.pay} · respect +${RESPECT.perMission}`);
  hud.announce(`Mission complete. ${mission.title}. Earned $${mission.pay}.`);
  audio.blip(true);
  // The save goes AFTER the mission index moves, so a reload never
  // replays a mission that already paid out.
  game.missionIndex += 1;
  game.missionPhase = 0;
  game.missionTimeLeft = null;
  game.tailProgress = 0;
  vehicles.stopMark();
  if (player.state.wanted > 0) player.state.wanted = Math.max(0, player.state.wanted - 1);
  startMission(game.missionIndex);
  hud.save({ ...hudState(), missionIndex: game.missionIndex });
}

/** The tail mission banks progress every step; this is where it lives. */
function updateTail(dt) {
  const mission = currentMission();
  if (!mission || mission.type !== 'tail' || !gateOpen(mission)) return;
  const mark = vehicles.cars[MARK_CAR_INDEX];
  const dist = Math.hypot(mark.x - player.state.x, mark.z - player.state.z);
  if (dist < 8) {
    // Spotted: two seconds nose-to-tail and the mark makes Ray.
    game.tailSpottedTimer += dt;
    if (game.tailSpottedTimer > 2) {
      game.tailSpottedTimer = 0;
      game.tailProgress = Math.max(0, game.tailProgress - 8);
      player.state.wanted = Math.min(5, player.state.wanted + 1);
      hud.toast('He spotted you! Back off before he calls it in.');
      hud.announce('Spotted. Back off.');
    }
    return;
  }
  game.tailSpottedTimer = 0;
  if (dist >= 12 && dist <= 45) {
    game.tailProgress += dt;
    if (game.tailProgress >= TAIL_NEEDED) completeMission(mission);
  } else if (dist > 60) {
    game.tailProgress = Math.max(0, game.tailProgress - dt * 0.5);
    if (time - game.lastHotToast > 4) {
      game.lastHotToast = time;
      hud.toast("You're losing him — get closer!");
    }
  }
}

function checkMission() {
  const mission = currentMission();
  if (!mission) return;
  if (!gateOpen(mission)) return;
  // The getaway's first leg is finished by getting into the car, not by
  // standing next to it — the target check below is for the drop.
  if (mission.type === 'getaway' && game.missionPhase === 0) return;
  // The tail completes on banked time, not on reaching a point.
  if (mission.type === 'tail') return;
  const target = missionTarget();
  if (!target) return;
  const dx = player.state.x - target.x;
  const dz = player.state.z - target.z;
  if (Math.hypot(dx, dz) >= 9) return;
  if (mission.type === 'heist' && game.missionPhase === 0) {
    // The vault is cracked: now the whole precinct is coming, and Ray
    // has to get out clean.
    game.missionPhase = 1;
    player.state.wanted = 4;
    hud.toast('Vault cracked! Now lose the cops and reach the safehouse!');
    hud.announce('Vault cracked. Wanted level four. Reach the safehouse.');
    audio.blip(true);
    return;
  }
  if (mission.type === 'escape' || (mission.type === 'heist' && game.missionPhase === 1)) {
    // An escape only counts once the cops are actually off you.
    if (game.lastPoliceDistance !== null && game.lastPoliceDistance < 20) {
      if (time - game.lastHotToast > 3) {
        game.lastHotToast = time;
        hud.toast('Too hot — shake the cops first!');
      }
      return;
    }
  }
  completeMission(mission);
}

/** The police caught Ray: a $100 fine, a reset, and a failed mission if
 * the escape was the one running. */
function doBusted() {
  const mission = currentMission();
  const fine = Math.min(BUSTED_FINE, player.state.money);
  player.state.money -= fine;
  const failedEscape = mission !== null && (mission.type === 'escape' || mission.type === 'heist');
  audio.setRadio(-1);
  screen = 'over';
  const failedLine = failedEscape
    ? '<p>Mara\'s escape is blown — you\'ll have to run it again.</p>'
    : '';
  hud.showScreen(
    `<h1>BUSTED</h1><h2>THE VICE POINT POLICE CAUGHT UP WITH YOU</h2><p>Ray spends the night in a cell and pays a $${fine} fine. The debt is still waiting.</p>${failedLine}<button>TRY AGAIN</button><div class="keys">Your money and mission progress are saved.</div>`,
    'TRY AGAIN',
    () => {
      player.state.health = 100;
      player.state.wanted = 0;
      game.driving = null;
      player.setPosition(PLAYER.startX, PLAYER.startZ, 0);
      if (failedEscape) {
        // The escape re-arms: the cops are on you again from the start.
        player.state.wanted = 3;
      }
      if (currentMission() && currentMission().type === 'timed') {
        game.missionTimeLeft = currentMission().timeLimit;
      }
      if (currentMission() && currentMission().type === 'tail') {
        // The mark drove on while Ray was in the cell — restart the tail
        // from scratch instead of leaving him halfway across the city.
        game.tailProgress = 0;
        game.tailSpottedTimer = 0;
        const spot = vehicles.snapToRoad(PLAYER.startX + 30, PLAYER.startZ + 10);
        vehicles.startMark(spot.x, spot.z);
      }
      screen = 'play';
      hud.hideScreen();
      hud.save({ ...hudState(), missionIndex: game.missionIndex });
    },
  );
  hud.announce(failedEscape ? 'Busted. Mission failed. One hundred dollar fine.' : 'Busted. One hundred dollar fine.');
  hud.save({ ...hudState(), missionIndex: game.missionIndex });
}

function pauseGame() {
  if (screen !== 'play') return;
  screen = 'paused';
  audio.setSiren(false);
  audio.setRadio(-1);
  audio.setEngine(0, CAR.maxSpeed, false);
  hud.showScreen(
    '<h1>PAUSED</h1><h2>VICE POINT WAITS FOR NO ONE — EXCEPT NOW</h2><p>Take a breath. The city will still be here.</p><button>RESUME</button><div class="keys">WASD walk &amp; drive · Mouse look · Shift run · Space brake · E enter / exit car · F fire / punch · Q weapon · R radio · G garage · M mute</div>',
    'RESUME',
    () => {
      screen = 'play';
      hud.hideScreen();
      if (game.driving) audio.setRadio(game.radioStation);
    },
  );
  hud.announce('Paused.');
}

/** Fire the armed weapon at whatever is in front of Ray. */
function fireWeapon() {
  const result = player.fire();
  if (result === 'cooling') return;
  if (result === 'empty') {
    hud.toast('Out of ammo — back to fists.');
    player.state.weapon = 'fists';
    return;
  }
  if (result === 'fists') {
    // The punch swing: same targets as before, at arm's length.
    const ped = pedestrians.nearestPed(player.state.x, player.state.z, PLAYER.punchRange);
    const policeDist = Math.hypot(vehicles.police.x - player.state.x, vehicles.police.z - player.state.z);
    if (ped) {
      pedestrians.fleeFrom(ped, player.state.x, player.state.z);
      player.state.wanted = Math.min(5, player.state.wanted + 1);
      hud.toast('You punched a pedestrian! Someone called the cops.');
      hud.announce('You punched a pedestrian. Wanted level up.');
      audio.blip(false);
    } else if (policeDist < 2.8 && player.state.wanted >= 2 && vehicles.police.downTimer <= 0) {
      vehicles.police.speed = 0;
      player.state.wanted = Math.min(5, player.state.wanted + 1);
      hud.toast('You shoved the cop! That was a mistake.');
      hud.announce('You shoved a police officer. Wanted level up.');
      audio.blip(false);
    } else {
      audio.blip(false);
    }
    return;
  }
  // A gunshot: the first thing inside the firing cone takes the hit.
  audio.gunshot();
  const yaw = player.state.camYaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const inCone = (tx, tz, maxDist, halfAngle) => {
    const dx = tx - player.state.x;
    const dz = tz - player.state.z;
    const dist = Math.hypot(dx, dz);
    if (dist > maxDist || dist < 0.01) return 0;
    const dot = (dx * fx + dz * fz) / dist;
    return dot > Math.cos(halfAngle) ? dist : 0;
  };
  const heliDist = inCone(vehicles.heli.position.x, vehicles.heli.position.z, 55, 0.45);
  if (heliDist > 0 && vehicles.heli.visible) {
    const outcome = vehicles.hitHeli();
    if (outcome === 'down') {
      player.state.money += POLICE.heliReward;
      player.addRespect(RESPECT.perHeliDown);
      hud.toast(`Air One is down! +$${POLICE.heliReward} · respect +${RESPECT.perHeliDown}`);
      hud.announce('Helicopter shot down. Five hundred dollars.');
      audio.blip(true);
    } else if (outcome === 'hit') {
      hud.toast(`Hit Air One! ${vehicles.heliState.health} hits to go.`);
    }
    return;
  }
  const policeDist = inCone(vehicles.police.x, vehicles.police.z, 30, 0.35);
  if (policeDist > 0 && vehicles.police.downTimer <= 0 && player.state.wanted >= 1) {
    const outcome = vehicles.hitPolice();
    player.state.wanted = Math.min(5, player.state.wanted + 1);
    if (outcome === 'down') {
      hud.toast('Interceptor down! It will be back in 8 seconds — move!');
      hud.announce('Police car knocked out. Eight seconds.');
    } else {
      hud.toast('Hit the Interceptor — it stalled!');
    }
    return;
  }
  const ped = pedestrians.nearestPed(player.state.x, player.state.z, 20);
  if (ped && inCone(ped.x, ped.z, 20, 0.35) > 0) {
    pedestrians.fleeFrom(ped, player.state.x, player.state.z);
    player.state.wanted = Math.min(5, player.state.wanted + 1);
    hud.toast('You shot at a pedestrian! Someone called the cops.');
    hud.announce('You fired at a pedestrian. Wanted level up.');
  }
}

function switchWeapon(next) {
  const order = ['fists', 'pistol', 'smg'];
  if (next) {
    player.state.weapon = next;
  } else {
    const i = order.indexOf(player.state.weapon);
    player.state.weapon = order[(i + 1) % order.length];
  }
  const spec = { fists: 'FISTS', pistol: 'PISTOL', smg: 'SMG' }[player.state.weapon];
  const ammo = player.state.weapon === 'fists' ? '∞' : player.state.ammo[player.state.weapon];
  hud.toast(`${spec} — ${ammo} rounds.`);
  audio.blip(false);
}

/** G near the garage: buy it, stash a car, or take the stashed car out. */
function garageAction() {
  const dist = Math.hypot(player.state.x - GARAGE.x, player.state.z - GARAGE.z);
  if (dist > 12) return;
  if (!game.garageOwned) {
    const price = player.state.respect >= GARAGE.discountRespect ? GARAGE.discountPrice : GARAGE.price;
    if (player.state.money < price) {
      hud.toast(`The garage costs $${price} — you're $${price - player.state.money} short.`);
      return;
    }
    player.state.money -= price;
    game.garageOwned = true;
    hud.toast(`Garage bought for $${price}! Park a car inside with G.`);
    hud.announce('Garage bought.');
    audio.blip(true);
    hud.save({ ...hudState(), missionIndex: game.missionIndex });
    return;
  }
  if (game.driving) {
    const car = game.driving;
    game.garageCar = car;
    game.driving = null;
    car.speed = 0;
    car.x = 1000;
    car.z = 1000;
    car.mesh.group.visible = false;
    player.setPosition(GARAGE.x, GARAGE.z + 12, 0);
    hud.toast(`The ${car.name} is stashed in the garage.`);
    hud.announce('Car stored in the garage.');
    audio.blip(true);
    return;
  }
  if (game.garageCar) {
    const car = game.garageCar;
    game.garageCar = null;
    car.x = GARAGE.x;
    car.z = GARAGE.z + 16;
    car.yaw = 0;
    car.mesh.group.visible = true;
    car.mesh.group.position.set(car.x, 0, car.z);
    car.mesh.group.rotation.y = 0;
    hud.toast(`The ${car.name} is back out. E to get in.`);
    hud.announce('Car retrieved from the garage.');
    audio.blip(true);
  } else {
    hud.toast('The garage is empty — drive a car in and press G.');
  }
}

function stepGame(dt) {
  const move = input.move();
  const look = input.takeLook();
  player.state.camYaw -= look.dx * 0.0032;
  player.state.camYaw = ((player.state.camYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    hud.toast(muted ? 'Sound off' : 'Sound on');
  }
  if (actions & ACTION_PAUSE) {
    pauseGame();
    return;
  }
  if (actions & ACTION_WEAPON_NEXT) switchWeapon(null);
  if (actions & ACTION_WEAPON_1) switchWeapon('fists');
  if (actions & ACTION_WEAPON_2) switchWeapon('pistol');
  if (actions & ACTION_WEAPON_3) switchWeapon('smg');
  if (actions & ACTION_RADIO) {
    if (game.driving) {
      game.radioStation = (game.radioStation + 1) % RADIO_STATIONS.length;
      audio.setRadio(game.radioStation);
      hud.toast(`♪ ${RADIO_STATIONS[game.radioStation].name}`);
    } else {
      hud.toast('The radio only plays in a car.');
    }
  }
  if (actions & ACTION_GARAGE) garageAction();

  if (actions & ACTION_ENTER) {
    if (game.driving) {
      const car = game.driving;
      game.driving = null;
      player.setPosition(car.x + 2.4, car.z, car.yaw);
      player.state.camYaw = car.yaw;
      hud.toast('You left the car.');
      audio.setRadio(-1);
      audio.blip(false);
    } else {
      const car = vehicles.nearestCar(player.state.x, player.state.z, 4.5);
      // The mark's own car is off limits during the tail — stealing it
      // would end the mission before it starts, and the mark drives it.
      const mission = currentMission();
      if (car && mission && mission.type === 'tail' && car === vehicles.cars[MARK_CAR_INDEX]) {
        hud.toast("That's the mark's car — don't touch it.");
      } else if (car) {
        game.driving = car;
        if (!car.stolen) player.addRespect(RESPECT.perCarStolen);
        car.stolen = true;
        if (player.state.wanted < 2) player.state.wanted = 2;
        hud.toast(`You stole the ${car.name}! The cops noticed.`);
        hud.announce(`Stole the ${car.name}. Wanted level ${player.state.wanted}.`);
        audio.setRadio(game.radioStation);
        audio.blip(true);
        // Stealing the getaway car starts its second leg: the drive out.
        const mission = currentMission();
        if (mission && mission.type === 'getaway' && game.missionPhase === 0 && car === vehicles.cars[GETAWAY_CAR_INDEX]) {
          game.missionPhase = 1;
          hud.toast('Got the getaway car — now drive it to the marina drop!');
          hud.announce('Got the getaway car. Drive to the marina drop.');
        }
      }
    }
  }

  if ((actions & ACTION_PUNCH) && !game.driving) {
    fireWeapon();
  }

  if (game.driving) {
    vehicles.drive(game.driving, dt, move);
    // Head-on with the Interceptor at a crawl: shove sideways 4.5 m so
    // the chase can move again instead of deadlocking bumper to bumper.
    if (vehicles.applyShove(game.driving, move, vehicles.police)) {
      hud.toast('You shoved past the Interceptor!');
    }
    player.setPosition(game.driving.x, game.driving.z, game.driving.yaw);
    player.state.camYaw = game.driving.yaw;
    audio.setEngine(game.driving.speed, CAR.maxSpeed, true);
  } else {
    player.update(dt, move);
    audio.setEngine(0, CAR.maxSpeed, false);
    if (player.state.moving && time - lastFootstep > 0.42) {
      lastFootstep = time;
      audio.footstep();
    }
  }

  const police = vehicles.update(dt, time, player.position(), player.state.wanted);
  game.lastPoliceDistance = police.policeDistance;
  audio.setSiren(player.state.wanted >= 2);
  // Air One's warning shots: at wanted 4+ the heli fires at Ray on foot.
  if (police.heliWarningShot && !game.driving && player.state.wanted >= POLICE.warningShotWanted) {
    const pos = tracer.geometry.attributes.position;
    pos.setXYZ(0, vehicles.heli.position.x, vehicles.heli.position.y, vehicles.heli.position.z);
    pos.setXYZ(1, player.state.x, 1.2, player.state.z);
    pos.needsUpdate = true;
    tracer.visible = true;
    tracerTimer = 0.18;
    player.state.health -= POLICE.warningShotDamage;
    hud.toast('Air One is firing warning shots — get under cover!');
    if (player.state.health <= 0) {
      player.state.health = 0;
      doBusted();
      return;
    }
  }
  if (player.state.wanted >= 2 && police.policeDistance < 4 && !game.driving) {
    player.state.health -= dt * 6;
    if (player.state.health <= 0) {
      player.state.health = 0;
      doBusted();
      return;
    }
  }
  // Boxed in while driving: the Interceptor on your bumper at a crawl
  // means the chase is over too.
  if (game.driving && player.state.wanted >= 2 && police.policeDistance < 3.5 && Math.abs(game.driving.speed) < 3) {
    doBusted();
    return;
  }

  // Roadblocks guard escape missions at wanted 3+: ram through or go
  // around, but hitting one at speed stops the car cold.
  const mission = currentMission();
  const roadblock = vehicles.updateRoadblock(
    player.state.wanted,
    mission ? mission.type : null,
    player.position(),
    game.driving ? game.driving.yaw : player.state.camYaw,
  );
  game.roadblock = roadblock;
  if (game.driving && roadblock.active && vehicles.roadblockNear(game.driving.x, game.driving.z, 6)) {
    if (Math.abs(game.driving.speed) > 5) {
      game.driving.speed *= -0.2;
      hud.toast('Roadblock! You slammed into the barricade!');
      hud.announce('Roadblock hit.');
      audio.blip(false);
    } else if (time - game.lastRoadblockToast > 3) {
      game.lastRoadblockToast = time;
      hud.toast('Roadblock ahead — ram through or go around!');
    }
  }

  // The garage hide: ducking inside while wanted drops one star, once
  // every 30 seconds.
  if (game.garageCooldown > 0) game.garageCooldown -= dt;
  if (game.garageOwned && !game.driving && player.state.wanted > 0 && game.garageCooldown <= 0) {
    const garageDist = Math.hypot(player.state.x - GARAGE.x, player.state.z - GARAGE.z);
    if (garageDist < 9) {
      player.state.wanted -= 1;
      game.garageCooldown = GARAGE.hideCooldown;
      player.addRespect(RESPECT.perStarCooled);
      hud.toast('You slipped into the garage — one star gone.');
      hud.announce('Wanted level down. Garage hide.');
    }
  }

  // Wanted heat: 20 seconds out of sight and one star decays — but the
  // fleet returns with it, respawning back on Ray's tail.
  if (player.state.wanted > 0 && police.policeDistance > 60) {
    game.lostTimer += dt;
    if (game.lostTimer > POLICE.lostCopsSeconds) {
      game.lostTimer = 0;
      player.state.wanted -= 1;
      player.addRespect(RESPECT.perStarCooled);
      hud.toast('The heat is cooling off… but the fleet is back on you.');
      if (player.state.wanted >= 2) vehicles.respawnPolice(player.position());
    }
  } else {
    game.lostTimer = 0;
  }

  // The Drop's clock: game time only — it never runs while paused.
  if (mission && mission.type === 'timed' && game.missionTimeLeft !== null) {
    game.missionTimeLeft -= dt;
    if (game.missionTimeLeft <= 0) {
      game.missionTimeLeft = mission.timeLimit;
      hud.toast("Too slow! Mara's package is late — run it again.");
      hud.announce('Drop failed. Out of time.');
    }
  }

  updateTail(dt);
  checkMission();
}

/** Everything that must happen once per frame, even when a step above
 * threw: the world keeps painting, the HUD keeps updating, and the loop
 * keeps running instead of freezing on a dead frame. */
function endFrame(dt, frozen) {
  if (!frozen) {
    world.update(dt, time);
    city.update(time);
    pedestrians.update(dt);
    if (tracerTimer > 0) {
      tracerTimer -= dt;
      if (tracerTimer <= 0) tracer.visible = false;
    }
  }
  const target = game.driving
    ? { x: game.driving.x, y: 0, z: game.driving.z }
    : { x: player.state.x, y: 0, z: player.state.z };
  const yaw = game.driving ? game.driving.yaw : player.state.camYaw;
  if (!frozen) {
    renderer.updateCamera(target, yaw, game.driving ? 12 : 8.5, game.driving ? 5 : 3.4, dt);
  }
  updateBeacon();
  hud.update(hudState());
  minimap.draw(minimapState());
  renderer.render();
}

function frame(now) {
  requestAnimationFrame(frame);
  // Real frame delta, clamped so a hidden-tab stall is dropped, not
  // replayed; the simulation itself still advances in fixed STEP slices.
  const rawDt = lastNow === 0 ? STEP : (now - lastNow) / 1000;
  lastNow = now;
  const dt = Math.min(MAX_FRAME, Math.max(0, rawDt));
  // Paused means frozen: the clock, the sea, the neon and the pedestrians
  // all wait with you.
  const frozen = screen === 'paused';
  if (!frozen) time += dt;
  try {
    if (screen === 'play') {
      let remaining = dt;
      while (remaining >= STEP) {
        stepGame(STEP);
        remaining -= STEP;
        if (screen !== 'play') break;
      }
    }
  } finally {
    endFrame(dt, frozen);
  }
}

function runShot(name) {
  // Let traffic settle into its lanes and the sea start moving FIRST, then
  // stage the scene — staging last means the staged cars and helicopter
  // stay exactly where the shot put them instead of being pulled away by
  // the settle step.
  vehicles.update(0.5, 1, player.position(), 0);
  pedestrians.update(0.5);
  world.update(0.5, 1);
  city.update(1);
  const hudValues = stageShot(name, game);
  applyShotHud(hudValues);
  updateBeacon();
  minimap.draw({
    player: { x: player.state.x, z: player.state.z, yaw: player.state.yaw },
    cars: vehicles.cars.map((c) => ({ x: c.x, z: c.z })),
    peds: pedestrians.peds.map((p) => ({ x: p.x, z: p.z })),
    police: { x: vehicles.police.x, z: vehicles.police.z },
    heli: { x: vehicles.heli.position.x, z: vehicles.heli.position.z },
    wanted: player.state.wanted,
    missionTarget: missionTarget(),
    garage: { x: GARAGE.x, z: GARAGE.z },
    garageOwned: game.garageOwned,
    roadblock: { active: false, x: 0, z: 0 },
    mark: { x: 0, z: 0, active: false },
  });
  let painted = 0;
  function paint() {
    renderer.render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const saved = hud.load();
  const startBtn = document.getElementById('start-btn');
  function start() {
    audio.resume();
    if (saved) {
      player.state.money = saved.money ?? 250;
      game.missionIndex = saved.missionIndex ?? 0;
      game.missionPhase = 0;
      player.state.wanted = saved.wanted ?? 0;
      player.state.respect = saved.respect ?? 0;
      player.state.weapon = saved.weapon ?? 'fists';
      if (saved.ammo) player.state.ammo = { pistol: saved.ammo.pistol ?? 24, smg: saved.ammo.smg ?? 60 };
      game.garageOwned = saved.garageOwned ?? false;
      game.radioStation = saved.radioStation ?? 0;
      if (typeof saved.x === 'number') player.setPosition(saved.x, saved.z ?? 8, 0);
      // The mission's entry effects re-arm on load — the timer, the mark
      // and the heat start fresh with the mission, not mid-way through.
      startMission(game.missionIndex);
      hud.toast('Save loaded — welcome back to Vice Point.');
    }
    screen = 'play';
    hud.hideScreen();
    hud.announce('Playing. Mara Voss needs a package picked up at Pier 9.');
  }
  if (startBtn) startBtn.addEventListener('click', start);
  window.addEventListener('keydown', (event) => {
    if ((event.code === 'Enter' || event.code === 'Space') && screen === 'title') start();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') pauseGame();
  });
  // Autosave every 20 seconds of play.
  window.setInterval(() => {
    if (screen === 'play') hud.save({ ...hudState(), missionIndex: game.missionIndex });
  }, 20000);
  hud.announce('Vice Point. Press Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
