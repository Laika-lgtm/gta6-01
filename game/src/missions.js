// Vice Point — Mara Voss, Act 1. Three jobs, one chain: pick Mara up and
// run her to the Hotel VICE, shake the heat the pickup brings down, then
// steal the Midnight GT and deliver it to the Docks. Cash runs
// $250 -> $550 -> $950 -> $1,550. The objective marker is a light beam and
// a ring on the ground plus a HUD line; the escape job has NO target
// position at all, and every read of it guards for null, because the old
// build crashed every frame on exactly that.
import * as THREE from 'three';

const MARA_SPOT = { x: 40, z: 322 };
const HOTEL_DROP = { x: -50, z: 44 };
const DOCKS_DROP = { x: -250, z: -200 };
const GETAWAY_CAR_ID = 'midnight';

const LINES = {
  m1go: [
    ["Mara Voss", "Ray. About time. You drive, I talk — and I talk fast."],
    ["Mara Voss", "Get some wheels first, then swing by. Hotel VICE. Don't keep me waiting."],
  ],
  m1pick: [
    ["Mara Voss", "There you are. Hotel VICE, and take the Strip — I want to be seen."],
    ["Ray Delgado", "Seen? Mara, the whole point is not being seen."],
    ["Mara Voss", "Relax. Drive."],
  ],
  m1done: [
    ["Mara Voss", "Smooth. You're not half bad, Ray."],
    ["Mara Voss", "One problem: the pickup put eyes on us. Lose them, then come find me."],
  ],
  m2done: [
    ["Mara Voss", "Clean. Okay, real job now."],
    ["Mara Voss", "A Midnight GT is sitting near the Strip. Bring it to the Docks. Don't scratch it."],
  ],
  m2fail: [
    ["Mara Voss", "Busted? Ray. BUSTED?"],
    ["Mara Voss", "Shake it off. The heat will come back — lose it again, then the GT."],
  ],
  m3done: [
    ["Mara Voss", "The GT, untouched. You're hired, Ray. Act 1 done — the real work starts now."],
  ],
};

export class MissionChain {
  constructor(scene, hud, sounds) {
    this.scene = scene;
    this.hud = hud;
    this.sounds = sounds;
    this.stage = 0; // 0 = not started, 1..3 = mission active, 4 = act done
    this.phase = 'go'; // per-mission phase
    this.failedEscape = false;
    this.dialogQueue = [];
    this.dialogActive = false;
    this.onReward = null;   // (amount) => main adds cash
    this.onHeat = null;     // (stars) => main forces wanted up
    this.onBustedDuringEscape = null; // () => main handles the fail
    this.marker = null;     // THREE.Group beam + ring, or null
    this._makeMara();
    this._makeBeam();
  }

