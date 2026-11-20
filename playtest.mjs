// Vice Point — headless playtest + screenshot capture (Node, Playwright).
// Serves game/ with serve.ts, opens it in the stock Playwright Chromium
// (SwiftShader WebGL; game time there runs ~0.1x real time, so waits are
// measured in game seconds), then plays the full Mara Voss chain ($250 ->
// $1,550), the wanted level, police chase and bust, the F punch, traffic
// and pedestrian movement, pause, and save/load — and takes the four
// screenshots of screenshots/. Fails on any console error, uncaught
// exception or off-origin network request (the game must play offline).
//
//   node playtest.mjs [--port 8901] [--shots-only]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
// playwright-core is installed once in /tmp/vp-playtest (not in the repo,
// so the entry stays dependency-free); resolve it from there.
const require = createRequire('/tmp/vp-playtest/package.json');
const { chromium } = require('playwright-core');
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const PORT = portIndex === -1 ? 8901 : Number(args[portIndex + 1]);
const SHOTS_ONLY = args.includes('--shots-only');
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1148/chrome-linux/chrome`;

const failures = [];
const notes = [];
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve(true);
      } catch (_e) { /* not up yet */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('server did not come up'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: here, stdio: 'pipe' });
server.stdout.on('data', (d) => process.stdout.write(`[serve] ${d}`));
server.stderr.on('data', (d) => process.stderr.write(`[serve:err] ${d}`));

let browser = null;
try {
  await waitForServer(`${BASE}/index.html`);
  browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  const pageErrors = [];
  const offOrigin = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('request', (req) => {
    if (!req.url().startsWith(BASE)) offOrigin.push(req.url());
  });

  const waitReady = async () => {
    await page.waitForFunction(() => window.__vp && window.__vp.ready, null, { timeout: 90000 });
  };

  // Game time runs ~0.05 s per frame at SwiftShader frame rates, so waits
  // are measured in game seconds, not wall-clock seconds.
  const waitGame = async (seconds, timeoutMs = 240000) => {
    const t0 = await page.evaluate(() => window.__vp.state.time);
    await page.waitForFunction(
      ([start, secs]) => window.__vp.state.time - start >= secs,
      [t0, seconds],
      { timeout: timeoutMs, polling: 500 },
    );
  };
  const vp = (fn, arg) => page.evaluate(fn, arg);

  if (!SHOTS_ONLY) {
    // --- interactive playtest ---
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await waitReady();
    check('game loads and renders first frame', true);
    await page.click('#btnNew');
    await page.waitForTimeout(800);

    // Traffic: 10 cars, 14 pedestrians, all seeded and moving.
    const traffic0 = await vp(() => ({
      cars: window.__vp.traffic.cars.length,
      peds: window.__vp.traffic.peds.length,
      carPos: window.__vp.traffic.cars.map((c) => [c.group.position.x, c.group.position.z]),
      pedPos: window.__vp.traffic.peds.map((p) => [p.group.position.x, p.group.position.z]),
    }));
    check('traffic is 10 cars + 14 pedestrians', traffic0.cars === 10 && traffic0.peds === 14,
      `${traffic0.cars} cars, ${traffic0.peds} peds`);
    await waitGame(1.0);
    const traffic1 = await vp(() => ({
      carPos: window.__vp.traffic.cars.map((c) => [c.group.position.x, c.group.position.z]),
      pedPos: window.__vp.traffic.peds.map((p) => [p.group.position.x, p.group.position.z]),
    }));
    const movedCars = traffic1.carPos.filter((p, i) => Math.hypot(p[0] - traffic0.carPos[i][0], p[1] - traffic0.carPos[i][1]) > 0.5).length;
    const movedPeds = traffic1.pedPos.filter((p, i) => Math.hypot(p[0] - traffic0.pedPos[i][0], p[1] - traffic0.pedPos[i][1]) > 0.3).length;
    check('traffic cars move along the streets', movedCars >= 5, `${movedCars}/10 cars moved`);
    check('pedestrians walk the sidewalks', movedPeds >= 5, `${movedPeds}/14 peds moved`);

    // Walk.
    const before = await vp(() => ({ x: window.__vp.player.position.x, z: window.__vp.player.position.z }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(10000);
    await page.keyboard.up('KeyW');
    const after = await vp(() => ({ x: window.__vp.player.position.x, z: window.__vp.player.position.z }));
    const walked = Math.hypot(after.x - before.x, after.z - before.z);
    check('walk with W moves the player', walked > 0.2, `moved ${walked.toFixed(2)} m`);
    notes.push(`walked ${walked.toFixed(2)} m in 10 s real time (SwiftShader ~0.01x, ~1 fps)`);

    // Enter the red car parked at (8, 60), then exit it.
    await vp(() => window.__vp.teleport(10, 60));
    await page.waitForTimeout(400);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
    const inCar = await vp(() => window.__vp.state.inCar);
    check('E enters the car', inCar === true);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
    const outCar = await vp(() => window.__vp.state.inCar);
    check('E exits the car', outCar === false);

    // --- Mara Voss chain: $250 -> $550 -> $950 -> $1,550 ---
    const chainStart = await vp(() => ({
      cash: window.__vp.state.cash,
      id: window.__vp.missions.current().id,
      wanted: window.__vp.police.wanted,
    }));
    check('new game starts at $250 on THE PICKUP, wanted 0',
      chainStart.cash === 250 && chainStart.id === 'pickup' && chainStart.wanted === 0,
      `cash=${chainStart.cash} mission=${chainStart.id} wanted=${chainStart.wanted}`);

    // Mission 1, stage 0: walk to Mara at (0, 75).
    await vp(() => window.__vp.teleport(0, 75));
    await waitGame(0.3);
    const pickedUp = await vp(() => ({ stage: window.__vp.missions.stage, index: window.__vp.missions.index }));
    check('reaching Mara advances the pickup to stage 1', pickedUp.stage === 1 && pickedUp.index === 0,
      `stage=${pickedUp.stage} index=${pickedUp.index}`);
    // Mission 1, stage 1: drive her to Hotel VICE (drop-off needs a car).
    await vp(() => window.__vp.enterCar(0));
    await waitGame(0.3);
    const hotel = await vp(() => window.__vp.missions.hotelSpot);
    await vp(([hx, hz]) => window.__vp.teleportCar(hx, hz), [hotel.x, hotel.z]);
    await waitGame(0.3);
    const afterPickup = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
      id: window.__vp.missions.current().id,
      wanted: window.__vp.police.wanted,
      police: window.__vp.police.police.length,
    }));
    check('THE PICKUP pays +$300 and HEAT starts hot',
      afterPickup.cash === 550 && afterPickup.index === 1 && afterPickup.id === 'heat'
      && afterPickup.wanted === 2 && afterPickup.police === 2,
      `cash=${afterPickup.cash} mission=${afterPickup.id} wanted=${afterPickup.wanted} police=${afterPickup.police}`);

    // Police chase: Interceptors close in, never over their 34 m/s cap.
    const chase0 = await vp(() => window.__vp.police.police.map((p) => [p.group.position.x, p.group.position.z]));
    await waitGame(1.0);
    const chase1 = await vp(() => ({
      pos: window.__vp.police.police.map((p) => [p.group.position.x, p.group.position.z]),
      speed: window.__vp.police.police.map((p) => p.speed),
    }));
    const chased = chase1.pos.some((p, i) => Math.hypot(p[0] - chase0[i][0], p[1] - chase0[i][1]) > 0.5)
      || chase1.speed.some((s) => s > 1);
    check('police Interceptors chase the player', chased,
      `speeds=${chase1.speed.map((s) => s.toFixed(1)).join(',')}`);
    check('police top speed never exceeds 34 m/s', chase1.speed.every((s) => s <= 34.01),
      `max=${Math.max(...chase1.speed).toFixed(1)}`);

    // Escape: break 55 m away from every Interceptor and let the heat
    // decay — one star per 6 quiet seconds — then stay clean 1.5 s.
    await vp(() => {
      window.__vp.teleportCar(0, 215); // out on the pier, far from downtown
      window.__vp.setWanted(1);
      window.__vp.police.decayTimer = 5.9; // real decay code, one tick from the edge
    });
    await waitGame(0.5);
    const cooled = await vp(() => window.__vp.police.wanted);
    check('wanted decays to 0 when no police can see the player', cooled === 0, `wanted=${cooled}`);
    await waitGame(2.0);
    const afterHeat = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
      id: window.__vp.missions.current().id,
      wanted: window.__vp.police.wanted,
      police: window.__vp.police.police.length,
    }));
    check('HEAT pays +$400 and THE GETAWAY CAR starts',
      afterHeat.cash === 950 && afterHeat.index === 2 && afterHeat.id === 'getaway'
      && afterHeat.wanted === 0 && afterHeat.police === 0,
      `cash=${afterHeat.cash} mission=${afterHeat.id} wanted=${afterHeat.wanted} police=${afterHeat.police}`);

    // Mission 3: reach the white getaway car, then get in it.
    await vp(() => window.__vp.exitCar());
    await page.waitForTimeout(400);
    await vp(() => window.__vp.teleport(-58, 80));
    await waitGame(0.3);
    const atCar = await vp(() => window.__vp.missions.stage);
    check('reaching the getaway car advances it to stage 1', atCar === 1, `stage=${atCar}`);
    await vp(() => window.__vp.enterCar(3));
    await waitGame(0.3);
    const chainEnd = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
      finished: window.__vp.missions.isFinished(),
    }));
    check('THE GETAWAY CAR pays +$600 — chain $250 -> $1,550',
      chainEnd.cash === 1550 && chainEnd.index === 3 && chainEnd.finished === true,
      `cash=${chainEnd.cash} index=${chainEnd.index}`);

    // Combat: F decks a pedestrian next to Ray.
    await vp(() => window.__vp.exitCar());
    await page.waitForTimeout(400);
    await vp(() => {
      const ped = window.__vp.traffic.peds.find((p) => p.down <= 0);
      const px = ped.group.position.x;
      const pz = ped.group.position.z;
      window.__vp.teleport(px + 1.2, pz);
      window.__vp.state.yaw = Math.atan2(px - (px + 1.2), pz - pz);
      window.__vp.player.rotation.y = window.__vp.state.yaw;
      window.__vp._punchTarget = ped;
    });
    await page.keyboard.press('KeyF');
    await waitGame(0.2);
    const punched = await vp(() => ({
      down: window.__vp._punchTarget.down > 0,
      wanted: window.__vp.police.wanted,
      police: window.__vp.police.police.length,
    }));
    check('F punch knocks the pedestrian down and raises wanted',
      punched.down === true && punched.wanted >= 1 && punched.police >= 1,
      `down=${punched.down} wanted=${punched.wanted} police=${punched.police}`);

    // Busted in free roam: pinned by a cop on foot costs $100.
    await vp(() => {
      window.__vp.setWanted(2);
      const px = window.__vp.player.position.x;
      const pz = window.__vp.player.position.z;
      window.__vp.setPolicePos(0, px + 2.5, pz);
    });
    await waitGame(2.0);
    const busted = await vp(() => ({
      cash: window.__vp.state.cash,
      wanted: window.__vp.police.wanted,
      x: window.__vp.player.position.x,
      z: window.__vp.player.position.z,
      index: window.__vp.missions.index,
    }));
    check('busted costs a $100 fine, clears wanted, respawns safe',
      busted.cash === 1450 && busted.wanted === 0
      && Math.hypot(busted.x - 6, busted.z - 96) < 5 && busted.index === 3,
      `cash=${busted.cash} wanted=${busted.wanted} at=(${busted.x.toFixed(0)},${busted.z.toFixed(0)})`);

    // Pause with Esc, then resume.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const paused = await vp(() => window.__vp.state.paused);
    check('Esc pauses the game', paused === true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const resumed = await vp(() => window.__vp.state.paused);
    check('Esc resumes the game', resumed === false);

    // Save / load: pause saved, reload and continue keeps $1,450 + chain done.
    await page.keyboard.press('Escape'); // pause also saves
    await page.waitForTimeout(400);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await waitReady();
    await page.click('#btnContinue');
    await page.waitForTimeout(800);
    const loaded = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
      wanted: window.__vp.police.wanted,
      x: window.__vp.player.position.x,
      z: window.__vp.player.position.z,
    }));
    check('save/load keeps cash, missions and position',
      loaded.cash === 1450 && loaded.index === 3 && loaded.wanted === 0
      && Math.hypot(loaded.x - 6, loaded.z - 96) < 5,
      `cash=${loaded.cash} index=${loaded.index} wanted=${loaded.wanted}`);

    // Busted DURING Heat fails the job: no reward, job restarts.
    await vp(() => window.__vp.debugStartMission(1, 1450));
    await waitGame(0.3);
    const heatOn = await vp(() => ({ wanted: window.__vp.police.wanted, police: window.__vp.police.police.length }));
    check('restarted HEAT is hot again', heatOn.wanted === 2 && heatOn.police === 2,
      `wanted=${heatOn.wanted} police=${heatOn.police}`);
    await vp(() => {
      const px = window.__vp.player.position.x;
      const pz = window.__vp.player.position.z;
      window.__vp.setPolicePos(0, px + 2.5, pz);
    });
    await waitGame(2.0);
    const heatBusted = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
      done: [...window.__vp.missions.done],
      wanted: window.__vp.police.wanted,
      police: window.__vp.police.police.length,
    }));
    // The fine lands, the job is NOT completed or paid, and the job
    // restarts hot at once (wanted 2, two Interceptors) for the retry.
    check('busted during HEAT fails the job (no +$400, still mission 2)',
      heatBusted.cash === 1350 && heatBusted.index === 1
      && heatBusted.done.join(',') === 'pickup' && heatBusted.wanted === 2
      && heatBusted.police === 2,
      `cash=${heatBusted.cash} index=${heatBusted.index} done=${heatBusted.done.join(',')} wanted=${heatBusted.wanted} police=${heatBusted.police}`);
    // And the failed job can be escaped and finished on the retry.
    await vp(() => {
      window.__vp.teleport(0, 215);
      window.__vp.setWanted(1);
      window.__vp.police.decayTimer = 5.9;
    });
    await waitGame(0.5);
    await waitGame(2.0);
    const heatRetry = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
    }));
    check('HEAT retry escapes and pays +$400', heatRetry.cash === 1750 && heatRetry.index === 2,
      `cash=${heatRetry.cash} index=${heatRetry.index}`);

    check('0 console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
    check('0 uncaught exceptions', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
    check('0 off-origin requests (offline game)', offOrigin.length === 0, offOrigin.join(', ').slice(0, 300));
  }

  // --- screenshots ---
  const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
  for (const shot of shots) {
    await page.goto(`${BASE}/index.html${shot.query}`, { waitUntil: 'domcontentloaded' });
    await waitReady();
    await page.waitForTimeout(3000);
    const path = join(here, 'screenshots', shot.name);
    await page.screenshot({ path, type: 'jpeg', quality: 82 });
    check(`screenshot ${shot.name}`, existsSync(path));
  }
  check('0 console errors (shots)', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));
  check('0 uncaught exceptions (shots)', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(`\n${failures.length === 0 ? 'PLAYTEST PASSED' : `PLAYTEST FAILED: ${failures.join(', ')}`}`);
for (const n of notes) console.log(`note: ${n}`);
process.exit(failures.length === 0 ? 0 : 1);
