// Vice Point — screenshot modes (`?shot=...`).
// The cover and the other screenshots are taken by the game itself: each mode
// stages a different scene, starts the game automatically, and parks the
// camera on a composed frame with the HUD and minimap visible. The playtest
// and the screenshot script wait for `window.__VICE_READY__` before shooting.
//
//   ?shot=chase    NEW in round 5: Ray drives the Neon Coupe down the main
//                  avenue at dusk, wanted level 4, an Interceptor on his tail
//                  and Air One circling overhead. The cover shot.
//   ?shot=mission  Ray on foot at Pier 9, mission marker and objective on HUD.
//   ?shot=drive    Ray cruising the Neon Coupe past the VICE sign.
//   ?shot=street   Ray walking a palm-lined avenue, city and neon behind him.

export function shotFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return null;
  const allowed = ['chase', 'mission', 'drive', 'street'];
  return allowed.includes(shot) ? shot : null;
}

// Stage the world for a shot. `game` is the object main.js builds (player,
// cars, police, heli, state). Returns the camera mode to use.
export function applyShotMode(game, shot) {
  const { state, player, cars, traffic } = game;
  state.started = true;
  state.shotMode = shot;

  if (shot === 'chase') {
    // Ray in the Neon Coupe, already at speed, police right behind.
    const coupe = cars.find((c) => c.def.id === 'neon') || cars[0];
    coupe.x = 0;
    coupe.z = 40;
    coupe.heading = Math.PI; // heading north down the x=0 avenue
    coupe.speed = 26;
    coupe.mesh.position.set(coupe.x, 0, coupe.z);
    coupe.mesh.rotation.y = coupe.heading;
    game.enterCar(coupe, true);
    state.wanted = 4;
    state.money = 1250;
    game.spawnPoliceChase();
    game.spawnHelicopter();
    // Stage the pursuit for the frame: the Interceptor tucked in right
    // behind the coupe, Air One low and circling just behind it.
    const interceptor = game.police;
    if (interceptor) {
      // On the road centre line, directly behind the coupe.
      interceptor.x = coupe.x;
      interceptor.z = coupe.z + 10;
      interceptor.heading = Math.PI;
      interceptor.speed = 30;
      interceptor.sideOffset = 0;
      interceptor.mesh.position.set(interceptor.x, 0, interceptor.z);
      interceptor.mesh.rotation.y = interceptor.heading;
    }
    const airOne = game.heli;
    if (airOne) {
      airOne.angle = Math.PI / 2;
      airOne.height = 12;
      airOne.radius = 14;
      airOne.frozen = true;
    }
    // Clear the chase avenue: move every traffic car to the far east road
    // so the frame is just Ray, the Interceptor and Air One.
    for (const t of traffic) {
      t.x = 126;
      t.z = t.z;
      t.horizontal = false;
      t.heading = Math.PI;
      t.mesh.position.set(t.x, 0, t.z);
      t.mesh.rotation.y = t.heading;
    }
    // And move any parked street car off the x=0 avenue — the coupe would
    // otherwise clip the Sunset GT parked at (0, 24) on its way south.
    for (const c of cars) {
      if (c !== coupe && Math.abs(c.x) < 3) {
        c.x = 42;
        c.mesh.position.x = 42;
      }
    }
    player.x = coupe.x;
    player.z = coupe.z;
    player.heading = coupe.heading;
    return 'car-chase';
  }

  if (shot === 'mission') {
    // Ray on foot at the pier, objective live, a little heat for drama.
    player.x = 196;
    player.z = 92;
    player.heading = Math.PI / 2;
    player.group.position.set(player.x, 0, player.z);
    player.cameraYaw = Math.PI / 2 + Math.PI;
    state.missionIndex = 0;
    state.money = 750;
    state.wanted = 1;
    return 'player';
  }

  if (shot === 'drive') {
    const coupe = cars.find((c) => c.def.id === 'neon') || cars[0];
    coupe.x = -42;
    coupe.z = 0;
    coupe.heading = Math.PI / 2; // east along the z=0 avenue, past the VICE sign
    coupe.speed = 18;
    coupe.mesh.position.set(coupe.x, 0, coupe.z);
    coupe.mesh.rotation.y = coupe.heading;
    game.enterCar(coupe, true);
    player.x = coupe.x;
    player.z = coupe.z;
    state.money = 900;
    state.wanted = 0;
    return 'car';
  }

  // street
  player.x = 0;
  player.z = 60;
  player.heading = Math.PI;
  player.group.position.set(player.x, 0, player.z);
  player.cameraYaw = 0;
  player.cameraPitch = 0.3;
  state.money = 250;
  state.wanted = 0;
  state.missionIndex = 0;
  return 'player';
}
