// Vice Point — Ray Delgado on foot. WASD moves relative to the camera yaw,
// Shift sprints, the mouse (pointer lock) steers the look direction, and a
// simple AABB push-out keeps Ray out of buildings. The model is a low-poly
// figure built from boxes: jacket, jeans, sneakers and a cap.
import * as THREE from 'three';

export class Walker {
  constructor(scene, start) {
    this.pos = new THREE.Vector3(start.x, 0, start.z);
    this.yaw = start.yaw;
    this.speed = 0;
    this.stepPhase = 0;
    this.group = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0xc23b3b });
    const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a5e });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a075 });
    const cap = new THREE.MeshLambertMaterial({ color: 0x1c2440 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.9, 0.4), jacket);
    torso.position.y = 1.15;
    this.group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
    head.position.y = 1.85;
    this.group.add(head);
    const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48), cap);
    capTop.position.y = 2.1;
    this.group.add(capTop);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.24), cap);
    brim.position.set(0, 2.04, 0.3);
    this.group.add(brim);
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.85, 0.3), jeans);
    this.legL.position.set(-0.19, 0.45, 0);
    this.group.add(this.legL);
    this.legR = this.legL.clone();
    this.legR.position.x = 0.19;
    this.group.add(this.legR);
    this.armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.24), jacket);
    this.armL.position.set(-0.48, 1.2, 0);
    this.group.add(this.armL);
    this.armR = this.armL.clone();
    this.armR.position.x = 0.48;
    this.group.add(this.armR);
    this.group.position.copy(this.pos);
    scene.add(this.group);
  }
  collides(colliders, x, z, r = 0.6) {
    for (const c of colliders) {
      if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
    }
    return false;
  }
  update(dt, keys, camYaw, colliders, sounds) {
    let fx = 0, fz = 0;
    if (keys.has('KeyW')) fz -= 1;
    if (keys.has('KeyS')) fz += 1;
    if (keys.has('KeyA')) fx -= 1;
    if (keys.has('KeyD')) fx += 1;
    const moving = fx !== 0 || fz !== 0;
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const target = moving ? (run ? 9.5 : 5.2) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 8);
    if (moving) {
      const len = Math.hypot(fx, fz);
      fx /= len; fz /= len;
      const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
      const wx = fx * cos - fz * sin;
      const wz = fx * sin + fz * cos;
      const nx = this.pos.x + wx * this.speed * dt;
      const nz = this.pos.z + wz * this.speed * dt;
      if (!this.collides(colliders, nx, this.pos.z)) this.pos.x = nx;
      if (!this.collides(colliders, this.pos.x, nz)) this.pos.z = nz;
      this.yaw = Math.atan2(wx, wz);
      const prev = this.stepPhase;
      this.stepPhase += this.speed * dt * 1.6;
      if (Math.floor(this.stepPhase / Math.PI) !== Math.floor(prev / Math.PI)) sounds.step(run);
    }
    const swing = moving ? Math.sin(this.stepPhase) * 0.55 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.7;
    this.armR.rotation.x = swing * 0.7;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    return moving;
  }
}
