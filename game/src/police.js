// Vice Point — Vice Point PD Interceptors, round 8 stage 3 final. One
// cruiser per star up to three, spawned on the nearest road a block away,
// chasing at a capped 34 m/s (a 42 m/s cruiser could never be outrun, so
// the cap stays) with 6.5 m/s^2 of acceleration. Their light bars flash
// red and blue, the siren wails while any unit is active, and they ram the
// player's car to stop it. Corner a player on foot — or pin a stopped car
// — and the cuffs come out: BUSTED, a $100 fine, the heat wiped, and a
// walk home from the station on Old Town. At four stars and up, Air One
// joins the chase: a police helicopter that circles overhead at 0.28 rad/s
// and never loses the scent — staging can pin it to a fixed bearing with
// pinHeli() so a screenshot always catches it in frame. NEW in stage 3
// final: at three stars and up the PD also throws a ROADBLOCK across the
// road ahead of the player — two parked cruisers angled nose-to-nose with
// striped barriers between them. It is visual and static (the parked
// cruisers never chase, ram or bust); it re-seats itself ahead of the
// player when he slips past it, and it packs up the moment the heat drops
// below three stars.
import * as THREE from 'three';
import { makeRng } from './config.js';

const ROADS = [-250, -150, -50, 50, 150, 250];
const TOP_SPEED = 34;   // m/s — deliberately below the Midnight GT's 40
const ACCEL = 6.5;      // m/s^2 — a touch sharper than round 7's 6
const MAX_UNITS = 3;
const ROADBLOCK_AHEAD = 55; // metres in front of the player, on his road
const ROADBLOCK_RESET = 90; // re-seat it once the player is this far away
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

function buildBarrierMesh() {
  // A striped sawhorse barrier: orange board on white legs, the classic
  // Vice Point PD roadblock furniture. Two of them plus the parked
  // cruisers read as a block from any camera angle.
  const g = new THREE.Group();
  const orange = new THREE.MeshLambertMaterial({ color: 0xff6a00 });
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.12), orange);
  board.position.y = 0.85;
  g.add(board);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.14, 0.13), white);
  stripe.position.y = 0.85;
  g.add(stripe);
  for (const sx of [-1.0, 1.0]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.7), white);
    leg.position.set(sx, 0.45, 0);
    g.add(leg);
  }
  return g;
}

function buildRoadblockGroup() {
  // Two parked cruisers angled nose-to-nose across the road, three striped
  // barriers filling the gaps between them. Local +X runs across the road
  // (perpendicular to travel), local +Z runs along it.
  const g = new THREE.Group();
  const left = buildCruiserMesh();
  left.position.set(-4.6, 0, 1.4);
  left.rotation.y = 0.5;
  g.add(left);
  const right = buildCruiserMesh();
  right.position.set(4.6, 0, -1.4);
  right.rotation.y = -0.5 + Math.PI;
  g.add(right);
  for (const bx of [-2.3, 0, 2.3]) {
    const b = buildBarrierMesh();
    b.position.set(bx, 0, bx === 0 ? 0.4 : -0.4);
    g.add(b);
  }
  g.userData.cruisers = [left, right];
  return g;
}

