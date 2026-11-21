// Vehicles: six stealable cars with arcade handling, ambient traffic that
// drives the grid and yields to the car ahead, and the police response —
// an Interceptor patrol car that pursues at up to 34 m/s and the Air One
// helicopter. Cars are simple box-built low-poly bodies with cabin, wheels
// and headlights.
import * as THREE from 'three';
import { CAR, CITY, PALETTE, POLICE, TRAFFIC } from './config.js';
import { createRandom, pick, range } from './random.js';

const CAR_NAMES = ['Comet GT', 'Sunrise Coupe', 'Bayliner Sedan', 'Palm Van', 'Vice Cruiser', 'Marina Hatch'];

function buildCarMesh(scene, paint, isPolice) {
  const group = new THREE.Group();
  const paintMat = new THREE.MeshStandardMaterial({ color: paint, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), paintMat);
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.65, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.2, metalness: 0.6 }),
  );
  cabin.position.set(0, 1.3, -0.2);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const hx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.08), headMat);
    head.position.set(hx, 0.7, 2.22);
    group.add(head);
  }
  let lights = null;
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.72, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.set(-0.3, 1.74, -0.2);
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    blue.position.set(0.3, 1.74, -0.2);
    group.add(blue);
    const decal = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    decal.position.set(0, 0.72, 0);
    group.add(decal);
    lights = { red, blue };
  }
  scene.add(group);
  return { group, wheels, lights };
}

