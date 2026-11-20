// Vice Point — the Mara Voss mission chain. Three jobs take Ray from a
// $250 wallet to $1,550: pick Mara up and drive her to Hotel VICE (+$300),
// lose the cops who show up right after (+$400), then grab the getaway car
// (+$600). A light beacon marks the objective in the world, on the minimap
// and in the HUD; the manager only tracks state, the game loop owns cash,
// sound, wanted level and saving.
//
// The escape job has NO map target on purpose: its objective is the wanted
// level itself, so every consumer must guard for a null target — the HUD,
// the beacon and the distance readout all do.

import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'THE PICKUP',
    text: 'Pick up Mara Voss on the avenue, then drive her to Hotel VICE.',
    reward: 300,
    kind: 'pickup',
    // Mara waits on the road at (0, 75); the hotel drop-off is set from
    // the city at construction (the HOTEL sign's street face).
    pickup: { x: 0, z: 75 },
    radius: 9,
  },
  {
    id: 'heat',
    title: 'HEAT',
    text: 'The cops are on you — break away and stay out of sight until the heat clears.',
    reward: 400,
    kind: 'escape',
    target: null,
  },
  {
    id: 'getaway',
    title: 'THE GETAWAY CAR',
    text: 'Get to the white getaway car and get in.',
    reward: 600,
    kind: 'getaway',
    target: { x: -58, z: 80 },
    carIndex: 3,
    radius: 9,
  },
];

export class MissionManager {
  // `spots.hotel` is the Hotel VICE drop-off from the city builder.
  constructor(scene, spots = {}) {
    this.scene = scene;
    this.hotelSpot = spots.hotel ?? { x: 100, z: 25 };
    this.index = 0;
    this.done = [];
    // Pickup stages: 0 = walk to Mara, 1 = drive her to the hotel.
    // Getaway stages: 0 = reach the car, 1 = get in it.
    this.stage = 0;
    // Escape: seconds the wanted level has sat at zero, in a row.
    this.escapeTimer = 0;
    this.escapeNeeded = 1.5;
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 34, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd166, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    beam.position.y = 17;
    this.beacon.add(beam);
    this.diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.3),
      new THREE.MeshBasicMaterial({ color: 0xffd166 }),
    );
    this.diamond.position.y = 5;
    this.beacon.add(this.diamond);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 3.1, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    this.beacon.add(ring);
    scene.add(this.beacon);
    this.markerPos = { x: 0, z: 0 };
  }

  current() {
    return MISSIONS[this.index] ?? null;
  }

  isFinished() {
    return this.index >= MISSIONS.length;
  }

  // Where the beacon stands right now. The escape job has no map target:
  // the beacon parks over the player instead of pointing nowhere (and
  // markerPos is left alone, so the minimap never chases a null target).
  updateBeacon(carPositions, px, pz) {
    const m = this.current();
    if (!m) {
      this.beacon.visible = false;
      return;
    }
    this.beacon.visible = true;
    if (m.kind === 'pickup') {
      this.markerPos = this.stage === 0
        ? { x: m.pickup.x, z: m.pickup.z }
        : { x: this.hotelSpot.x, z: this.hotelSpot.z };
    } else if (m.kind === 'escape') {
      // No destination: hover the beacon over the player as a "lay low"
      // marker instead of dereferencing a null target.
      this.markerPos = { x: px, z: pz };
    } else if (m.target) {
      this.markerPos = { x: m.target.x, z: m.target.z };
    }
    this.beacon.position.set(this.markerPos.x, 0, this.markerPos.z);
  }

  // Beacon spin only. Escape timing lives in updateEscape(dt, wanted),
  // which the loop feeds with real frame time — never a fixed 1/60 step.
  update(time) {
    this.diamond.rotation.y = time * 1.6;
    this.diamond.position.y = 5 + Math.sin(time * 2.2) * 0.6;
  }

  // Escape progress in real frame time — the loop feeds dt, not a fixed
  // 1/60 step, so the timer stays honest at any frame rate.
  updateEscape(dt, wanted) {
    const m = this.current();
    if (!m || m.kind !== 'escape') return null;
    if (wanted <= 0) {
      this.escapeTimer += dt;
      if (this.escapeTimer >= this.escapeNeeded) return this.complete();
    } else {
      this.escapeTimer = 0;
    }
    return null;
  }

  // Returns the completed mission when the player's position finishes it.
  // `inCar` matters for the pickup drop-off: Mara only counts as delivered
  // when Ray drives her there.
  checkReach(x, z, inCar = false) {
    const m = this.current();
    if (!m || m.kind === 'escape') return null;
    if (m.kind === 'pickup') {
      const goal = this.stage === 0 ? m.pickup : this.hotelSpot;
      const dx = x - goal.x;
      const dz = z - goal.z;
      if (dx * dx + dz * dz > m.radius * m.radius) return null;
      if (this.stage === 0) {
        this.stage = 1;
        return null; // Mara is in — now drive her to the hotel.
      }
      if (!inCar) return null; // On foot at the hotel: she is still waiting in the car.
      return this.complete();
    }
    if (m.kind !== 'getaway' || !m.target) return null;
    const dx = x - m.target.x;
    const dz = z - m.target.z;
    if (dx * dx + dz * dz > m.radius * m.radius) return null;
    if (this.stage === 0) {
      this.stage = 1;
      return null; // At the car — now get in it.
    }
    return null;
  }

  // Returns the completed mission when the player gets into a car. Only
  // the getaway job completes this way, and only in its own car.
  checkEnterCar(carIndex) {
    const m = this.current();
    if (!m) return null;
    if (m.kind === 'getaway' && this.stage === 1 && carIndex === m.carIndex) {
      return this.complete();
    }
    return null;
  }

  // A bust during the escape job fails it — no reward, no completion, the
  // job restarts from the top (the game loop re-raises the wanted level).
  // A bust during any other job leaves the job alone.
  failCurrent() {
    const m = this.current();
    if (!m || m.kind !== 'escape') return false;
    this.stage = 0;
    this.escapeTimer = 0;
    return true;
  }

  complete() {
    const m = this.current();
    this.done.push(m.id);
    this.index++;
    this.stage = 0;
    this.escapeTimer = 0;
    return m;
  }

  // Save / load shape. The stage rides along so a save mid-pickup still
  // knows Mara is already in the car.
  serialize() {
    return { index: this.index, done: [...this.done], stage: this.stage };
  }

  restore(data) {
    if (!data) return;
    this.index = Math.max(0, Math.min(MISSIONS.length, data.index | 0));
    this.done = Array.isArray(data.done) ? [...data.done] : [];
    this.stage = data.stage === 1 ? 1 : 0;
    this.escapeTimer = 0;
  }
}
