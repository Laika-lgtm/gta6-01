// Vice Point — Air One, the police helicopter. It shows up once the
// wanted level hits 4 stars, circles above Ray at rooftop-clearing height
// with a spotlight pinned on him, and keeps the heat on: while it is up,
// an extra Interceptor joins the chase and the wanted level never cools
// down. It can be shot down (150 hp) — it spins out of the sky, and a new
// one only comes back after a breather. The heli never flies through a
// building: its altitude clears the tallest roof near the player.

import * as THREE from 'three';

const HELI_HP = 150;
const ORBIT_RADIUS = 24;
const ORBIT_SPEED = 0.22;
const MIN_ALTITUDE = 38;
const RESPAWN_DELAY = 25;

export class HeliManager {
  // `buildings` is the city's full 3D building list, for altitude.
  constructor(scene, buildings = []) {
    this.scene = scene;
    this.buildings = buildings;
    this.group = null;
    this.spot = null;
    this.beam = null;
    this.state = 'gone'; // gone | active | falling
    this.hp = HELI_HP;
    this.angle = 0;
    this.altitude = MIN_ALTITUDE;
    this.fallSpeed = 0;
    this.respawnTimer = 0;
    this.active = false;
  }

  get position() {
    return this.group ? this.group.position : null;
  }

  makeHeli() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 5.2), bodyMat);
    body.castShadow = true;
    g.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.46, 0.5, 5.26), whiteMat);
    stripe.position.y = 0.1;
    g.add(stripe);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.9, 1.6),
      new THREE.MeshLambertMaterial({ color: 0x1a2733 }),
    );
    glass.position.set(0, 0.3, 2.0);
    g.add(glass);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.6), bodyMat);
    tail.position.set(0, 0.3, -4.4);
    g.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.6, 1.2), bodyMat);
    fin.position.set(0, 1.0, -6.4);
    g.add(fin);
    // Main rotor: two long blades on a mast, spinning in update().
    const rotor = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(11, 0.08, 0.5);
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0x2c3136 });
    rotor.add(new THREE.Mesh(bladeGeo, bladeMat));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 6), bladeMat);
    mast.position.y = -0.4;
    rotor.add(mast);
    rotor.position.y = 1.2;
    rotor.name = 'rotor';
    g.add(rotor);
    // Searchlight beam: a translucent cone hanging below the nose.
    const beamGeo = new THREE.ConeGeometry(4.5, 40, 16, 1, true);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xfff6c9, transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    beam.rotation.x = Math.PI; // cone points down
    beam.position.y = -20;
    beam.name = 'beam';
    g.add(beam);
    // Real spotlight, aimed at the player every frame.
    const spot = new THREE.SpotLight(0xfff2c0, 60, 140, 0.32, 0.5, 1.2);
    spot.position.set(0, -0.8, 1.5);
    g.add(spot);
    // The target lives in the scene, not in the group: a child target
    // would be rotated by the heli's own yaw and point the wrong way.
    g.userData.rotor = rotor;
    g.userData.beam = beam;
    g.userData.spot = spot;
    return g;
  }

  spawn(px, pz) {
    this.group = this.makeHeli();
    this.group.position.set(px + ORBIT_RADIUS, MIN_ALTITUDE, pz);
    this.scene.add(this.group);
    this.spot = this.group.userData.spot;
    this.beam = this.group.userData.beam;
    this.scene.add(this.spot.target);
    this.state = 'active';
    this.active = true;
    this.hp = HELI_HP;
    this.angle = 0;
    this.fallSpeed = 0;
  }

  remove() {
    if (!this.group) return;
    if (this.spot) this.scene.remove(this.spot.target);
    this.scene.remove(this.group);
    this.group = null;
    this.spot = null;
    this.beam = null;
    this.state = 'gone';
    this.active = false;
    this.respawnTimer = RESPAWN_DELAY;
  }

  // Returns 'down' the frame the heli hits the ground, else null.
  damage(amount) {
    if (this.state !== 'active') return null;
    this.hp -= amount;
    if (this.hp > 0) return null;
    this.state = 'falling';
    this.fallSpeed = 0;
    return 'falling';
  }

  // Tallest roof within 45 m of the player, so the orbit clears it.
  altitudeFor(px, pz) {
    let tallest = 0;
    for (const b of this.buildings) {
      if (Math.abs(b.x - px) < 45 && Math.abs(b.z - pz) < 45 && b.h > tallest) tallest = b.h;
    }
    return Math.max(MIN_ALTITUDE, tallest + 8);
  }

  // `wanted` drives spawning; the loop passes the player's position.
  // Returns 'down' when a shot-down heli hits the ground.
  update(dt, px, pz, wanted) {
    if (this.state === 'falling') {
      this.fallSpeed += 22 * dt;
      this.group.position.y -= this.fallSpeed * dt;
      this.group.rotation.z += dt * 4;
      this.group.rotation.y += dt * 1.5;
      if (this.group.position.y <= 1.2) {
        this.group.position.y = 1.2;
        this.remove();
        return 'down';
      }
      return null;
    }
    if (this.state === 'gone') {
      if (wanted >= 4) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.spawn(px, pz);
      } else {
        this.respawnTimer = 0;
      }
      return null;
    }
    // Active: circle the player, altitude clears the roofs nearby.
    // The heat dropped below 4 stars: Air One peels off and leaves.
    if (wanted < 4) {
      this.remove();
      return null;
    }
    this.angle += ORBIT_SPEED * dt;
    const targetAlt = this.altitudeFor(px, pz);
    this.altitude += (targetAlt - this.altitude) * Math.min(1, dt);
    const tx = px + Math.sin(this.angle) * ORBIT_RADIUS;
    const tz = pz + Math.cos(this.angle) * ORBIT_RADIUS;
    const g = this.group;
    g.position.x += (tx - g.position.x) * Math.min(1, 1.6 * dt);
    g.position.z += (tz - g.position.z) * Math.min(1, 1.6 * dt);
    g.position.y += (this.altitude - g.position.y) * Math.min(1, 1.2 * dt);
    g.rotation.y = Math.atan2(px - g.position.x, pz - g.position.z);
    g.userData.rotor.rotation.y += dt * 22;
    // Spotlight + beam track the player (world-space target).
    if (this.spot) {
      this.spot.target.position.set(px, 0, pz);
    }
    return null;
  }
}
