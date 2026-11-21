// Vice Point — Ray Delgado, the third-person player character.
// A low-poly figure built from boxes: teal shirt, dark jeans, sneakers, hair.
// Walks with WASD relative to the camera, runs with Shift, and the camera
// orbits on mouse drag and never clips through a building (it pulls in when
// the line of sight hits one).

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { resolveCircleCollisions, pointInsideBuildings } from './city.js';

export function createPlayer(scene, start) {
  const group = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x2ea8a0, roughness: 0.85 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.9 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 1 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.18;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.34), skin);
  head.position.y = 1.74;
  head.castShadow = true;
  group.add(head);

  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.36), hair);
  hairTop.position.y = 1.95;
  group.add(hairTop);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirt);
  armL.position.set(-0.4, 1.2, 0);
  armL.castShadow = true;
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  group.add(armR);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.24), jeans);
  legL.position.set(-0.16, 0.42, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);

  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.4), shoe);
  shoeL.position.set(-0.16, 0.05, 0.06);
  group.add(shoeL);
  const shoeR = shoeL.clone();
  shoeR.position.x = 0.16;
  group.add(shoeR);

  group.position.set(start.position.x, 0, start.position.z);
  scene.add(group);

  return {
    group,
    armL,
    armR,
    legL,
    legR,
    x: start.position.x,
    z: start.position.z,
    heading: start.heading,
    cameraYaw: start.heading + Math.PI,
    cameraPitch: 0.32,
    speed: 0,
    moving: false,
    walkPhase: 0,
    health: PLAYER.maxHealth,
  };
}

// Move on foot. intent: {forward, strafe, run} in camera space.
export function updatePlayer(player, intent, mouse, dt, colliders) {
  const speed = intent.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const mx = Math.sin(player.cameraYaw);
  const mz = Math.cos(player.cameraYaw);
  // Camera looks along -forward of yaw; forward vector on the ground:
  const fx = -mx;
  const fz = -mz;
  const rx = -fz;
  const rz = fx;

  let dx = fx * intent.forward + rx * intent.strafe;
  let dz = fz * intent.forward + rz * intent.strafe;
  const len = Math.hypot(dx, dz);
  player.moving = len > 0.01;
  if (player.moving) {
    dx /= len;
    dz /= len;
    const targetHeading = Math.atan2(dx, dz);
    let diff = targetHeading - player.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    player.heading += diff * Math.min(1, PLAYER.turnSpeed * dt);
    const nx = player.x + dx * speed * dt;
    const nz = player.z + dz * speed * dt;
    const fixed = resolveCircleCollisions(nx, nz, PLAYER.radius, colliders);
    player.x = fixed.x;
    player.z = fixed.z;
    player.speed = speed;
    player.walkPhase += dt * (intent.run ? 13 : 8);
  } else {
    player.speed = 0;
    player.walkPhase *= 0.9;
  }

  // Camera orbit from the mouse.
  player.cameraYaw -= mouse.dx * 0.0032;
  player.cameraPitch = Math.max(0.05, Math.min(1.1, player.cameraPitch + mouse.dy * 0.0024));

  // Pose: swing limbs while walking, idle sway otherwise.
  const swing = player.moving ? Math.sin(player.walkPhase) * 0.7 : 0;
  player.armL.rotation.x = swing;
  player.armR.rotation.x = -swing;
  player.legL.rotation.x = -swing;
  player.legR.rotation.x = swing;
  player.group.position.set(player.x, 0, player.z);
  player.group.rotation.y = player.heading;
}

// Third-person camera: behind the player at cameraYaw, pulled in when a
// building blocks the view. Returns nothing; writes into camera.
export function updatePlayerCamera(player, camera, colliders) {
  const dist = PLAYER.cameraDistance;
  const pitch = player.cameraPitch;
  const target = new THREE.Vector3(player.x, 1.6, player.z);
  let d = dist;
  // Step the camera in until the line of sight is clear of buildings.
  for (let tryDist = dist; tryDist >= PLAYER.cameraMinDistance; tryDist -= 0.5) {
    const cx = player.x + Math.sin(player.cameraYaw) * Math.cos(pitch) * tryDist;
    const cz = player.z + Math.cos(player.cameraYaw) * Math.cos(pitch) * tryDist;
    const cy = 1.6 + Math.sin(pitch) * tryDist;
    if (!pointInsideBuildings(cx, cz, colliders) || tryDist <= PLAYER.cameraMinDistance + 0.01) {
      d = tryDist;
      camera.position.set(cx, cy, cz);
      break;
    }
  }
  camera.lookAt(target);
  return d;
}
