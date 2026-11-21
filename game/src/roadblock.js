// Vice Point — roadblocks: the VCPD barricades the road at wanted >= 3
// during escape jobs. Two Interceptors park angled across the carriageway
// with striped barriers between them. Ram one at speed and it gets shoved
// aside (the block breaks, the heat goes up); crawl into it and it just
// stops you — driveCar already pushes the player's car out of the parked
// units, so a slow approach can never phase through. A block the player
// slips past, or outwaits, is cleared away.

import * as THREE from 'three';
import { POLICE_DEF } from './config.js';

// Two parked Interceptors + barriers, built from the same meshes as the
// chase fleet so a block reads as police at a glance. Returned cars are
// plain car-like objects ({def, x, z, heading, speed, group, police}) so
// driveCar's car-vs-car push treats them as solid.
export function createRoadblock(scene, x, z, heading) {
  const group = new THREE.Group();
  const cars = [];
  // Perpendicular to the road: three units across the carriageway, one of
  // them dead centre — a 9 m gap between two cars is a lane, not a block.
  // The units sit 4.5 m apart, and a car needs 3.6 m of clearance from each,
  // so there is no clean line through the middle any more.
  const across = heading + Math.PI / 2;
  const spots = [
    { dx: Math.sin(across) * -4.5, dz: Math.cos(across) * -4.5, h: heading + 0.6 },
    { dx: 0, dz: 0, h: heading - 0.5 },
    { dx: Math.sin(across) * 4.5, dz: Math.cos(across) * 4.5, h: heading + 0.4 },
  ];
  for (const spot of spots) {
    const car = buildBlockCar();
    car.x = x + spot.dx;
    car.z = z + spot.dz;
    car.heading = spot.h;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    group.add(car.group);
    cars.push(car);
  }
  // Striped barriers between the cars. Positions are in world space (the
  // group sits at the origin), so the block centre (x, z) is added in; the
  // bar's long axis runs across the road (rotation across - PI/2) and its
  // legs stand at the bar's two ends.
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xff5a3c, roughness: 0.7 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 });
  for (const s of [-2.25, 2.25]) {
    const bx = x + Math.sin(across) * s;
    const bz = z + Math.cos(across) * s;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 0.25), stripeMat);
    bar.position.set(bx, 0.75, bz);
    bar.rotation.y = across - Math.PI / 2;
    group.add(bar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 0.26), whiteMat);
    stripe.position.set(bx, 0.95, bz);
    stripe.rotation.y = across - Math.PI / 2;
    group.add(stripe);
    for (const leg of [-1.9, 1.9]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.75, 0.12), whiteMat);
      post.position.set(
        bx + Math.sin(across) * leg,
        0.38,
        bz + Math.cos(across) * leg,
      );
      group.add(post);
    }
  }
  group.position.set(0, 0, 0);
  scene.add(group);
  return {
    group, cars, x, z, heading,
    broken: false, timer: 30, // seconds until the VCPD gives up and clears it
  };
}

function buildBlockCar() {
  const group = new THREE.Group();
  const def = POLICE_DEF;
  const paint = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.35, metalness: 0.45 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(def.width, 0.62, def.length), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(def.width * 0.82, 0.55, def.length * 0.45),
    new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.15, metalness: 0.6 }),
  );
  cabin.position.set(0, 1.1, -def.length * 0.05);
  group.add(cabin);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4, metalness: 0.3 });
  const doors = new THREE.Mesh(new THREE.BoxGeometry(def.width + 0.04, 0.4, def.length * 0.42), doorMat);
  doors.position.set(0, 0.62, 0);
  group.add(doors);
  const barBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.12, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }),
  );
  barBase.position.set(0, 1.44, 0);
  group.add(barBase);
  const strobeL = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.16, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 1.6 }),
  );
  strobeL.position.set(-0.28, 1.52, 0);
  group.add(strobeL);
  const strobeR = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.16, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 1.6 }),
  );
  strobeR.position.set(0.28, 1.52, 0);
  group.add(strobeR);
  return {
    def, group, strobeL, strobeR,
    x: 0, z: 0, heading: 0, speed: 0, police: true, traffic: false, roadblock: true,
  };
}

// Shove all units sideways off the road when the player rams through.
export function smashRoadblock(block) {
  block.broken = true;
  const across = block.heading + Math.PI / 2;
  for (let i = 0; i < block.cars.length; i++) {
    const car = block.cars[i];
    const side = i % 2 === 0 ? -1 : 1;
    car.x += Math.sin(across) * side * 7;
    car.z += Math.cos(across) * side * 7;
    car.heading += side * 0.5;
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
  }
}

export function removeRoadblock(scene, block) {
  if (!block) return;
  scene.remove(block.group);
}
