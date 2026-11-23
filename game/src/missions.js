// Vice Point — Mara Voss, the full three-act chain, stage 4. Eight jobs:
// Act 1 (stages 1-3, $300 + $400 + $600) picks Mara up, loses the heat
// and steals the Midnight GT. Act 2 (stages 4-6, $800 + $1,200 + $1,500)
// raises the stakes — a hot delivery, a crew rescue, a warehouse heist —
// and recruits one crew member per job: Dara, then Kiko, then Bima.
// Act 3 (stages 7-8, $1,500 + $2,000) is the climax: a five-point chase
// across the island and the final heist. Cash runs $250 -> $1,550 ->
// $8,550. The escape jobs have NO target position at all, and every read
// of the objective guards for null; getting busted mid-escape fails that
// job and sends Ray back to its start.
import * as THREE from 'three';

const MARA_SPOT = { x: 40, z: 322 };
const HOTEL_DROP = { x: -50, z: 44 };
const DOCKS_DROP = { x: -250, z: -200 };
const MARINA_PICK = { x: 50, z: -200 };
const HILLS_DROP = { x: 250, z: -200 };
const AIRPORT_PICK = { x: 220, z: 40 };
const NEON_SAFE = { x: 50, z: 50 };
const GARAGE_DROP = { x: -150, z: 110 };
const CHASE_START = { x: -50, z: -50 };
const CHASE_POINTS = [
  { x: -50, z: -50 }, { x: 150, z: -50 }, { x: 150, z: 150 },
  { x: -50, z: 150 }, { x: 0, z: 250 },
];
const HILLS_MANSION = { x: 250, z: -250 };

const REWARDS = { 1: 300, 2: 400, 3: 600, 4: 800, 5: 1200, 6: 1500, 7: 1500, 8: 2000 };

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
  m4go: [
    ["Mara Voss", "Act 2. A package is waiting at the Marina — hot cargo, no questions."],
    ["Mara Voss", "Pick it up, run it to the Hills. The PD will be on you the second you grab it."],
    ["Mara Voss", "Do this clean and Dara drives with us from now on. She is the best wheel in Vice Point."],
  ],
  m4done: [
    ["Mara Voss", "Delivered, heat and all. Dara's in — she says your line through the Strip was sloppy, by the way."],
    ["Dara", "Sloppy but alive. I'll take it. I ride with you now, Ray."],
  ],
  m4fail: [
    ["Mara Voss", "Busted on a delivery? The package is back at the Marina. Go again — and drive like Dara's watching."],
  ],
  m5go: [
    ["Mara Voss", "Kiko got pinched at the Airport. She is sitting on a runway with PD all over her."],
    ["Mara Voss", "Get her out and bring her to the safehouse on the Strip. She hacks — with her, the PD goes blind."],
  ],
  m5done: [
    ["Kiko", "You drive like my grandma, but you showed up. I'm in."],
    ["Mara Voss", "Kiko's ours. One button from her and every cruiser in the city goes dark for twenty seconds."],
  ],
  m5fail: [
    ["Mara Voss", "They grabbed you AND Kiko's still out there. Back to the Airport, Ray."],
  ],
  m6go: [
    ["Mara Voss", "Warehouse job. A Lagoon Van full of product is parked at the Docks."],
    ["Mara Voss", "Take the van to my garage in Old Town. Bima's waiting there — he keeps our cars alive."],
  ],
  m6done: [
    ["Bima", "Van's in one piece. Mostly. I can work with mostly."],
    ["Mara Voss", "Bima's crew now. From here on, our cars take a beating and keep rolling."],
  ],
  m7go: [
    ["Mara Voss", "Act 3. The whole island is about to know our name."],
    ["Mara Voss", "Five checkpoints, start to finish, three stars on your tail the whole way. Don't stop for anything."],
  ],
  m7done: [
    ["Mara Voss", "THAT is how you run Vice Point. The chase made the news, Ray. The news!"],
    ["Mara Voss", "One job left. The big one. Meet me at the Hills mansion."],
  ],
  m7fail: [
    ["Mara Voss", "Busted on the victory lap? Get back to the start line. We run it again."],
  ],
  m8go: [
    ["Mara Voss", "The Velvet Cruiser. One car, one mansion, four stars waiting."],
    ["Mara Voss", "Take it, lose them, bring it to the Docks. Then we are done — and we are rich."],
  ],
  m8done: [
    ["Mara Voss", "The Cruiser. The money. The crew. The island."],
    ["Mara Voss", "Eight jobs, Ray. From $250 to a name. Vice Point is ours now."],
  ],
  m8fail: [
    ["Mara Voss", "Busted on the final job? No. Get back to the mansion. We finish this."],
  ],
};