function buildHeliMesh() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xe8ecf0 });
  const blue = new THREE.MeshLambertMaterial({ color: 0x1d4fa1 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x14202a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14181d });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 4.6), white);
  body.position.y = 0;
  g.add(body);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.4, 4.62), blue);
  stripe.position.y = -0.25;
  g.add(stripe);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.1, 1.2), glass);
  nose.position.set(0, 0.1, 2.6);
  g.add(nose);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.4), white);
  boom.position.set(0, 0.35, -4.2);
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.6, 1.1), blue);
  fin.position.set(0, 1.1, -6.2);
  g.add(fin);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 0.12), dark);
  tailRotor.position.set(-0.45, 0.5, -6.2);
  g.add(tailRotor);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), dark);
  mast.position.y = 0.95;
  g.add(mast);
  const rotor = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(11, 0.08, 0.5);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x22262c });
  const b1 = new THREE.Mesh(bladeGeo, bladeMat);
  rotor.add(b1);
  const b2 = new THREE.Mesh(bladeGeo, bladeMat);
  b2.rotation.y = Math.PI / 2;
  rotor.add(b2);
  rotor.position.y = 1.25;
  g.add(rotor);
  for (const sx of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.4), dark);
    skid.position.set(sx, -1.0, 0);
    g.add(skid);
  }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
  lamp.position.set(0, -1.0, 1.6);
  g.add(lamp);
  g.userData.rotor = rotor;
  g.userData.tailRotor = tailRotor;
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
    this.heli = null;       // Air One mesh, live only at wanted >= 4
    this.heliAngle = 0;     // orbit bearing around the player
    this.heliPinned = false; // staging holds the bearing fixed
    this.heliRadius = 26;
    this.heliHeight = 34;
    this.roadblock = null;  // roadblock group, live only at wanted >= 3
    this.roadblockPos = null;
  }

  get active() { return this.units.length; }
  get heliUp() { return !!this.heli; }
  get roadblockUp() { return !!this.roadblock; }
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

  // --- roadblock -----------------------------------------------------------
  // Place the block at an exact spot (staging / debug), facing `heading`
  // so its barrier row lies across the road the player travels on.
  spawnRoadblockAt(x, z, heading) {
    this.removeRoadblock();
    const g = buildRoadblockGroup();
    g.position.set(x, 0, z);
    g.rotation.y = heading;
    this.scene.add(g);
    this.roadblock = g;
    this.roadblockPos = { x, z };
    return g;
  }
  removeRoadblock() {
    if (!this.roadblock) return;
    this.scene.remove(this.roadblock);
    this.roadblock = null;
    this.roadblockPos = null;
  }
  // Live placement: 55 m ahead of the player along his heading, snapped
  // onto the nearest road line so the block always sits on tarmac.
  _roadblockAhead(playerPos, heading) {
    const ax = playerPos.x + Math.sin(heading) * ROADBLOCK_AHEAD;
    const az = playerPos.z + Math.cos(heading) * ROADBLOCK_AHEAD;
    let bestLine = ROADS[0], bestD = Infinity, vertical = true;
    for (const v of ROADS) {
      const d = Math.abs(ax - v);
      if (d < bestD) { bestD = d; bestLine = v; vertical = true; }
      const dz = Math.abs(az - v);
      if (dz < bestD) { bestD = dz; bestLine = v; vertical = false; }
    }
    const clamp = (v) => Math.max(-285, Math.min(285, v));
    if (vertical) return { x: bestLine, z: clamp(az), heading: 0 };
    return { x: clamp(ax), z: bestLine, heading: Math.PI / 2 };
  }

  // Air One: spawn the helicopter, or take it down when the heat drops.
  spawnHeli() {
    if (this.heli) return this.heli;
    const mesh = buildHeliMesh();
    this.scene.add(mesh);
    this.heli = mesh;
    return mesh;
  }
  removeHeli() {
    if (!this.heli) return;
    this.scene.remove(this.heli);
    this.heli = null;
    this.heliPinned = false;
  }
  // Staging: hold the heli at one fixed bearing/radius/height around the
  // player so a screenshot always catches it in frame.
  pinHeli(angle, radius, height) {
    this.spawnHeli();
    this.heliAngle = angle;
    this.heliRadius = radius;
    this.heliHeight = height;
    this.heliPinned = true;
  }
  unpinHeli() {
    this.heliPinned = false;
    this.heliRadius = 26;
    this.heliHeight = 34;
  }

  clearAll() {
    for (const u of this.units) this.scene.remove(u.mesh);
    this.units.length = 0;
    this.footTimer = 0;
    this.pinnedTimer = 0;
    this.removeHeli();
    this.removeRoadblock();
  }

  update(dt, wanted, playerPos, playerCar, onFoot, playerSpeed, colliders, onBusted, playerHeading = 0) {
    this.flashPhase += dt * 6;
    const flashOn = Math.floor(this.flashPhase) % 2 === 0;
    for (const u of this.units) {
      u.mesh.userData.red.material.color.setHex(flashOn ? 0xff2020 : 0x551010);
      u.mesh.userData.blue.material.color.setHex(flashOn ? 0x102050 : 0x2050ff);
    }
    // The parked roadblock cruisers flash in step with the pursuit units.
    if (this.roadblock) {
      for (const c of this.roadblock.userData.cruisers) {
        c.userData.red.material.color.setHex(flashOn ? 0xff2020 : 0x551010);
        c.userData.blue.material.color.setHex(flashOn ? 0x102050 : 0x2050ff);
      }
    }

    // Air One flies only while the heat is four stars or worse.
    if (wanted >= 4 && !this.heli) this.spawnHeli();
    else if (wanted < 4 && this.heli) this.removeHeli();
    if (this.heli) {
      if (!this.heliPinned) this.heliAngle += dt * 0.28;
      const hx = playerPos.x + Math.cos(this.heliAngle) * this.heliRadius;
      const hz = playerPos.z + Math.sin(this.heliAngle) * this.heliRadius;
      this.heli.position.set(hx, this.heliHeight, hz);
      // Nose follows the orbit tangent so it reads as flying, not hovering.
      this.heli.rotation.y = Math.atan2(
        Math.cos(this.heliAngle + 0.5) - Math.cos(this.heliAngle),
        Math.sin(this.heliAngle + 0.5) - Math.sin(this.heliAngle),
      );
      this.heli.userData.rotor.rotation.y += dt * 22;
      this.heli.userData.tailRotor.rotation.z += dt * 30;
    }

    // Roadblock: up at three stars, down below three. It seats itself
    // ahead of the player and re-seats when he gets far past it, so the
    // chase always has a wall to run at — never on top of him, never
    // left behind in a district he already fled.
    if (wanted >= 3) {
      if (!this.roadblock) {
        const spot = this._roadblockAhead(playerPos, playerHeading);
        this.spawnRoadblockAt(spot.x, spot.z, spot.heading);
      } else {
        const d = Math.hypot(playerPos.x - this.roadblockPos.x, playerPos.z - this.roadblockPos.z);
        if (d > ROADBLOCK_RESET) {
          const spot = this._roadblockAhead(playerPos, playerHeading);
          this.spawnRoadblockAt(spot.x, spot.z, spot.heading);
        }
      }
    } else if (this.roadblock) {
      this.removeRoadblock();
    }

    const want = this.wantCount(wanted);
    this.spawnTimer -= dt;
    if (this.units.length < want && this.spawnTimer <= 0) {
      const spot = this._nearestRoadPoint(playerPos.x, playerPos.z, 70 + this.rng() * 30);
      this._spawnAt(spot.x, spot.z);
      this.spawnTimer = 1.4;
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
