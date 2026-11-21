// Vehicles: six stealable cars with arcade handling, ambient traffic that
// drives the grid and yields to the car ahead, and the police response —
// an Interceptor patrol car that pursues at up to 34 m/s and the Air One
// helicopter. Cars are simple box-built low-poly bodies with cabin, wheels
// and headlights.
import * as THREE from 'three';
import { CAR, CITY, MARK_CAR_INDEX, PALETTE, POLICE, TRAFFIC } from './config.js';
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
    // Hits from Ray's guns accumulate; three put the Interceptor down and
    // it respawns 8 seconds later, snapped onto a road inside the grid.
    hits: 0,
    downTimer: 0,
  };
  policeMesh.group.position.set(police.x, 0, police.z);
  policeMesh.group.rotation.y = police.yaw;

  // Road lines run at these coordinates on both axes; snapping a spawn to
  // the nearest one keeps the police on the streets, never in a building.
  const roadLines = [];
  for (let i = 0; i <= CITY.blocks; i += 1) roadLines.push(origin - pitch / 2 + i * pitch);

  function snapToRoad(x, z) {
    let bestX = roadLines[0];
    let bestZ = roadLines[0];
    for (const line of roadLines) {
      if (Math.abs(line - x) < Math.abs(bestX - x)) bestX = line;
      if (Math.abs(line - z) < Math.abs(bestZ - z)) bestZ = line;
    }
    // Snap the axis that is already closer to a road line; the other axis
    // stays, so the point lands on a real street. The returned axis tells
    // callers which way the road runs there.
    if (Math.abs(bestX - x) <= Math.abs(bestZ - z)) return { x: bestX, z, axis: 'z' };
    return { x, z: bestZ, axis: 'x' };
  }

  /** Put the Interceptor back on a road at least 45 m from the player. */
  function respawnPolice(playerPos) {
    const offsets = [[60, 0], [-60, 0], [0, 60], [0, -60], [60, 60], [-60, -60]];
    let spot = { x: playerPos.x + 60, z: playerPos.z };
    for (const [ox, oz] of offsets) {
      const candidate = snapToRoad(playerPos.x + ox, playerPos.z + oz);
      if (Math.hypot(candidate.x - playerPos.x, candidate.z - playerPos.z) >= 45) {
        spot = candidate;
        break;
      }
    }
    police.x = spot.x;
    police.z = spot.z;
    police.yaw = Math.atan2(playerPos.x - spot.x, playerPos.z - spot.z);
    police.speed = 0;
    police.hits = 0;
    police.downTimer = 0;
    police.mesh.group.visible = true;
    police.mesh.group.position.set(police.x, 0, police.z);
    police.mesh.group.rotation.y = police.yaw;
  }

  /**
   * One gunshot lands on the Interceptor: it stalls, and three hits in a
   * row knock it out for the 8-second respawn delay. Returns 'hit' | 'down'.
   */
  function hitPolice() {
    if (police.downTimer > 0) return 'down';
    police.speed = 0;
    police.hits += 1;
    if (police.hits >= 3) {
      police.hits = 0;
      police.downTimer = POLICE.respawnDelay;
      police.active = false;
      police.mesh.group.visible = false;
      return 'down';
    }
    return 'hit';
  }

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
  // Air One's combat state: 5 hits bring it down for $500, then it comes
  // back after 45 seconds. At wanted 4+ it fires warning shots at Ray.
  const heliState = { health: POLICE.heliHealth, downTimer: 0, warningTimer: 0 };

  /**
   * One gunshot lands on Air One. Returns 'hit' | 'down' | 'already-down'.
   */
  function hitHeli() {
    if (heliState.downTimer > 0 || !heli.visible) return 'already-down';
    heliState.health -= 1;
    if (heliState.health <= 0) {
      heliState.downTimer = POLICE.heliRespawn;
      heli.visible = false;
      return 'down';
    }
    return 'hit';
  }

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

  // Roadblocks: two Interceptors parked nose-to-nose across the road plus
  // a striped barrier, staged ahead of Ray during escape missions at
  // wanted 3+. One group is reused and repositioned; it is hidden whenever
  // the heat drops or the mission is not an escape.
  const roadblockGroup = new THREE.Group();
  const rbCarA = buildCarMesh(scene, PALETTE.policePaint, true);
  rbCarA.group.position.set(-3.4, 0, 0);
  rbCarA.group.rotation.y = Math.PI / 2;
  roadblockGroup.add(rbCarA.group);
  const rbCarB = buildCarMesh(scene, PALETTE.policePaint, true);
  rbCarB.group.position.set(3.4, 0, 0);
  rbCarB.group.rotation.y = -Math.PI / 2;
  roadblockGroup.add(rbCarB.group);
  const barrier = new THREE.Mesh(
    new THREE.BoxGeometry(8, 1.1, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xf0c030, roughness: 0.7 }),
  );
  barrier.position.set(0, 0.9, 0);
  roadblockGroup.add(barrier);
  const barrierStripe = new THREE.Mesh(
    new THREE.BoxGeometry(8.1, 0.3, 0.52),
    new THREE.MeshBasicMaterial({ color: 0x111111 }),
  );
  barrierStripe.position.set(0, 1.2, 0);
  roadblockGroup.add(barrierStripe);
  roadblockGroup.visible = false;
  scene.add(roadblockGroup);
  const roadblock = { active: false, x: 0, z: 0 };

  /**
   * Keep the roadblock in the right state for this frame. During an escape
   * mission at wanted 3+ it sits on the road ahead of the player, snapped
   * to a grid line; otherwise it is gone. Returns the roadblock state.
   */
  function updateRoadblock(wanted, missionType, playerPos, playerYaw) {
    const want = missionType === 'escape' && wanted >= 3;
    if (!want) {
      roadblock.active = false;
      roadblockGroup.visible = false;
      return roadblock;
    }
    if (!roadblock.active) {
      const ahead = snapToRoad(
        playerPos.x + Math.sin(playerYaw) * 46,
        playerPos.z + Math.cos(playerYaw) * 46,
      );
      roadblock.x = ahead.x;
      roadblock.z = ahead.z;
      roadblock.active = true;
      roadblockGroup.position.set(ahead.x, 0, ahead.z);
      // The cars sit across the road: a snapped-x line is a north-south
      // road, so the barricade spans east-west at rotation 0; a snapped-z
      // line is an east-west road, so it turns ninety degrees.
      roadblockGroup.rotation.y = ahead.axis === 'z' ? 0 : Math.PI / 2;
      roadblockGroup.visible = true;
    }
    return roadblock;
  }

  /** True when (x, z) is inside the roadblock's blocking circle. */
  function roadblockNear(x, z, dist = 6) {
    return roadblock.active && Math.hypot(x - roadblock.x, z - roadblock.z) < dist;
  }

  // The tail-mission mark: the Vice Cruiser drives a slow loop around the
  // central blocks while Ray tails it. It only moves while the tail is on.
  const markWaypoints = [
    { x: -43, z: -43 }, { x: 43, z: -43 }, { x: 43, z: 43 }, { x: -43, z: 43 },
  ];
  const markState = { active: false, waypoint: 0 };

  function startMark(x, z) {
    const car = cars[MARK_CAR_INDEX];
    car.x = x;
    car.z = z;
    car.speed = 8;
    car.yaw = 0;
    car.mesh.group.position.set(x, 0, z);
    car.mesh.group.rotation.y = 0;
    markState.active = true;
    markState.waypoint = 0;
  }

  function stopMark() {
    markState.active = false;
    cars[MARK_CAR_INDEX].speed = 0;
  }

  function updateMark(dt) {
    if (!markState.active) return;
    const car = cars[MARK_CAR_INDEX];
    const target = markWaypoints[markState.waypoint % markWaypoints.length];
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) {
      markState.waypoint += 1;
      return;
    }
    const targetYaw = Math.atan2(dx, dz);
    let diff = targetYaw - car.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.yaw += Math.max(-1.2 * dt, Math.min(1.2 * dt, diff));
    car.x += Math.sin(car.yaw) * car.speed * dt;
    car.z += Math.cos(car.yaw) * car.speed * dt;
    car.mesh.group.position.set(car.x, 0, car.z);
    car.mesh.group.rotation.y = car.yaw;
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

  /**
   * Anti-deadlock shove: when Ray holds the gas within 4.5 m of the
   * Interceptor head-on, the two cars would otherwise sit bumper to
   * bumper forever. Shove Ray's car 4.5 m sideways, away from the cop,
   * so the chase can move again. Returns true when a shove happened.
   */
  function applyShove(car, input, policePos) {
    if (!input.forward) return false;
    const dx = car.x - policePos.x;
    const dz = car.z - policePos.z;
    if (Math.hypot(dx, dz) >= 4.5) return false;
    const px = Math.cos(car.yaw);
    const pz = -Math.sin(car.yaw);
    const side = (px * dx + pz * dz) >= 0 ? 1 : -1;
    car.x += px * side * 4.5;
    car.z += pz * side * 4.5;
    car.mesh.group.position.set(car.x, 0, car.z);
    return true;
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
    updateMark(dt);
    // Police pursuit: at wanted 2+ the Interceptor rolls out toward the
    // player, steering to intercept. It tops out at 34 m/s and only gains
    // 6 m/s per second, so a clean getaway car (42 m/s) can pull away —
    // and it eases off inside 8 m so it corners onto the player instead
    // of overshooting past them. At wanted 4 the helicopter joins.
    // A knocked-out Interceptor sits out its 8-second respawn delay, then
    // comes back snapped onto a road near the player — the fleet returns.
    if (police.downTimer > 0) {
      police.downTimer -= dt;
      if (police.downTimer <= 0) respawnPolice(playerPos);
    }
    police.active = wanted >= 2 && police.downTimer <= 0;
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
    let heliWarningShot = false;
    if (heliState.downTimer > 0) {
      heliState.downTimer -= dt;
      heli.visible = false;
      if (heliState.downTimer <= 0) {
        heliState.health = POLICE.heliHealth;
        heli.position.set(playerPos.x + 20, POLICE.heliHeight, playerPos.z - 20);
      }
    }
    heli.visible = heliWanted && heliState.downTimer <= 0;
    if (heliWanted && heliState.downTimer <= 0) {
      const hx = playerPos.x + Math.sin(time * 0.4) * 14;
      const hz = playerPos.z + Math.cos(time * 0.4) * 14;
      heli.position.x += (hx - heli.position.x) * Math.min(1, dt * 0.8);
      heli.position.z += (hz - heli.position.z) * Math.min(1, dt * 0.8);
      heli.position.y = POLICE.heliHeight + Math.sin(time * 1.3) * 2;
      heli.rotation.y = Math.atan2(playerPos.x - heli.position.x, playerPos.z - heli.position.z);
      rotor.rotation.y += dt * 22;
      search.intensity = 300 + Math.sin(time * 6) * 120;
      // Warning shots at wanted 4+: Air One fires at Ray on a timer. The
      // main loop turns the flag into damage and a tracer, so this module
      // never touches the player's health itself.
      heliState.warningTimer -= dt;
      if (heliState.warningTimer <= 0) {
        heliState.warningTimer = POLICE.warningShotInterval;
        heliWarningShot = true;
      }
    }
    return {
      policeDistance: Math.hypot(playerPos.x - police.x, playerPos.z - police.z),
      heliWarningShot,
      heliHealth: heliState.health,
      heliDown: heliState.downTimer > 0,
      roadblock,
      mark: { x: cars[MARK_CAR_INDEX].x, z: cars[MARK_CAR_INDEX].z, active: markState.active },
    };
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

  return {
    cars, police, heli, heliState, traffic, drive, update, nearestCar,
    hitPolice, hitHeli, respawnPolice, snapToRoad, applyShove,
    updateRoadblock, roadblockNear, startMark, stopMark, markState,
  };
}
