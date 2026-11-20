// Vice Point — the Mara Voss mission chain. Eight jobs take Ray from a
// $250 wallet to $8,550: pick Mara up and drive her to Hotel VICE (+$300),
// lose the cops who show up right after (+$400), then grab the getaway car
// (+$600), run a timed drop to the pier (+$800), tail a debtor's coupe
// (+$1,200), sabotage a rival warehouse (+$1,500), pick up Mara's guy while
// the heat is on (+$1,800, needs 30 respect), and the big one — grab the
// cash downtown and run for the pier under Air One (+$1,700, needs 50
// respect). A light beacon marks the objective in the world, on the
// minimap and in the HUD; the manager only tracks state, the game loop
// owns cash, sound, wanted level and saving.
//
// The escape job has NO map target on purpose: its objective is the wanted
// level itself, so every consumer must guard for a null target — the HUD,
// the beacon and the distance readout all do.

import * as THREE from 'three';
import { makeCar } from './vehicles.js';

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
  {
    id: 'drop',
    title: 'THE DROP',
    text: "Mara's package has to be at the pier in 45 seconds — drive like it matters.",
    reward: 800,
    kind: 'timed',
    // Pier mouth (z 188): cars clamp at z 196, so the pier end itself is
    // out of reach for a car — the mouth is where the drop happens.
    target: { x: 0, z: 188 },
    radius: 9,
    limit: 45,
  },
  {
    id: 'tail',
    title: 'THE TAIL',
    text: 'Tail the pink coupe — get close and stay on it until Mara has what she needs.',
    reward: 1200,
    kind: 'chase',
    radius: 7,
  },
  {
    id: 'sabotage',
    title: 'SABOTAGE',
    text: 'Plant the device at the rival warehouse gate — hold still for 3 seconds.',
    reward: 1500,
    kind: 'sabotage',
    target: { x: -100, z: -100 },
    radius: 9,
    hold: 3,
  },
  {
    id: 'hotpickup',
    title: 'THE HOT PICKUP',
    text: 'Pick up Mara’s guy while the heat is on, then get him to the safehouse.',
    reward: 1800,
    kind: 'hotpickup',
    pickup: { x: -100, z: 100 },
    dropoff: { x: 100, z: -100 },
    radius: 9,
    respect: 30,
  },
  {
    id: 'heist',
    title: 'THE BIG ONE',
    text: 'Grab the cash downtown, then run for the pier — Air One will be overhead.',
    reward: 1700,
    kind: 'heist',
    target: { x: 0, z: 0 },
    // Pier mouth again: the escape point a car can actually reach.
    escape: { x: 0, z: 188 },
    radius: 10,
    respect: 50,
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
    // Heist stages: 0 = grab the cash downtown, 1 = run for the pier.
    this.stage = 0;
    // Escape: seconds the wanted level has sat at zero, in a row.
    this.escapeTimer = 0;
    this.escapeNeeded = 1.5;
    // Timed drop: seconds left on the clock. Sabotage: seconds held still.
    this.timeLeft = 0;
    this.holdTimer = 0;
    // Respect gate: true while the current job needs more respect than
    // Ray has — the job waits, it never skips ahead.
    this.locked = false;
    // One-shot side effect for the loop (heist grab raises the heat,
    // sabotage trips an alarm): read and cleared by the game loop.
    this.stageEvent = null;
    // The chase target: a pink coupe that loops the downtown ring road
    // while THE TAIL is current, hidden the rest of the time.
    this.chaseCar = makeCar(0xff5da2);
    this.chaseCar.visible = false;
    this.chaseCar.position.set(-100, 0, -100);
    scene.add(this.chaseCar);
    this.chaseLoop = [[-100, -100], [100, -100], [100, 100], [-100, 100]];
    this.chaseWp = 1;
    this.chaseYaw = 0;
    this.chaseSpeed = 0;
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
    if (m.kind === 'pickup' || m.kind === 'hotpickup') {
      this.markerPos = this.stage === 0
        ? { x: m.pickup.x, z: m.pickup.z }
        : (m.dropoff ?? { x: this.hotelSpot.x, z: this.hotelSpot.z });
    } else if (m.kind === 'escape') {
      // No destination: hover the beacon over the player as a "lay low"
      // marker instead of dereferencing a null target.
      this.markerPos = { x: px, z: pz };
    } else if (m.kind === 'chase') {
      this.markerPos = { x: this.chaseCar.position.x, z: this.chaseCar.position.z };
    } else if (m.kind === 'heist') {
      this.markerPos = this.stage === 0
        ? { x: m.target.x, z: m.target.z }
        : { x: m.escape.x, z: m.escape.z };
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

  // Called whenever a mission becomes current: resets its timers, parks
  // or spawns the chase coupe, and applies the respect gate. Returns
  // true when the job is open, false when it is locked behind respect.
  beginCurrent(respect = 0) {
    const m = this.current();
    this.stage = 0;
    this.escapeTimer = 0;
    this.timeLeft = m && m.kind === 'timed' ? m.limit : 0;
    this.holdTimer = 0;
    this.stageEvent = null;
    this.chaseCar.visible = Boolean(m && m.kind === 'chase');
    if (m && m.kind === 'chase') {
      this.chaseCar.position.set(-100, 0, -100);
      this.chaseWp = 1;
      this.chaseYaw = Math.PI / 2;
      this.chaseSpeed = 0;
    }
    this.locked = Boolean(m && m.respect && respect < m.respect);
    return !this.locked;
  }

  // A locked job opens the moment Ray's respect reaches the requirement.
  // Returns true when a locked job just unlocked.
  tryUnlock(respect) {
    const m = this.current();
    if (!m || !this.locked) return false;
    if (!m.respect || respect < m.respect) return false;
    this.locked = false;
    this.beginCurrent(respect);
    return true;
  }

  // One-shot stage side effect for the loop (heist grab, sabotage alarm).
  takeStageEvent() {
    const ev = this.stageEvent;
    this.stageEvent = null;
    return ev;
  }

  // Per-frame progress for the timed, chase, sabotage and heist jobs.
  // `ctx` is { px, pz, inCar }. Returns { completed: m } or
  // { failed: m } (timed drop ran out of time), else null. A failed job
  // is NOT completed — the loop retries it via retryCurrent().
  updateMission(dt, ctx) {
    const m = this.current();
    if (!m || this.locked) return null;
    const distTo = (t) => Math.hypot(ctx.px - t.x, ctx.pz - t.z);
    if (m.kind === 'timed') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) return { failed: m };
      if (m.target && distTo(m.target) <= m.radius) return { completed: this.complete() };
      return null;
    }
    if (m.kind === 'chase') {
      this.updateChase(dt, ctx);
      if (distTo({ x: this.chaseCar.position.x, z: this.chaseCar.position.z }) <= m.radius) {
        return { completed: this.complete() };
      }
      return null;
    }
    if (m.kind === 'sabotage') {
      if (m.target && distTo(m.target) <= m.radius) {
        this.holdTimer += dt;
        if (this.holdTimer >= m.hold) {
          this.stageEvent = { type: 'sabotage-done' };
          return { completed: this.complete() };
        }
      } else {
        this.holdTimer = 0;
      }
      return null;
    }
    if (m.kind === 'heist') {
      if (this.stage === 0) {
        if (m.target && distTo(m.target) <= m.radius) {
          this.stage = 1;
          this.stageEvent = { type: 'heist-grab' };
        }
      } else if (m.escape && distTo(m.escape) <= m.radius) {
        return { completed: this.complete() };
      }
      return null;
    }
    return null;
  }

  // The pink coupe loops the downtown ring road on the street
  // centrelines (like traffic, so it never cuts through a building) and
  // speeds up when Ray closes in.
  updateChase(dt, ctx) {
    const car = this.chaseCar;
    const [tx, tz] = this.chaseLoop[this.chaseWp];
    const dx = tx - car.position.x;
    const dz = tz - car.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 5) {
      this.chaseWp = (this.chaseWp + 1) % this.chaseLoop.length;
      return;
    }
    const desired = Math.atan2(dx, dz);
    let diff = desired - this.chaseYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.chaseYaw += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    car.rotation.y = this.chaseYaw;
    const playerDist = Math.hypot(ctx.px - car.position.x, ctx.pz - car.position.z);
    const targetSpeed = playerDist < 30 ? 20 : 16;
    this.chaseSpeed += Math.max(-8 * dt, Math.min(8 * dt, targetSpeed - this.chaseSpeed));
    car.position.x += Math.sin(this.chaseYaw) * this.chaseSpeed * dt;
    car.position.z += Math.cos(this.chaseYaw) * this.chaseSpeed * dt;
    const wheels = car.userData.wheels;
    const spin = (this.chaseSpeed * dt) / 0.36;
    for (const w of wheels) w.rotation.x += spin;
  }

  // Retry a failed job from the top: same mission, fresh timer, no cash
  // lost. Used by the timed drop (and any future failing job).
  retryCurrent() {
    const m = this.current();
    if (!m) return;
    this.stage = 0;
    this.escapeTimer = 0;
    this.timeLeft = m.kind === 'timed' ? m.limit : 0;
    this.holdTimer = 0;
    this.stageEvent = null;
    if (m.kind === 'chase') {
      this.chaseCar.position.set(-100, 0, -100);
      this.chaseWp = 1;
      this.chaseSpeed = 0;
    }
  }

  // Returns the completed mission when the player's position finishes it.
  // `inCar` matters for the pickup drop-off: Mara only counts as delivered
  // when Ray drives her there. A locked (respect-gated) job never
  // progresses, even if Ray walks into its marker.
  checkReach(x, z, inCar = false) {
    const m = this.current();
    if (!m || m.kind === 'escape' || this.locked) return null;
    if (m.kind === 'pickup' || m.kind === 'hotpickup') {
      const goal = this.stage === 0
        ? m.pickup
        : (m.dropoff ?? this.hotelSpot);
      const dx = x - goal.x;
      const dz = z - goal.z;
      if (dx * dx + dz * dz > m.radius * m.radius) return null;
      if (this.stage === 0) {
        this.stage = 1;
        return null; // Passenger is in — now drive them to the drop-off.
      }
      if (!inCar) return null; // On foot at the drop-off: they are still waiting in the car.
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
    this.timeLeft = 0;
    this.holdTimer = 0;
    this.chaseCar.visible = false;
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
