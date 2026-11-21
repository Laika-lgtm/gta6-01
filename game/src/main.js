// Vice Point boot and the one loop: input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// The game moves between three screens: title, play and paused. Stealing a
// car raises the wanted level; the police answer it; finishing a mission
// pays out and advances the story.
//
// ?seed=N fixes the city. ?shot=chase|mission|drive|street (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { CAR, CITY, MISSIONS, STEP } from './config.js';
import { createRenderer } from './render.js';
import { createWorld } from './world.js';
import { createCity } from './city.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { applyShotHud, stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const MISSION_TARGETS = [
  { x: 296, z: 120 },
  { x: 10, z: -60 },
  { x: -100, z: 80 },
];

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CITY.seed;

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const world = createWorld(renderer.scene);
const city = createCity(renderer.scene);
const player = createPlayer(renderer.scene, city.colliders);
const vehicles = createVehicles(renderer.scene, city.colliders);
const hud = createHud();
const minimap = createMinimap();
const audio = createAudio();
const input = createInput(canvas);

const game = {
  player,
  vehicles,
  driving: null,
  missionIndex: 0,
  camera: {
    snapTo(x, z, yaw, distance = 11, height = 5.5) {
      renderer.camera.position.set(x - Math.sin(yaw) * distance, height, z - Math.cos(yaw) * distance);
      renderer.camera.lookAt(x + Math.sin(yaw) * 4, 1.6, z + Math.cos(yaw) * 4);
    },
  },
};

let screen = 'title';
let time = 0;
let lastNow = 0;
let lastFootstep = 0;

function missionTarget() {
  return MISSION_TARGETS[game.missionIndex % MISSION_TARGETS.length];
}

function hudState() {
  const driving = game.driving;
  return {
    money: player.state.money,
    wanted: player.state.wanted,
    missionIndex: game.missionIndex,
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
    police: { x: vehicles.police.x, z: vehicles.police.z },
    heli: { x: vehicles.heli.position.x, z: vehicles.heli.position.z },
    wanted: player.state.wanted,
    missionTarget: missionTarget(),
  };
}

function checkMission() {
  const target = missionTarget();
  const dx = player.state.x - target.x;
  const dz = player.state.z - target.z;
  if (Math.hypot(dx, dz) < 9) {
    const mission = MISSIONS[game.missionIndex % MISSIONS.length];
    player.state.money += mission.pay;
    hud.toast(`Mission complete: ${mission.title} — +$${mission.pay}`);
    hud.announce(`Mission complete. ${mission.title}. Earned $${mission.pay}.`);
    audio.blip(true);
    game.missionIndex += 1;
    if (player.state.wanted > 0) player.state.wanted = Math.max(0, player.state.wanted - 1);
    hud.save({ ...hudState(), missionIndex: game.missionIndex });
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
    screen = 'paused';
    hud.showScreen(
      '<h1>PAUSED</h1><h2>VICE POINT WAITS FOR NO ONE — EXCEPT NOW</h2><p>Take a breath. The city will still be here.</p><button>RESUME</button><div class="keys">WASD walk &amp; drive · Mouse look · Shift run · Space brake · E enter / exit car · M mute</div>',
      'RESUME',
      () => { screen = 'play'; hud.hideScreen(); },
    );
    hud.announce('Paused.');
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
  audio.setSiren(player.state.wanted >= 2);
  if (player.state.wanted >= 2 && police.policeDistance < 4 && !game.driving) {
    player.state.health -= dt * 6;
    if (player.state.health <= 0) {
      player.state.health = 0;
      screen = 'over';
      hud.showScreen(
        '<h1>BUSTED</h1><h2>THE VICE POINT POLICE CAUGHT UP WITH YOU</h2><p>Ray spends the night in a cell. The debt is still waiting.</p><button>TRY AGAIN</button><div class="keys">Your money and mission progress are saved.</div>',
        'TRY AGAIN',
        () => {
          player.state.health = 100;
          player.state.wanted = 0;
          player.setPosition(-8, 8, 0);
          screen = 'play';
          hud.hideScreen();
        },
      );
      hud.announce('Busted. Game over.');
    }
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

function frame(now) {
  requestAnimationFrame(frame);
  // Real frame delta, clamped so a hidden-tab stall is dropped, not
  // replayed; the simulation itself still advances in fixed STEP slices.
  const rawDt = lastNow === 0 ? STEP : (now - lastNow) / 1000;
  lastNow = now;
  const dt = Math.min(MAX_FRAME, Math.max(0, rawDt));
  time += dt;
  if (screen === 'play') {
    let remaining = dt;
    while (remaining >= STEP) {
      stepGame(STEP);
      remaining -= STEP;
      if (screen !== 'play') break;
    }
  }
  world.update(dt, time);
  city.update(time);
  const target = game.driving
    ? { x: game.driving.x, y: 0, z: game.driving.z }
    : { x: player.state.x, y: 0, z: player.state.z };
  const yaw = game.driving ? game.driving.yaw : player.state.camYaw;
  renderer.updateCamera(target, yaw, game.driving ? 12 : 8.5, game.driving ? 5 : 3.4, dt);
  hud.update(hudState());
  minimap.draw(minimapState());
  renderer.render();
}

function runShot(name) {
  // Let traffic settle into its lanes and the sea start moving FIRST, then
  // stage the scene — staging last means the staged cars and helicopter
  // stay exactly where the shot put them instead of being pulled away by
  // the settle step.
  vehicles.update(0.5, 1, player.position(), 0);
  world.update(0.5, 1);
  city.update(1);
  const hudValues = stageShot(name, game);
  applyShotHud(hudValues);
  minimap.draw({
    player: { x: player.state.x, z: player.state.z, yaw: player.state.yaw },
    cars: vehicles.cars.map((c) => ({ x: c.x, z: c.z })),
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
      player.state.wanted = saved.wanted ?? 0;
      if (typeof saved.x === 'number') player.setPosition(saved.x, saved.z ?? 8, 0);
      hud.toast('Save loaded — welcome back to Vice Point.');
    }
    screen = 'play';
    hud.hideScreen();
    hud.announce('Playing. Meet Marisol at Pier 9.');
  }
  if (startBtn) startBtn.addEventListener('click', start);
  window.addEventListener('keydown', (event) => {
    if ((event.code === 'Enter' || event.code === 'Space') && screen === 'title') start();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'paused';
      hud.showScreen(
        '<h1>PAUSED</h1><h2>VICE POINT WAITS FOR NO ONE — EXCEPT NOW</h2><p>Take a breath. The city will still be here.</p><button>RESUME</button><div class="keys">WASD walk &amp; drive · Mouse look · Shift run · Space brake · E enter / exit car · M mute</div>',
        'RESUME',
        () => { screen = 'play'; hud.hideScreen(); },
      );
    }
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