export class MissionChain {
  constructor(scene, hud, sounds) {
    this.scene = scene;
    this.hud = hud;
    this.sounds = sounds;
    this.stage = 0; // 0 = not started, 1..8 = mission active, 9 = chain done
    this.phase = 'go';
    this.chaseIdx = 0;
    this.failedEscape = false;
    this.dialogQueue = [];
    this.dialogActive = false;
    this.onReward = null;          // (amount) => main adds cash
    this.onHeat = null;            // (stars) => main forces wanted up
    this.onMissionComplete = null; // (no, districtIds) => standing + respect
    this.onRecruit = null;         // (crewId) => main recruits crew
    this.marker = null;
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

  // Where Mara waits for the current job's opening, or null when the job
  // opens on a car instead of a person (missions 3 and 6).
  get maraSpot() {
    if (this.stage === 0 || this.stage === 1) return MARA_SPOT;
    if (this.stage === 4 && this.phase === 'pickup') return MARINA_PICK;
    if (this.stage === 5 && this.phase === 'go') return AIRPORT_PICK;
    if (this.stage === 7 && this.phase === 'go') return CHASE_START;
    if (this.stage === 8 && this.phase === 'go') return HILLS_MANSION;
    return null;
  }

  // The current objective position, or null when the job has no place to
  // point at (escapes and steal phases). Callers MUST check for null.
  get target() {
    if (this.stage === 1) return this.phase === 'go' ? MARA_SPOT : HOTEL_DROP;
    if (this.stage === 2) return null; // escape: no target, lose the cops
    if (this.stage === 3) return this.phase === 'steal' ? null : DOCKS_DROP;
    if (this.stage === 4) return this.phase === 'pickup' ? MARINA_PICK : HILLS_DROP;
    if (this.stage === 5) return this.phase === 'go' ? AIRPORT_PICK : NEON_SAFE;
    if (this.stage === 6) return this.phase === 'steal' ? null : GARAGE_DROP;
    if (this.stage === 7) {
      if (this.phase === 'go') return CHASE_START;
      return CHASE_POINTS[this.chaseIdx] || null;
    }
    if (this.stage === 8) {
      if (this.phase === 'go') return HILLS_MANSION;
      if (this.phase === 'steal') return null;
      return DOCKS_DROP;
    }
    return null;
  }

  get targetLabel() {
    const L = {
      1: this.phase === 'go' ? 'Pick up Mara Voss at Pier 9' : 'Drive Mara to Hotel VICE',
      2: 'Lose the cops — get your wanted level to zero',
      3: this.phase === 'steal' ? 'Steal the Midnight GT' : 'Deliver the Midnight GT to the Docks',
      4: this.phase === 'pickup' ? 'Act 2 — Pick up the hot package at the Marina' : 'Act 2 — Deliver the package to the Hills (wanted!)',
      5: this.phase === 'go' ? 'Act 2 — Rescue Kiko at the Airport' : 'Act 2 — Get Kiko to the Strip safehouse (wanted!)',
      6: this.phase === 'steal' ? 'Act 2 — Steal the Lagoon Van at the Docks' : 'Act 2 — Deliver the van to the Old Town garage',
      7: this.phase === 'go' ? 'Act 3 — Get to the chase start on the Strip' : `Act 3 — Chase checkpoint ${this.chaseIdx + 1}/${CHASE_POINTS.length} — don't stop!`,
      8: this.phase === 'go' ? 'Act 3 — Meet Mara at the Hills mansion' : this.phase === 'steal' ? 'Act 3 — Steal the Velvet Cruiser' : 'Act 3 — FINAL: deliver the Cruiser to the Docks (4 stars!)',
    };
    return L[this.stage] || 'Chain complete — Vice Point is yours';
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

  // Shared finish step: pay, say the line, hand standing/respect and the
  // crew recruit to main, then move to the next job's opening.
  _complete(no, nextStage, nextPhase, doneKey, districts, recruitId) {
    this._pay(REWARDS[no]);
    if (doneKey) this.say(doneKey);
    if (this.onMissionComplete) this.onMissionComplete(no, districts);
    if (recruitId && this.onRecruit) this.onRecruit(recruitId);
    this.stage = nextStage;
    this.phase = nextPhase;
    this.chaseIdx = 0;
    this._placeMara();
    this._syncHud();
  }

  _placeMara() {
    const spot = this.maraSpot;
    if (spot) this.mara.position.set(spot.x, 0, spot.z);
  }

  // True when a bust right now fails the active job (an escape leg).
  bustedDuringEscape() {
    if (this.stage === 2) return true;
    if (this.stage === 4 && this.phase === 'deliver') return true;
    if (this.stage === 5 && this.phase === 'escape') return true;
    if (this.stage === 7 && this.phase === 'chase') return true;
    if (this.stage === 8 && this.phase === 'escape') return true;
    return false;
  }

  onBusted() {
    if (this.stage === 2) {
      this.stage = 2;
      this.phase = 'escape';
      this.failedEscape = true;
      this.say('m2fail');
    } else if (this.stage === 4) {
      this.stage = 4;
      this.phase = 'pickup';
      this.failedEscape = true;
      this.say('m4fail');
    } else if (this.stage === 5) {
      this.stage = 5;
      this.phase = 'go';
      this.failedEscape = true;
      this.say('m5fail');
    } else if (this.stage === 7) {
      this.stage = 7;
      this.phase = 'go';
      this.chaseIdx = 0;
      this.failedEscape = true;
      this.say('m7fail');
    } else if (this.stage === 8) {
      this.stage = 8;
      this.phase = 'go';
      this.failedEscape = true;
      this.say('m8fail');
    } else {
      return;
    }
    this._placeMara();
    this._syncHud();
  }

  // The car a steal phase wants, resolved through the fleet at call time.
  stealCar(fleet) {
    if (!fleet || !fleet.list) return null;
    const want = this.stage === 3 ? 'midnight' : this.stage === 6 ? 'lagoon' : this.stage === 8 ? 'velvet' : null;
    if (!want) return null;
    return fleet.list.find((c) => c.def && c.def.id === want) || null;
  }
  getawayCar(fleet) { return this.stealCar(fleet); }

  update(dt, ctx) {
    // ctx: { playerPos, driving, car, fleet, wanted }
    if (this.stage === 0) {
      if (Math.hypot(ctx.playerPos.x - MARA_SPOT.x, ctx.playerPos.z - MARA_SPOT.z) < 12) this.start();
      return;
    }
    if (this.stage === 9) return;
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
        if (this.onHeat) this.onHeat(2);
        this._syncHud();
      } else if (near(HOTEL_DROP, 11) && !ctx.driving) {
        this.hud.setHint("Mara won't walk — drive her to the hotel");
      }
    } else if (this.stage === 2) {
      // Escape: the objective is a state, not a place. Guard the null
      // target explicitly — no position math runs on this branch at all.
      if (t !== null) return;
      if (ctx.wanted === 0) {
        this._complete(2, 3, 'steal', 'm2done', ['neon'], null);
      }
    } else if (this.stage === 3) {
      const gt = this.stealCar(ctx.fleet);
      if (this.phase === 'steal') {
        if (ctx.driving && gt && ctx.car === gt) {
          this.phase = 'deliver';
          this._syncHud();
        } else if (ctx.driving && ctx.car && gt && ctx.car !== gt) {
          this.hud.setHint("Wrong car — Mara wants the Midnight GT, follow the gold marker");
        }
        if (gt) {
          this.marker.position.set(gt.pos.x, 0, gt.pos.z);
          this.marker.visible = true;
        }
      } else if (near(DOCKS_DROP, 12) && ctx.driving && ctx.car === gt) {
        this._complete(3, 4, 'pickup', 'm3done', ['docks', 'neon'], null);
        this.say('m4go');
      }
    } else if (this.stage === 4) {
      if (this.phase === 'pickup') {
        if (near(MARINA_PICK, 8)) {
          // Package grabbed: the heat comes down, run it to the Hills.
          this.phase = 'deliver';
          if (this.onHeat) this.onHeat(2);
          this._syncHud();
        }
      } else if (near(HILLS_DROP, 11)) {
        this._complete(4, 5, 'go', 'm4done', ['marina', 'hills'], 'dara');
      }
    } else if (this.stage === 5) {
      if (this.phase === 'go') {
        if (near(AIRPORT_PICK, 8)) {
          this.phase = 'escape';
          if (this.onHeat) this.onHeat(2);
          this._syncHud();
        }
      } else if (near(NEON_SAFE, 11) && ctx.driving) {
        this._complete(5, 6, 'steal', 'm5done', ['airport', 'neon'], 'kiko');
      } else if (near(NEON_SAFE, 11) && !ctx.driving) {
        this.hud.setHint("Kiko won't walk — drive her to the safehouse");
      }
    } else if (this.stage === 6) {
      const van = this.stealCar(ctx.fleet);
      if (this.phase === 'steal') {
        if (ctx.driving && van && ctx.car === van) {
          this.phase = 'deliver';
          this._syncHud();
        } else if (ctx.driving && ctx.car && van && ctx.car !== van) {
          this.hud.setHint("Wrong van — Mara wants the Lagoon Van, follow the gold marker");
        }
        if (van) {
          this.marker.position.set(van.pos.x, 0, van.pos.z);
          this.marker.visible = true;
        }
      } else if (near(GARAGE_DROP, 12) && ctx.driving && ctx.car === van) {
        this._complete(6, 7, 'go', 'm6done', ['docks', 'oldtown'], 'bima');
        this.say('m7go');
      }
    } else if (this.stage === 7) {
      if (this.phase === 'go') {
        if (near(CHASE_START, 10)) {
          this.phase = 'chase';
          this.chaseIdx = 0;
          if (this.onHeat) this.onHeat(3);
          this._syncHud();
        }
      } else {
        // Chase: the target is a checkpoint, never null while chasing.
        const cp = CHASE_POINTS[this.chaseIdx];
        if (!cp) return; // defensive: no checkpoint, no math
        if (near(cp, 12)) {
          this.chaseIdx++;
          if (this.chaseIdx >= CHASE_POINTS.length) {
            this._complete(7, 8, 'go', 'm7done', ['neon', 'beach'], null);
            this.say('m8go');
          } else {
            this._syncHud();
          }
        }
      }
    } else if (this.stage === 8) {
      if (this.phase === 'go') {
        if (near(HILLS_MANSION, 9)) {
          this.phase = 'steal';
          this._syncHud();
        }
      } else if (this.phase === 'steal') {
        const cruiser = this.stealCar(ctx.fleet);
        if (ctx.driving && cruiser && ctx.car === cruiser) {
          this.phase = 'escape';
          if (this.onHeat) this.onHeat(4);
          this._syncHud();
        } else if (ctx.driving && ctx.car && cruiser && ctx.car !== cruiser) {
          this.hud.setHint("Wrong car — Mara wants the Velvet Cruiser, follow the gold marker");
        }
        if (cruiser) {
          this.marker.position.set(cruiser.pos.x, 0, cruiser.pos.z);
          this.marker.visible = true;
        }
      } else if (near(DOCKS_DROP, 12) && ctx.driving) {
        const cruiser = this.stealCar(ctx.fleet);
        if (ctx.car === cruiser) {
          this._complete(8, 9, 'done', 'm8done', ['hills', 'docks'], null);
        }
      }
    }
    // Pulse the beam so it reads as a live objective.
    if (this.marker.visible) {
      const s = 1 + Math.sin(performance.now() * 0.004) * 0.12;
      this.marker.scale.set(s, 1, s);
    }
  }
}
