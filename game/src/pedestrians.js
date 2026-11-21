// Pedestrians: fourteen people walking the sidewalks. Each one strolls one
// sidewalk edge of a city block and turns around at the end, so the streets
// feel lived in without anyone ever walking through a wall or a road. A
// pedestrian who gets punched runs away from whoever hit them.
import * as THREE from 'three';
import { CITY, PEDS } from './config.js';
import { createRandom, pick, range } from './random.js';

const SHIRTS = [0xe85d75, 0x4d9de0, 0x7bc47f, 0xe9c46a, 0x9b5de5, 0xf15bb5, 0xef8354, 0x00bbf9];
const PANTS = [0x2a3242, 0x4a3b31, 0x3a4a3a, 0x555555];
const SKINS = [0xc98d64, 0x8d5a3b, 0xe8b88a, 0x6b4226];

function buildPedMesh(scene, shirt, pants, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.9 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.38), shirtMat);
  torso.position.y = 1.1;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.position.y = 1.75;
  head.castShadow = true;
  group.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), shirtMat);
  armL.position.set(-0.46, 1.1, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.46;
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.75, 0.26), pantsMat);
  legL.position.set(-0.17, 0.38, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);
  scene.add(group);
  return { group, armL, armR, legL, legR };
}

export function createPedestrians(scene) {
  const random = createRandom(CITY.seed + 77);
  const pitch = CITY.blockSize + CITY.roadWidth;
  const origin = -(CITY.blocks / 2) * pitch + pitch / 2;
  const edge = CITY.blockSize / 2 + 2.5;

  const peds = [];
  for (let i = 0; i < PEDS.count; i += 1) {
    const mesh = buildPedMesh(
      scene,
      pick(random, SHIRTS),
      pick(random, PANTS),
      pick(random, SKINS),
    );
    // Pick a block and one of its four sidewalk edges; the ped walks that
    // edge end to end, then turns around.
    const bx = origin + Math.floor(random() * CITY.blocks) * pitch;
    const bz = origin + Math.floor(random() * CITY.blocks) * pitch;
    const side = Math.floor(random() * 4);
    const horizontal = side < 2;
    const fixed = side === 0 ? bz - edge : side === 1 ? bz + edge : side === 2 ? bx - edge : bx + edge;
    const along = range(random, -CITY.blockSize / 2 + 4, CITY.blockSize / 2 - 4);
    const centre = horizontal ? bx : bz;
    const ped = {
      mesh,
      horizontal,
      fixed,
      centre,
      along,
      dir: random() < 0.5 ? 1 : -1,
      speed: PEDS.speed + range(random, -0.4, 0.5),
      walkPhase: random() * Math.PI * 2,
      fleeTimer: 0,
      fleeX: 0,
      fleeZ: 0,
      x: horizontal ? bx + along : fixed,
      z: horizontal ? fixed : bz + along,
    };
    mesh.group.position.set(ped.x, 0, ped.z);
    mesh.group.rotation.y = horizontal ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
    peds.push(ped);
  }

  function update(dt) {
    for (const ped of peds) {
      let speed = ped.speed;
      if (ped.fleeTimer > 0) {
        // Sprint away from the threat for a short while, then calm down.
        // The flee is deliberately slower than Ray's run (max ~4.2 m/s
        // vs 11 m/s), so a punched pedestrian can be caught again.
        ped.fleeTimer -= dt;
        speed = ped.speed * 2;
        const dx = ped.x - ped.fleeX;
        const dz = ped.z - ped.fleeZ;
        const len = Math.hypot(dx, dz) || 1;
        ped.x += (dx / len) * speed * dt;
        ped.z += (dz / len) * speed * dt;
        ped.mesh.group.rotation.y = Math.atan2(dx, dz);
      } else {
        ped.along += ped.dir * speed * dt;
        const half = CITY.blockSize / 2 - 4;
        if (ped.along > half) {
          ped.along = half;
          ped.dir = -1;
        } else if (ped.along < -half) {
          ped.along = -half;
          ped.dir = 1;
        }
        ped.x = ped.horizontal ? ped.centre + ped.along : ped.fixed;
        ped.z = ped.horizontal ? ped.fixed : ped.centre + ped.along;
        ped.mesh.group.rotation.y = ped.horizontal
          ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (ped.dir > 0 ? 0 : Math.PI);
      }
      ped.walkPhase += dt * speed * 3.4;
      const swing = Math.sin(ped.walkPhase) * 0.5;
      ped.mesh.armL.rotation.x = swing;
      ped.mesh.armR.rotation.x = -swing;
      ped.mesh.legL.rotation.x = -swing;
      ped.mesh.legR.rotation.x = swing;
      ped.mesh.group.position.set(ped.x, 0, ped.z);
    }
  }

  /** Make a pedestrian run away from (x, z) for a short while. */
  function fleeFrom(ped, x, z) {
    ped.fleeTimer = 1.2;
    ped.fleeX = x;
    ped.fleeZ = z;
  }

  function nearestPed(x, z, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const ped of peds) {
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = ped;
      }
    }
    return best;
  }

  return { peds, update, fleeFrom, nearestPed };
}
