// Vice Point — the garage: one lot east of the grid where Ray can store a
// car, buy a fresh one with mission money, or lay low to shed a star.
// The building is a plain box with a striped awning and a GARAGE neon sign
// (the sign itself lives in config.js NEON_SIGNS); the pad in front is
// where bought and retrieved cars appear.

import * as THREE from 'three';
import { GARAGE } from './config.js';
import { makeNeonTexture } from './world.js';

export function createGarage(scene) {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(16, 7, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.9 }),
  );
  shell.position.set(GARAGE.x, 3.5, GARAGE.z);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);
  // Striped awning over the door.
  const awnMat = new THREE.MeshStandardMaterial({ color: 0xff9f1c, roughness: 0.8 });
  const awnMat2 = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.25, 3.4),
      i % 2 === 0 ? awnMat : awnMat2,
    );
    stripe.position.set(GARAGE.x - 6.75 + i * 2.7, 5.4, GARAGE.z - 6.6);
    stripe.rotation.x = 0.35;
    group.add(stripe);
  }
  // Roller door.
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(10, 5, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.6, metalness: 0.5 }),
  );
  door.position.set(GARAGE.x, 2.5, GARAGE.z - 6.1);
  group.add(door);
  // Neon sign over the door.
  const tex = makeNeonTexture('GARAGE', '#ff9f1c', 92);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(12.8, 4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
  );
  sign.position.set(GARAGE.x, 8.6, GARAGE.z - 6.2);
  group.add(sign);
  // Parking pad in front of the door (west side, facing the city).
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.95 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(GARAGE.x - 15, 0.05, GARAGE.z);
  pad.receiveShadow = true;
  group.add(pad);
  // Yellow bay lines on the pad.
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  for (const dz of [-4, 0, 4]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.3), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(GARAGE.x - 15, 0.07, GARAGE.z + dz);
    group.add(line);
  }
  scene.add(group);
  return { group, x: GARAGE.x, z: GARAGE.z };
}

// Price of a fresh car from the garage: 25% off once respect hits the bar.
export function garageBuyPrice(respect) {
  if (respect >= GARAGE.discountRespect) {
    return Math.round(GARAGE.buyPrice * (1 - GARAGE.discount));
  }
  return GARAGE.buyPrice;
}
