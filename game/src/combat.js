// Vice Point — hand-to-hand combat: the F-key punch.
// Ray swings his right arm; anything in a short arc in front of him takes
// the hit. Pedestrians go down, stay down a few seconds, then get up and run.
// Hitting a cop is a crime. One swing every 0.55 s — the cooldown is what
// keeps a punch from landing twice on the same frame.

import * as THREE from 'three';

export const PUNCH = {
  cooldown: 0.55,
  range: 2.3,
  arcCos: 0.5, // ~60 degrees off the facing direction
  animTime: 0.28,
  policeRange: 2.6,
  policeWanted: 2,
  pedWanted: 1,
};

export function createCombat(scene) {
  // A quick expanding ring at the impact point — the only effect a punch gets.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.5, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  return {
    cooldown: 0,
    anim: 0, // seconds left in the swing; 0 means idle
    ring,
    ringLife: 0,
  };
}

// Start a swing if the cooldown allows. Returns true when a swing started.
export function tryPunch(combat, player, pedestrians, policeUnits, onHit) {
  if (combat.cooldown > 0 || combat.anim > 0) return { swung: false, hit: false };
  combat.anim = PUNCH.animTime;
  combat.cooldown = PUNCH.cooldown;
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  let hitAnything = false;

  for (const ped of pedestrians) {
    if (ped.down) continue;
    const dx = ped.x - player.x;
    const dz = ped.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < PUNCH.range && d > 0.001 && (dx * fx + dz * fz) / d > PUNCH.arcCos) {
      knockDownPed(ped);
      showImpact(combat, ped.x, ped.z);
      onHit({ kind: 'pedestrian', target: ped });
      hitAnything = true;
    }
  }
  for (const unit of policeUnits || []) {
    const dx = unit.x - player.x;
    const dz = unit.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < PUNCH.policeRange && d > 0.001 && (dx * fx + dz * fz) / d > PUNCH.arcCos) {
      unit.speed = Math.max(0, unit.speed - 6);
      showImpact(combat, unit.x, unit.z);
      onHit({ kind: 'police', target: unit });
      hitAnything = true;
    }
  }
  return { swung: true, hit: hitAnything };
}

// Drop a pedestrian: flat on their back for a few seconds, then up and running.
export function knockDownPed(ped) {
  if (ped.down) return;
  ped.down = true;
  ped.downTimer = 3.5;
  ped.flee = 0;
  ped.group.rotation.x = -Math.PI / 2 * 0.92;
  ped.legL.rotation.x = 0;
  ped.legR.rotation.x = 0;
}

// Per-frame: swing the arm, tick the cooldown, fade the impact ring.
export function updateCombat(combat, player, dt) {
  if (combat.cooldown > 0) combat.cooldown -= dt;
  if (combat.anim > 0) {
    combat.anim -= dt;
    // Arm punches forward and back: a sine hump over the swing.
    const t = 1 - Math.max(0, combat.anim) / PUNCH.animTime;
    player.armR.rotation.x = -Math.sin(t * Math.PI) * 1.9;
    player.armR.rotation.z = -Math.sin(t * Math.PI) * 0.35;
  } else {
    player.armR.rotation.z = 0;
  }
  if (combat.ringLife > 0) {
    combat.ringLife -= dt;
    const t = 1 - Math.max(0, combat.ringLife) / 0.3;
    const s = 1 + t * 2.2;
    combat.ring.scale.set(s, s, s);
    combat.ring.material.opacity = 0.85 * (1 - t);
    if (combat.ringLife <= 0) combat.ring.visible = false;
  }
}

function showImpact(combat, x, z) {
  combat.ring.position.set(x, 1.2, z);
  combat.ring.visible = true;
  combat.ringLife = 0.3;
  combat.ring.scale.set(1, 1, 1);
  combat.ring.material.opacity = 0.85;
}
