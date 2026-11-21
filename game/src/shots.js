// The screenshot scenes behind ?shot=chase|mission|drive|street. Each one
// stages the live game — real city, real cars, real HUD — from the fixed
// seed, then paints two frames and sets window.__shotReady so a screenshot
// tool knows the frame is settled. The chase is the cover: Ray in the
// Comet GT at speed, the Interceptor on his bumper, Air One overhead,
// four wanted stars, the minimap and the mission objective on the HUD.
import { MISSIONS } from './config.js';

function setHudForShot(hudState) {
  const moneyEl = document.getElementById('money-value');
  const starsEl = document.getElementById('stars');
  const missionEl = document.getElementById('mission-text');
  const speedEl = document.getElementById('speed-value');
  const speedLabelEl = document.getElementById('speed-label');
  const healthEl = document.getElementById('health-fill');
  if (moneyEl) moneyEl.textContent = String(hudState.money);
  if (starsEl) {
    starsEl.textContent = '★'.repeat(hudState.wanted) + '☆'.repeat(5 - hudState.wanted);
    starsEl.style.visibility = hudState.wanted > 0 ? 'visible' : 'hidden';
  }
  if (missionEl) missionEl.textContent = MISSIONS[hudState.missionIndex % MISSIONS.length].text;
  if (speedEl) speedEl.textContent = String(hudState.speedMph);
  if (speedLabelEl) speedLabelEl.textContent = hudState.speedLabel;
  if (healthEl) {
    healthEl.style.width = `${hudState.health}%`;
    healthEl.style.background = '#4ade80';
  }
}

/**
 * Stage the named scene on the running game object (the same state main.js
 * drives) and return the HUD values to show. Unknown names stage street.
 */
export function stageShot(name, game) {
  const { player, vehicles, camera } = game;
  const screen = document.getElementById('screen');
  if (screen) screen.style.display = 'none';

  if (name === 'chase') {
    // Ray in the Comet GT, mid-avenue, the Interceptor closing in on his
    // quarter and Air One hanging low ahead — four stars, mission live.
    const car = vehicles.cars[0];
    car.x = -40;
    car.z = 60;
    car.yaw = Math.PI / 2;
    car.speed = 30;
    car.mesh.group.position.set(car.x, 0, car.z);
    car.mesh.group.rotation.y = car.yaw;
    game.driving = car;
    player.setPosition(car.x, car.z, car.yaw);
    player.state.wanted = 4;
    player.state.money = 1250;
    player.state.health = 82;
    vehicles.police.x = car.x + 2;
    vehicles.police.z = car.z - 6;
    vehicles.police.yaw = Math.PI / 2;
    vehicles.police.speed = 28;
    vehicles.police.active = true;
    vehicles.police.mesh.group.position.set(vehicles.police.x, 0, vehicles.police.z);
    vehicles.police.mesh.group.rotation.y = vehicles.police.yaw;
    vehicles.heli.visible = true;
    vehicles.heli.position.set(car.x + 35, 13, car.z + 6);
    vehicles.heli.rotation.y = Math.PI / 2;
    camera.snapTo(car.x, car.z, car.yaw, 14, 7);
    return {
      money: 1250, wanted: 4, missionIndex: 2, health: 82,
      speedMph: 68, speedLabel: 'COMET GT — E TO EXIT',
    };
  }

  if (name === 'mission') {
    // On foot at Pier 9, facing the pier deck and the sea, Marisol's
    // package in sight — the ocean and the neon behind the mission.
    player.setPosition(296, 118, Math.PI / 2);
    player.state.wanted = 1;
    player.state.money = 650;
    player.state.health = 100;
    game.missionIndex = 1;
    camera.snapTo(296, 118, Math.PI / 2);
    return {
      money: 650, wanted: 1, missionIndex: 1, health: 100,
      speedMph: 0, speedLabel: 'ON FOOT — E NEAR A CAR',
    };
  }

  if (name === 'drive') {
    // Cruising Coral Way at dusk-light, traffic ahead, palms and neon.
    const car = vehicles.cars[1];
    car.x = 3.5;
    car.z = -60;
    car.yaw = 0;
    car.speed = 24;
    car.mesh.group.position.set(car.x, 0, car.z);
    car.mesh.group.rotation.y = car.yaw;
    game.driving = car;
    player.setPosition(car.x, car.z, car.yaw);
    player.state.wanted = 0;
    player.state.money = 900;
    player.state.health = 100;
    camera.snapTo(car.x, car.z, car.yaw);
    return {
      money: 900, wanted: 0, missionIndex: 0, health: 100,
      speedMph: 54, speedLabel: 'SUNRISE COUPE — E TO EXIT',
    };
  }

  // street: Ray on foot on a neon corner, palms and towers behind him.
  player.setPosition(-30, 30, Math.PI * 0.75);
  player.state.wanted = 0;
  player.state.money = 250;
  player.state.health = 100;
  camera.snapTo(-30, 30, Math.PI * 0.75);
  return {
    money: 250, wanted: 0, missionIndex: 0, health: 100,
    speedMph: 0, speedLabel: 'ON FOOT — E NEAR A CAR',
  };
}

export function applyShotHud(hudState) {
  setHudForShot(hudState);
}
