// Vice Point — weapons and the weapon wheel. Ray carries a pistol
// (unlimited ammo) and an SMG (limited ammo); the wheel opens while Q is
// held, Digit1/2/3 switch directly, and clicking fires. Aiming is arcade
// lock-on: the shot goes to the nearest shootable target inside a cone
// around the camera's forward direction — police cars, pedestrians and
// the police helicopter — so a chase-camera game can actually hit a heli
// overhead. The module only reports hits; the game loop owns wanted
// level, knockdowns, respect and removal.

import * as THREE from 'three';

export const WEAPONS = [
  { id: 'pistol', name: 'PISTOL', damage: 34, rate: 0.28, range: 110, ammo: Infinity, auto: false },
  { id: 'smg', name: 'SMG', damage: 18, rate: 0.09, range: 110, ammo: 270, auto: true },
];

const CONE_COS = Math.cos(0.61); // ~35 deg half-angle for ground targets
const HELI_CONE_COS = Math.cos(0.85); // ~49 deg: the heli sits high up

export class WeaponManager {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.index = 0;
    this.ammo = WEAPONS.map((w) => w.ammo);
    this.cooldown = 0;
    this.tracers = []; // { line, life }
    this.muzzle = new THREE.Vector3();
  }

  current() {
    return WEAPONS[this.index];
  }

  ammoLeft() {
    const w = this.current();
    return w.ammo === Infinity ? Infinity : this.ammo[this.index];
  }

  switchTo(i) {
    if (i < 0 || i >= WEAPONS.length || i === this.index) return false;
    this.index = i;
    this.cooldown = Math.max(this.cooldown, 0.15);
    this.sound.ui();
    return true;
  }

  cycle() {
    this.switchTo((this.index + 1) % WEAPONS.length);
  }

  // Fire one shot. `origin` is the gun position, `dir` the camera forward
  // (unit). `targets` is { police: [{x, z, y?}], peds: [...],
  // heli: {x, y, z, active} | null } — plain positions, no scene graph.
  // Returns { hit: 'police'|'ped'|'heli'|null, index, point } or null when
  // the weapon is cooling down or the SMG is dry.
  fire(origin, dir, targets) {
    if (this.cooldown > 0) return null;
    const w = this.current();
    if (w.ammo !== Infinity) {
      if (this.ammo[this.index] <= 0) {
        // Dry: fall back to the pistol so Ray is never defenceless.
        this.switchTo(0);
        return { hit: null, dry: true };
      }
      this.ammo[this.index] -= 1;
    }
    this.cooldown = w.rate;
    this.sound.shot(w.id);

    // Nearest target inside the aim cone wins; the heli gets a wider
    // cone because it sits far above the camera's line of sight.
    let best = null;
    let bestD = w.range;
    const consider = (pos, cosLimit, kind, index) => {
      const dx = pos.x - origin.x;
      const dy = (pos.y ?? 1.2) - origin.y;
      const dz = pos.z - origin.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > w.range || d < 0.5) return;
      const dot = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
      if (dot < cosLimit) return;
      if (d < bestD) {
        bestD = d;
        best = { hit: kind, index, point: new THREE.Vector3(pos.x, pos.y ?? 1.2, pos.z) };
      }
    };
    if (targets.police) {
      targets.police.forEach((p, i) => consider({ x: p.x, y: 1.0, z: p.z }, CONE_COS, 'police', i));
    }
    if (targets.peds) {
      targets.peds.forEach((p, i) => consider({ x: p.x, y: 1.2, z: p.z }, CONE_COS, 'ped', i));
    }
    if (targets.heli && targets.heli.active) {
      consider(targets.heli, HELI_CONE_COS, 'heli', 0);
    }

    const end = best
      ? best.point
      : new THREE.Vector3(origin.x + dir.x * 60, origin.y + dir.y * 60, origin.z + dir.z * 60);
    this.spawnTracer(origin, end);
    if (!best) return { hit: null, point: end };
    best.damage = w.damage;
    return best;
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.9,
    }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.12 });
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  serialize() {
    return { index: this.index, ammo: this.ammo.map((a) => (a === Infinity ? -1 : a)) };
  }

  restore(data) {
    if (!data) return;
    if (typeof data.index === 'number' && data.index >= 0 && data.index < WEAPONS.length) {
      this.index = data.index;
    }
    if (Array.isArray(data.ammo)) {
      data.ammo.forEach((a, i) => {
        if (i < this.ammo.length) this.ammo[i] = a === -1 ? Infinity : Math.max(0, a | 0);
      });
    }
  }
}
