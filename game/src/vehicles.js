// Vice Point — vehicles: the six stealable street cars, traffic, police.
// Cars are built from boxes (body, cabin, wheels, lights) so each model reads
// differently at a glance. Driving is simple arcade physics: accelerate,
// brake, steer by speed, grip damps the slide, buildings and other cars
// collide as circles. E enters the nearest car, E exits it again. Traffic
// cars cruise the road grid; the police Interceptor chases the player when
// the wanted level is up, and a helicopter circles overhead in a hot chase.

import * as THREE from 'three';
import { CAR_DEFS, POLICE_DEF, WANTED, CITY } from './config.js';
import { createRng, range, pick } from './random.js';
import { resolveCircleCollisions } from './city.js';

// Build one car's mesh from a definition. Returns a THREE.Group.
export function buildCarMesh(def) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.35, metalness: 0.55 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.15, metalness: 0.8 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.25, metalness: 0.9 });

  const L = def.length;
  const W = def.width;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, 0.62, L), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.55, L * 0.48), glass);
  cabin.position.set(0, 1.1, -L * 0.04);
  cabin.castShadow = true;
  group.add(cabin);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.16, 0.18), chrome);
  bumper.position.set(0, 0.32, L / 2);
  group.add(bumper);
  const bumperRear = bumper.clone();
  bumperRear.position.z = -L / 2;
  group.add(bumperRear);

  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffedb0, emissiveIntensity: 0.7 });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), lightMat);
    head.position.set(side * (W / 2 - 0.3), 0.62, L / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xaa0000, emissiveIntensity: 0.6 }));
    tail.position.set(side * (W / 2 - 0.3), 0.62, -L / 2 - 0.02);
    group.add(tail);
  }

  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [[-W / 2, L * 0.32], [W / 2, L * 0.32], [-W / 2, -L * 0.32], [W / 2, -L * 0.32]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  group.userData.wheels = wheels;
  return group;
}

function makeVehicle(def, x, z, heading, scene) {
  const mesh = buildCarMesh(def);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  return {
    def, mesh, x, z, heading,
    speed: 0,
    steerAngle: 0,
    radius: Math.max(def.length, def.width) / 2,
  };
}

// Park the six stealable cars around the city (seeded, so screenshots match).
export function spawnStreetCars(scene, seed) {
  const rng = createRng(seed + 77);
  // Parked on road lines (x or z on a -126..126 grid line), never in a block.
  const spots = [
    { x: 0, z: 24 }, { x: -42, z: -7 }, { x: 42, z: 56 },
    { x: -84, z: 49 }, { x: 0, z: -49 }, { x: 84, z: -7 },
  ];
  return CAR_DEFS.map((def, i) => {
    const spot = spots[i % spots.length];
    const jitter = range(rng, -2, 2);
    return makeVehicle(def, spot.x + jitter, spot.z, (i % 4) * Math.PI / 2, scene);
  });
}

// Traffic: plain cars cruising the road grid in loops.
export function spawnTraffic(scene, seed) {
  const rng = createRng(seed + 131);
  const cars = [];
  for (let i = 0; i < 8; i++) {
    const def = pick(rng, CAR_DEFS);
    // Avenue is a road centre line between blocks.
    const avenue = (Math.floor(range(rng, 0, CITY.blocksX + 1)) - CITY.blocksX / 2) * CITY.blockSize;
    const along = range(rng, -120, 120);
    const horizontal = rng() < 0.5;
    const car = makeVehicle(def, horizontal ? along : avenue, horizontal ? avenue : along,
      horizontal ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI), scene);
    car.traffic = true;
    car.cruiseSpeed = range(rng, 7, 11);
    car.horizontal = horizontal;
    cars.push(car);
  }
  return cars;
}

// The police Interceptor: spawns off-screen and hunts the player.
export function spawnPolice(scene) {
  const car = makeVehicle(POLICE_DEF, 60, 60, Math.PI, scene);
  // Light bar on the roof.
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.18, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x2244ff, emissiveIntensity: 1.4 }),
  );
  bar.position.y = 1.45;
  car.mesh.add(bar);
  car.police = true;
  return car;
}

// Air One helicopter: a simple body + spinning rotor that circles the chase.
export function spawnHelicopter(scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: 0.5, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 4.6), bodyMat);
  body.castShadow = true;
  group.add(body);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x0e1a24, roughness: 0.15, metalness: 0.7 }));
  glass.position.set(0, 0.2, 1.6);
  group.add(glass);
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), rotorMat);
  rotor.position.y = 0.85;
  group.add(rotor);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.2), bodyMat);
  tail.position.set(0, 0.2, -4.2);
  group.add(tail);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xff2222, emissiveIntensity: 2 }));
  beacon.position.y = -0.7;
  group.add(beacon);
  scene.add(group);
  return { group, rotor, angle: 0, height: 42, radius: 26 };
}

// Nearest stealable car within reach, or null.
export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

