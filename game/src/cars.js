// Vice Point — six stealable cars with simple arcade driving. Each car is a
// low-poly build (body, cabin, wheels, headlights) with its own colour, top
// speed and acceleration from config. E enters/exits; driving uses W/S for
// throttle and brake/reverse, A/D to steer, Space for the handbrake. The
// chase camera is computed in main.js so it can also serve the walker.
import * as THREE from 'three';
import { CARS } from './config.js';

function buildCarMesh(def) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: def.color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x18242e });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), paint);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.58, 2.2), glass);
  cabin.position.set(0, 1.18, -0.2);
  g.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.34, 0.7), paint);
  nose.position.set(0, 0.52, 2.4);
  g.add(nose);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const sx of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), lightMat);
    lamp.position.set(sx, 0.62, 2.78);
    g.add(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    tail.position.set(sx, 0.62, -2.24);
    g.add(tail);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  g.userData.wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
    g.userData.wheels.push(w);
  }
  return g;
}

export class CarFleet {
  constructor(scene) {
    this.list = CARS.map((def, i) => {
      // Parked on road lines (x/z = -250, -150, -50, 50, 150, 250), clear of
      // building lots and their annex blocks.
      const spots = [
        [-50, -20], [50, 30], [-150, 80], [150, -100], [50, 200], [-250, -120],
      ];
      const mesh = buildCarMesh(def);
      mesh.position.set(spots[i][0], 0, spots[i][1]);
      mesh.rotation.y = (i * 1.1) % (Math.PI * 2);
      scene.add(mesh);
      return {
        def, mesh,
        pos: mesh.position,
        heading: mesh.rotation.y,
        speed: 0,
        steer: 0,
        occupied: false,
      };
    });
  }
  nearest(pos, maxDist = 4.5) {
    let best = null, bestD = maxDist;
    for (const car of this.list) {
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }
  drive(car, dt, keys, colliders, sounds) {
    const def = car.def;
    let throttle = 0;
    if (keys.has('KeyW')) throttle += 1;
    if (keys.has('KeyS')) throttle -= 1;
    const handbrake = keys.has('Space');
    car.speed += throttle * def.accel * dt;
    if (handbrake) car.speed *= Math.max(0, 1 - dt * 4);
    else car.speed *= Math.max(0, 1 - dt * 0.7);
    car.speed = Math.max(-def.top * 0.45, Math.min(def.top, car.speed));
    if (Math.abs(car.speed) < 0.05 && throttle === 0) car.speed = 0;
    const steerTarget = (keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0);
    const steerGoal = steerTarget * 0.55 * Math.min(1, Math.abs(car.speed) / 8);
    car.steer += (steerGoal - car.steer) * Math.min(1, dt * 6);
    car.heading += car.steer * (car.speed / def.top) * def.grip * dt * (car.speed >= 0 ? 1 : -1);
    const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
    let blocked = false;
    for (const c of colliders) {
      if (nx + 1.1 > c.x0 && nx - 1.1 < c.x1 && nz + 1.1 > c.z0 && nz - 1.1 < c.z1) { blocked = true; break; }
    }
    if (nx > 295 || nx < -295 || nz > 295 || nz < -295) blocked = true;
    if (!blocked) {
      car.pos.x = nx;
      car.pos.z = nz;
    } else {
      car.speed *= -0.25;
    }
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = car.heading;
    car.mesh.rotation.z = -car.steer * 0.06;
    for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
    sounds.setEngine(true, Math.abs(car.speed) / def.top);
    return Math.abs(car.speed);
  }
}