  _makeMara() {
    const g = new THREE.Group();
    const purple = new THREE.MeshLambertMaterial({ color: 0x6a2a8a });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8c09a });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.85, 0.38), purple);
    torso.position.y = 1.12;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
    head.position.y = 1.78;
    g.add(head);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.46), new THREE.MeshLambertMaterial({ color: 0x2a1a0a }));
    hair.position.y = 1.98;
    g.add(hair);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.28), dark);
    legL.position.set(-0.17, 0.4, 0);
    g.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.17;
    g.add(legR);
    g.position.set(MARA_SPOT.x, 0, MARA_SPOT.z);
    this.scene.add(g);
    this.mara = g;
  }

  _makeBeam() {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true), beamMat);
    beam.position.y = 15;
    g.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    g.add(ring);
    g.visible = false;
    this.scene.add(g);
    this.marker = g;
  }

  // The current objective position, or null when the job has no place to
  // point at (the escape). Callers MUST check for null — that is the guard.
  get target() {
    if (this.stage === 1) return this.phase === 'go' ? MARA_SPOT : HOTEL_DROP;
    if (this.stage === 2) return null; // escape: no target, lose the cops
    if (this.stage === 3) return this.phase === 'steal' ? null : DOCKS_DROP;
    return null;
  }

  get targetLabel() {
    if (this.stage === 1) return this.phase === 'go' ? 'Pick up Mara Voss at Pier 9' : 'Drive Mara to Hotel VICE';
    if (this.stage === 2) return 'Lose the cops — get your wanted level to zero';
    if (this.stage === 3) return this.phase === 'steal' ? 'Steal the Midnight GT' : 'Deliver the Midnight GT to the Docks';
    return 'Act 1 complete — more work coming';
  }

  start() {
    if (this.stage !== 0) return;
    this.stage = 1;
    this.phase = 'go';
    this.say('m1go');
    this._syncHud();
  }

  say(key) {
    const lines = LINES[key];
    if (!lines) return;
    this.dialogQueue.push(...lines);
    this._advanceDialog();
  }

  _advanceDialog() {
    if (this.dialogActive || this.dialogQueue.length === 0) return;
    this.dialogActive = true;
    const [name, text] = this.dialogQueue.shift();
    this.hud.showDialog(name, text, () => {
      this.dialogActive = false;
      this._advanceDialog();
    });
  }

  _syncHud() {
    this.hud.setObjective(this.targetLabel);
    const t = this.target; // may be null — the marker hides, nothing throws
    if (t) {
      this.marker.position.set(t.x, 0, t.z);
      this.marker.visible = true;
    } else {
      this.marker.visible = false;
    }
  }

  _pay(amount) {
    if (this.onReward) this.onReward(amount);
    this.sounds.blip(660, 0.12);
    setTimeout(() => this.sounds.blip(990, 0.2), 130);
  }

  // Called when the player is busted. Returns true if the bust happened
  // during the escape job (a failed mission, not a payout).
  bustedDuringEscape() {
    return this.stage === 2;
  }

  onBusted() {
    if (this.stage === 2) {
      this.stage = 2;
      this.phase = 'escape';
      this.failedEscape = true;
      this.say('m2fail');
      this._syncHud();
      if (this.onBustedDuringEscape) this.onBustedDuringEscape();
    }
  }

  // The getaway car for mission 3, resolved through the fleet at call time.
  getawayCar(fleet) {
    if (!fleet || !fleet.list) return null;
    return fleet.list.find((c) => c.def && c.def.id === GETAWAY_CAR_ID) || null;
  }

  update(dt, ctx) {
    // ctx: { playerPos, driving, car, fleet, wanted }
    if (this.stage === 0) {
      // Walk up to Mara and the chain starts itself.
      if (Math.hypot(ctx.playerPos.x - MARA_SPOT.x, ctx.playerPos.z - MARA_SPOT.z) < 12) this.start();
      return;
    }
    if (this.stage === 4) return;
    const t = this.target; // null-safe by design
    const near = (p, r) => p && Math.hypot(ctx.playerPos.x - p.x, ctx.playerPos.z - p.z) < r;

    if (this.stage === 1) {
      if (this.phase === 'go') {
        if (near(MARA_SPOT, 9)) {
          if (ctx.driving) {
            this.phase = 'drive';
            this.say('m1pick');
            this._syncHud();
          } else {
            this.hud.setHint("Mara wants wheels — get in a car, then come back for her");
          }
        }
      } else if (near(HOTEL_DROP, 11) && ctx.driving) {
        this.stage = 2;
        this.phase = 'escape';
        this._pay(300);
        this.say('m1done');
        if (this.onHeat) this.onHeat(2); // the pickup brings the heat down
        this._syncHud();
      } else if (near(HOTEL_DROP, 11) && !ctx.driving) {
        this.hud.setHint("Mara won't walk — drive her to the hotel");
      }
    } else if (this.stage === 2) {
      // Escape: the objective is a state, not a place. Guard the null
      // target explicitly — no position math runs on this branch at all.
      if (t !== null) return; // defensive: escape must never have a target
      if (ctx.wanted === 0) {
        this.stage = 3;
        this.phase = 'steal';
        this._pay(400);
        this.say('m2done');
        this._syncHud();
      }
    } else if (this.stage === 3) {
      const gt = this.getawayCar(ctx.fleet);
      if (this.phase === 'steal') {
        if (ctx.driving && gt && ctx.car === gt) {
          this.phase = 'deliver';
          this._syncHud();
        } else if (ctx.driving && ctx.car && gt && ctx.car !== gt) {
          this.hud.setHint("Wrong car — Mara wants the Midnight GT, follow the gold marker");
        }
        // Keep the beam on the getaway car while it still needs stealing.
        if (gt) {
          this.marker.position.set(gt.pos.x, 0, gt.pos.z);
          this.marker.visible = true;
        }
      } else if (near(DOCKS_DROP, 12) && ctx.driving && ctx.car === gt) {
        this.stage = 4;
        this.phase = 'done';
        this._pay(600);
        this.say('m3done');
        this._syncHud();
      }
    }
    // Pulse the beam so it reads as a live objective.
    if (this.marker.visible) {
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.12;
      this.marker.scale.set(s, 1, s);
    }
  }
}
