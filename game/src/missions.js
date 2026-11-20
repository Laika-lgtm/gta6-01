// Vice Point — the mission chain. Three jobs take Ray from borrowing his
// first car to a run out to the pier and a drop downtown, each paying cash
// on completion. A light beacon marks the objective in the world, on the
// minimap and in the HUD; the manager only tracks state, the game loop
// owns cash, sound and saving.

import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 'wheels',
    title: 'BORROWED WHEELS',
    text: 'Get in a car — walk up to one and press E.',
    reward: 150,
    kind: 'enterCar',
  },
  {
    id: 'pier',
    title: 'PIER RUN',
    text: 'Drive out to the PIER 9 marker on the pier.',
    reward: 300,
    kind: 'reach',
    target: { x: 0, z: 215 },
    radius: 9,
  },
  {
    id: 'downtown',
    title: 'DOWNTOWN DROP',
    text: 'Reach the marker in the middle of downtown.',
    reward: 500,
    kind: 'reach',
    target: { x: 0, z: 0 },
    radius: 9,
  },
];

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.index = 0;
    this.done = [];
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

  // Where the beacon stands right now: the mission target, or the nearest
  // car to the player while the job is to get into one.
  updateBeacon(carPositions, px, pz) {
    const m = this.current();
    if (!m) {
      this.beacon.visible = false;
      return;
    }
    this.beacon.visible = true;
    if (m.kind === 'enterCar' && carPositions.length > 0) {
      let best = carPositions[0];
      let bestD = Infinity;
      for (const p of carPositions) {
        const d = (p.x - px) * (p.x - px) + (p.z - pz) * (p.z - pz);
        if (d < bestD) { bestD = d; best = p; }
      }
      this.markerPos = { x: best.x, z: best.z };
    } else if (m.target) {
      this.markerPos = { x: m.target.x, z: m.target.z };
    }
    this.beacon.position.set(this.markerPos.x, 0, this.markerPos.z);
  }

  update(time) {
    this.diamond.rotation.y = time * 1.6;
    this.diamond.position.y = 5 + Math.sin(time * 2.2) * 0.6;
  }

  // Returns the completed mission when the player's position finishes it.
  checkReach(x, z) {
    const m = this.current();
    if (!m || m.kind !== 'reach' || !m.target) return null;
    const dx = x - m.target.x;
    const dz = z - m.target.z;
    if (dx * dx + dz * dz > m.radius * m.radius) return null;
    return this.complete();
  }

  // Returns the completed mission when the player gets into a car.
  checkEnterCar() {
    const m = this.current();
    if (!m || m.kind !== 'enterCar') return null;
    return this.complete();
  }

  complete() {
    const m = this.current();
    this.done.push(m.id);
    this.index++;
    return m;
  }

  // Save / load shape.
  serialize() {
    return { index: this.index, done: [...this.done] };
  }

  restore(data) {
    if (!data) return;
    this.index = Math.max(0, Math.min(MISSIONS.length, data.index | 0));
    this.done = Array.isArray(data.done) ? [...data.done] : [];
  }
}
