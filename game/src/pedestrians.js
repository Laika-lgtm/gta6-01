// Vice Point — sidewalk crowds. Fourteen pedestrians stroll the pavements
// beside the road grid, each with their own pace and shirt. When a car
// bears down on one they scatter sideways; when the player's car clips one
// at speed they go down, the crowd gasps, and the law takes notice.
import * as THREE from 'three';
import { makeRng } from './config.js';

const ROADS = [-250, -150, -50, 50, 150, 250];
const SHIRTS = [0x3a6ea5, 0xe8e8e8, 0x4a9a5a, 0xd85a7a, 0x7a4a9a, 0xe8b13a, 0xc25a2a, 0x2a2a2a, 0x9ac25a, 0x5ac2c2];
const PANTS = [0x3a3a3a, 0x2a3a5e, 0x4a2a3a, 0x6a4a2a, 0x24343a];

function buildWalkerMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), shirtMat);
  torso.position.y = 1.12;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), skinMat);
  head.position.y = 1.72;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), new THREE.MeshLambertMaterial({ color: 0x241a12 }));
  hair.position.y = 1.94;
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.26), pantsMat);
  legL.position.set(-0.16, 0.39, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  g.userData = { legL, legR };
  return g;
}

export class Pedestrians {
  constructor(scene) {
    const rng = makeRng(777);
    this.list = [];
    for (let i = 0; i < 14; i++) {
      const alongRoad = rng() < 0.5;
      const line = ROADS[Math.floor(rng() * ROADS.length)];
      const side = rng() < 0.5 ? -7.5 : 7.5;
      const dir = rng() < 0.5 ? 1 : -1;
      const along = -280 + rng() * 560;
      const mesh = buildWalkerMesh(
        SHIRTS[i % SHIRTS.length],
        PANTS[Math.floor(rng() * PANTS.length)],
        [0x8a5a3a, 0xd8a075, 0x6a4230, 0xe8c09a][i % 4],
      );
      const ped = {
        mesh,
        pos: mesh.position,
        heading: 0,
        pace: 1.1 + rng() * 1.1,
        alongRoad,
        line,
        side,
        dir,
        phase: rng() * Math.PI * 2,
        down: 0,      // seconds left lying on the pavement
        flee: 0,      // seconds left scattering from a car
        fleeX: 0,
        fleeZ: 0,
      };
      if (alongRoad) { ped.pos.set(along, 0, line + side); ped.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
      else { ped.pos.set(line + side, 0, along); ped.heading = dir > 0 ? 0 : Math.PI; }
      mesh.rotation.y = ped.heading;
      scene.add(mesh);
      this.list.push(ped);
    }
  }

  // A car (player, traffic or police) closing in makes nearby peds scatter.
  scareFrom(x, z, radius = 9) {
    for (const p of this.list) {
      if (p.down > 0) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < radius) {
        p.flee = 1.6;
        p.fleeX = (p.pos.x - x) / (d || 1);
        p.fleeZ = (p.pos.z - z) / (d || 1);
      }
    }
  }

  // The player car ran one over: they go down for a while, then get up.
  knockDown(ped) {
    if (ped.down > 0) return;
    ped.down = 5;
    ped.mesh.rotation.x = Math.PI / 2 - 0.15;
    ped.mesh.position.y = 0.25;
  }

  // A punch: knocked flat, then they get up angry and run off.
  punchDown(ped) {
    this.knockDown(ped);
    ped.flee = 4;
  }

  update(dt, colliders, cars, playerCar, playerPos, onFoot, onRunOver) {
    for (const p of this.list) {
      if (p.down > 0) {
        p.down -= dt;
        if (p.down <= 0) {
          p.mesh.rotation.x = 0;
          p.mesh.position.y = 0;
          p.flee = 3;
          p.fleeX = (p.pos.x - (playerCar ? playerCar.pos.x : playerPos.x)) || 1;
          p.fleeZ = (p.pos.z - (playerCar ? playerCar.pos.z : playerPos.z)) || 0;
          const l = Math.hypot(p.fleeX, p.fleeZ) || 1;
          p.fleeX /= l; p.fleeZ /= l;
        }
        continue;
      }
      // Scatter away from any fast car nearby.
      if (p.flee > 0) {
        p.flee -= dt;
        const nx = p.pos.x + p.fleeX * 3.2 * dt;
        const nz = p.pos.z + p.fleeZ * 3.2 * dt;
        if (!this._hits(colliders, nx, nz)) { p.pos.x = nx; p.pos.z = nz; }
        p.heading = Math.atan2(p.fleeX, p.fleeZ);
        p.phase += dt * 9;
      } else {
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
        const nx = p.pos.x + fx * p.pace * dt;
        const nz = p.pos.z + fz * p.pace * dt;
        if (this._hits(colliders, nx, nz)) {
          // Sidewalk blocked by a building annex: turn around.
          p.dir *= -1;
          p.heading += Math.PI;
        } else {
          p.pos.x = nx;
          p.pos.z = nz;
        }
        const along = p.alongRoad ? p.pos.x : p.pos.z;
        if (along * p.dir > 288) {
          if (p.alongRoad) p.pos.x = -288 * p.dir;
          else p.pos.z = -288 * p.dir;
        }
        p.phase += p.pace * dt * 2.4;
      }
      // The player's car clips a pedestrian at speed: they go down.
      const car = playerCar;
      if (car) {
        const d = Math.hypot(p.pos.x - car.pos.x, p.pos.z - car.pos.z);
        if (d < 2.0 && Math.abs(car.speed) > 3 && onRunOver) {
          this.knockDown(p);
          onRunOver(Math.abs(car.speed), p.pos.x, p.pos.z);
        } else if (d < 8 && Math.abs(car.speed) > 6) {
          this.scareFrom(car.pos.x, car.pos.z, 9);
        }
      } else if (onFoot) {
        const d = Math.hypot(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
        if (d < 1.1) { // bumped into on foot: they step aside, no crime
          p.flee = 0.8;
          p.fleeX = (p.pos.x - playerPos.x) / (d || 1);
          p.fleeZ = (p.pos.z - playerPos.z) / (d || 1);
        }
      }
      const swing = Math.sin(p.phase) * 0.5;
      p.mesh.userData.legL.rotation.x = swing;
      p.mesh.userData.legR.rotation.x = -swing;
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y = p.heading;
    }
  }

  _hits(colliders, x, z, r = 0.55) {
    for (const c of colliders) {
      if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
    }
    return false;
  }

  // Nearest pedestrian to a point, within maxDist — for the punch.
  nearest(pos, maxDist = 2.4) {
    let best = null, bestD = maxDist;
    for (const p of this.list) {
      if (p.down > 0) continue;
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}
