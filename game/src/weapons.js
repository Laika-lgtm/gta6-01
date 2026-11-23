// Vice Point — weapons + weapon wheel, stage 4. Two guns on the wheel:
// the Pistol (12-round mag, bottomless reserve, steady) and the SMG
// (30-round mag, 90 in reserve, fast and wild). Q opens the wheel, 1/2
// pick a gun, X (or a mouse click) fires. A shot finds the nearest
// pedestrian or cop in front of Ray inside range and drops them — and
// shooting anyone is a crime, so the heat follows. Mags reload on their
// own when they run dry.
import * as THREE from 'three';

export const WEAPONS = {
  pistol: { name: 'Pistol', mag: 12, reserve: Infinity, range: 26, rate: 0.28, spread: 0.02, damage: 1 },
  smg: { name: 'SMG', mag: 30, reserve: 90, range: 22, rate: 0.09, spread: 0.06, damage: 1 },
};

export const WEAPON_ORDER = ['pistol', 'smg'];

export class Arsenal {
  constructor(scene, sounds) {
    this.scene = scene;
    this.sounds = sounds;
    this.current = 'pistol';
    this.wheelOpen = false;
    this.mag = { pistol: WEAPONS.pistol.mag, smg: WEAPONS.smg.mag };
    this.reserve = { pistol: Infinity, smg: WEAPONS.smg.reserve };
    this.cooldown = 0;
    this.reloadLeft = 0;
    this.shotsFired = 0;
    this.hits = 0;
    this.kills = 0;
    this._tracer = null;
    this._tracerLeft = 0;
    this._buildTracer();
  }

  _buildTracer() {
    const geo = new THREE.BoxGeometry(0.08, 0.08, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.9 });
    this._tracer = new THREE.Mesh(geo, mat);
    this._tracer.visible = false;
    this.scene.add(this._tracer);
  }

  _showTracer(from, to) {
    const dx = to.x - from.x, dy = (to.y || 1.4) - 1.4, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    this._tracer.position.set((from.x + to.x) / 2, 1.4 + dy / 2, (from.z + to.z) / 2);
    this._tracer.scale.set(1, 1, len);
    this._tracer.lookAt(to.x, 1.4 + dy, to.z);
    this._tracer.visible = true;
    this._tracerLeft = 0.08;
  }

  get def() { return WEAPONS[this.current]; }
  get reloading() { return this.reloadLeft > 0; }

  select(id) {
    if (!WEAPONS[id]) return false;
    this.current = id;
    this.wheelOpen = false;
    return true;
  }

  toggleWheel() { this.wheelOpen = !this.wheelOpen; return this.wheelOpen; }

  label() {
    const d = this.def;
    const res = this.reserve[this.current] === Infinity ? '∞' : String(this.reserve[this.current]);
    const rel = this.reloading ? ' · reloading…' : '';
    return `${d.name} ${this.mag[this.current]}/${res}${rel}`;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this._tracerLeft > 0) {
      this._tracerLeft -= dt;
      if (this._tracerLeft <= 0) this._tracer.visible = false;
    }
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        const d = this.def;
        const need = d.mag - this.mag[this.current];
        const take = Math.min(need, this.reserve[this.current]);
        this.mag[this.current] += take;
        if (this.reserve[this.current] !== Infinity) this.reserve[this.current] -= take;
      }
    }
  }

  // Fire one shot. Returns 'ped' | 'police' | 'miss' | 'cooldown' |
  // 'reloading' | 'empty'. The caller applies the wanted penalty.
  shoot(origin, yaw, peds, police) {
    if (this.cooldown > 0) return 'cooldown';
    if (this.reloadLeft > 0) return 'reloading';
    if (this.mag[this.current] <= 0) {
      if (this.reserve[this.current] > 0 || this.reserve[this.current] === Infinity) {
        this.reloadLeft = 1.4;
        return 'reloading';
      }
      return 'empty';
    }
    this.cooldown = this.def.rate;
    this.mag[this.current]--;
    this.shotsFired++;
    if (this.sounds) this.sounds.blip(190, 0.07, 'square', 0.22);
    if (this.mag[this.current] === 0 && (this.reserve[this.current] > 0 || this.reserve[this.current] === Infinity)) {
      this.reloadLeft = 1.4;
    }
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const inCone = (x, z, range) => {
      const dx = x - origin.x, dz = z - origin.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      return along > 0 && along < range && side < 2.4;
    };
    let target = null, kind = null;
    if (peds) {
      for (const p of peds.list) {
        if (p.down > 0) continue;
        if (inCone(p.pos.x, p.pos.z, this.def.range)) {
          const d = Math.hypot(p.pos.x - origin.x, p.pos.z - origin.z);
          if (!target || d < target.d) { target = { d, x: p.pos.x, z: p.pos.z, ped: p }; kind = 'ped'; }
        }
      }
    }
    if (police) {
      for (const u of police.units) {
        if (inCone(u.pos.x, u.pos.z, this.def.range)) {
          const d = Math.hypot(u.pos.x - origin.x, u.pos.z - origin.z);
          if (!target || d < target.d) { target = { d, x: u.pos.x, z: u.pos.z, unit: u }; kind = 'police'; }
        }
      }
    }
    if (target) {
      this._showTracer(origin, target);
      this.hits++;
      if (kind === 'ped') {
        peds.punchDown(target.ped);
        this.kills++;
        return 'ped';
      }
      // A cop unit goes down: pulled off the chase, lights out.
      const u = target.unit;
      this.scene.remove(u.mesh);
      police.units.splice(police.units.indexOf(u), 1);
      this.kills++;
      return 'police';
    }
    const far = { x: origin.x + fx * this.def.range, z: origin.z + fz * this.def.range };
    this._showTracer(origin, far);
    return 'miss';
  }

  serialize() {
    return {
      current: this.current,
      mag: { ...this.mag },
      reserve: { pistol: this.reserve.pistol, smg: this.reserve.smg },
      shotsFired: this.shotsFired, hits: this.hits, kills: this.kills,
    };
  }
  restore(s) {
    if (!s) return;
    if (WEAPONS[s.current]) this.current = s.current;
    if (s.mag) for (const k of WEAPON_ORDER) if (typeof s.mag[k] === 'number') this.mag[k] = s.mag[k];
    if (s.reserve) for (const k of WEAPON_ORDER) if (typeof s.reserve[k] === 'number') this.reserve[k] = s.reserve[k];
    if (typeof s.shotsFired === 'number') this.shotsFired = s.shotsFired;
    if (typeof s.hits === 'number') this.hits = s.hits;
    if (typeof s.kills === 'number') this.kills = s.kills;
  }
}
