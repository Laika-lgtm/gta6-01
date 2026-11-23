// Vice Point — 12 hidden caches, stage 4. Twelve stashes spread across all
// seven districts on roadside spots a driver can actually reach (never
// inside a building footprint). A cache sits quiet until Ray gets within
// 45 m — then its gold beam lights up — and walking or driving within
// 4.5 m cracks it open: $100, standing in that district, and a tick on
// the HUD counter (Caches n/12).
import * as THREE from 'three';
import { districtAt } from './config.js';

export const CACHE_REWARD = 100;

// 12 spots: 2 Docks, 2 Marina, 2 Old Town, 2 Neon Strip, 1 Hills,
// 1 Airport, 2 Beachfront. All sit on or just off a road line.
export const CACHE_SPOTS = [
  { x: -243, z: -150 }, // Docks
  { x: -157, z: -250 }, // Docks
  { x: 57, z: -200 },   // Marina
  { x: -43, z: -157 },  // Marina
  { x: -243, z: 50 },   // Old Town
  { x: -157, z: 57 },   // Old Town
  { x: 57, z: -43 },    // Neon Strip
  { x: -43, z: 57 },    // Neon Strip
  { x: 243, z: -157 },  // Hills
  { x: 243, z: 57 },    // Airport
  { x: -43, z: 260 },   // Beachfront
  { x: 157, z: 260 },   // Beachfront
];

export class Caches {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.found = new Set();
    this.onCollect = null; // (index, districtId, amount) => main pays out
    this._build();
  }

  _build() {
    const gold = new THREE.MeshLambertMaterial({ color: 0xffd23b, emissive: 0x6a5200 });
    const lidMat = new THREE.MeshLambertMaterial({ color: 0x8a6a10 });
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd23b, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    });
    CACHE_SPOTS.forEach((s, i) => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 1.1), gold);
      box.position.y = 0.7;
      g.add(box);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 1.2), lidMat);
      lid.position.y = 1.18;
      g.add(lid);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 22, 10, 1, true), beamMat);
      beam.position.y = 11;
      beam.visible = false;
      g.add(beam);
      g.position.set(s.x, 0, s.z);
      this.scene.add(g);
      this.items.push({ ...s, index: i, group: g, beam, district: districtAt(s.x, s.z).id, taken: false });
    });
  }

  get count() { return this.found.size; }
  get total() { return this.items.length; }

  nearestUnfound(pos, maxDist = 45) {
    let best = null, bestD = maxDist;
    for (const c of this.items) {
      if (c.taken) continue;
      const d = Math.hypot(c.group.position.x - pos.x, c.group.position.z - pos.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  update(dt, playerPos) {
    for (const c of this.items) {
      if (c.taken) continue;
      const d = Math.hypot(c.group.position.x - playerPos.x, c.group.position.z - playerPos.z);
      c.beam.visible = d < 45;
      if (d < 4.5) this._collect(c);
    }
  }

  _collect(c) {
    c.taken = true;
    this.found.add(c.index);
    c.group.visible = false;
    if (this.onCollect) this.onCollect(c.index, c.district, CACHE_REWARD);
  }

  // Debug/test aid: collect a cache by index without walking to it.
  collectAt(i) {
    const c = this.items[i];
    if (!c || c.taken) return false;
    this._collect(c);
    return true;
  }

  serialize() { return [...this.found]; }
  restore(arr) {
    if (!Array.isArray(arr)) return;
    for (const i of arr) {
      const c = this.items[i];
      if (c && !c.taken) { c.taken = true; c.group.visible = false; this.found.add(i); }
    }
  }
}
