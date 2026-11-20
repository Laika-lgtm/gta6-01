// Vice Point — the wanted level and the police. Hitting people and cars,
// or starting the Heat job, raises the wanted level from 0 to 5 stars;
// staying out of sight of every Interceptor lets it fall again, one star
// per quiet stretch. Interceptors chase Ray, ram his car, and bust him if
// they pin him down on foot or crawling — a bust costs a $100 fine, clears
// the wanted level and drops Ray back at a safe spot. Top speed is 34 m/s
// on purpose: faster than Ray's 27 m/s cars, but slow enough through
// corners and from a standing start that a good driver can break away and
// hide. The module only tracks state; the game loop owns cash, missions
// and the bust itself.

import * as THREE from 'three';
import { makeCar, resolveCircleCollision } from './vehicles.js';

const POLICE_MAX_SPEED = 34;
const POLICE_ACCEL = 6;
const POLICE_TURN = 2.4;
const UNSEEN_DISTANCE = 55; // no Interceptor this close: the heat cools off
const DECAY_SECONDS = 6; // quiet seconds per star lost
const BUST_DISTANCE = 3.4;
const BUST_SECONDS = 1.2; // pinned down this long while slow: busted
const CHASE_RANGE = 90; // past this, they cruise to the last known spot

export class PoliceManager {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.wanted = 0;
    this.decayTimer = 0;
    this.bustTimer = 0;
    this.fine = 100;
    this.police = []; // { group, speed, yaw, stuckTimer, lastX, lastZ, detour, detourTimer, flash }
    this.anchor = { x: 0, z: 0 }; // where the player is: spawn point for new units
    this.lastKnown = { x: 0, z: 0 };
    // Air One overhead means one extra Interceptor and no cooling off.
    this.heliActive = false;
    // Roadblocks: barricades the police throw across the road ahead of
    // Ray once the heat hits 3 stars. Each is a group with two parked
    // Interceptors and a striped barrier; blockColliders is the AABB list
    // the game loop merges into the driving collision.
    this.roadblocks = []; // { group, x, z }
    this.blockColliders = [];
    this.roadblockTimer = 0;
  }

  desiredCount() {
    let n;
    if (this.wanted >= 4) n = 3;
    else if (this.wanted >= 2) n = 2;
    else if (this.wanted >= 1) n = 1;
    else n = 0;
    if (this.heliActive && n > 0) n += 1; // Air One calls in backup
    return n;
  }

  desiredRoadblocks() {
    if (this.wanted >= 5) return 2;
    if (this.wanted >= 3) return 1;
    return 0;
  }

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n | 0));
    this.decayTimer = 0;
    this.bustTimer = 0;
    this.syncPolice();
    if (this.wanted > 0) this.sound.startSiren();
    else this.sound.stopSiren();
  }

  addWanted(n) {
    this.setWanted(this.wanted + n);
  }

  clearWanted() {
    this.setWanted(0);
  }

  syncPolice() {
    while (this.police.length < this.desiredCount()) this.spawnOne();
    while (this.police.length > this.desiredCount()) this.removeOne();
  }

  spawnOne() {
    const group = makeCar(0x14181f);
    // Light bar: red left, blue right, flashing in update().
    const barGeo = new THREE.BoxGeometry(0.5, 0.16, 0.34);
    const red = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.set(-0.32, 1.56, -0.25);
    const blue = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blue.position.set(0.32, 1.56, -0.25);
    group.add(red);
    group.add(blue);
    // White doors so the Interceptor reads as a police car at a glance.
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    for (const dx of [-0.96, 0.96]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 1.6), doorMat);
      door.position.set(dx, 0.62, -0.2);
      group.add(door);
    }
    // Park it on a road near the player, never inside a building.
    const angle = Math.random() * Math.PI * 2;
    const dist = 32 + Math.random() * 12;
    let x = this.anchor.x + Math.sin(angle) * dist;
    let z = this.anchor.z + Math.cos(angle) * dist;
    x = Math.max(-160, Math.min(160, x));
    z = Math.max(-160, Math.min(190, z));
    const solved = resolveCircleCollision(x, z, 2.2, this.colliders ?? []);
    group.position.set(solved.x, 0, solved.z);
    this.scene.add(group);
    this.police.push({
      group,
      speed: 0,
      yaw: Math.atan2(this.anchor.x - solved.x, this.anchor.z - solved.z),
      stuckTimer: 0,
      lastX: solved.x,
      lastZ: solved.z,
      detour: 0,
      detourTimer: 0,
      flash: Math.random(),
      hp: 100,
      red,
      blue,
    });
  }

  removeOne() {
    const p = this.police.pop();
    if (!p) return;
    this.scene.remove(p.group);
  }

  // Shoot an Interceptor: returns 'destroyed' when its hp runs out (the
  // unit leaves the scene), 'hit' on a damaging hit, null when the index
  // is stale. No wanted change — the heat is already on.
  damagePolice(index, dmg) {
    const p = this.police[index];
    if (!p) return null;
    p.hp -= dmg;
    if (p.hp > 0) return 'hit';
    this.scene.remove(p.group);
    this.police.splice(index, 1);
    return 'destroyed';
  }

  // --- roadblocks ---
  makeRoadblockCar() {
    const group = makeCar(0x14181f);
    const barGeo = new THREE.BoxGeometry(0.5, 0.16, 0.34);
    const red = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
    red.position.set(-0.32, 1.56, -0.25);
    const blue = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    blue.position.set(0.32, 1.56, -0.25);
    group.add(red);
    group.add(blue);
    return group;
  }

  // A striped barrier: alternating orange / white blocks across the road.
  makeBarrier() {
    const g = new THREE.Group();
    const orange = new THREE.MeshLambertMaterial({ color: 0xe8722a });
    const white = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.55, 0.3),
        i % 2 === 0 ? orange : white,
      );
      seg.position.set(-3.3 + i * 1.1, 0.75, 0);
      g.add(seg);
    }
    for (const lx of [-3.3, 3.3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.6), orange);
      leg.position.set(lx, 0.38, 0);
      g.add(leg);
    }
    return g;
  }

  clearRoadblocks() {
    for (const rb of this.roadblocks) this.scene.remove(rb.group);
    this.roadblocks = [];
    this.blockColliders = [];
  }

  // Place the barricades on the street ahead of the player, snapped to
  // the nearest street centreline so they sit on asphalt, not in a
  // building. `heading` is the player's yaw. Rebuilt every few seconds
  // as Ray moves; skipped entirely off-road (beach, pier).
  updateRoadblocks(dt, px, pz, heading) {
    this.roadblockTimer -= dt;
    const want = this.desiredRoadblocks();
    if (want === 0) {
      if (this.roadblocks.length > 0) this.clearRoadblocks();
      return;
    }
    if (this.roadblocks.length !== want || this.roadblockTimer <= 0) {
      this.roadblockTimer = 4;
      this.clearRoadblocks();
      // Off the road grid (beach / pier): no street to block.
      if (pz > 150 || Math.abs(px) > 158) return;
      const streetLines = [-100, -50, 0, 50, 100];
      const snap = (v) => streetLines.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      for (let i = 0; i < want; i++) {
        const ahead = 45 + i * 32;
        const ax = px + fx * ahead;
        const az = pz + fz * ahead;
        let cx;
        let cz;
        if (Math.abs(fx) > Math.abs(fz)) {
          cx = Math.max(-150, Math.min(150, ax));
          cz = snap(az);
        } else {
          cx = snap(ax);
          cz = Math.max(-150, Math.min(150, az));
        }
        const group = new THREE.Group();
        // Two Interceptors parked across the road, plus a barrier.
        const carYaw = heading + Math.PI / 2;
        for (const off of [-3.4, 3.4]) {
          const car = this.makeRoadblockCar();
          // Side by side across the road: offset perpendicular to the
          // player's heading, car noses pointing across the asphalt.
          const ox = Math.cos(heading) * off;
          const oz = -Math.sin(heading) * off;
          car.position.set(cx + ox, 0, cz + oz);
          car.rotation.y = carYaw;
          group.add(car);
          // AABB for the parked car, from its yaw.
          const hx = Math.abs(Math.cos(carYaw)) * 1.1 + Math.abs(Math.sin(carYaw)) * 2.3;
          const hz = Math.abs(Math.sin(carYaw)) * 1.1 + Math.abs(Math.cos(carYaw)) * 2.3;
          this.blockColliders.push({
            minX: cx + ox - hx, maxX: cx + ox + hx,
            minZ: cz + oz - hz, maxZ: cz + oz + hz,
          });
        }
        const barrier = this.makeBarrier();
        barrier.position.set(cx, 0, cz);
        barrier.rotation.y = heading;
        group.add(barrier);
        this.scene.add(group);
        this.roadblocks.push({ group, x: cx, z: cz });
      }
    }
  }

  // `ctx`: { px, pz, playerSpeed, inCar, playerCar, colliders }.
  // playerCar is the player's car object ({ group, speed }) or null.
  // Returns 'busted' when the pin-down timer runs out, else null.
  update(dt, ctx) {
    this.colliders = ctx.colliders;
    this.anchor.x = ctx.px;
    this.anchor.z = ctx.pz;
    if (this.wanted <= 0) {
      if (this.police.length > 0) this.syncPolice();
      if (this.roadblocks.length > 0) this.clearRoadblocks();
      return null;
    }
    // Keep the count honest every frame: Air One joining (or leaving)
    // changes the desired count without any setWanted call.
    this.syncPolice();

    // --- wanted decay: only while no Interceptor can see Ray — and
    // never while Air One is overhead: the heli keeps the heat on. ---
    let nearest = Infinity;
    for (const p of this.police) {
      const d = Math.hypot(p.group.position.x - ctx.px, p.group.position.z - ctx.pz);
      if (d < nearest) nearest = d;
    }
    if (this.heliActive) {
      this.decayTimer = 0;
      this.lastKnown.x = ctx.px;
      this.lastKnown.z = ctx.pz;
    } else if (this.police.length === 0 || nearest > UNSEEN_DISTANCE) {
      this.decayTimer += dt;
      if (this.decayTimer >= DECAY_SECONDS) {
        this.decayTimer = 0;
        this.setWanted(this.wanted - 1);
        if (this.wanted <= 0) return null;
      }
    } else {
      this.decayTimer = 0;
      this.lastKnown.x = ctx.px;
      this.lastKnown.z = ctx.pz;
    }

    // --- chase / ram / bust ---
    let busted = false;
    for (const p of this.police) {
      const gx = p.group.position.x;
      const gz = p.group.position.z;
      const dx = ctx.px - gx;
      const dz = ctx.pz - gz;
      const dist = Math.hypot(dx, dz);
      const chasing = dist < CHASE_RANGE;
      const tx = chasing ? ctx.px : this.lastKnown.x;
      const tz = chasing ? ctx.pz : this.lastKnown.z;

      // Unstuck: barely moved in 2 s while chasing means a building is in
      // the way — swing around it on a detour heading for a moment.
      if (Math.hypot(gx - p.lastX, gz - p.lastZ) < 0.5) {
        p.stuckTimer += dt;
      } else {
        p.stuckTimer = 0;
      }
      p.lastX = gx;
      p.lastZ = gz;
      if (p.stuckTimer > 2 && p.detourTimer <= 0) {
        p.detour = (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + Math.random() * 0.6);
        p.detourTimer = 1.5;
        p.stuckTimer = 0;
      }
      if (p.detourTimer > 0) {
        p.detourTimer -= dt;
        p.yaw += p.detour * 0.9 * dt;
      } else {
        const desired = Math.atan2(tx - gx, tz - gz);
        let diff = desired - p.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-POLICE_TURN * dt, Math.min(POLICE_TURN * dt, diff));
        p.yaw += turn;
        // Hard cornering scrubs speed — this is how Ray breaks away.
        if (Math.abs(diff) > 0.7) p.speed = Math.min(p.speed, 14);
      }
      const maxSpeed = chasing ? POLICE_MAX_SPEED : 12;
      p.speed = Math.min(maxSpeed, p.speed + POLICE_ACCEL * dt);
      if (dist < 3.2 && !ctx.inCar) {
        // On foot: stop short of running Ray over, and hold him there.
        p.speed = 0;
      }
      p.group.rotation.y = p.yaw;
      let nx = gx + Math.sin(p.yaw) * p.speed * dt;
      let nz = gz + Math.cos(p.yaw) * p.speed * dt;
      nx = Math.max(-164, Math.min(164, nx));
      nz = Math.max(-164, Math.min(196, nz));
      const solved = resolveCircleCollision(nx, nz, 1.7, ctx.colliders);
      if (solved.hit) p.speed *= 0.5;
      p.group.position.x = solved.x;
      p.group.position.z = solved.z;
      const wheels = p.group.userData.wheels;
      const spin = (p.speed * dt) / 0.36;
      for (const w of wheels) w.rotation.x += spin;

      // Ram: shove the player's car and bleed its speed on contact.
      if (ctx.inCar && ctx.playerCar) {
        const car = ctx.playerCar;
        const cdx = car.group.position.x - p.group.position.x;
        const cdz = car.group.position.z - p.group.position.z;
        const cd = Math.hypot(cdx, cdz);
        if (cd < 3.6 && cd > 0.01) {
          car.speed *= 0.55;
          p.speed *= 0.6;
          car.group.position.x += (cdx / cd) * 0.7;
          car.group.position.z += (cdz / cd) * 0.7;
        }
      }

      // Light bar flash, alternating red / blue.
      p.flash += dt * 6;
      const on = Math.floor(p.flash) % 2 === 0;
      p.red.visible = on;
      p.blue.visible = !on;
    }

    // --- roadblocks: barricades across the road ahead, from 3 stars ---
    this.updateRoadblocks(dt, ctx.px, ctx.pz, ctx.heading ?? 0);

    // --- busted: pinned down close by while slow or on foot ---
    if (nearest < BUST_DISTANCE && ctx.playerSpeed < 4) {
      this.bustTimer += dt;
      if (this.bustTimer >= BUST_SECONDS) {
        this.bustTimer = 0;
        busted = true;
      }
    } else {
      this.bustTimer = 0;
    }
    return busted ? 'busted' : null;
  }
}
