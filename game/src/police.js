// Vice Point — Vice Point PD Interceptors. One cruiser per star up to
// three, spawned on the nearest road a block away, chasing at a capped
// 34 m/s (a 42 m/s cruiser could never be outrun, so the cap stays) with
// 6 m/s^2 of acceleration. Their light bars flash red and blue, the siren
// wails while any unit is active, and they ram the player's car to stop
// it. Corner a player on foot — or pin a stopped car — and the cuffs come
// out: BUSTED, a $100 fine, the heat wiped, and a walk home from the
// station on Old Town.
import * as THREE from 'three';
import { makeRng } from './config.js';

const ROADS = [-250, -150, -50, 50, 150, 250];
const TOP_SPEED = 34;   // m/s — deliberately below the Midnight GT's 40
const ACCEL = 6;        // m/s^2
const MAX_UNITS = 3;
export const POLICE_STATION = { x: -160, z: 40 };
export const BUSTED_FINE = 100;

function buildCruiserMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x14181d });
  const doorMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x14202a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 4.4), bodyMat);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.58, 2.1), glass);
  cabin.position.set(0, 1.18, -0.2);
  g.add(cabin);
  for (const sx of [-1.06, 1.06]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 2.4), doorMat);
    door.position.set(sx, 0.7, 0);
    g.add(door);
  }
  const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  barBase.position.set(0, 1.56, -0.2);
  g.add(barBase);
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.36), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  red.position.set(-0.32, 1.68, -0.2);
  g.add(red);
  const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.36), new THREE.MeshBasicMaterial({ color: 0x2050ff }));
  blue.position.set(0.32, 1.68, -0.2);
  g.add(blue);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  for (const sx of [-0.7, 0.7]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), lampMat);
    lamp.position.set(sx, 0.62, 2.24);
    g.add(lamp);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x101214 });
  g.userData.wheels = [];
  for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
    g.userData.wheels.push(w);
  }
  g.userData.red = red;
  g.userData.blue = blue;
  return g;
}

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.units = [];
    this.spawnTimer = 0;
    this.footTimer = 0;   // how long a unit has stood next to Ray on foot
    this.pinnedTimer = 0; // how long Ray's car has sat still beside a unit
    this.flashPhase = 0;
    this.rng = makeRng(31337);
  }

  get active() { return this.units.length; }
  nearestDistTo(pos) {
    let best = Infinity;
    for (const u of this.units) {
      const d = Math.hypot(u.pos.x - pos.x, u.pos.z - pos.z);
      if (d < best) best = d;
    }
    return best;
  }

  wantCount(wanted) {
    if (wanted <= 0) return 0;
    return Math.min(MAX_UNITS, Math.ceil(wanted / 2) + (wanted >= 2 ? 1 : 0));
  }

  _spawnAt(x, z) {
    const mesh = buildCruiserMesh();
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const unit = { mesh, pos: mesh.position, heading: 0, speed: 0, ramCooldown: 0 };
    this.units.push(unit);
    return unit;
  }

  _nearestRoadPoint(px, pz, dist) {
    // Pick the closest road line, then a point ON that road `dist` away
    // from Ray along it. (A vertical road is x = v, so the point varies
    // in z; a horizontal road is z = v, so the point varies in x.)
    let bestLine = ROADS[0], bestD = Infinity, vertical = true;
    for (const v of ROADS) {
      const d = Math.abs(px - v);
      if (d < bestD) { bestD = d; bestLine = v; vertical = true; }
      const dz = Math.abs(pz - v);
      if (dz < bestD) { bestD = dz; bestLine = v; vertical = false; }
    }
    const rng = this.rng;
    const off = (rng() < 0.5 ? -1 : 1) * dist;
    const lane = rng() < 0.5 ? -3 : 3;
    const clamp = (v) => Math.max(-290, Math.min(290, v));
    if (vertical) return { x: bestLine + lane, z: clamp(pz + off) };
    return { x: clamp(px + off), z: bestLine + lane };
  }

  clearAll() {
    for (const u of this.units) this.scene.remove(u.mesh);
    this.units.length = 0;
    this.footTimer = 0;
    this.pinnedTimer = 0;
  }

  update(dt, wanted, playerPos, playerCar, onFoot, playerSpeed, colliders, onBusted) {
    this.flashPhase += dt * 6;
    const flashOn = Math.floor(this.flashPhase) % 2 === 0;
    for (const u of this.units) {
      u.mesh.userData.red.material.color.setHex(flashOn ? 0xff2020 : 0x551010);
      u.mesh.userData.blue.material.color.setHex(flashOn ? 0x102050 : 0x2050ff);
    }

    const want = this.wantCount(wanted);
    this.spawnTimer -= dt;
    if (this.units.length < want && this.spawnTimer <= 0) {
      const spot = this._nearestRoadPoint(playerPos.x, playerPos.z, 70 + this.rng() * 30);
      this._spawnAt(spot.x, spot.z);
      this.spawnTimer = 1.5;
    }
    if (this.units.length > want) {
      // Heat dropped: the farthest unit peels off and leaves.
      let far = this.units[0], farD = -1;
      for (const u of this.units) {
        const d = Math.hypot(u.pos.x - playerPos.x, u.pos.z - playerPos.z);
        if (d > farD) { farD = d; far = u; }
      }
      this.scene.remove(far.mesh);
      this.units.splice(this.units.indexOf(far), 1);
    }

    let anyClose = false;
    for (const u of this.units) {
      u.ramCooldown = Math.max(0, u.ramCooldown - dt);
      const dx = playerPos.x - u.pos.x;
      const dz = playerPos.z - u.pos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - u.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const turn = Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
      u.heading += turn;
      // Approach speed scales with distance so a cruiser closing at
      // 34 m/s does not blow straight past Ray: it glides in and parks
      // beside him on foot (target 0 up close) or rides the bumper in a
      // chase (floor 4). The old stepped profile (34, then 12 under 14 m)
      // could never shed the speed in time — stopping from 34 needs ~69 m
      // — so units orbited for a full decay cycle and the bust never came.
      const closeFloor = onFoot ? 0 : 4;
      const target = Math.min(TOP_SPEED, Math.max(closeFloor, dist * 1.2));
      u.speed += Math.max(-ACCEL * 1.4 * dt, Math.min(ACCEL * dt, target - u.speed));
      const nx = u.pos.x + Math.sin(u.heading) * u.speed * dt;
      const nz = u.pos.z + Math.cos(u.heading) * u.speed * dt;
      const hits = (x, z) => {
        if (Math.abs(x) > 295 || Math.abs(z) > 295) return true;
        for (const c of colliders) {
          if (x + 1.1 > c.x0 && x - 1.1 < c.x1 && z + 1.1 > c.z0 && z - 1.1 < c.z1) return true;
        }
        return false;
      };
      if (!hits(nx, nz)) {
        u.pos.x = nx;
        u.pos.z = nz;
      } else {
        // Blocked by a building: slide along the wall instead of grinding
        // into it — try headings fanned out from the current one and take
        // the first that has open road ahead.
        let slid = false;
        for (const off of [1.1, -1.1, 2.2, -2.2]) {
          const h = u.heading + off;
          const tx = u.pos.x + Math.sin(h) * 4;
          const tz = u.pos.z + Math.cos(h) * 4;
          if (!hits(tx, tz)) { u.heading = h; slid = true; break; }
        }
        if (slid) u.speed = Math.max(4, Math.min(u.speed, 10));
        else { u.heading += Math.PI; u.speed = Math.min(u.speed, 4); }
      }
      u.mesh.position.copy(u.pos);
      u.mesh.rotation.y = u.heading;
      for (const w of u.mesh.userData.wheels) w.rotation.x += u.speed * dt * 2.4;

      // Ram the player's car to slow it down.
      if (playerCar && dist < 4.6 && u.ramCooldown <= 0) {
        const closing = u.speed - Math.abs(playerCar.speed);
        playerCar.speed *= 0.62;
        playerCar.heading += (this.rng() - 0.5) * 0.25;
        const px = (playerCar.pos.x - u.pos.x) / dist;
        const pz = (playerCar.pos.z - u.pos.z) / dist;
        playerCar.pos.x += px * 0.8;
        playerCar.pos.z += pz * 0.8;
        u.speed *= 0.5;
        u.ramCooldown = 1.2;
        if (closing > 5 && this.onRam) this.onRam(closing, u.pos.x, u.pos.z);
      }
      if (dist < 12) anyClose = true;
    }

    // BUSTED: cornered on foot, or pinned in a stopped car. The grab
    // radius (6.5 m) matches the distance at which a cruiser pulls up and
    // stops, and the timer bleeds off instead of snapping to zero, so one
    // step out of reach does not erase a cornering already in progress.
    const near = this.nearestDistTo(playerPos);
    if (wanted > 0 && this.units.length > 0) {
      if (onFoot && near < 6.5) {
        this.footTimer += dt;
        this.pinnedTimer = 0;
        if (this.footTimer > 2.5 && onBusted) onBusted('foot');
      } else if (!onFoot && playerCar && playerSpeed < 1.5 && near < 7) {
        this.pinnedTimer += dt;
        this.footTimer = Math.max(0, this.footTimer - dt * 2);
        if (this.pinnedTimer > 6 && onBusted) onBusted('pinned');
      } else {
        this.footTimer = Math.max(0, this.footTimer - dt * 2);
        this.pinnedTimer = 0;
      }
    } else {
      this.footTimer = 0;
      this.pinnedTimer = 0;
    }
    return anyClose;
  }
}