// One driving step: arcade handling with collision. intent: {throttle, steer, brake}.
export function updateDriving(car, intent, dt, colliders, otherCars) {
  const def = car.def;
  if (intent.throttle > 0) car.speed += def.accel * dt;
  else if (intent.throttle < 0) car.speed -= def.accel * 0.7 * dt;
  else car.speed *= Math.max(0, 1 - 0.6 * dt);
  if (intent.brake) car.speed *= Math.max(0, 1 - 3.2 * dt);
  car.speed = Math.max(-def.topSpeed * 0.45, Math.min(def.topSpeed, car.speed));

  const steerTarget = intent.steer * 0.55;
  car.steerAngle += (steerTarget - car.steerAngle) * Math.min(1, 8 * dt);
  const dir = car.speed >= 0 ? 1 : -1;
  car.heading += car.steerAngle * (Math.abs(car.speed) / def.topSpeed) * def.handling * 2.4 * dt * dir;

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  const fixed = resolveCircleCollisions(nx, nz, car.radius * 0.82, colliders);
  const hitWall = fixed.x !== nx || fixed.z !== nz;
  car.x = fixed.x;
  car.z = fixed.z;
  if (hitWall) car.speed *= 0.55;

  // Car-to-car bumps. The circle radius is the half-length, which overstates
  // a car's width, so contact starts at 80% of the summed radii — otherwise
  // a trailing car brakes the leader to a crawl on every frame.
  for (const other of otherCars) {
    if (other === car) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const minD = (car.radius + other.radius) * 0.8;
    const d = Math.hypot(dx, dz);
    if (d < minD && d > 0.001) {
      const push = (minD - d) / 2;
      car.x += (dx / d) * push;
      car.z += (dz / d) * push;
      car.speed *= 0.9;
    }
  }

  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  for (const wheel of car.mesh.userData.wheels) {
    wheel.rotation.x += car.speed * dt * 2.2;
    wheel.rotation.y = 0;
  }
  return hitWall;
}

// Traffic cars cruise their avenue and wrap around the city edge.
export function updateTraffic(traffic, dt, span) {
  for (const car of traffic) {
    car.speed = car.cruiseSpeed;
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const limit = span / 2 + 8;
    if (car.horizontal) {
      car.x = nx > limit ? -limit : nx;
      car.z = nz;
    } else {
      car.z = nz > limit ? -limit : nz;
      car.x = nx;
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}

// Police chase: steer toward the player, slightly faster than the player's car.
export function updatePoliceChase(police, playerX, playerZ, dt, colliders, otherCars) {
  // Aim slightly to the side of the player (police.sideOffset, set by the
  // chase shot) so the Interceptor trails beside the car, visible in frame
  // instead of hidden directly behind it.
  const dx = (playerX + (police.sideOffset || 0)) - police.x;
  const dz = playerZ - police.z;
  const dist = Math.hypot(dx, dz);
  const targetHeading = Math.atan2(dx, dz);
  let diff = targetHeading - police.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  police.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
  // Standoff: brake when close so the Interceptor tails the player instead
  // of ramming the player's car to a crawl on every frame.
  if (dist < 8) {
    police.speed = Math.max(0, police.speed - 25 * dt);
  } else {
    police.speed = Math.min(police.def.topSpeed * WANTED.chaseSpeedBoost,
      police.speed + police.def.accel * dt);
  }
  const nx = police.x + Math.sin(police.heading) * police.speed * dt;
  const nz = police.z + Math.cos(police.heading) * police.speed * dt;
  const fixed = resolveCircleCollisions(nx, nz, police.radius * 0.82, colliders);
  police.x = fixed.x;
  police.z = fixed.z;
  if (fixed.x !== nx || fixed.z !== nz) {
    // Blocked by a building: the straight-line chase drives into walls, so
    // fall back to road-grid (Manhattan) steering instead of grinding to a
    // halt against the facade.
    const adx = (playerX + (police.sideOffset || 0)) - police.x;
    const adz = playerZ - police.z;
    police.heading = Math.abs(adx) > Math.abs(adz)
      ? (adx > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (adz > 0 ? 0 : Math.PI);
    police.speed *= 0.85;
  }
  for (const other of otherCars) {
    if (other === police) continue;
    const ox = police.x - other.x;
    const oz = police.z - other.z;
    const minD = (police.radius + other.radius) * 0.8;
    const d = Math.hypot(ox, oz);
    if (d < minD && d > 0.001) {
      police.x += (ox / d) * (minD - d);
      police.z += (oz / d) * (minD - d);
    }
  }
  police.mesh.position.set(police.x, 0, police.z);
  police.mesh.rotation.y = police.heading;
  return dist;
}

// Helicopter circles the player at a fixed height, rotor spinning.
export function updateHelicopter(heli, playerX, playerZ, dt, time) {
  // In the chase shot the helicopter holds its staged position so it stays
  // in frame above the road; otherwise it circles the player.
  if (!heli.frozen) heli.angle += dt * 0.45;
  const r = heli.radius ?? 26;
  heli.group.position.set(
    playerX + Math.cos(heli.angle) * r,
    heli.height + Math.sin(time * 0.7) * 2,
    playerZ + Math.sin(heli.angle) * r,
  );
  heli.group.rotation.y = -heli.angle;
  heli.rotor.rotation.y += dt * 22;
}

// Chase camera for the ?shot=chase cover: parked straight ahead of the car
// on the same avenue, looking back down it — so the player's car, the
// Interceptor right behind it and the helicopter above all share one frame,
// with the avenue's buildings framing both sides. (No sideways offset: a
// camera 9m off the road line ends up inside a building.)
export function updateChaseCamera(car, police, camera) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const cx = car.x + fx * 16;
  const cz = car.z + fz * 16;
  camera.position.set(cx, 6, cz);
  const lookX = police ? (car.x + police.x) / 2 : car.x;
  const lookZ = police ? (car.z + police.z) / 2 : car.z;
  camera.lookAt(lookX, 1.6, lookZ);
}

// Chase camera behind a car: higher and further back than the on-foot camera.
export function updateCarCamera(car, camera, mouse, colliders) {
  const yaw = car.heading + Math.PI;
  const dist = 10.5;
  const height = 4.2;
  const cx = car.x + Math.sin(yaw) * dist;
  const cz = car.z + Math.cos(yaw) * dist;
  camera.position.set(cx, height, cz);
  camera.lookAt(car.x, 1.4, car.z);
}
