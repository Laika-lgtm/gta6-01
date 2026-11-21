// Vice Point — vehicles: street cars, traffic, pedestrians, police, heli.
// Six stealable street cars with arcade handling, traffic that stays on the
// roads, wandering pedestrians, the VCPD Interceptor fleet and the Air One
// helicopter. The police are tuned so the player CAN escape: top speed
// 34 m/s (never 42), gentle acceleration, a full stop at 2.8 m standoff, and
// Manhattan steering fallback so they never get stuck on a building facade.

import * as THREE from 'three';
import { CAR_DEFS, POLICE_DEF, WANTED, HELI } from './config.js';
import { createRng, pick, range, rangeInt } from './random.js';
import { resolveCircleCollisions, pointInsideBuildings } from './city.js';

const ROAD_LINES = [-126, -84, -42, 0, 42, 84, 126];

// --- Car meshes -------------------------------------------------------------
// Cars face +z of their group; heading = atan2(dx, dz), same as the player.
function buildCarMesh(def, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: isPolice ? POLICE_DEF.color : def.color, roughness: 0.35, metalness: 0.45,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(def.width, 0.62, def.length), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(def.width * 0.82, 0.55, def.length * 0.45),
    new THREE.MeshStandardMaterial({ color: 0x18222e, roughness: 0.15, metalness: 0.6 }),
  );
  cabin.position.set(0, 1.1, -def.length * 0.05);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  for (const [wx, wz] of [
    [-def.width / 2, def.length * 0.32], [def.width / 2, def.length * 0.32],
    [-def.width / 2, -def.length * 0.32], [def.width / 2, -def.length * 0.32],
  ]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    wheel.castShadow = true;
    group.add(wheel);
  }
  // Headlights + taillights so cars read at dusk.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffedb0, emissiveIntensity: 0.9 });
  for (const wx of [-def.width * 0.32, def.width * 0.32]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
    head.position.set(wx, 0.6, def.length / 2 + 0.01);
    group.add(head);
  }
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xcc1122, emissive: 0xaa0011, emissiveIntensity: 0.8 });
  for (const wx of [-def.width * 0.32, def.width * 0.32]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), tailMat);
    tail.position.set(wx, 0.62, -def.length / 2 - 0.01);
    group.add(tail);
  }
  let strobeL = null;
  let strobeR = null;
  if (isPolice) {
    // White doors + roof light bar (red left, blue right) for the strobe.
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
    strobeL = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.28),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.4 }),
    );
    strobeL.position.set(-0.28, 1.52, 0);
    group.add(strobeL);
    strobeR = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x2244ff, emissive: 0x0022ff, emissiveIntensity: 0.4 }),
    );
    strobeR.position.set(0.28, 1.52, 0);
    group.add(strobeR);
  }
  return { group, strobeL, strobeR };
}

// Collision radius between two cars: 80% of the summed half-lengths.
export function carGap(a, b) {
  return (a.def.length / 2 + b.def.length / 2) * 0.8;
}

function syncMesh(car) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
}

// Push `mover` out of every car in `others` (others never move — in
// particular the police never shove the player's car forward).
function resolveCarVsCars(mover, others) {
  let hit = false;
  for (const o of others) {
    if (o === mover) continue;
    const dx = mover.x - o.x;
    const dz = mover.z - o.z;
    const d = Math.hypot(dx, dz);
    const min = carGap(mover, o);
    if (d < min && d > 1e-6) {
      mover.x = o.x + (dx / d) * min;
      mover.z = o.z + (dz / d) * min;
      hit = true;
    } else if (d <= 1e-6) {
      mover.x = o.x + min;
      hit = true;
    }
  }
  return hit;
}

