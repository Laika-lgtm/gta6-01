// Ray Delgado, third-person walker. On foot he is a low-poly figure —
// teal jacket, dark jeans, cap — with a simple walk swing; the mouse orbits
// the camera and WASD moves relative to where the camera looks. The module
// owns the player's position, heading, health and money, and resolves wall
// collisions against the city's collider boxes. F throws a punch: the right
// arm snaps forward for a beat, and the main loop decides what it hits.
import * as THREE from 'three';
import { PLAYER } from './config.js';

export function createPlayer(scene, colliders) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x1f8a70, roughness: 0.8 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2a3242, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.7 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xd83a3a, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.95, 0.45), jacket);
  torso.position.y = 1.15;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin);
  head.position.y = 1.9;
  head.castShadow = true;
  group.add(head);
  const capMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.56), cap);
  capMesh.position.y = 2.18;
  group.add(capMesh);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), cap);
  brim.position.set(0, 2.12, 0.36);
  group.add(brim);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.24), jacket);
  armL.position.set(-0.58, 1.15, 0);
  armL.castShadow = true;
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.58;
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.3), jeans);
  legL.position.set(-0.2, 0.42, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.2;
  group.add(legR);
  scene.add(group);

  const state = {
    x: PLAYER.startX,
    z: PLAYER.startZ,
    yaw: 0,
    camYaw: 0,
    health: 100,
    money: 250,
    wanted: 0,
    // Respect 0-100: the street's opinion of Ray. Missions and big plays
    // raise it; the survey and the heist are gated on it.
    respect: 0,
    // Weapons: fists / pistol (24) / SMG (60). F fires whatever is armed.
    weapon: 'fists',
    ammo: { pistol: 24, smg: 60 },
    fireCooldown: 0,
    moving: false,
    speed: 0,
    walkPhase: 0,
    punchTimer: 0,
    punchCooldown: 0,
  };
  group.position.set(state.x, 0, state.z);

  // The beach runs to the sea; the playable east edge is the waterline.
  const CITY_LIMIT_X = 296;

  function collides(x, z) {
    const r = PLAYER.radius;
    for (const c of colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  function clampToCity(x, z) {
    const lim = 236;
    return { x: Math.max(-lim, Math.min(CITY_LIMIT_X, x)), z: Math.max(-lim, Math.min(lim, z)) };
  }

  /** Start a punch swing if the cooldown has cleared; returns true. */
  function punch() {
    if (state.punchCooldown > 0) return false;
    state.punchTimer = 0.32;
    state.punchCooldown = PLAYER.punchCooldown;
    return true;
  }

  /**
   * Fire the armed weapon. Fists reuse the punch swing and never run out;
   * guns spend one round per shot and refuse to fire on an empty magazine.
   * Returns 'fists' | 'shot' | 'empty' | 'cooling'.
   */
  function fire() {
    if (state.fireCooldown > 0) return 'cooling';
    if (state.weapon === 'fists') {
      if (!punch()) return 'cooling';
      state.fireCooldown = 0.1;
      return 'fists';
    }
    if (state.ammo[state.weapon] <= 0) return 'empty';
    state.ammo[state.weapon] -= 1;
    state.fireCooldown = state.weapon === 'smg' ? 0.14 : 0.34;
    state.punchTimer = 0.18;
    return 'shot';
  }

  /** Add respect, clamped to 0-100. Returns the new value. */
  function addRespect(amount) {
    state.respect = Math.max(0, Math.min(100, state.respect + amount));
    return state.respect;
  }

  function update(dt, input) {
    if (state.punchTimer > 0) state.punchTimer -= dt;
    if (state.punchCooldown > 0) state.punchCooldown -= dt;
    if (state.fireCooldown > 0) state.fireCooldown -= dt;
    const run = input.shift ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let fx = 0;
    let fz = 0;
    if (input.forward) { fx += Math.sin(state.camYaw); fz += Math.cos(state.camYaw); }
    if (input.back) { fx -= Math.sin(state.camYaw); fz -= Math.cos(state.camYaw); }
    if (input.left) { fx -= Math.cos(state.camYaw); fz += Math.sin(state.camYaw); }
    if (input.right) { fx += Math.cos(state.camYaw); fz -= Math.sin(state.camYaw); }
    const len = Math.hypot(fx, fz);
    state.moving = len > 0;
    if (len > 0) {
      fx /= len;
      fz /= len;
      state.yaw = Math.atan2(fx, fz);
      const nx = state.x + fx * run * dt;
      const nz = state.z + fz * run * dt;
      const clamped = clampToCity(nx, nz);
      // Slide along walls: try the full step, then each axis alone.
      if (!collides(clamped.x, clamped.z)) {
        state.x = clamped.x;
        state.z = clamped.z;
      } else if (!collides(clamped.x, state.z)) {
        state.x = clamped.x;
      } else if (!collides(state.x, clamped.z)) {
        state.z = clamped.z;
      }
      state.speed = run;
      state.walkPhase += dt * run * 1.6;
    } else {
      state.speed = 0;
    }
    group.position.set(state.x, 0, state.z);
    group.rotation.y = state.yaw;
    const swing = state.moving ? Math.sin(state.walkPhase) * 0.55 : 0;
    armL.rotation.x = swing;
    legL.rotation.x = -swing;
    legR.rotation.x = swing;
    // A punch overrides the right-arm walk swing: the arm snaps forward
    // and comes back as the timer runs down.
    if (state.punchTimer > 0) {
      armR.rotation.x = -1.9 * Math.min(1, state.punchTimer / 0.12 + 0.4);
    } else {
      armR.rotation.x = -swing;
    }
  }

  function setPosition(x, z, yaw) {
    state.x = x;
    state.z = z;
    if (yaw !== undefined) {
      state.yaw = yaw;
      state.camYaw = yaw;
    }
    group.position.set(x, 0, z);
    group.rotation.y = state.yaw;
  }

  /**
   * Punch lunge: step toward (x, z) until stopDist away, sliding along
   * walls the same way a walk does — so a swing at a pedestrian Ray has
   * just run up to actually connects instead of whiffing at arm's length.
   */
  function stepToward(x, z, stopDist) {
    const dx = x - state.x;
    const dz = z - state.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= stopDist) return;
    const step = dist - stopDist;
    const nx = state.x + (dx / dist) * step;
    const nz = state.z + (dz / dist) * step;
    const clamped = clampToCity(nx, nz);
    if (!collides(clamped.x, clamped.z)) {
      state.x = clamped.x;
      state.z = clamped.z;
    } else if (!collides(clamped.x, state.z)) {
      state.x = clamped.x;
    } else if (!collides(state.x, clamped.z)) {
      state.z = clamped.z;
    }
    group.position.set(state.x, 0, state.z);
  }

  return {
    state,
    group,
    update,
    punch,
    fire,
    addRespect,
    setPosition,
    stepToward,
    position: () => new THREE.Vector3(state.x, 0, state.z),
  };
}
