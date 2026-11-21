// Vice Point — weapons: pistol + SMG, weapon wheel, hitscan shooting.
// Q cycles fists -> pistol -> SMG, Digit1/2/3 pick directly, F fires while
// armed (and punches while unarmed — that path stays in combat.js). A shot
// is one ray: the nearest pedestrian, police car or helicopter inside a
// narrow cone in front of Ray takes the hit. Ammo only comes back by
// finishing jobs, so every bullet is a small decision. The tracer is a
// stretched glowing box that lives 0.08 s; the muzzle flash is a tiny bright
// sphere at the barrel. Nothing here touches wanted levels — the caller
// decides what a witnessed shot costs (see main.js onShootHit).

import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER, HELI } from './config.js';

export function createWeapons() {
  return {
    weapon: 'fists',
    ammo: { pistol: WEAPONS.pistol.startAmmo, smg: WEAPONS.smg.startAmmo },
    cooldown: 0,
  };
}

export function currentWeapon(weapons) {
  return WEAPONS[weapons.weapon];
}

export function cycleWeapon(weapons) {
  const i = WEAPON_ORDER.indexOf(weapons.weapon);
  weapons.weapon = WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length];
  return weapons.weapon;
}

export function selectWeapon(weapons, id) {
  if (WEAPONS[id]) weapons.weapon = id;
  return weapons.weapon;
}

export function refillAmmo(weapons) {
  weapons.ammo.pistol += WEAPONS.pistol.refill;
  weapons.ammo.smg += WEAPONS.smg.refill;
}

export function updateWeapons(weapons, dt) {
  if (weapons.cooldown > 0) weapons.cooldown -= dt;
}

// --- Tracers + muzzle flash -------------------------------------------------
export function createWeaponFx(scene) {
  const tracers = [];
  for (let i = 0; i < 4; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0 }),
  );
  flash.visible = false;
  scene.add(flash);
  return { tracers, flash, next: 0 };
}

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _mid = new THREE.Vector3();

function fireTracer(fx, from, to) {
  const t = fx.tracers[fx.next];
  fx.next = (fx.next + 1) % fx.tracers.length;
  _from.copy(from);
  _to.copy(to);
  _mid.addVectors(_from, _to).multiplyScalar(0.5);
  const len = Math.max(0.1, _from.distanceTo(_to));
  t.mesh.position.copy(_mid);
  t.mesh.lookAt(_to);
  t.mesh.scale.set(1, 1, len);
  t.mesh.material.opacity = 0.95;
  t.mesh.visible = true;
  t.life = 0.08;
  fx.flash.position.copy(from);
  fx.flash.material.opacity = 0.95;
  fx.flash.visible = true;
}

// Public tracer entry: plain {x, y, z} endpoints (the heli warning shots
// use this; the player's own shots go through tryShoot).
export function shootTracer(fx, from, to) {
  fireTracer(
    fx,
    new THREE.Vector3(from.x, from.y, from.z),
    new THREE.Vector3(to.x, to.y, to.z),
  );
}

export function updateWeaponFx(fx, dt) {
  for (const t of fx.tracers) {
    if (t.life > 0) {
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.08) * 0.95;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }
  if (fx.flash.visible) {
    fx.flash.material.opacity = Math.max(0, fx.flash.material.opacity - dt * 14);
    if (fx.flash.material.opacity <= 0) fx.flash.visible = false;
  }
}

// --- Shooting ---------------------------------------------------------------
// Returns { fired, empty, hit, kind, target }. `targets` is
// { pedestrians, police, heli }. The heli is a 3D target: it counts when its
// horizontal distance is inside range and it sits inside the firing cone.
export function tryShoot(weapons, fx, player, targets, onHit) {
  const def = WEAPONS[weapons.weapon];
  if (!def || weapons.weapon === 'fists') return { fired: false };
  if (weapons.cooldown > 0) return { fired: false };
  if (weapons.ammo[weapons.weapon] <= 0) {
    weapons.cooldown = 0.3; // dry-fire click, throttled
    return { fired: false, empty: true };
  }
  weapons.ammo[weapons.weapon] -= 1;
  weapons.cooldown = def.cooldown;

  const ox = player.x + Math.sin(player.heading) * 0.6;
  const oz = player.z + Math.cos(player.heading) * 0.6;
  const oy = 1.35;
  const fxDir = Math.sin(player.heading);
  const fzDir = Math.cos(player.heading);
  const origin = new THREE.Vector3(ox, oy, oz);

  let best = null;
  let bestD = def.range;
  let bestKind = null;
  const consider = (x, z, range, kind, target) => {
    const dx = x - player.x;
    const dz = z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > range || d < 0.001) return;
    const cos = (dx * fxDir + dz * fzDir) / d;
    if (cos < def.arcCos) return;
    if (d < bestD) { bestD = d; best = target; bestKind = kind; }
  };
  for (const ped of targets.pedestrians || []) {
    if (ped.down) continue;
    consider(ped.x, ped.z, def.range, 'pedestrian', ped);
  }
  for (const unit of targets.police || []) {
    if (unit.disabled) continue;
    consider(unit.x, unit.z, def.range, 'police', unit);
  }
  const heli = targets.heli;
  if (heli && heli.active && !heli.down) {
    consider(heli.x, heli.z, HELI.shootRange, 'heli', heli);
  }

  const end = new THREE.Vector3(
    ox + fxDir * (best ? bestD : def.range),
    bestKind === 'heli' && heli ? heli.y : oy,
    oz + fzDir * (best ? bestD : def.range),
  );
  fireTracer(fx, origin, end);
  if (best) {
    if (onHit) onHit({ kind: bestKind, target: best });
    return { fired: true, hit: true, kind: bestKind, target: best };
  }
  return { fired: true, hit: false };
}