// --- Arcade driving ---------------------------------------------------------
// intent: {throttle -1..1, steer -1..1, brake}. Returns true on a hard hit.
export function driveCar(car, intent, dt, colliders, others) {
  const def = car.def;
  const speed = car.speed;
  if (intent.throttle > 0) {
    car.speed = Math.min(def.topSpeed, speed + def.accel * intent.throttle * dt);
  } else if (intent.throttle < 0) {
    if (speed > 0.5) car.speed = Math.max(0, speed - def.brake * dt);
    else car.speed = Math.max(-9, speed + def.accel * 0.55 * intent.throttle * dt);
  } else if (intent.brake) {
    car.speed = speed > 0 ? Math.max(0, speed - def.brake * 1.4 * dt)
      : Math.min(0, speed + def.brake * 1.4 * dt);
  } else {
    // Rolling drag + a little grip so the car settles instead of gliding.
    car.speed = Math.abs(speed) < 0.15 ? 0 : speed * Math.max(0, 1 - 0.35 * dt);
  }
  const spdFactor = Math.max(-1, Math.min(1, car.speed / 7));
  car.heading += intent.steer * def.handling * 1.9 * spdFactor * dt;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const fixed = resolveCircleCollisions(car.x, car.z, def.length * 0.35, colliders);
  const hitWall = fixed.x !== car.x || fixed.z !== car.z;
  car.x = fixed.x;
  car.z = fixed.z;
  const hitCar = others ? resolveCarVsCars(car, others) : false;
  if (hitWall || hitCar) car.speed *= 0.45;
  syncMesh(car);
  return hitWall || hitCar;
}

// --- Street cars ------------------------------------------------------------
// One of each def, parked on road centrelines (roads are full strips, so any
// spot on a road line is clear of buildings). Deterministic spots.
const PARKED_SPOTS = [
  { id: 'neon', x: 42, z: 60, heading: 0 },
  { id: 'sunset', x: -42, z: -20, heading: Math.PI },
  { id: 'marlin', x: 0, z: 100, heading: Math.PI / 2 },
  { id: 'palmetto', x: -84, z: 40, heading: 0 },
  { id: 'bayside', x: 84, z: -70, heading: Math.PI },
  { id: 'coral', x: 126, z: 10, heading: -Math.PI / 2 },
];

export function createStreetCars(scene) {
  const cars = [];
  for (const spot of PARKED_SPOTS) {
    const def = CAR_DEFS.find((d) => d.id === spot.id);
    const { group } = buildCarMesh(def, false);
    scene.add(group);
    const car = {
      def, group, x: spot.x, z: spot.z, heading: spot.heading,
      speed: 0, stolen: false, parked: true, traffic: false, police: false,
    };
    syncMesh(car);
    cars.push(car);
  }
  return cars;
}

export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

// --- Traffic ----------------------------------------------------------------
export function createTraffic(scene, seed, count) {
  const rng = createRng(seed + 77);
  const cars = [];
  for (let i = 0; i < (count || 8); i++) {
    const def = pick(rng, CAR_DEFS);
    const { group } = buildCarMesh(def, false);
    scene.add(group);
    const alongRoad = rng() < 0.5;
    const line = pick(rng, ROAD_LINES);
    const at = range(rng, -140, 140);
    const car = {
      def, group,
      x: alongRoad ? line : at,
      z: alongRoad ? at : line,
      heading: alongRoad ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      speed: range(rng, 8, 12),
      stolen: false, parked: false, traffic: true, police: false,
      turnCooldown: 0,
    };
    syncMesh(car);
    cars.push(car);
  }
  return cars;
}

export function updateTraffic(cars, dt, colliders) {
  for (const car of cars) {
    car.turnCooldown -= dt;
    // At an intersection (near a road crossing) sometimes turn 90 degrees.
    const nearX = ROAD_LINES.some((l) => Math.abs(car.x - l) < 2.5);
    const nearZ = ROAD_LINES.some((l) => Math.abs(car.z - l) < 2.5);
    if (nearX && nearZ && car.turnCooldown <= 0 && Math.random() < 0.25) {
      car.heading += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      car.turnCooldown = 4;
    }
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const fixed = resolveCircleCollisions(car.x, car.z, car.def.length * 0.35, colliders);
    car.x = fixed.x;
    car.z = fixed.z;
    // Wrap around the far edge back onto a road.
    if (Math.abs(car.x) > 150 || Math.abs(car.z) > 150) {
      car.x = Math.max(-140, Math.min(140, car.x * -0.9));
      car.z = Math.max(-140, Math.min(140, car.z * -0.9));
    }
    syncMesh(car);
  }
}

// --- Pedestrians ------------------------------------------------------------
const PED_SHIRTS = [0xe8e8e8, 0xff8fb3, 0x7ec8ff, 0xffd23f, 0x9be89b, 0xd8a0ff];

