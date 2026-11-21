// Vice Point boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// The game moves between four screens: title, play, paused and over.
// Stealing a car raises the wanted level; the police answer it; getting
// caught means a $100 fine and, on an escape mission, a failed mission.
// Mara Voss's three missions chain in order — Pickup, Heat Escape,
// Getaway Car — and pay $300, $400 and $600 on a $250 start.
//
// ?seed=N fixes the city. ?shot=chase|mission|drive|street (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import * as THREE from 'three';
import { CAR, CITY, GETAWAY_CAR_INDEX, MISSION_TARGETS, MISSIONS, PLAYER, STEP } from './config.js';
import { createRenderer } from './render.js';
import { createWorld } from './world.js';
import { createCity } from './city.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { applyShotHud, stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const BUSTED_FINE = 100;

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
  // The getaway mission has two legs: steal the car, then drive it to the
  // drop. Every other mission is a single leg.
  missionPhase: 0,
  lastPoliceDistance: null,
  lastHotToast: -10,
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

let screen = 'title';
let time = 0;
let lastNow = 0;
let lastFootstep = 0;

function currentMission() {
  return MISSIONS[game.missionIndex % MISSIONS.length] ?? null;
}

/**
 * Where the current objective is. The getaway mission's first leg points
 * at the getaway car itself; every other leg points at a fixed target.
 * Returns null when there is no objective to point at — callers must
 * handle that, never assume a target exists.
 */
function missionTarget() {
  const mission = currentMission();
  if (!mission) return null;
  if (mission.type === 'getaway' && game.missionPhase === 0) {
    const car = vehicles.cars[GETAWAY_CAR_INDEX];
    if (!car) return null;
    return { x: car.x, z: car.z };
  }
  return MISSION_TARGETS[game.missionIndex % MISSION_TARGETS.length] ?? null;
}

/** The HUD line for the current leg; null means the mission's own text. */
function missionText() {
  const mission = currentMission();
  if (!mission) return null;
  if (mission.type === 'getaway' && game.missionPhase === 0) {
    return 'Mara Voss: steal the gold getaway car on Coral Way.';
  }
  if (mission.type === 'getaway' && game.missionPhase === 1) {
    return 'Mara Voss: drive the getaway car to the marina drop.';
  }
  return null;
}

/** Entry effects for a mission that has just become current. */
function startMission(index) {
  const mission = MISSIONS[index % MISSIONS.length];
  if (!mission) return;
  if (mission.type === 'escape') {
    // The heat is the mission: Mara's escape starts with the cops already
    // on you, three stars deep.
    player.state.wanted = 3;
    hud.toast("Mara Voss: the heat is on! Lose them and reach the safehouse.");
    hud.announce('Heat escape. Wanted level three. Reach the safehouse.');
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
  return {
    player: { x: player.state.x, z: player.state.z, yaw: player.state.yaw },
    cars: vehicles.cars.map((c) => ({ x: c.x, z: c.z })),
    peds: pedestrians.peds.map((p) => ({ x: p.x, z: p.z })),
    police: { x: vehicles.police.x, z: vehicles.police.z },
    heli: { x: vehicles.heli.position.x, z: vehicles.heli.position.z },
    wanted: player.state.wanted,
    missionTarget: missionTarget(),
  };
}

function completeMission(mission) {
  player.state.money += mission.pay;
  hud.toast(`Mission complete: ${mission.title} — +$${mission.pay}`);
  hud.announce(`Mission complete. ${mission.title}. Earned $${mission.pay}.`);
  audio.blip(true);
  game.missionIndex += 1;
  game.missionPhase = 0;
  if (player.state.wanted > 0) player.state.wanted = Math.max(0, player.state.wanted - 1);
  startMission(game.missionIndex);
  hud.save({ ...hudState(), missionIndex: game.missionIndex });
}

function checkMission() {
  const mission = currentMission();
  if (!mission) return;
  // The getaway's first leg is finished by getting into the car, not by
  // standing next to it — the target check below is for the drop.
  if (mission.type === 'getaway' && game.missionPhase === 0) return;
  const target = missionTarget();
  if (!target) return;
  const dx = player.state.x - target.x;
  const dz = player.state.z - target.z;
  if (Math.hypot(dx, dz) >= 9) return;
  if (mission.type === 'escape') {
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
  const failedEscape = mission !== null && mission.type === 'escape';
  screen = 'over';
  const failedLine = failedEscape
    ? '<p>Mara\'s heat escape is blown — you\'ll have to run it again.</p>'
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
  audio.setEngine(0, CAR.maxSpeed, false);
  hud.showScreen(
    '<h1>PAUSED</h1><h2>VICE POINT WAITS FOR NO ONE — EXCEPT NOW</h2><p>Take a breath. The city will still be here.</p><button>RESUME</button><div class="keys">WASD walk &amp; drive · Mouse look · Shift run · Space brake · E enter / exit car · F punch · M mute</div>',
    'RESUME',
    () => { screen = 'play'; hud.hideScreen(); },
  );
  hud.announce('Paused.');
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

  if (actions & ACTION_ENTER) {
    if (game.driving) {
      const car = game.driving;
      game.driving = null;
      player.setPosition(car.x + 2.4, car.z, car.yaw);
      player.state.camYaw = car.yaw;
      hud.toast('You left the car.');
      audio.blip(false);
    } else {
      const car = vehicles.nearestCar(player.state.x, player.state.z, 4.5);
      if (car) {
        game.driving = car;
        car.stolen = true;
        if (player.state.wanted < 2) player.state.wanted = 2;
        hud.toast(`You stole the ${car.name}! The cops noticed.`);
        hud.announce(`Stole the ${car.name}. Wanted level ${player.state.wanted}.`);
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
    if (player.punch()) {
      const ped = pedestrians.nearestPed(player.state.x, player.state.z, PLAYER.punchRange);
      const policeDist = Math.hypot(vehicles.police.x - player.state.x, vehicles.police.z - player.state.z);
      if (ped) {
        pedestrians.fleeFrom(ped, player.state.x, player.state.z);
        player.state.wanted = Math.min(5, player.state.wanted + 1);
        hud.toast('You punched a pedestrian! Someone called the cops.');
        hud.announce('You punched a pedestrian. Wanted level up.');
        audio.blip(false);
      } else if (policeDist < 2.8 && player.state.wanted >= 2) {
        vehicles.police.speed = 0;
        player.state.wanted = Math.min(5, player.state.wanted + 1);
        hud.toast('You shoved the cop! That was a mistake.');
        hud.announce('You shoved a police officer. Wanted level up.');
        audio.blip(false);
      } else {
        audio.blip(false);
      }
    }
  }

  if (game.driving) {
    vehicles.drive(game.driving, dt, move);
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

  // Wanted heat cools slowly when the police cannot see you.
  if (player.state.wanted > 0 && police.policeDistance > 60) {
    player.state._coolTimer = (player.state._coolTimer ?? 0) + dt;
    if (player.state._coolTimer > 14) {
      player.state.wanted -= 1;
      player.state._coolTimer = 0;
      hud.toast('The heat is cooling off…');
    }
  } else {
    player.state._coolTimer = 0;
  }

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
      if (typeof saved.x === 'number') player.setPosition(saved.x, saved.z ?? 8, 0);
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
