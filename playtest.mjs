// Vice Point — headless playtest (fresh, written for round 5 finish-repair).
// Serves game/ on 127.0.0.1:8931, drives it in stock Chromium 1148 via
// playwright-core, and checks boot, walking, driving, wanted/police,
// busted, the full Mara Voss chain (with a busted + retry inside Heat),
// pause, punch, car-swap decay and the four ?shot= modes. Logic runs at
// 480x270 (SwiftShader ~0.36 game-s per real-s); shots render at 1280x720
// and are written to screenshots/ as JPEGs <= 256 KiB.
// Run: node playtest.mjs   (exit 0 only when every check passes)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';

const REPO = new URL('.', import.meta.url).pathname;
const PORT = 8931;
const BASE = `http://127.0.0.1:${PORT}`;
const EXE = `${process.env.HOME}/.cache/ms-playwright/chromium-1148/chrome-linux/chrome`;
const LAUNCH_ARGS = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'];

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`PASS ${name}`); }
  else { failed++; failures.push(name); console.log(`FAIL ${name} ${extra}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureServer() {
  try {
    const res = await fetch(`${BASE}/index.html`);
    if (res.ok) { console.log('server: reusing :8931'); return null; }
  } catch { /* not up */ }
  console.log('server: spawning serve.ts :8931');
  const child = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: REPO, stdio: 'ignore' });
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try { const res = await fetch(`${BASE}/index.html`); if (res.ok) return child; } catch { /* retry */ }
  }
  throw new Error('server did not come up');
}

function watchErrors(page, label, bucket) {
  page.on('console', (m) => { if (m.type() === 'error') bucket.push(`${label} console: ${m.text()}`); });
  page.on('pageerror', (e) => bucket.push(`${label} pageerror: ${String(e)}`));
}

// Plain snapshot of the live game state (JSON-safe subset).
async function snap(page) {
  return page.evaluate(() => {
    const v = window.__vp;
    if (!v) return null;
    const s = v.state;
    return {
      money: s.money, wanted: s.wanted, missionIndex: s.missionIndex,
      missionsDone: [...s.missionsDone], started: s.started, paused: s.paused,
      busted: s.busted, inCar: s.inCar, carName: s.carName, speed: s.speed,
      x: s.x, z: s.z, heading: s.heading, health: s.health, time: s.time,
      frames: s.frames, lostCops: s.lostCops, escapeArmed: s.escapeArmed,
      missionFailed: s.missionFailed, missionNote: s.missionNote,
      police: v.police.map((u) => ({ x: u.x, z: u.z, speed: u.speed })),
      heliActive: v.heli.active, heliVisible: v.heli.group.visible,
      cars: v.cars.map((c) => ({ id: c.def.id, x: c.x, z: c.z })),
      trafficN: v.traffic.length, pedsN: v.pedestrians.length,
      ped0: v.pedestrians[0] ? { x: v.pedestrians[0].x, z: v.pedestrians[0].z, down: v.pedestrians[0].down } : null,
      mara: { x: v.mara.x, z: v.mara.z },
      shotFraming: !!s.shotFraming, version: v.version,
    };
  });
}

async function waitFor(page, fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await snap(page);
    if (s && fn(s)) return s;
    await sleep(700);
  }
  throw new Error(`timeout waiting for: ${label}`);
}

async function press(page, key, holdMs = 120) {
  await page.keyboard.down(key);
  await sleep(holdMs);
  await page.keyboard.up(key);
}

async function newPage(browser, w, h, query) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errors = [];
  watchErrors(page, query, errors);
  await page.goto(`${BASE}/${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__vp, null, { timeout: 30000 });
  await sleep(1500);
  return { ctx, page, errors };
}

async function startGame(page) {
  await press(page, 'Enter', 150);
  await sleep(800);
  const s = await snap(page);
  return s;
}

const browser = await chromium.launch({ executablePath: EXE, headless: true, args: LAUNCH_ARGS });
let serverChild = null;
try {
  serverChild = await ensureServer();

  // ============ PAGE A — boot, walk, car, swap, punch, pause ============
  {
    const { ctx, page, errors } = await newPage(browser, 480, 270, '?lowfx=1&seed=1');
    const s0 = await snap(page);
    check('boot: title VICE POINT', (await page.title()).includes('VICE POINT'));
    check('boot: __vp handle exists', !!s0);
    check('boot: version 1.0.0-r5s2', s0.version === '1.0.0-r5s2');
    check('boot: money $250', s0.money === 250);
    check('boot: missionIndex 0', s0.missionIndex === 0);
    check('boot: wanted 0', s0.wanted === 0);
    check('boot: not started', s0.started === false);
    check('boot: start screen visible', await page.evaluate(() => !document.getElementById('start-screen').classList.contains('hidden')));
    check('boot: HUD hidden before start', await page.evaluate(() => document.getElementById('hud').classList.contains('hidden')));
    const f0 = s0.frames;
    await sleep(2000);
    const f1 = (await snap(page)).frames;
    check('boot: frames advance (game ticking)', f1 > f0, `f ${f0}->${f1}`);
    check('boot: no console/page errors', errors.length === 0, errors.join(' | ').slice(0, 200));
    check('boot: no save yet in fresh context', await page.evaluate(() => localStorage.getItem('vicepoint-save-v1') === null));
    check('boot: game + minimap canvases', await page.evaluate(() => document.querySelectorAll('canvas').length === 2));
    check('boot: HUD money text $250', (await page.textContent('#hud-money')).includes('250'));
    check('boot: HUD stars empty', (await page.textContent('#hud-stars')).trim() === '☆☆☆☆☆');
    check('boot: mission card names The Pickup', (await page.textContent('#hud-mission')).includes('The Pickup'));
    check('boot: 6 street cars, 8 traffic, 10 peds', s0.cars.length === 6 && s0.trafficN === 8 && s0.pedsN === 10);

    // Start + walk.
    const sStart = await startGame(page);
    check('start: Enter starts game', sStart.started === true);
    check('start: start screen hidden', await page.evaluate(() => document.getElementById('start-screen').classList.contains('hidden')));
    check('start: HUD visible', await page.evaluate(() => !document.getElementById('hud').classList.contains('hidden')));
    const w0 = await snap(page);
    await page.keyboard.down('KeyW');
    let maxWalk = 0;
    for (let i = 0; i < 10; i++) { await sleep(400); maxWalk = Math.max(maxWalk, Math.abs((await snap(page)).speed)); }
    const w1 = await snap(page);
    const walkDist = Math.hypot(w1.x - w0.x, w1.z - w0.z);
    check('walk: W moves player >=2m', walkDist >= 2, `moved ${walkDist.toFixed(1)}m`);
    check('walk: walk speed ~5.2 m/s', maxWalk >= 4.0 && maxWalk <= 5.6, `max ${maxWalk.toFixed(2)}`);
    await page.keyboard.down('ShiftLeft');
    let maxRun = 0;
    for (let i = 0; i < 8; i++) { await sleep(400); maxRun = Math.max(maxRun, Math.abs((await snap(page)).speed)); }
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    check('walk: run speed ~9.5 m/s', maxRun >= 8.0, `max ${maxRun.toFixed(2)}`);
    const st0 = await snap(page);
    await page.keyboard.down('KeyD');
    await sleep(2500);
    await page.keyboard.up('KeyD');
    const st1 = await snap(page);
    check('walk: strafe D moves player', Math.hypot(st1.x - st0.x, st1.z - st0.z) > 0.5, `moved ${Math.hypot(st1.x - st0.x, st1.z - st0.z).toFixed(2)}m`);
    const sHp = await snap(page);
    check('walk: health 100', sHp.health === 100);
    await press(page, 'KeyM');
    check('walk: M shows mission toast', (await page.textContent('#hud-toast')).includes('The Pickup'));
    check('walk: HUD speed dashes on foot', (await page.textContent('#hud-speed')).includes('—'));
    check('walk: HUD car label On foot', (await page.textContent('#hud-car')).includes('On foot'));

    // Enter the Neon Coupe and drive.
    const neon = (await snap(page)).cars.find((c) => c.id === 'neon');
    await page.evaluate(([x, z]) => window.__vp.debug.tp(x, z), [neon.x, neon.z]);
    await press(page, 'KeyE');
    await sleep(600);
    let s = await snap(page);
    check('car: E enters Neon Coupe', s.inCar === true && s.carName === 'Neon Coupe', `inCar=${s.inCar} car=${s.carName}`);
    check('car: toast names Neon Coupe', (await page.textContent('#hud-toast')).includes('Neon Coupe'));
    check('car: player mesh hidden in car', await page.evaluate(() => !window.__vp.player.group.visible));
    await page.keyboard.down('KeyW');
    let maxSpd = 0;
    for (let i = 0; i < 12; i++) { await sleep(500); maxSpd = Math.max(maxSpd, Math.abs((await snap(page)).speed)); }
    check('car: driving builds speed >15', maxSpd > 15, `max ${maxSpd.toFixed(1)}`);
    for (let i = 0; i < 14; i++) { await sleep(500); maxSpd = Math.max(maxSpd, Math.abs((await snap(page)).speed)); }
    check('car: Neon top speed reaches ~38', maxSpd >= 36, `max ${maxSpd.toFixed(2)}`);
    check('car: Neon never exceeds 38.6', maxSpd <= 38.6, `max ${maxSpd.toFixed(2)}`);
    check('car: HUD speed shows mph while driving', /[1-9][0-9]* mph/.test(await page.textContent('#hud-speed')));
    // Lift off the throttle first: driveCar gives throttle priority over
    // the brake, so W+Space together just keep accelerating.
    await page.keyboard.up('KeyW');
    await sleep(300);
    const beforeBrake = Math.abs((await snap(page)).speed);
    await page.keyboard.down('Space');
    await sleep(2000);
    await page.keyboard.up('Space');
    const afterBrake = Math.abs((await snap(page)).speed);
    check('car: Space brake slows car', afterBrake < beforeBrake - 5, `${beforeBrake.toFixed(1)} -> ${afterBrake.toFixed(1)}`);
    const carPos = await page.evaluate(() => { const c = window.__vp.state.car; return { x: c.x, z: c.z }; });
    await press(page, 'KeyE');
    await sleep(600);
    s = await snap(page);
    check('car: E exits car', s.inCar === false);
    check('car: player mesh visible after exit', await page.evaluate(() => window.__vp.player.group.visible));
    check('car: player steps out beside car', Math.hypot(s.x - carPos.x, s.z - carPos.z) < 5, `dist ${Math.hypot(s.x - carPos.x, s.z - carPos.z).toFixed(1)}m`);

    // Sunset top speed, then car-swap decay.
    await page.evaluate(() => window.__vp.debug.enterCarById('sunset'));
    await sleep(500);
    s = await snap(page);
    check('car: enterCarById sunset works', s.inCar === true && s.carName === 'Sunset GT');
    await page.keyboard.down('KeyW');
    let maxSun = 0;
    for (let i = 0; i < 16; i++) { await sleep(500); maxSun = Math.max(maxSun, Math.abs((await snap(page)).speed)); }
    await page.keyboard.up('KeyW');
    check('car: Sunset top speed <=34.6', maxSun <= 34.6, `max ${maxSun.toFixed(2)}`);
    check('car: Sunset top speed >=30', maxSun >= 30, `max ${maxSun.toFixed(2)}`);
    await press(page, 'KeyE');
    await sleep(400);
    await page.evaluate(() => window.__vp.debug.setWanted(2));
    await sleep(400);
    s = await snap(page);
    check('swap: setWanted(2) gives 2 stars', s.wanted === 2);
    await page.evaluate(() => window.__vp.debug.tp(0, 24)); // far from the spawned police
    await page.evaluate(() => window.__vp.debug.enterCarById('neon'));
    await sleep(600);
    s = await snap(page);
    check('swap: new car sheds one star (2->1)', s.wanted === 1, `wanted=${s.wanted}`);
    // enterCar toasts the swap first, then overwrites it with the steal
    // toast — the 2->1 above is the proof the swap fired, not the toast.
    check('swap: toast names the stolen Neon Coupe', (await page.textContent('#hud-toast')).includes('Neon Coupe'));

    // Punch a pedestrian (F).
    await press(page, 'KeyE'); // out of the Neon
    await sleep(400);
    const ped = (await snap(page)).ped0;
    await page.evaluate(([px, pz]) => {
      window.__vp.player.heading = Math.PI;
      window.__vp.player.cameraYaw = Math.PI;
      window.__vp.debug.tp(px, pz + 1.5);
    }, [ped.x, ped.z]);
    await press(page, 'KeyF');
    await sleep(2500);
    s = await snap(page);
    check('punch: F knocks the pedestrian down', s.ped0.down === true, `down=${s.ped0.down}`);
    check('punch: no console/page errors on page A', errors.length === 0, errors.join(' | ').slice(0, 200));

    // Pause with Esc: time must freeze.
    await press(page, 'Escape');
    await sleep(500);
    s = await snap(page);
    check('pause: Esc pauses', s.paused === true);
    check('pause: pause screen visible', await page.evaluate(() => !document.getElementById('pause-screen').classList.contains('hidden')));
    const tA = (await snap(page)).time;
    await sleep(2000);
    const tB = (await snap(page)).time;
    check('pause: game time frozen while paused', tA === tB, `t ${tA} -> ${tB}`);
    await press(page, 'Escape');
    await sleep(500);
    s = await snap(page);
    check('pause: Esc resumes', s.paused === false);
    check('pause: pause screen hidden', await page.evaluate(() => document.getElementById('pause-screen').classList.contains('hidden')));
    await ctx.close();
  }

  // ============ PAGE B1 — Interceptor top speed, measured in the Palmetto ====
  // The Palmetto tops out at 26 m/s, BELOW the police cap, so the fleet
  // closes from its 42 m spawn, sits at 34 while the gap is still >30 m,
  // and never despawns. (The Sunset run was racy: matched 34/34 top speeds
  // let the acceleration head-start push the gap past 120 m first.)
  {
    const { ctx, page, errors } = await newPage(browser, 480, 270, '?lowfx=1&seed=1');
    await startGame(page);
    await page.evaluate(() => window.__vp.debug.enterCarById('palmetto'));
    await sleep(500);
    let s = await snap(page);
    check('topspeed: in Palmetto', s.inCar === true && s.carName === 'Palmetto');
    await page.evaluate(() => window.__vp.debug.setWanted(4));
    await sleep(400);
    s = await snap(page);
    check('topspeed: 4 stars', s.wanted === 4);
    await page.keyboard.down('KeyW');
    let maxPolice = 0;
    for (let i = 0; i < 90; i++) {
      await sleep(500);
      const q = await snap(page);
      for (const u of q.police) maxPolice = Math.max(maxPolice, u.speed);
    }
    await page.keyboard.up('KeyW');
    check('topspeed: Interceptor reaches ~34 m/s', maxPolice >= 33, `max ${maxPolice.toFixed(2)}`);
    check('topspeed: Interceptor never exceeds 34.05 m/s', maxPolice <= 34.05, `max ${maxPolice.toFixed(2)}`);
    check('topspeed: no console/page errors on page B1', errors.length === 0, errors.join(' | ').slice(0, 200));
    await ctx.close();
  }

  // ============ PAGE B — police chase, escape, lostCops 20 s window ============
  {
    const { ctx, page, errors } = await newPage(browser, 480, 270, '?lowfx=1&seed=1');
    await startGame(page);
    let s = await snap(page);
    check('police: game started on page B', s.started === true);
    await page.evaluate(() => window.__vp.debug.enterCarById('neon'));
    await sleep(500);
    s = await snap(page);
    check('police: in Neon Coupe', s.inCar === true);
    await page.evaluate(() => window.__vp.debug.setWanted(4));
    await sleep(400);
    s = await snap(page);
    check('police: setWanted(4) gives 4 stars', s.wanted === 4);
    s = await waitFor(page, (x) => x.police.length === 3, 90000, '3 police units at 4 stars');
    check('police: fleet is 3 Interceptors at 4 stars', s.police.length === 3);
    check('police: heli active at 4 stars', s.heliActive === true && s.heliVisible === true);
    check('police: HUD shows 4 stars', (await page.textContent('#hud-stars')).trim() === '★★★★☆');
    // Drive flat out; sample police speed + gap.
    await page.keyboard.down('KeyW');
    let maxPolice = 0, dEarly = null, lastNear = null;
    for (let i = 0; i < 50; i++) {
      await sleep(500);
      const q = await snap(page);
      for (const u of q.police) maxPolice = Math.max(maxPolice, u.speed);
      const near = q.police.length ? Math.min(...q.police.map((u) => Math.hypot(u.x - q.x, u.z - q.z))) : Infinity;
      lastNear = near;
      if (i === 8) dEarly = near;
      if (q.police.length === 0) break;
    }
    const dLate = lastNear;
    check('police: Interceptor never exceeds 34.05 m/s', maxPolice <= 34.05, `max ${maxPolice.toFixed(2)}`);
    // (How fast they DO go is measured on page B1 in the Sunset: the Neon
    // outruns the fleet in ~4 s of game time, before they can reach 34.)
    // A despawned fleet (gap >120 m) is the strongest form of "gap grew".
    check('escape: gap grows while Neon runs at 38', dLate !== null && dEarly !== null && dLate > dEarly, `gap ${dEarly?.toFixed(0)}m -> ${dLate === Infinity ? '>120m (despawned)' : dLate?.toFixed(0) + 'm'}`);
    // Keep driving until the whole fleet is outrun (>120 m despawn).
    s = await waitFor(page, (x) => x.police.length === 0 && x.lostCops === true, 240000, 'fleet despawn + lostCops');
    check('escape: fleet despawns, lostCops true', s.police.length === 0 && s.lostCops === true);
    // One star must decay inside the 20 s lostCops window (12 s decay).
    s = await waitFor(page, (x) => x.wanted === 3, 90000, 'wanted 4->3 while hidden');
    check('escape: one star decays while hidden (4->3)', s.wanted === 3);
    check('escape: heli stands down at 3 stars', s.heliActive === false);
    // After 20 s the window expires and the fleet comes back — at whatever
    // wanted level the decay has reached by then (the 4->3 decay can land
    // before the expiry, so the returning fleet is 2 units at 3 stars or
    // 1 unit at 2 stars; assert the count matches the live wanted level).
    const targetFor = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
    s = await waitFor(page, (x) => x.lostCops === false, 120000, 'lostCops expiry after 20 s');
    check('lostCops: 20 s window expires', s.lostCops === false);
    await sleep(1500);
    s = await snap(page);
    check('lostCops: fleet returns at the live wanted level', s.police.length === targetFor[s.wanted], `wanted=${s.wanted} n=${s.police.length} target=${targetFor[s.wanted]}`);
    await page.keyboard.up('KeyW');
    check('police: no console/page errors on page B', errors.length === 0, errors.join(' | ').slice(0, 200));
    await ctx.close();
  }

  // ============ PAGE C — busted, $100 fine, retry ============
  {
    const { ctx, page, errors } = await newPage(browser, 480, 270, '?lowfx=1&seed=1');
    await startGame(page);
    let s = await snap(page);
    check('busted: game started on page C', s.started === true);
    await page.evaluate(() => window.__vp.debug.setWanted(2));
    await sleep(400);
    s = await snap(page);
    check('busted: setWanted(2) gives 2 stars', s.wanted === 2);
    s = await waitFor(page, (x) => x.police.length === 1, 90000, '1 police unit at 2 stars');
    check('busted: 1 Interceptor hunts at 2 stars', s.police.length === 1);
    // Stand still on foot: cornered 1.5 s -> BUSTED.
    s = await waitFor(page, (x) => x.busted === true, 150000, 'busted while cornered on foot');
    check('busted: cornered on foot -> BUSTED', s.busted === true);
    check('busted: fine is $100 (250->150)', s.money === 150, `money=${s.money}`);
    check('busted: fine text names $100', (await page.textContent('#game-over-fine')).includes('$100'));
    check('busted: game-over screen visible', await page.evaluate(() => !document.getElementById('game-over').classList.contains('hidden')));
    check('busted: wanted cleared to 0', s.wanted === 0);
    check('busted: police despawned', s.police.length === 0);
    await press(page, 'Enter');
    await sleep(800);
    s = await snap(page);
    check('busted: Enter retries, busted clears', s.busted === false);
    check('busted: game-over hidden after retry', await page.evaluate(() => document.getElementById('game-over').classList.contains('hidden')));
    check('busted: no console/page errors on page C', errors.length === 0, errors.join(' | ').slice(0, 200));
    await ctx.close();
  }

  // ============ PAGE D — full Mara Voss chain, busted inside Heat ============
  {
    const { ctx, page, errors } = await newPage(browser, 480, 270, '?lowfx=1&seed=1');
    await startGame(page);
    let s = await snap(page);
    check('chain: game started on page D', s.started === true);
    // M1 The Pickup: walk into the marker at (-42,-42) from (-42,-30).
    // Default cameraYaw walks -z; do NOT touch it (setting it to PI
    // walks +z, away from the marker — that mis-set cost run 6 its m1).
    await page.evaluate(() => window.__vp.debug.tp(-42, -30));
    await page.keyboard.down('KeyW');
    s = await waitFor(page, (x) => x.missionIndex === 1, 60000, 'm1 completes');
    await page.keyboard.up('KeyW');
    check('chain: m1 completes -> missionIndex 1', s.missionIndex === 1);
    check('chain: m1 pays +$300 (250->550)', s.money === 550, `money=${s.money}`);
    await sleep(500);
    s = await snap(page);
    check('chain: Heat starts hot (2 stars, escape armed)', s.wanted === 2 && s.escapeArmed === true, `wanted=${s.wanted} armed=${s.escapeArmed}`);
    // Get BUSTED during Heat on foot: the escape FAILS, $100 fine.
    s = await waitFor(page, (x) => x.busted === true, 150000, 'busted during Heat');
    check('chain: busted during Heat', s.busted === true);
    check('chain: Heat fine is $100 (550->450)', s.money === 450, `money=${s.money}`);
    check('chain: Heat marked failed on busted', s.missionFailed === true);
    await press(page, 'Enter'); // retry: Heat restarts with 2 stars
    await sleep(1000);
    s = await snap(page);
    check('chain: Heat retry re-arms escape (2 stars, failed clears)', s.busted === false && s.wanted === 2 && s.escapeArmed === true && s.missionFailed === false, `wanted=${s.wanted} armed=${s.escapeArmed} failed=${s.missionFailed}`);
    check('chain: mission still Heat after retry', s.missionIndex === 1);
    // Now escape for real: Neon Coupe, flat out, outrun the fleet.
    await page.evaluate(() => window.__vp.debug.enterCarById('neon'));
    await sleep(500);
    await page.keyboard.down('KeyW');
    const moneyBeforeEscape = (await snap(page)).money;
    s = await waitFor(page, (x) => x.police.length === 0 && x.lostCops === true, 240000, 'outrun fleet in Heat');
    check('chain: fleet outrun in Heat (lostCops)', s.lostCops === true);
    s = await waitFor(page, (x) => x.missionIndex === 2, 180000, 'Heat completes (wanted 0)');
    await page.keyboard.up('KeyW');
    check('chain: escape completes by missionIndex (==2), not by exact money', s.missionIndex === 2, `missionIndex=${s.missionIndex}`);
    check('chain: Heat pays +$400 relative to pre-escape balance', s.money === moneyBeforeEscape + 400, `money=${s.money} before=${moneyBeforeEscape}`);
    // M3 The Getaway Car: Neon Coupe to Pier 9 (214,96).
    const moneyBeforeM3 = s.money;
    await page.evaluate(() => window.__vp.debug.tp(214, 88));
    s = await waitFor(page, (x) => x.missionIndex === 3, 30000, 'm3 completes');
    check('chain: m3 completes -> missionIndex 3', s.missionIndex === 3);
    check('chain: m3 pays +$600 relative', s.money === moneyBeforeM3 + 600, `money=${s.money} before=${moneyBeforeM3}`);
    check('chain: all three jobs done', s.missionsDone.length === 3 && s.missionsDone.includes('m3-getaway'));
    // Save / load: reload the page, progress must come back.
    const savedMoney = s.money, savedMissions = [...s.missionsDone];
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__vp, null, { timeout: 30000 });
    await sleep(1500);
    s = await snap(page);
    check('save/load: money survives reload', s.money === savedMoney, `money=${s.money} saved=${savedMoney}`);
    check('save/load: missionIndex survives reload', s.missionIndex === 3, `missionIndex=${s.missionIndex}`);
    check('save/load: missionsDone survives reload', JSON.stringify(s.missionsDone) === JSON.stringify(savedMissions));
    check('chain: no console/page errors on page D', errors.length === 0, errors.join(' | ').slice(0, 200));
    await ctx.close();
  }

  // ============ PAGES E-H — four ?shot= modes, 1280x720 JPEGs ============
  const shots = [
    { name: '1-chase.jpg', query: '?shot=chase&seed=1&lowfx=1' },
    { name: '2-mission.jpg', query: '?shot=mission&seed=1&lowfx=1' },
    { name: '3-drive.jpg', query: '?shot=drive&seed=1&lowfx=1' },
    { name: '4-street.jpg', query: '?shot=street&seed=1&lowfx=1' },
  ];
  for (const shot of shots) {
    const { ctx, page, errors } = await newPage(browser, 1280, 720, shot.query);
    const s = await snap(page);
    check(`shot ${shot.name}: boots with framing`, !!s && s.shotFraming === true);
    check(`shot ${shot.name}: no console/page errors`, errors.length === 0, errors.join(' | ').slice(0, 200));
    if (shot.name === '1-chase.jpg') {
      check('shot chase: active pursuit (4 stars, 3 police, heli, in Neon)', s.wanted === 4 && s.police.length === 3 && s.heliVisible === true && s.inCar === true && s.carName === 'Neon Coupe', `wanted=${s.wanted} n=${s.police.length} heli=${s.heliVisible} car=${s.carName}`);
    } else if (shot.name === '2-mission.jpg') {
      check('shot mission: Mara in beam, Ray on foot, no heat', s.wanted === 0 && s.mara.x === 0 && s.mara.z === 24 && s.inCar === false, `mara=(${s.mara.x},${s.mara.z}) wanted=${s.wanted}`);
    } else if (shot.name === '3-drive.jpg') {
      check('shot drive: Neon on the beach, no heat', s.inCar === true && s.x > 190 && s.wanted === 0, `x=${s.x.toFixed(0)}`);
    } else if (shot.name === '4-street.jpg') {
      const pedDist = Math.hypot(s.ped0.x - s.x, s.ped0.z - s.z);
      check('shot street: Ray on foot with a pedestrian near', s.inCar === false && pedDist < 6, `pedDist=${pedDist.toFixed(1)}m`);
    }
    // Capture fast: the staged chase pose drifts as the world ticks.
    let quality = 85, buf = null, path = `${REPO}screenshots/${shot.name}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      buf = await page.screenshot({ type: 'jpeg', quality });
      if (buf.length <= 262144) break;
      quality -= 15;
    }
    writeFileSync(path, buf);
    check(`shot ${shot.name}: JPEG <=256 KiB (q${quality})`, buf.length <= 262144 && buf.length > 10000, `${buf.length} bytes`);
    await ctx.close();
  }
} finally {
  await browser.close();
  if (serverChild) serverChild.kill();
}

console.log(`\nPLAYTEST ${passed}/${passed + failed} passed${failed ? ` — FAILURES: ${failures.join('; ')}` : ' — ALL GREEN'}`);
process.exit(failed ? 1 : 0);