export function createPedestrians(scene, seed, count) {
  const rng = createRng(seed + 131);
  const peds = [];
  for (let i = 0; i < (count || 10); i++) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: pick(rng, PED_SHIRTS), roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.32), shirt);
    torso.position.y = 1.16;
    torso.castShadow = true;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin);
    head.position.y = 1.72;
    group.add(head);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.76, 0.22), pants);
    legL.position.set(-0.15, 0.4, 0);
    group.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.15;
    group.add(legR);
    scene.add(group);
    const ped = {
      group, legL, legR,
      x: range(rng, -120, 120), z: range(rng, -120, 120),
      heading: rng() * Math.PI * 2,
      speed: range(rng, 1.1, 1.8),
      walkPhase: rng() * 6,
      down: false, downTimer: 0, flee: 0, turnTimer: range(rng, 2, 6),
    };
    group.position.set(ped.x, 0, ped.z);
    group.rotation.y = ped.heading;
    peds.push(ped);
  }
  return peds;
}

export function updatePedestrians(peds, dt, colliders, playerX, playerZ) {
  for (const ped of peds) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.down = false;
        ped.group.rotation.x = 0;
        ped.flee = 5; // get up and run away from whoever hit them
      }
      continue;
    }
    let speed = ped.speed;
    if (ped.flee > 0) {
      ped.flee -= dt;
      speed = 4.2;
      ped.heading = Math.atan2(ped.x - playerX, ped.z - playerZ);
    } else {
      ped.turnTimer -= dt;
      if (ped.turnTimer <= 0) {
        ped.heading += (Math.random() - 0.5) * 1.8;
        ped.turnTimer = 2 + Math.random() * 4;
      }
    }
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
    const fixed = resolveCircleCollisions(ped.x, ped.z, 0.5, colliders);
    ped.x = fixed.x;
    ped.z = fixed.z;
    ped.walkPhase += dt * (ped.flee > 0 ? 12 : 6);
    const swing = Math.sin(ped.walkPhase) * 0.55;
    ped.legL.rotation.x = -swing;
    ped.legR.rotation.x = swing;
    ped.group.position.set(ped.x, 0, ped.z);
    ped.group.rotation.y = ped.heading;
  }
}

