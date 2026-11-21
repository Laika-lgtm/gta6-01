// Vice Point — `?shot=` screenshot staging.
// Each mode poses one frozen moment of the game for a 1280x720 cover shot:
// chase (an active pursuit), mission (Mara Voss in her yellow beam), drive
// (a beach cruise past the palms) and street (Ray on foot with a pedestrian).
// Staging only moves things that already exist; it never changes the rules.

import * as THREE from 'three';
import { MISSIONS, START } from './config.js';
import { ensurePoliceCount } from './vehicles.js';

export function shotModeFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('shot');
  } catch {
    return null;
  }
}

// A simple Mara Voss figure: burgundy jacket, dark hair, gold hoops of light.
export function createMara(scene) {
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x7a1f2b, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a077, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 1 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.34), jacket);
  torso.position.y = 1.18;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.34), skin);
  head.position.y = 1.74;
  group.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.38), hair);
  hairTop.position.y = 1.96;
  group.add(hairTop);
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.12), hair);
  hairBack.position.set(0, 1.7, -0.2);
  group.add(hairBack);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), jacket);
  armL.position.set(-0.4, 1.2, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.4;
  group.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.24), pants);
  legL.position.set(-0.16, 0.42, 0);
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  group.add(legR);
  group.position.set(START.position.x, 0, START.position.z);
  scene.add(group);
  return {
    group, x: START.position.x, z: START.position.z, heading: 0,
  };
}

// A tall yellow beam marking the mission giver, plus a ground ring.
export function createBeam(scene, x, z) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 14, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23f, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.set(x, 7, z);
  scene.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.9, 2.3, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.06, z);
  scene.add(ring);
  return { beam, ring };
}

// Move every traffic car and parked street car off the x=0 avenue so the
// chase frame shows open road, neon and the city — not a traffic jam.
function clearAvenue(cars, traffic) {
  for (const car of [...cars, ...traffic]) {
    if (Math.abs(car.x) < 20) {
      car.x = car.x >= 0 ? 126 : -126;
      car.z = Math.max(-130, Math.min(130, car.z + 60));
      car.group.position.set(car.x, 0, car.z);
    }
  }
}

// G is the live game bag from main.js:
// {state, player, cars, traffic, pedestrians, police, heli, mara, beam,
//  scene, colliders, setInCar(car)}.
export function stageShotMode(mode, G) {
  const { state } = G;
  if (!mode) return false;
  if (mode === 'chase') {
    // Clear the avenue FIRST: it shoves every car with |x|<20 off the road,
    // and the staged Neon sits at x=0 — clearing after staging moved the
    // Neon itself to (126,106), ~135 m from the staged police, who then
    // instantly despawned past the 120 m radius. The frame showed fog.
    clearAvenue(G.cars, G.traffic);
    // Ray in the Neon Coupe, mid-avenue, three Interceptors right on him and
    // the heli frozen above the road so it stays in frame. Wanted four stars.
    // The Neon is FROZEN (speed 0): a rolling car drives out of the static
    // frame in a second of game time, while the police close to their 2.8 m
    // standoff and hold there — Interceptors on the bumper, heli above.
    const neon = G.cars.find((c) => c.def.id === 'neon');
    neon.x = 0; neon.z = 46; neon.heading = Math.PI; neon.speed = 0;
    neon.group.position.set(0, 0, 46);
    neon.group.rotation.y = Math.PI;
    G.setInCar(neon);
    state.wanted = 4;
    state.missionIndex = 0;
    ensurePoliceCount(G.police, G.scene, 3, 0, 46, G.colliders);
    const spots = [[0, 58, Math.PI], [6.5, 52, Math.PI], [-6.5, 55, Math.PI]];
    G.police.forEach((unit, i) => {
      const [x, z, h] = spots[i % spots.length];
      unit.x = x; unit.z = z; unit.heading = h; unit.speed = 30;
      unit.group.position.set(x, 0, z);
      unit.group.rotation.y = h;
    });
    G.heli.x = 0; G.heli.z = 14; G.heli.frozen = true;
    G.heli.group.position.set(0, 30, 14);
    // Frame it from behind and above the coupe: pursuit, city and neon all in.
    // Angles checked against the 62-degree camera: Neon ~13 deg off-axis,
    // all three Interceptors 14-23 deg, heli ~20 deg up — everything in
    // (look y 4 clipped the heli's rotor at the top edge; y 7 clears it).
    state.shotFraming = {
      cam: [5, 5, 72], look: [0, 7, 42],
    };
    return true;
  }
  if (mode === 'mission') {
    // Mara Voss standing in her yellow beam at the start corner; Ray on foot
    // a few steps away, facing her. No heat, first mission showing.
    state.wanted = 0;
    state.missionIndex = 0;
    G.mara.x = 0; G.mara.z = 24; G.mara.heading = Math.PI;
    G.mara.group.position.set(0, 0, 24);
    G.mara.group.rotation.y = Math.PI;
    G.beam.beam.position.set(0, 7, 24);
    G.beam.ring.position.set(0, 0.06, 24);
    G.beam.beam.visible = true;
    G.beam.ring.visible = true;
    G.player.x = 3.5; G.player.z = 30; G.player.heading = Math.PI;
    G.player.cameraYaw = Math.PI;
    G.player.group.position.set(3.5, 0, 30);
    G.player.group.rotation.y = Math.PI;
    state.shotFraming = {
      cam: [10, 4.2, 38], look: [1, 1.4, 25],
    };
    return true;
  }
  if (mode === 'drive') {
    // A beach cruise: the Neon Coupe on the sand by the sea, palms and the
    // city skyline behind it, late sun over the water. Frozen (speed 0) so
    // the car stays in the static frame instead of rolling out of it.
    const neon = G.cars.find((c) => c.def.id === 'neon');
    neon.x = 202; neon.z = 40; neon.heading = Math.PI; neon.speed = 0;
    neon.group.position.set(202, 0, 40);
    neon.group.rotation.y = Math.PI;
    G.setInCar(neon);
    state.wanted = 0;
    state.missionIndex = 0;
    state.shotFraming = {
      cam: [218, 6, 62], look: [198, 1.5, 30],
    };
    return true;
  }
  if (mode === 'street') {
    // Ray on foot on the avenue with a pedestrian beside him — street life.
    state.wanted = 0;
    state.missionIndex = 0;
    G.player.x = 0; G.player.z = 12; G.player.heading = Math.PI * 0.85;
    G.player.cameraYaw = Math.PI * 0.85;
    G.player.group.position.set(0, 0, 12);
    G.player.group.rotation.y = G.player.heading;
    const ped = G.pedestrians[0];
    if (ped) {
      // West of Ray on the open avenue, facing him — the old spot (x 3.2)
      // put the pedestrian behind the block's building wall from this camera.
      ped.x = -2.8; ped.z = 8.0; ped.heading = 0.61; ped.down = false;
      ped.group.position.set(-2.8, 0, 8.0);
      ped.group.rotation.set(0, ped.heading, 0);
    }
    state.shotFraming = {
      cam: [7, 3.4, 24], look: [1, 1.4, 10],
    };
    return true;
  }
  return false;
}

// The mission marker for the HUD arrow / minimap. Escape missions have a
// null marker on purpose — every consumer must guard it (see hud/minimap).
export function currentMarker(state) {
  const mission = MISSIONS[state.missionIndex];
  return mission ? mission.marker : null;
}
