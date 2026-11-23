// Vice Point — street traffic. Ten AI cars cruise the road grid, one lane
// each way, easing off for the car ahead and for the player. A hard shunt
// against the player's car costs the player heat, and a smashed-up traffic
// car limps away instead of vanishing from the street.
import * as THREE from 'three';
import { makeRng } from './config.js';

const ROADS = [-250, -150, -50, 50, 150, 250];
const PAINT = [0x4a6fa5, 0xd8d2c0, 0x3f7a4a, 0x8a2f2f, 0x7a6a8a, 0xc9a227, 0xb0b8c0, 0x2e4a3a, 0x9a6a3a, 0x5a3a6a];
const NAMES = ['Hauler', 'Civic', 'Comet', 'Tide', 'Sable', 'Mule', 'Gull', 'Rook', 'Ferry', 'Pinto'];

function buildStreetCarMesh(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2830 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.1), paint);
  body.position.y = 0.58;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 2.0), glass);
  cabin.position.set(0, 1.12, -0.25);
  g.add(cabin);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f });
  for (const sx of [-0.65, 0.65]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.08), lampMat);
    lamp.position.set(sx, 0.6, 2.08);
    g.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.08), tailMat);
    tail.position.set(sx, 0.6, -2.08);
    g.add(tail);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 9);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x101214 });
  g.userData.wheels = [];
  for (const [wx, wz] of [[-0.92, 1.35], [0.92, 1.35], [-0.92, -1.35], [0.92, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    g.userData.wheels.push(w);
  }
  return g;
}

export class Traffic {
  constructor(scene) {
    const rng = makeRng(4242);
    this.list = [];
    for (let i = 0; i < 10; i++) {
      const alongRoad = rng() < 0.5; // drive along x (east-west road) or z
      const line = ROADS[Math.floor(rng() * ROADS.length)];
      const laneSide = rng() < 0.5 ? -3 : 3;
      const dir = rng() < 0.5 ? 1 : -1;
      const along = -280 + rng() * 560;
      const mesh = buildStreetCarMesh(PAINT[i]);
      const car = {
        name: NAMES[i],
        mesh,
        pos: mesh.position,
        heading: 0,
        speed: 0,
        cruise: 8 + rng() * 6, // 8..14 m/s
        alongRoad,
        line,
        laneSide,
        dir,
        damaged: 0,
        brakeLight: 0,
      };
      if (alongRoad) {
        car.pos.set(along, 0, line + laneSide);
        car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.pos.set(line + laneSide, 0, along);
        car.heading = dir > 0 ? 0 : Math.PI;
      }
      mesh.rotation.y = car.heading;
      scene.add(mesh);
      this.list.push(car);
    }
  }

  // Distance to the nearest thing ahead on the same road and lane.
  aheadGap(car, others, playerCar, playerPos, onFoot) {
    let gap = 999;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const check = (ox, oz, halfLen) => {
      const dx = ox - car.pos.x, dz = oz - car.pos.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > 40) return;
      const side = Math.abs(dx * fz - dz * fx);
      if (side < 2.6) gap = Math.min(gap, along - halfLen);
    };
    for (const o of others) {
      if (o === car) continue;
      if (o.alongRoad !== car.alongRoad || o.line !== car.line || o.laneSide !== car.laneSide) continue;
      check(o.pos.x, o.pos.z, 2.4);
    }
    if (playerCar) check(playerCar.pos.x, playerCar.pos.z, 2.4);
    else if (onFoot) check(playerPos.x, playerPos.z, 0.8);
    return gap;
  }

  update(dt, colliders, playerCar, playerPos, onFoot, onCrash) {
    for (const car of this.list) {
      const gap = this.aheadGap(car, this.list, playerCar, playerPos, onFoot);
      const want = car.damaged > 0 ? car.cruise * 0.4 : car.cruise;
      let target = want;
      if (gap < 14) target = 0;
      else if (gap < 26) target = Math.min(want, (gap - 12) * 0.9);
      const accel = target > car.speed ? 5 : 11;
      car.speed += Math.max(-accel * dt, Math.min(accel * dt, target - car.speed));
      if (car.speed < 0.02) car.speed = 0;
      if (car.damaged > 0) car.damaged = Math.max(0, car.damaged - dt);
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const nx = car.pos.x + fx * car.speed * dt;
      const nz = car.pos.z + fz * car.speed * dt;
      // A stray annex block can jut onto a road: stop and turn around.
      let blocked = nx > 292 || nx < -292 || nz > 292 || nz < -292;
      if (!blocked) {
        for (const c of colliders) {
          if (nx + 1.0 > c.x0 && nx - 1.0 < c.x1 && nz + 1.0 > c.z0 && nz - 1.0 < c.z1) { blocked = true; break; }
        }
      }
      if (blocked && car.speed > 0.5) {
        car.dir *= -1;
        car.laneSide *= -1;
        car.heading += Math.PI;
        car.speed = 0;
      } else if (!blocked) {
        car.pos.x = nx;
        car.pos.z = nz;
      }
      // Wrap around the far end of the road so the streets never empty out.
      const along = car.alongRoad ? car.pos.x : car.pos.z;
      if (along * car.dir > 292) {
        if (car.alongRoad) car.pos.x = -292 * car.dir;
        else car.pos.z = -292 * car.dir;
      }
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
      // Shunt with the player's car: noise, a shove, heat when it was hard.
      if (playerCar) {
        const d = Math.hypot(car.pos.x - playerCar.pos.x, car.pos.z - playerCar.pos.z);
        if (d < 3.6) {
          const rel = Math.abs(car.speed - playerCar.speed);
          const push = (playerCar.pos.x - car.pos.x) / (d || 1);
          const pushZ = (playerCar.pos.z - car.pos.z) / (d || 1);
          playerCar.pos.x += push * 0.35;
          playerCar.pos.z += pushZ * 0.35;
          playerCar.speed *= 0.55;
          car.speed *= 0.6;
          car.damaged = 6;
          car.pos.x -= push * 0.3;
          car.pos.z -= pushZ * 0.3;
          if (rel > 4 && onCrash) onCrash(rel, car.pos.x, car.pos.z);
        }
      }
    }
  }
}