// Manhattan fallback: among the four axis headings, pick the one that moves
// toward the target and whose way ahead (7 m) is clear of buildings. A naive
// "bigger axis wins" pick re-chooses the blocked direction and wedges the
// unit against the facade forever — the clear-axis test is the whole point.
function pickAxisHeading(unit, dx, dz, colliders) {
  let best = Math.PI / 2;
  let bestScore = -Infinity;
  for (const h of [Math.PI / 2, -Math.PI / 2, 0, Math.PI]) {
    const ax = unit.x + Math.sin(h) * 7;
    const az = unit.z + Math.cos(h) * 7;
    const clear = !pointInsideBuildings(ax, az, colliders);
    const progress = Math.sin(h) * dx + Math.cos(h) * dz;
    const score = (clear ? 1000 : 0) + progress;
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return best;
}
export function createPoliceUnit(scene, x, z, heading) {
  const { group, strobeL, strobeR } = buildCarMesh(POLICE_DEF, true);
  scene.add(group);
  const unit = {
    def: POLICE_DEF, group, strobeL, strobeR,
    x, z, heading, speed: 0, police: true, traffic: false,
    manhattanTimer: 0, progressTimer: 0, lastX: x, lastZ: z,
    shotsTaken: 0, disabled: false, disableTimer: 0,
  };
  syncMesh(unit);
  return unit;
}

// Keep the fleet at exactly `count` units, spawning new ones on a road
// ~42 m from the player (WANTED.policeSpawnRadius). The snap-to-road and
// the ±140 clamp only apply while the player is on the grid: off the grid
// (a getaway can run kilometres out) the clamp used to drag the spawn back
// to the map edge, thousands of metres from the player — the unit then
// instantly despawned past 120 m, re-armed the lostCops window, and the
// fleet could never come back, so the heat decayed for free.
export function ensurePoliceCount(units, scene, count, nearX, nearZ, colliders) {
  while (units.length < count) {
    const angle = Math.random() * Math.PI * 2;
    let x = nearX + Math.sin(angle) * WANTED.policeSpawnRadius;
    let z = nearZ + Math.cos(angle) * WANTED.policeSpawnRadius;
    if (Math.abs(nearX) <= 150 && Math.abs(nearZ) <= 150) {
      // Snap onto the nearest road line so the unit never spawns inside a block.
      const snap = (v) => ROAD_LINES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
      if (Math.abs(x - snap(x)) < Math.abs(z - snap(z))) x = snap(x);
      else z = snap(z);
      x = Math.max(-140, Math.min(140, x));
      z = Math.max(-140, Math.min(140, z));
    }
    const fixed = resolveCircleCollisions(x, z, 2.5, colliders);
    units.push(createPoliceUnit(scene, fixed.x, fixed.z, Math.atan2(nearX - fixed.x, nearZ - fixed.z)));
  }
  while (units.length > count) {
    const unit = units.pop();
    scene.remove(unit.group);
  }
  return units;
}

export function despawnPolice(units, scene) {
  for (const unit of units) scene.remove(unit.group);
  units.length = 0;
}

export function nearestPoliceDistance(units, x, z) {
  let best = Infinity;
  for (const unit of units) {
    const d = Math.hypot(unit.x - x, unit.z - z);
    if (d < best) best = d;
  }
  return best;
}

// Chase the target. Top speed is POLICE_DEF.topSpeed (34) — never more —
// with gentle acceleration (6), so the Neon Coupe (38) can outrun them.
// Within 2.8 m they brake to a full stop instead of ramming the player.
// The approach speed is capped by distance AND by how fast the target is
// moving: flat-out 34 against a moving car, but eased down near a slow or
// stationary target — otherwise a 34 m/s unit overshoots a standing player
// and orbits forever instead of cornering them.
export function updatePolice(units, dt, tx, tz, playerCar, colliders, time, targetSpeed) {
  const tgtSpeed = targetSpeed || 0;
  for (const unit of units) {
    // Shot up three times: the unit is out of the chase, parked where it
    // died, strobes still flashing until the heat dies down.
    if (unit.disabled) {
      unit.speed = Math.max(0, unit.speed - POLICE_DEF.brake * dt);
      unit.disableTimer -= dt;
      const phase = Math.floor(time * 4) % 2 === 0;
      if (unit.strobeL) unit.strobeL.material.emissiveIntensity = phase ? 2.4 : 0.25;
      if (unit.strobeR) unit.strobeR.material.emissiveIntensity = phase ? 0.25 : 2.4;
      continue;
    }
    const dx = tx - unit.x;
    const dz = tz - unit.z;
    const dist = Math.hypot(dx, dz);
    // Hard cap: the approach target itself must never exceed top speed.
    // (An earlier form let tgtSpeed+2 leak through uncapped, so a unit could
    // hit 40 m/s and outrun the Neon Coupe — escape was impossible.)
    const approach = dist < 30
      ? Math.min(POLICE_DEF.topSpeed, Math.max(tgtSpeed + 2, dist * 0.85))
      : POLICE_DEF.topSpeed;
    // Standoff: full stop at 2.8 m — the busted timer does the rest.
    if (dist < 2.8) {
      unit.speed = Math.max(0, unit.speed - POLICE_DEF.brake * dt);
    } else if (approach > unit.speed) {
      unit.speed = Math.min(approach, unit.speed + POLICE_DEF.accel * dt);
    } else {
      unit.speed = Math.max(approach, unit.speed - POLICE_DEF.brake * dt);
    }
    // Desired heading: direct, unless the way ahead is a building facade.
    let desired = Math.atan2(dx, dz);
    const aheadBlocked = (h) => pointInsideBuildings(
      unit.x + Math.sin(h) * 7, unit.z + Math.cos(h) * 7, colliders,
    );
    if (unit.manhattanTimer > 0) {
      unit.manhattanTimer -= dt;
      desired = unit.manhattanHeading;
    } else if (aheadBlocked(desired)) {
      // Manhattan fallback: drive around the block on a clear axis.
      desired = pickAxisHeading(unit, dx, dz, colliders);
      unit.manhattanHeading = desired;
      unit.manhattanTimer = 1.2;
    }
    // Stuck watch: barely moving while far away means "go Manhattan".
    unit.progressTimer += dt;
    if (unit.progressTimer > 1.5) {
      const moved = Math.hypot(unit.x - unit.lastX, unit.z - unit.lastZ);
      if (moved < 0.6 && dist > 15) {
        unit.manhattanHeading = pickAxisHeading(unit, dx, dz, colliders);
        unit.manhattanTimer = 1.5;
      }
      unit.lastX = unit.x;
      unit.lastZ = unit.z;
      unit.progressTimer = 0;
    }
    let diff = desired - unit.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnRate = POLICE_DEF.handling * 2.6 * Math.max(0.45, Math.min(1, unit.speed / 6));
    unit.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
    while (unit.heading > Math.PI) unit.heading -= Math.PI * 2;
    while (unit.heading < -Math.PI) unit.heading += Math.PI * 2;
    unit.x += Math.sin(unit.heading) * unit.speed * dt;
    unit.z += Math.cos(unit.heading) * unit.speed * dt;
    const fixed = resolveCircleCollisions(unit.x, unit.z, POLICE_DEF.length * 0.35, colliders);
    unit.x = fixed.x;
    unit.z = fixed.z;
    // Never push the player's car: only the police unit yields.
    const others = playerCar ? [playerCar] : [];
    for (const o of units) if (o !== unit) others.push(o);
    if (resolveCarVsCars(unit, others)) unit.speed *= 0.4;
    syncMesh(unit);
    // Strobe: alternate red / blue twice a second.
    const phase = Math.floor(time * 4) % 2 === 0;
    if (unit.strobeL) unit.strobeL.material.emissiveIntensity = phase ? 2.4 : 0.25;
    if (unit.strobeR) unit.strobeR.material.emissiveIntensity = phase ? 0.25 : 2.4;
  }
}

// --- Helicopter -------------------------------------------------------------
// Air One: follows the player from 30 m up once the heat hits 4 stars, with
// a spotlight cone and a ground pool of light tracking the target. At 4+
// stars it fires warning shots — tracers that land a few metres wide of the
// player, never on them. It can be shot down (HELI.health hits): it drops
// out of the sky, pays $500, and is back in the air after HELI.respawnSeconds
// if the heat is still on.
export function createHeli(scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.4, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 5.2), bodyMat);
  body.castShadow = true;
  group.add(body);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.24, 0.3, 5.24),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }),
  );
  group.add(stripe);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.4), bodyMat);
  tail.position.set(0, 0.3, -4);
  group.add(tail);
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
  for (const sx of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.6), skidMat);
    skid.position.set(sx, -0.9, 0.4);
    group.add(skid);
  }
  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(11, 0.08, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }),
  );
  rotor.position.y = 1.1;
  group.add(rotor);
  const search = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 1.6, 9, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }),
  );
  search.position.y = -4.5;
  group.add(search);
  group.visible = false;
  scene.add(group);
  // Pool of light on the ground under the heli, tracking the player.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(6, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.07;
  disc.visible = false;
  scene.add(disc);
  return {
    group, rotor, search, disc,
    x: 0, z: 0, y: 30, frozen: false, active: false,
    health: HELI.health, down: false, downTimer: 0,
    shotTimer: HELI.warningEvery, warningShots: 0,
  };
}

