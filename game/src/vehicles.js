// Vice Point — drivable cars. One factory builds the low-poly car model
// (body, cabin, four wheels, headlights), and one update step drives it with
// arcade handling: accelerate, brake, reverse and steering that follows
// speed, with a simple circle-vs-building collision so cars cannot pass
// through the city.

import * as THREE from 'three';

export function makeCar(color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.62, 4.4), paint);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.58, 2.1), glass);
  cabin.position.set(0, 1.18, -0.25);
  cabin.castShadow = true;
  group.add(cabin);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.22, 4.42), dark);
  skirt.position.y = 0.3;
  group.add(skirt);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheels = [];
  for (const [wx, wz] of [[-0.88, 1.45], [0.88, 1.45], [-0.88, -1.45], [0.88, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const lx of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), lightMat);
    lamp.position.set(lx, 0.66, 2.22);
    group.add(lamp);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const lx of [-0.62, 0.62]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    lamp.position.set(lx, 0.66, -2.22);
    group.add(lamp);
  }

  group.userData.wheels = wheels;
  return group;
}

const CAR_RADIUS = 1.7;
const WORLD = { minX: -164, maxX: 164, minZ: -164, maxZ: 196 };

// Push a circle (x, z, radius) out of every building AABB it overlaps.
// Returns true when a collision happened.
export function resolveCircleCollision(x, z, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = radius - d;
      x += (dx / d) * push;
      z += (dz / d) * push;
    } else {
      // Centre inside the box: shove out along the smallest exit.
      const exits = [x - (c.minX - radius), (c.maxX + radius) - x, z - (c.minZ - radius), (c.maxZ + radius) - z];
      const m = Math.min(...exits);
      if (m === exits[0]) x = c.minX - radius;
      else if (m === exits[1]) x = c.maxX + radius;
      else if (m === exits[2]) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return { x, z, hit };
}

// One arcade driving step. `car` is { group, speed, steerVisual } and
// `input` is { forward: -1..1, steer: -1..1 }. Mutates the car in place.
export function driveCar(car, input, dt, colliders) {
  const MAX_FWD = 27;
  const MAX_REV = 9;
  const ACCEL = 15;
  const BRAKE = 26;
  if (input.forward > 0) car.speed += ACCEL * dt * input.forward;
  else if (input.forward < 0) {
    car.speed += (car.speed > 0.5 ? -BRAKE : -ACCEL * 0.6) * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 9 * dt);
  }
  car.speed = Math.max(-MAX_REV, Math.min(MAX_FWD, car.speed));

  const speedFactor = Math.max(-1, Math.min(1, car.speed / 9));
  // Steering right (input +1) decreases yaw: with forward = (sin yaw, 0,
  // cos yaw), a larger yaw turns the car left, so right is negative.
  car.group.rotation.y -= input.steer * speedFactor * 1.7 * dt * (car.speed >= 0 ? 1 : -1);
  car.yaw = car.group.rotation.y;

  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  let nx = car.group.position.x + fx * car.speed * dt;
  let nz = car.group.position.z + fz * car.speed * dt;
  nx = Math.max(WORLD.minX, Math.min(WORLD.maxX, nx));
  nz = Math.max(WORLD.minZ, Math.min(WORLD.maxZ, nz));
  const solved = resolveCircleCollision(nx, nz, CAR_RADIUS, colliders);
  if (solved.hit) car.speed *= 0.45;
  car.group.position.x = solved.x;
  car.group.position.z = solved.z;

  const wheels = car.group.userData.wheels;
  const spin = (car.speed * dt) / 0.36;
  for (let i = 0; i < wheels.length; i++) {
    wheels[i].rotation.x += spin;
    if (i < 2) wheels[i].rotation.y = input.steer * 0.38;
  }
}
