// Vice Point — street races, stage 4. Three checkpoint races, each with a
// start pad, four to five checkpoints along the road grid, a target time
// and a rival who posts a fixed time of his own. Press Y on a start pad to
// flag off; every checkpoint you thread lights the gold beam on the next
// one and pings the HUD timer. Beat the target and the rival both and the
// purse is yours, plus standing in the district you finished in.
import * as THREE from 'three';
import { districtAt } from './config.js';

export const RACES = [
  {
    id: 'strip', name: 'Strip Sprint', start: { x: -150, z: -50 },
    checkpoints: [
      { x: -150, z: -50 }, { x: 50, z: -50 }, { x: 50, z: 50 },
      { x: -50, z: 50 }, { x: -50, z: -50 },
    ],
    target: 75, rivalTime: 82, reward: 600,
  },
  {
    id: 'beach', name: 'Beach Run', start: { x: -250, z: 250 },
    checkpoints: [
      { x: -250, z: 250 }, { x: 50, z: 250 }, { x: 50, z: 150 },
      { x: 250, z: 150 }, { x: 250, z: 250 },
    ],
    target: 80, rivalTime: 88, reward: 800,
  },
  {
    id: 'airport', name: 'Airport Loop', start: { x: 150, z: -50 },
    checkpoints: [
      { x: 150, z: -50 }, { x: 250, z: -50 }, { x: 250, z: 100 },
      { x: 150, z: 100 }, { x: 150, z: -50 },
    ],
    target: 70, rivalTime: 76, reward: 1000,
  },
];

export class Races {
  constructor(scene, hud) {
    this.scene = scene;
    this.hud = hud;
    this.active = -1; // index into RACES, or -1
    this.checkpoint = 0;
    this.elapsed = 0;
    this.wins = {}; // race id -> times won
    this.lastResult = null; // { race, time, won }
    this.onWin = null; // (race, time) => main pays out
    this._buildMarker();
  }

  _buildMarker() {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x2fd4ff, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 30, 12, 1, true), beamMat);
    beam.position.y = 15;
    g.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.6, 32),
      new THREE.MeshBasicMaterial({ color: 0x2fd4ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    g.add(ring);
    g.visible = false;
    this.scene.add(g);
    this.marker = g;
  }

  get current() { return this.active >= 0 ? RACES[this.active] : null; }
  get racing() { return this.active >= 0; }

  nearStart(pos, radius = 12) {
    for (let i = 0; i < RACES.length; i++) {
      if (Math.hypot(pos.x - RACES[i].start.x, pos.z - RACES[i].start.z) < radius) return i;
    }
    return -1;
  }

  start(i) {
    if (this.racing || i < 0 || i >= RACES.length) return false;
    this.active = i;
    this.checkpoint = 0;
    this.elapsed = 0;
    this.lastResult = null;
    this._syncMarker();
    if (this.hud) this.hud.setRace(`${RACES[i].name} — 0.0s / ${RACES[i].target}s`);
    return true;
  }

  _syncMarker() {
    const race = this.current;
    if (!race) { this.marker.visible = false; return; }
    const cp = race.checkpoints[this.checkpoint];
    if (!cp) { this.marker.visible = false; return; }
    this.marker.position.set(cp.x, 0, cp.z);
    this.marker.visible = true;
  }

  update(dt, playerPos, driving) {
    if (!this.racing) return null;
    const race = this.current;
    this.elapsed += dt;
    if (this.hud) {
      this.hud.setRace(`${race.name} — ${this.elapsed.toFixed(1)}s / ${race.target}s · CP ${this.checkpoint + 1}/${race.checkpoints.length}`);
    }
    const cp = race.checkpoints[this.checkpoint];
    if (cp && Math.hypot(playerPos.x - cp.x, playerPos.z - cp.z) < 14) {
      this.checkpoint++;
      if (this.checkpoint >= race.checkpoints.length) return this._finish();
      this._syncMarker();
      if (this.hud) this.hud.setHint(`Checkpoint ${this.checkpoint}/${race.checkpoints.length} — keep it pinned!`);
      return 'checkpoint';
    }
    if (this.elapsed > race.target + 30) {
      // Hopelessly over time: call it, no purse.
      this.lastResult = { race: race.id, time: this.elapsed, won: false, reason: 'too slow' };
      this._stop();
      if (this.hud) { this.hud.setRace(''); this.hud.setHint(`Race over — too slow. Target was ${race.target}s.`); }
      return 'lose';
    }
    return null;
  }

  _finish() {
    const race = this.current;
    const time = this.elapsed;
    const won = time <= race.target && time <= race.rivalTime;
    this.lastResult = { race: race.id, time, won };
    this.wins[race.id] = (this.wins[race.id] || 0) + (won ? 1 : 0);
    const finishDistrict = districtAt(race.checkpoints[race.checkpoints.length - 1].x, race.checkpoints[race.checkpoints.length - 1].z).id;
    this._stop();
    if (this.hud) this.hud.setRace('');
    if (won && this.onWin) this.onWin(race, time, finishDistrict);
    return won ? 'win' : 'lose';
  }

  _stop() {
    this.active = -1;
    this.checkpoint = 0;
    this.marker.visible = false;
  }

  serialize() { return { ...this.wins }; }
  restore(s) { if (s) this.wins = { ...s }; }
}