// fx is the weapon tracer pool ({fireTracer} is internal to weapons.js —
// pass the pool plus a tracer function); onWarning() is called per warning
// shot so the caller can play the sound. Both are optional.
export function updateHeli(heli, dt, tx, tz, active, time, tracer, onWarning) {
  heli.active = active;
  // Shot down: drop out of the sky, sit on the ground, then climb back up
  // once the respawn window has passed — but only while the heat is on.
  if (heli.down) {
    heli.y = Math.max(1.2, heli.y - dt * 22);
    heli.rotor.rotation.y += dt * 4;
    heli.group.position.set(heli.x, heli.y, heli.z);
    heli.group.visible = active;
    heli.search.material.opacity = 0;
    heli.disc.visible = false;
    if (active) {
      heli.downTimer += dt;
      if (heli.downTimer >= HELI.respawnSeconds) {
        heli.down = false;
        heli.health = HELI.health;
        heli.downTimer = 0;
        heli.y = 30;
        heli.shotTimer = HELI.warningEvery;
      }
    }
    return;
  }
  heli.group.visible = active;
  heli.disc.visible = active;
  if (!active) return;
  heli.rotor.rotation.y += dt * 22;
  if (!heli.frozen) {
    // Trail the target from above and slightly behind, with a hover bob.
    heli.x += (tx + 6 - heli.x) * Math.min(1, dt * 0.9);
    heli.z += (tz - 4 - heli.z) * Math.min(1, dt * 0.9);
  }
  heli.y = 30 + Math.sin(time * 1.3) * 0.8;
  heli.group.position.set(heli.x, heli.y, heli.z);
  heli.group.rotation.y = Math.atan2(tx - heli.x, tz - heli.z);
  // Spotlight: brighter cone plus a pool of light on the ground at the
  // player's feet, so the beam reads even in daylight.
  heli.search.material.opacity = 0.3;
  heli.disc.material.opacity = 0.2;
  heli.disc.position.set(tx, 0.07, tz);
  // Warning shots at 4+ stars: a tracer that lands a few metres wide of the
  // player — a warning, never a hit.
  heli.shotTimer -= dt;
  if (heli.shotTimer <= 0) {
    heli.shotTimer = HELI.warningEvery;
    heli.warningShots += 1;
    if (tracer) {
      const ox = (Math.random() - 0.5) * 10;
      const oz = (Math.random() - 0.5) * 10;
      tracer(
        { x: heli.x, y: heli.y - 1, z: heli.z },
        { x: tx + ox, y: 0.2, z: tz + oz },
      );
    }
    if (onWarning) onWarning();
  }
}

