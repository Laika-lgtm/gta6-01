// Vice Point — deterministic screenshot staging, round 8 stage 3 final
// (seed 8). Loaded from main.js when the page carries ?shot=<name>&seed=8.
// Each mode stages a real, live scene — no compositing, no fake overlays —
// by placing Ray, a car, the police, the helicopter, traffic and
// pedestrians at fixed coordinates, forcing the wanted level and the
// mission state, and locking the chase camera to a fixed angle.
// Everything below is deterministic: the same seed rebuilds the same frame
// (up to the renderer's own timing).
//
// Round-8 angles and positions are deliberately different from round 7:
// the chase is shot from the FRONT (camera ahead on the road, looking back
// at the Midnight GT with the Interceptors behind it) on road z=50 heading
// east, with the PD roadblock visible far down the road behind the
// cruisers; the mission shot is on the pier looking south at Mara's gold
// beam; the drive runs the beachfront road z=250; and the street shot
// walks the Neon Strip east from the x=-48 / z=50 intersection.
//
// The ctx object main.js passes in must provide:
//   walker, fleet, traffic, peds, wanted, police, missions, crew, hud
//   hideStart(), setShot(name), setCamera(yaw, pitch, dist, lock),
//   putInCar(id, x, z, heading, speed), putOnFoot(x, z), setCash(n)

export const SHOT_SEED = 8;

export const SHOT_DEFS = {
  chase: {
    car: 'midnight', carPos: [-118, 50], heading: Math.PI / 2, speed: 27,
    camera: { yaw: Math.PI / 2 + Math.PI - 0.55, pitch: 0.24, dist: 11 },
    wanted: 4, mission: { stage: 7, phase: 'chase', checkpoint: 0 },
    cash: 5050, crew: 'dara', settle_s: 2.0,
    hint: 'VICE PD on your tail — lose them!',
  },
  mission: {
    car: null, rayPos: [41, 314],
    camera: { yaw: 0.12, pitch: 0.34, dist: 8.5 },
    wanted: 0, mission: { stage: 1, phase: 'go', checkpoint: 0 },
    cash: 250, crew: 'dara', settle_s: 2.0,
    hint: 'Mara Voss is waiting at Pier 9 — go talk to her',
  },
  drive: {
    car: 'coral', carPos: [-98, 250], heading: Math.PI / 2, speed: 21,
    camera: { yaw: Math.PI / 2 + Math.PI - 0.35, pitch: 0.26, dist: 10.5 },
    wanted: 0, mission: { stage: 1, phase: 'go', checkpoint: 0 },
    cash: 250, crew: null, settle_s: 2.5,
    hint: 'Beachfront cruise — palms, sea air, no heat',
  },
  street: {
    car: null, rayPos: [-48, 50],
    camera: { yaw: Math.PI / 2 + 0.15, pitch: 0.28, dist: 7.5 },
    wanted: 0, mission: { stage: 1, phase: 'go', checkpoint: 0 },
    cash: 250, crew: null, settle_s: 2.5,
    hint: 'Neon Strip on foot — the city never stops',
  },
};

export function isShotName(name) {
  return Object.prototype.hasOwnProperty.call(SHOT_DEFS, name);
}

function placePed(peds, i, x, z, heading) {
  const p = peds.list[i];
  if (!p) return;
  p.pos.set(x, 0, z);
  p.mesh.position.copy(p.pos);
  p.heading = heading;
  p.mesh.rotation.y = heading;
  p.dir = 1;
  p.flee = 0;
  p.down = 0;
  p.phase = i * 1.7;
}

function placeTrafficCar(traffic, i, x, z, heading, laneSide, dir) {
  const c = traffic.list[i];
  if (!c) return;
  c.pos.set(x, 0, z);
  c.mesh.position.copy(c.pos);
  c.heading = heading;
  c.mesh.rotation.y = heading;
  c.alongRoad = true;
  c.line = z === 250 || z === 247 || z === 253 ? 250 : 50;
  c.laneSide = laneSide;
  c.dir = dir;
  c.speed = c.cruise;
  c.damaged = 0;
}

function stageCrew(ctx, activeId) {
  ctx.crew.recruit('dara');
  ctx.crew.recruit('kiko');
  ctx.crew.recruit('bima');
  if (activeId) ctx.crew.select(activeId);
  ctx.hud.setCrew(ctx.crew.label());
}

