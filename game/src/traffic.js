// Vice Point — ambient city life. Traffic cars cruise rectangular loops
// around the blocks and pedestrians wander the sidewalks, so the streets
// feel lived in even when Ray is just walking. Everything runs on a fixed
// seed, so the traffic is the same on every load.

import * as THREE from 'three';
import { makeCar } from './vehicles.js';
import { mulberry32, blockCenter, GRID } from './city.js';

const TRAFFIC_COLORS = [0x8a94a0, 0x3f6fb5, 0xc9c2b4, 0x5a7a52, 0xb5533c];

// Rectangular loops on the street centrelines: each loop is a ring of
// intersections around one or two blocks.
const LOOPS = [
  [[-100, -100], [100, -100], [100, -50], [-100, -50]],
  [[-50, 0], [50, 0], [50, 50], [-50, 50]],
  [[-100, 50], [0, 50], [0, 100], [-100, 100]],
  [[0, -100], [100, -100], [100, 0], [0, 0]],
  [[-50, -50], [-50, 50], [0, 50], [0, -50]],
];

function makePedestrian(rand) {
  const shirts = [0xe86a6a, 0x5b8dd9, 0x7fbf6a, 0xe8b13c, 0x9a6fd0, 0xdddddd];
  const shirt = shirts[Math.floor(rand() * shirts.length)];
  const skin = [0xe8b98d, 0xc98d5f, 0x8a5a3b][Math.floor(rand() * 3)];
  const g = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.62, 0.3),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.36, 0.34),
    new THREE.MeshLambertMaterial({ color: skin }),
  );
  head.position.y = 1.62;
  head.castShadow = true;
  g.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2e3440 });
  const legs = [];
  for (const lx of [-0.13, 0.13]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.78, 0.22), legMat);
    leg.position.set(lx, 0.42, 0);
    leg.geometry.translate(0, -0.39, 0);
    leg.position.y = 0.81;
    leg.castShadow = true;
    g.add(leg);
    legs.push(leg);
  }
  g.userData.legs = legs;
  return g;
}

function randomSidewalkPoint(rand) {
  const cx = blockCenter(Math.floor(rand() * GRID));
  const cz = blockCenter(Math.floor(rand() * GRID));
  return {
    x: cx + (rand() < 0.5 ? -20 : 20) + (rand() - 0.5) * 2,
    z: cz + (rand() - 0.5) * 36,
  };
}

export function createTraffic(scene) {
  const rand = mulberry32(777);
  const cars = LOOPS.map((loop, i) => {
    const group = makeCar(TRAFFIC_COLORS[i % TRAFFIC_COLORS.length]);
    const start = loop[0];
    group.position.set(start[0], 0, start[1]);
    scene.add(group);
    return {
      group,
      speed: 6.5 + rand() * 2.5,
      loop,
      wp: 1,
      yaw: 0,
    };
  });

  const peds = [];
  for (let i = 0; i < 12; i++) {
    const ped = makePedestrian(rand);
    const spot = randomSidewalkPoint(rand);
    ped.position.set(spot.x, 0, spot.z);
    scene.add(ped);
    peds.push({
      group: ped,
      speed: 1.1 + rand() * 0.7,
      target: randomSidewalkPoint(rand),
      phase: rand() * Math.PI * 2,
    });
  }

  function update(dt, time) {
    for (const car of cars) {
      const [tx, tz] = car.loop[car.wp];
      const dx = tx - car.group.position.x;
      const dz = tz - car.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 4) {
        car.wp = (car.wp + 1) % car.loop.length;
        continue;
      }
      const desired = Math.atan2(dx, dz);
      let diff = desired - car.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = Math.max(-1.4 * dt, Math.min(1.4 * dt, diff));
      car.yaw += turn;
      car.group.rotation.y = car.yaw;
      car.group.position.x += Math.sin(car.yaw) * car.speed * dt;
      car.group.position.z += Math.cos(car.yaw) * car.speed * dt;
      const wheels = car.group.userData.wheels;
      const spin = (car.speed * dt) / 0.36;
      for (const w of wheels) w.rotation.x += spin;
    }
    for (const ped of peds) {
      const dx = ped.target.x - ped.group.position.x;
      const dz = ped.target.z - ped.group.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        ped.target = randomSidewalkPoint(rand);
        continue;
      }
      const yaw = Math.atan2(dx, dz);
      ped.group.rotation.y = yaw;
      ped.group.position.x += Math.sin(yaw) * ped.speed * dt;
      ped.group.position.z += Math.cos(yaw) * ped.speed * dt;
      const swing = Math.sin(time * 7 + ped.phase) * 0.45;
      ped.group.userData.legs[0].rotation.x = swing;
      ped.group.userData.legs[1].rotation.x = -swing;
      ped.group.position.y = Math.abs(Math.sin(time * 7 + ped.phase)) * 0.04;
    }
  }

  return { cars, peds, update };
}