// A hit on the heli: returns true when that hit brings it down.
export function damageHeli(heli) {
  if (!heli.active || heli.down) return false;
  heli.health -= 1;
  if (heli.health <= 0) {
    heli.down = true;
    heli.downTimer = 0;
    return true;
  }
  return false;
}

// --- Tail target ------------------------------------------------------------
// The mark for 'Tail the Mark': an orange sedan looping the inner rectangle
// of avenues at 11 m/s, with a purple beacon cone above it so it reads from
// across the city. It drives its loop from boot (ambient traffic with a
// job), and the mission just asks Ray to get on its bumper.
export const TAIL_DEF = {
  id: 'mark', name: 'Mark', color: 0xff7a1a, topSpeed: 13, accel: 8, brake: 20, handling: 0.8, grip: 6, length: 4.4, width: 1.9,
};
const TAIL_LOOP = [[42, 42], [42, -42], [-42, -42], [-42, 42]];

export function createTailTarget(scene) {
  const { group } = buildCarMesh(TAIL_DEF, false);
  scene.add(group);
  const beacon = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.2, 12),
    new THREE.MeshBasicMaterial({ color: 0xc44dff, transparent: true, opacity: 0.85 }),
  );
  beacon.position.y = 3.4;
  beacon.rotation.x = Math.PI;
  group.add(beacon);
  const car = {
    def: TAIL_DEF, group, beacon,
    x: 42, z: 42, heading: Math.PI, speed: 11,
    stolen: false, parked: false, traffic: false, police: false,
    waypoint: 1,
  };
  group.position.set(42, 0, 42);
  group.rotation.y = Math.PI;
  return car;
}

export function updateTailTarget(car, dt, colliders) {
  const [wx, wz] = TAIL_LOOP[car.waypoint];
  const dx = wx - car.x;
  const dz = wz - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 3) {
    car.waypoint = (car.waypoint + 1) % TAIL_LOOP.length;
    return;
  }
  const desired = Math.atan2(dx, dz);
  let diff = desired - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const fixed = resolveCircleCollisions(car.x, car.z, car.def.length * 0.35, colliders);
  car.x = fixed.x;
  car.z = fixed.z;
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  car.beacon.rotation.y += dt * 2;
}

// Spawn a fresh street car into the world (garage buy / retrieve). Returns
// a car object in the same shape as the parked street cars.
export function spawnStreetCar(scene, def, x, z, heading) {
  const { group } = buildCarMesh(def, false);
  scene.add(group);
  const car = {
    def, group, x, z, heading,
    speed: 0, stolen: false, parked: false, traffic: false, police: false,
  };
  syncMesh(car);
  return car;
}