function stageMission(ctx, m) {
  ctx.missions.stage = m.stage;
  ctx.missions.phase = m.phase;
  ctx.missions.chaseIdx = m.checkpoint;
  ctx.missions.failedEscape = false;
  ctx.missions._placeMara();
  ctx.missions._syncHud();
}

export function applyShot(name, ctx) {
  const def = SHOT_DEFS[name];
  if (!def) return false;
  ctx.hideStart();
  ctx.setShot(name);
  ctx.setCash(def.cash);
  ctx.wanted.setLevel(def.wanted);
  ctx.police.clearAll();
  stageMission(ctx, def.mission);
  if (def.crew) stageCrew(ctx, def.crew);
  else {
    ctx.crew.select(null);
    ctx.hud.setCrew(ctx.crew.label());
  }
  ctx.setCamera(def.camera.yaw, def.camera.pitch, def.camera.dist, true);
  ctx.hud.setHint(def.hint);

  if (name === 'chase') {
    ctx.putInCar(def.car, def.carPos[0], def.carPos[1], def.heading, def.speed);
    // Three Interceptors already rolling, staged tight on Ray's bumper so
    // the chase reads in the very first seconds: fanned across both lanes
    // (z=45/46 and z=54) so all three stay visible around the GT instead
    // of hiding directly behind it, all at pursuit speed on the same road.
    const spots = [
      [-128, 46, 31], [-124, 54, 29], [-123, 45, 33],
    ];
    for (const [x, z, speed] of spots) {
      const u = ctx.police._spawnAt(x, z);
      u.heading = Math.PI / 2;
      u.speed = speed;
      u.mesh.rotation.y = u.heading;
    }
    // Air One holds LOW over the road just west of Ray — the front
    // camera looks down at the car, so a high heli flies out of the top
    // of the frame; at 6.5 m up, 16 m out and slightly south of the road
    // it sits in the upper middle of the shot, clear of the objective
    // pill and right above the lead Interceptor.
    ctx.police.pinHeli(Math.PI * 0.93, 16, 6.5);
    // The roadblock sits down the road behind the chase (in the front
    // camera's view, past the Interceptors): two parked cruisers and the
    // striped barriers across road z=50, so the cover shows the whole PD
    // response — pursuit behind, wall ahead of the escape route. It sits
    // at x=-137, the last open asphalt before the tower that closes the
    // road further west (a fill building sits on the road past x=-140).
    ctx.police.spawnRoadblockAt(-137, 50, Math.PI / 2);
    placeTrafficCar(ctx.traffic, 0, -163, 47, Math.PI / 2, -3, 1);
    placeTrafficCar(ctx.traffic, 1, -152, 53, -Math.PI / 2, 3, -1);
  } else if (name === 'mission') {
    ctx.putOnFoot(def.rayPos[0], def.rayPos[1]);
    // A few locals drift around the pier so the shot is a place, not a void.
    placePed(ctx.peds, 0, 30, 316, Math.PI / 2);
    placePed(ctx.peds, 1, 54, 313, -Math.PI / 2);
    placePed(ctx.peds, 2, 36, 303, 0);
    placePed(ctx.peds, 3, 50, 304, Math.PI);
  } else if (name === 'drive') {
    ctx.putInCar(def.car, def.carPos[0], def.carPos[1], def.heading, def.speed);
    // Beach road traffic: one car ahead in Ray's lane, one coming the
    // other way past the palms. Both sit far off — the oncoming car is
    // 68 m out, so no head-on can reach the shutter however slow the
    // boot runs (at ~0.06x game time under SwiftShader, the meeting
    // point is over two game-seconds away).
    placeTrafficCar(ctx.traffic, 0, -170, 247, Math.PI / 2, -3, 1);
    placeTrafficCar(ctx.traffic, 1, -30, 253, -Math.PI / 2, 3, -1);
  } else if (name === 'street') {
    ctx.putOnFoot(def.rayPos[0], def.rayPos[1]);
    // Sidewalk crowd on the Strip road, walking both ways past Ray.
    placePed(ctx.peds, 0, -36, 47, Math.PI / 2);
    placePed(ctx.peds, 1, -60, 53, -Math.PI / 2);
    placePed(ctx.peds, 2, -28, 53, -Math.PI / 2);
    placePed(ctx.peds, 3, -42, 47, Math.PI / 2);
    placeTrafficCar(ctx.traffic, 0, -78, 47, Math.PI / 2, -3, 1);
  }
  return true;
}