export function createVehicles(scene, colliders) {
  const random = createRandom(CITY.seed + 31);
  const pitch = CITY.blockSize + CITY.roadWidth;
  const origin = -(CITY.blocks / 2) * pitch + pitch / 2;

  const cars = [];
  for (let i = 0; i < CAR.count; i += 1) {
    const paint = PALETTE.carPaint[i % PALETTE.carPaint.length];
    const mesh = buildCarMesh(scene, paint, false);
    const roadX = origin + (i % CITY.blocks) * pitch;
    const roadZ = origin + Math.floor(i / CITY.blocks) * pitch * 2 - 30;
    const car = {
      name: CAR_NAMES[i % CAR_NAMES.length],
      mesh,
      x: roadX + (i % 2 === 0 ? 3.4 : -3.4),
      z: roadZ,
      yaw: (i % 2 === 0 ? 0 : Math.PI),
      speed: 0,
      steer: 0,
      stolen: false,
    };
    mesh.group.position.set(car.x, 0, car.z);
    mesh.group.rotation.y = car.yaw;
    cars.push(car);
  }

  // Police Interceptor: parked at the precinct until the wanted level rises.
  const policeMesh = buildCarMesh(scene, POLICE.paint ?? PALETTE.policePaint, true);
  const police = {
    mesh: policeMesh,
    x: origin + 20,
    z: origin - 20,
    yaw: Math.PI / 2,
    speed: 0,
    active: false,
    lightPhase: 0,
  };
  policeMesh.group.position.set(police.x, 0, police.z);
  policeMesh.group.rotation.y = police.yaw;

  // Air One helicopter: a small low-poly heli with a spinning rotor.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.4, 4.6),
    new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.4, metalness: 0.5 }),
  );
  heliBody.castShadow = true;
  heli.add(heliBody);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), new THREE.MeshStandardMaterial({ color: 0x223344 }));
  tail.position.set(0, 0.3, -3.6);
  heli.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  rotor.position.y = 1.0;
  heli.add(rotor);
  const search = new THREE.SpotLight(0xfff6c0, 400, 120, 0.35, 0.5, 1.2);
  search.position.set(0, -0.6, 0);
  search.target.position.set(0, -40, 0);
  heli.add(search);
  heli.add(search.target);
  heli.position.set(police.x, POLICE.heliHeight, police.z - 30);
  heli.visible = false;
  scene.add(heli);

  // Ambient traffic: cars looping the grid avenues at a steady cruise,
  // each one remembering its own cruise speed so it can slow for traffic.
  const traffic = [];
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const mesh = buildCarMesh(scene, pick(random, PALETTE.carPaint), false);
    const lane = origin + Math.floor(random() * CITY.blocks) * pitch;
    const horizontal = random() < 0.5;
    const cruise = TRAFFIC.speed + range(random, -2, 2);
    const t = {
      mesh,
      horizontal,
      lane,
      along: range(random, -CITY.halfSize, CITY.halfSize),
      dir: random() < 0.5 ? 1 : -1,
      cruise,
      speed: cruise,
    };
    traffic.push(t);
  }

  function collides(x, z) {
    const r = 1.4;
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  function drive(car, dt, input) {
    const accel = input.forward ? CAR.accel : input.back ? -CAR.accel * 0.6 : 0;
    if (input.brake) {
      car.speed -= Math.sign(car.speed) * CAR.brake * dt;
      if (Math.abs(car.speed) < 0.5) car.speed = 0;
    } else {
      car.speed += accel * dt;
    }
    car.speed -= car.speed * 0.55 * dt;
    car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
    if (Math.abs(car.speed) > 0.4) {
      car.yaw += car.steer * CAR.steer * dt * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 10);
    }
    const nx = car.x + Math.sin(car.yaw) * car.speed * dt;
    const nz = car.z + Math.cos(car.yaw) * car.speed * dt;
    if (!collides(nx, nz) && Math.abs(nx) < 300 && Math.abs(nz) < 240) {
      car.x = nx;
      car.z = nz;
    } else {
      car.speed *= -0.25;
    }
    car.mesh.group.position.set(car.x, 0, car.z);
    car.mesh.group.rotation.y = car.yaw;
    for (const wheel of car.mesh.wheels) wheel.rotation.x += car.speed * dt * 2;
  }

  function update(dt, time, playerPos, wanted) {
    // Traffic AI: each car checks the same lane ahead of it. A car close
    // ahead makes it brake to a stop; one a little further ahead makes it
    // ease off to half speed. Nobody drives through anybody — including
    // the player: a driven car ahead in the same lane is yielded to too.
    for (const t of traffic) {
      let speed = t.cruise;
      for (const other of traffic) {
        if (other === t || other.horizontal !== t.horizontal || other.lane !== t.lane || other.dir !== t.dir) continue;
        const gap = (other.along - t.along) * t.dir;
        if (gap > 0 && gap < 9) {
          speed = 0;
          break;
        }
        if (gap > 0 && gap < 16) speed = Math.min(speed, t.cruise * 0.5);
      }
      if (speed > 0) {
        // Yield to the player when they are ahead in this car's lane.
        const playerAlong = t.horizontal ? playerPos.x : playerPos.z;
        const playerLane = t.horizontal ? playerPos.z : playerPos.x;
        const gap = (playerAlong - t.along) * t.dir;
        if (Math.abs(playerLane - (t.lane + 3.4)) < 3 && gap > 0 && gap < 10) speed = 0;
        else if (Math.abs(playerLane - (t.lane + 3.4)) < 3 && gap > 0 && gap < 18) speed = Math.min(speed, t.cruise * 0.5);
      }
      t.speed = speed;
      t.along += t.dir * t.speed * dt;
      if (t.along > CITY.halfSize) t.along = -CITY.halfSize;
      if (t.along < -CITY.halfSize) t.along = CITY.halfSize;
      const x = t.horizontal ? t.along : t.lane + 3.4;
      const z = t.horizontal ? t.lane + 3.4 : t.along;
      t.mesh.group.position.set(x, 0, z);
      t.mesh.group.rotation.y = t.horizontal ? (t.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (t.dir > 0 ? 0 : Math.PI);
    }
    // Police pursuit: at wanted 2+ the Interceptor rolls out toward the
    // player, steering to intercept. It tops out at 34 m/s and only gains
    // 6 m/s per second, so a clean getaway car (42 m/s) can pull away —
    // and it eases off inside 8 m so it corners onto the player instead
    // of overshooting past them. At wanted 4 the helicopter joins.
    police.active = wanted >= 2;
    police.mesh.group.visible = true;
    if (police.active) {
      const dx = playerPos.x - police.x;
      const dz = playerPos.z - police.z;
      const dist = Math.hypot(dx, dz);
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - police.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      police.yaw += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
      police.speed = Math.min(POLICE.chaseSpeed, police.speed + POLICE.chaseAccel * dt);
      if (dist < 8) police.speed = Math.min(police.speed, 12);
      const nx = police.x + Math.sin(police.yaw) * police.speed * dt;
      const nz = police.z + Math.cos(police.yaw) * police.speed * dt;
      if (!collides(nx, nz)) {
        police.x = nx;
        police.z = nz;
      } else {
        // Stuck on a building corner: back off and re-aim next frame.
        police.speed *= 0.4;
      }
      police.lightPhase += dt * 10;
      const flashingRed = Math.sin(police.lightPhase) > 0;
      if (police.mesh.lights) {
        police.mesh.lights.red.visible = flashingRed;
        police.mesh.lights.blue.visible = !flashingRed;
      }
      police.mesh.group.position.set(police.x, 0, police.z);
      police.mesh.group.rotation.y = police.yaw;
    } else if (police.speed > 0) {
      police.speed = Math.max(0, police.speed - 10 * dt);
    }
    const heliWanted = wanted >= 4;
    heli.visible = heliWanted;
    if (heliWanted) {
      const hx = playerPos.x + Math.sin(time * 0.4) * 14;
      const hz = playerPos.z + Math.cos(time * 0.4) * 14;
      heli.position.x += (hx - heli.position.x) * Math.min(1, dt * 0.8);
      heli.position.z += (hz - heli.position.z) * Math.min(1, dt * 0.8);
      heli.position.y = POLICE.heliHeight + Math.sin(time * 1.3) * 2;
      heli.rotation.y = Math.atan2(playerPos.x - heli.position.x, playerPos.z - heli.position.z);
      rotor.rotation.y += dt * 22;
      search.intensity = 300 + Math.sin(time * 6) * 120;
    }
    return { policeDistance: Math.hypot(playerPos.x - police.x, playerPos.z - police.z) };
  }

  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }

  return { cars, police, heli, traffic, drive, update, nearestCar };
}
