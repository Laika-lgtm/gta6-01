// Vice Point — headless playtest + screenshot capture (Node, Playwright).
// Serves game/ with serve.ts, opens it in the stock Playwright Chromium
// (SwiftShader WebGL; game time there runs ~0.1x real time, so waits are
// measured in game seconds), then plays the full 8-job Mara Voss chain
// ($250 -> $8,550), the wanted level, police chase and bust, the F punch,
// weapons + wheel, Air One, roadblocks, radio, garage, respect, traffic
// and pedestrian movement, pause, and save/load — and takes the four
// screenshots of screenshots/. Fails on any console error, uncaught
// exception or off-origin network request (the game must play offline).
//
//   node playtest.mjs [--port 8901] [--shots-only]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
// playwright-core is installed once in ~/workspace/makefun/vp-playtest
// (not in the repo, so the entry stays dependency-free); resolve it
// from there. NOTE: /tmp/vp-playtest does NOT exist — do not point here.
const require = createRequire(`${process.env.HOME}/workspace/makefun/vp-playtest/package.json`);
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

    // --- Mara Voss chain: $250 -> $550 -> $950 -> $1,550 -> $8,550 ---
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
      id: window.__vp.missions.current().id,
      finished: window.__vp.missions.isFinished(),
    }));
    check('THE GETAWAY CAR pays +$600 — chain $250 -> $1,550, THE DROP starts',
      chainEnd.cash === 1550 && chainEnd.index === 3 && chainEnd.id === 'drop'
      && chainEnd.finished === false,
      `cash=${chainEnd.cash} index=${chainEnd.index} mission=${chainEnd.id}`);

    // Mission 4, timed: running the clock out fails the job and retries
    // it from the top (no cash lost, fresh 45 s).
    await vp(() => { window.__vp.missions.timeLeft = 0.1; });
    await waitGame(0.3);
    const dropFailed = await vp(() => ({
      index: window.__vp.missions.index,
      timeLeft: window.__vp.missions.timeLeft,
      cash: window.__vp.state.cash,
    }));
    check('THE DROP failing on time retries it (same mission, fresh clock)',
      dropFailed.index === 3 && dropFailed.timeLeft > 40 && dropFailed.cash === 1550,
      `index=${dropFailed.index} timeLeft=${dropFailed.timeLeft.toFixed(1)} cash=${dropFailed.cash}`);
    await vp(() => window.__vp.teleportCar(0, 188));
    await waitGame(0.3);
    const afterDrop = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
      id: window.__vp.missions.current().id,
    }));
    check('THE DROP pays +$800 and THE TAIL starts',
      afterDrop.cash === 2350 && afterDrop.index === 4 && afterDrop.id === 'tail',
      `cash=${afterDrop.cash} mission=${afterDrop.id}`);

    // Mission 5: the pink coupe is on the road and moving, and getting
    // close to it completes the tail.
    const tail0 = await vp(() => ({
      visible: window.__vp.missions.chaseCar.visible,
      x: window.__vp.missions.chaseCar.position.x,
      z: window.__vp.missions.chaseCar.position.z,
    }));
    await waitGame(1.0);
    const tail1 = await vp(() => ({
      x: window.__vp.missions.chaseCar.position.x,
      z: window.__vp.missions.chaseCar.position.z,
    }));
    const tailMoved = Math.hypot(tail1.x - tail0.x, tail1.z - tail0.z);
    check('THE TAIL coupe drives the ring road', tail0.visible && tailMoved > 2,
      `visible=${tail0.visible} moved ${tailMoved.toFixed(1)} m`);
    await vp(() => window.__vp.exitCar());
    await page.waitForTimeout(400);
    await vp(() => window.__vp.enterCar(0));
    await waitGame(0.2);
    await vp(([x, z]) => window.__vp.teleportCar(x, z), [tail1.x, tail1.z]);
    await waitGame(0.3);
    const afterTail = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
      id: window.__vp.missions.current().id,
    }));
    check('THE TAIL pays +$1,200 and SABOTAGE starts',
      afterTail.cash === 3550 && afterTail.index === 5 && afterTail.id === 'sabotage',
      `cash=${afterTail.cash} mission=${afterTail.id}`);

    // Mission 6: hold still 3 s at the warehouse gate to plant the device.
    await vp(() => window.__vp.exitCar());
    await page.waitForTimeout(400);
    await vp(() => window.__vp.teleport(-100, -100));
    await waitGame(3.5);
    const afterSabotage = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
      id: window.__vp.missions.current().id,
    }));
    check('SABOTAGE pays +$1,500 and THE HOT PICKUP starts',
      afterSabotage.cash === 5050 && afterSabotage.index === 6 && afterSabotage.id === 'hotpickup',
      `cash=${afterSabotage.cash} mission=${afterSabotage.id}`);

    // Mission 7 is respect-gated (30): with 0 respect it locks and never
    // progresses; at 40 it unlocks and starts hot.
    await vp(() => {
      window.__vp.setRespect(0);
      window.__vp.debugStartMission(6, 5050);
    });
    await waitGame(0.3);
    const gated = await vp(() => ({
      locked: window.__vp.missions.locked,
      index: window.__vp.missions.index,
    }));
    // Wanted is already 2 here: the job started hot on its own the first
    // time it became current (sabotage tripped an alarm), before the
    // forced lock — the lock itself is what this check proves.
    check('THE HOT PICKUP locks below 30 respect',
      gated.locked === true && gated.index === 6,
      `locked=${gated.locked} index=${gated.index}`);
    await vp(() => window.__vp.teleport(-100, 100));
    await waitGame(0.3);
    const stillLocked = await vp(() => window.__vp.missions.stage);
    check('a locked job does not progress at its marker', stillLocked === 0, `stage=${stillLocked}`);
    await vp(() => window.__vp.setRespect(40));
    await waitGame(0.5);
    const unlocked = await vp(() => ({
      locked: window.__vp.missions.locked,
      wanted: window.__vp.police.wanted,
    }));
    check('THE HOT PICKUP unlocks at 40 respect and starts hot',
      unlocked.locked === false && unlocked.wanted === 2,
      `locked=${unlocked.locked} wanted=${unlocked.wanted}`);
    await vp(() => window.__vp.teleport(-100, 100));
    await waitGame(0.3);
    const hotStage = await vp(() => window.__vp.missions.stage);
    check('hot pickup stage 1: the guy is in', hotStage === 1, `stage=${hotStage}`);
    await vp(() => window.__vp.enterCar(0));
    await waitGame(0.2);
    await vp(() => window.__vp.teleportCar(100, -100));
    await waitGame(0.3);
    const afterHot = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
      id: window.__vp.missions.current().id,
      respect: window.__vp.state.respect,
    }));
    check('THE HOT PICKUP pays +$1,800 and THE BIG ONE starts (respect 50)',
      afterHot.cash === 6850 && afterHot.index === 7 && afterHot.id === 'heist' && afterHot.respect === 50,
      `cash=${afterHot.cash} mission=${afterHot.id} respect=${afterHot.respect}`);

    // Mission 8: grab the cash downtown — the heat jumps to 4 stars and
    // Air One comes overhead — then run for the pier.
    await vp(() => window.__vp.teleportCar(0, 0));
    await waitGame(0.5);
    const grab = await vp(() => ({
      stage: window.__vp.missions.stage,
      wanted: window.__vp.police.wanted,
      heli: window.__vp.heli.active,
      heliY: window.__vp.heli.position ? window.__vp.heli.position.y : -1,
    }));
    check('THE BIG ONE grab raises wanted to 4 and Air One is overhead',
      grab.stage === 1 && grab.wanted === 4 && grab.heli === true && grab.heliY > 30,
      `stage=${grab.stage} wanted=${grab.wanted} heli=${grab.heli} y=${grab.heliY.toFixed(0)}`);
    await vp(() => window.__vp.teleportCar(0, 188));
    await waitGame(0.3);
    const chainDone = await vp(() => ({
      cash: window.__vp.state.cash,
      index: window.__vp.missions.index,
      finished: window.__vp.missions.isFinished(),
      respect: window.__vp.state.respect,
    }));
    check('THE BIG ONE pays +$1,700 — full chain $250 -> $8,550',
      chainDone.cash === 8550 && chainDone.index === 8 && chainDone.finished === true
      && chainDone.respect === 60,
      `cash=${chainDone.cash} index=${chainDone.index} respect=${chainDone.respect}`);

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
      respect: window.__vp.state.respect,
    }));
    check('busted costs a $100 fine, clears wanted, respawns safe, -15 respect',
      busted.cash === 8450 && busted.wanted === 0
      && Math.hypot(busted.x - 6, busted.z - 96) < 5 && busted.index === 8
      && busted.respect === 45,
      `cash=${busted.cash} wanted=${busted.wanted} at=(${busted.x.toFixed(0)},${busted.z.toFixed(0)}) respect=${busted.respect}`);

    // Pause with Esc, then resume.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const paused = await vp(() => window.__vp.state.paused);
    check('Esc pauses the game', paused === true);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const resumed = await vp(() => window.__vp.state.paused);
    check('Esc resumes the game', resumed === false);

    // Save / load: pause saved, reload and continue keeps $8,450 + chain done.
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
      respect: window.__vp.state.respect,
    }));
    check('save/load keeps cash, missions, respect and position',
      loaded.cash === 8450 && loaded.index === 8 && loaded.wanted === 0
      && Math.hypot(loaded.x - 6, loaded.z - 96) < 5 && loaded.respect === 45,
      `cash=${loaded.cash} index=${loaded.index} wanted=${loaded.wanted} respect=${loaded.respect}`);

    // Busted DURING Heat fails the job: no reward, job restarts.
    await vp(() => window.__vp.debugStartMission(1, 8450));
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
      heatBusted.cash === 8350 && heatBusted.index === 1
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
    check('HEAT retry escapes and pays +$400', heatRetry.cash === 8750 && heatRetry.index === 2,
      `cash=${heatRetry.cash} index=${heatRetry.index}`);

    // --- stage 4: weapons, wheel, Air One, roadblocks, radio, garage ---
    // Back on the streets (the retry left Ray on the pier).
    await vp(() => window.__vp.teleport(0, 75));
    await page.waitForTimeout(400);

    // Weapon wheel: hold Q to open, Digit2 picks the SMG, release closes.
    await page.keyboard.down('KeyQ');
    await page.waitForTimeout(400);
    const wheelOpen = await vp(() => !document.getElementById('weaponWheel').classList.contains('hidden'));
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(300);
    const smgPicked = await vp(() => window.__vp.weapons.current().id);
    await page.keyboard.up('KeyQ');
    await page.waitForTimeout(300);
    const wheelClosed = await vp(() => document.getElementById('weaponWheel').classList.contains('hidden'));
    check('weapon wheel opens on Q, Digit2 picks the SMG, release closes it',
      wheelOpen === true && smgPicked === 'smg' && wheelClosed === true,
      `open=${wheelOpen} picked=${smgPicked} closed=${wheelClosed}`);
    await page.keyboard.press('Digit1');
    // The HUD refreshes on the next rendered frame (~1 s real time at
    // SwiftShader frame rates), so wait for the text, not a fixed delay.
    await page.waitForFunction(
      () => document.getElementById('weaponValue').textContent.includes('PISTOL'),
      null, { timeout: 30000 },
    );
    const pistolBack = await vp(() => ({
      id: window.__vp.weapons.current().id,
      hud: document.getElementById('weaponValue').textContent,
    }));
    check('Digit1 switches back to the pistol and the HUD shows it',
      pistolBack.id === 'pistol' && pistolBack.hud.includes('PISTOL'),
      `id=${pistolBack.id} hud=${pistolBack.hud}`);

    // Shooting: three pistol rounds drop an Interceptor (34 x 3 > 100 hp).
    // One unit is parked 8 m ahead on the street, the other far behind,
    // so all three rounds land on the same car. The count stays at 2 —
    // a fresh Interceptor rolls in to replace a destroyed one — so the
    // check tracks the target unit itself, by its group uuid.
    await vp(() => window.__vp.setWanted(2));
    await waitGame(0.5);
    const shootSetup = await vp(() => {
      const px = window.__vp.player.position.x;
      const pz = window.__vp.player.position.z;
      window.__vp.setPolicePos(0, px, pz + 8);
      window.__vp.setPolicePos(1, px, pz - 50);
      return {
        uuid: window.__vp.police.police[0].group.uuid,
        respect: window.__vp.state.respect,
        p0: [px, pz + 8],
      };
    });
    await vp(([x, z]) => window.__vp.aimAt(x, z), shootSetup.p0);
    await page.waitForTimeout(2000); // let the camera swing onto the target
    for (let s = 0; s < 3; s++) {
      await vp(() => { window.__vp.weapons.cooldown = 0; window.__vp.shoot(); });
      await page.waitForTimeout(300);
    }
    const shotCop = await vp(([uuid]) => ({
      gone: !window.__vp.police.police.some((p) => p.group.uuid === uuid),
      respect: window.__vp.state.respect,
    }), [shootSetup.uuid]);
    check('pistol fire destroys an Interceptor (+3 respect)',
      shotCop.gone === true && shotCop.respect === shootSetup.respect + 3,
      `target gone=${shotCop.gone} respect=${shotCop.respect} (was ${shootSetup.respect})`);

    // SMG ammo counts down per shot.
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(300);
    await vp(() => { window.__vp.weapons.cooldown = 0; window.__vp.shoot(); });
    const smgAmmo = await vp(() => window.__vp.weapons.ammoLeft());
    check('SMG ammo counts down (270 -> 269)', smgAmmo === 269, `ammo=${smgAmmo}`);
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(300);

    // Switching weapons works in the car too, with no crash.
    await vp(() => window.__vp.enterCar(0));
    await waitGame(0.2);
    await page.keyboard.press('Digit2');
    await page.waitForTimeout(300);
    const inCarSwitch = await vp(() => window.__vp.weapons.current().id);
    check('weapon switch in the car works', inCarSwitch === 'smg', `id=${inCarSwitch}`);
    await vp(() => window.__vp.exitCar());
    await page.waitForTimeout(400);
    await page.keyboard.press('Digit1');

    // Air One: wanted 4 brings the heli, five pistol rounds bring it
    // down (34 x 5 > 150 hp), and it falls out of the sky.
    await vp(() => window.__vp.setWanted(4));
    await waitGame(1.0);
    const heliUp = await vp(() => ({
      active: window.__vp.heli.active,
      y: window.__vp.heli.position ? window.__vp.heli.position.y : -1,
      police: window.__vp.police.police.length,
    }));
    check('Air One is overhead at wanted 4 with extra police',
      heliUp.active === true && heliUp.y > 30 && heliUp.police >= 3,
      `active=${heliUp.active} y=${heliUp.y.toFixed(0)} police=${heliUp.police}`);
    // The player stands still, aiming up, while four Interceptors close
    // in — in run 3 one of them reached him mid-fall and busted him
    // (-$100, -15 respect), which poisoned this check and the garage
    // cash check downstream. Move the player to the pier mouth and
    // scatter every unit to the far corner (~305 m away, ~9 game-seconds
    // at top speed) before shooting, so the fall plays out unbusted.
    await vp(() => {
      window.__vp.teleport(0, 188);
      window.__vp.police.police.forEach((p, i) => window.__vp.setPolicePos(i, -100, -100));
    });
    const heliRespect0 = await vp(() => window.__vp.state.respect);
    await vp(() => { window.__vp.setAim(true); window.__vp.setPitch(-1.0); });
    const heliPos = await vp(() => [window.__vp.heli.position.x, window.__vp.heli.position.z]);
    await vp(([x, z]) => window.__vp.aimAt(x, z), heliPos);
    await page.waitForTimeout(2000);
    for (let s = 0; s < 5; s++) {
      await vp(() => { window.__vp.weapons.cooldown = 0; window.__vp.shoot(); });
      await page.waitForTimeout(300);
    }
    const heliHit = await vp(() => ({ state: window.__vp.heli.state, hp: window.__vp.heli.hp }));
    check('five pistol rounds send Air One into a falling spin',
      heliHit.state === 'falling' && heliHit.hp <= 0,
      `state=${heliHit.state} hp=${heliHit.hp}`);
    await vp(() => { window.__vp.setAim(false); window.__vp.setPitch(0.32); });
    await waitGame(3.0);
    const heliDown = await vp(() => ({
      active: window.__vp.heli.active,
      respect: window.__vp.state.respect,
    }));
    check('Air One is down (+10 respect) and gone',
      heliDown.active === false && heliDown.respect === heliRespect0 + 10,
      `active=${heliDown.active} respect=${heliDown.respect}`);

    // Roadblocks: barricades go up at wanted 3 and come down at 0.
    // Stand the player on a street intersection first — the heli section
    // leaves him at the pier mouth, where a roadblock would be skipped.
    await vp(() => window.__vp.teleport(0, 50));
    await vp(() => window.__vp.setWanted(3));
    await waitGame(1.0);
    const blocksUp = await vp(() => ({
      n: window.__vp.police.roadblocks.length,
      colliders: window.__vp.police.blockColliders.length,
    }));
    check('roadblock barricades appear at wanted 3',
      blocksUp.n >= 1 && blocksUp.colliders > 0,
      `roadblocks=${blocksUp.n} colliders=${blocksUp.colliders}`);
    await vp(() => window.__vp.setWanted(0));
    await waitGame(0.3);
    const blocksDown = await vp(() => window.__vp.police.roadblocks.length);
    check('roadblocks clear when the heat clears', blocksDown === 0, `roadblocks=${blocksDown}`);

    // Radio: R cycles the stations in the car, and the HUD names the one
    // playing.
    await vp(() => window.__vp.enterCar(0));
    await waitGame(0.2);
    await page.keyboard.press('KeyR');
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyR');
    // HUD text refreshes on the next rendered frame, so wait for it.
    await page.waitForFunction(
      () => document.getElementById('radioValue').textContent.includes('PIER 9'),
      null, { timeout: 30000 },
    );
    const radio = await vp(() => ({
      channel: window.__vp.sound.radioChannel,
      on: window.__vp.sound.radioOn,
      hud: document.getElementById('radioValue').textContent,
    }));
    check('R cycles the radio to PIER 9 95.5 in the car',
      radio.channel === 2 && radio.on === true && radio.hud.includes('PIER 9'),
      `channel=${radio.channel} on=${radio.on} hud=${radio.hud}`);
    await vp(() => window.__vp.exitCar());
    await page.waitForTimeout(400);

    // Garage: store the red car on the beach lot, reload, it is still
    // stored — then take it back out.
    await vp(() => window.__vp.enterCar(0));
    await waitGame(0.2);
    await vp(() => window.__vp.teleportCar(60, 170));
    await page.keyboard.press('KeyG');
    await page.waitForTimeout(500);
    const stored = await vp(() => ({
      n: window.__vp.garage.stored.length,
      parked: window.__vp.cars[0].parked,
      visible: window.__vp.cars[0].group.visible,
    }));
    check('G stores the car in the garage',
      stored.n === 1 && stored.parked === true && stored.visible === false,
      `stored=${stored.n} parked=${stored.parked}`);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await waitReady();
    await page.click('#btnContinue');
    await page.waitForTimeout(800);
    const storedAfterLoad = await vp(() => ({
      n: window.__vp.garage.stored.length,
      parked: window.__vp.cars[0].parked,
      cash: window.__vp.state.cash,
    }));
    check('garage stash survives save/load',
      storedAfterLoad.n === 1 && storedAfterLoad.parked === true && storedAfterLoad.cash === 8750,
      `stored=${storedAfterLoad.n} cash=${storedAfterLoad.cash}`);
    await vp(() => window.__vp.teleport(60, 170));
    await page.keyboard.press('KeyG');
    await page.waitForTimeout(500);
    const retrieved = await vp(() => ({
      n: window.__vp.garage.stored.length,
      visible: window.__vp.cars[0].group.visible,
    }));
    check('G on foot retrieves the stored car',
      retrieved.n === 0 && retrieved.visible === true,
      `stored=${retrieved.n} visible=${retrieved.visible}`);

    // Respect in the HUD, and canvas textures on ground / sand / sea / road.
    const respectHud = await vp(() => document.getElementById('respectValue').textContent);
    check('respect shows in the HUD', /RESPECT \d+ · GARAGE \d/.test(respectHud), respectHud);
    const textures = await vp(() => {
      const found = {};
      window.__vp.scene.traverse((o) => {
        if (o.isMesh && o.material && o.material.map
          && o.material.map.image instanceof HTMLCanvasElement) {
          found[o.name || 'unnamed'] = true;
        }
      });
      return found;
    });
    check('procedural canvas textures on ground, sand, sea and roads',
      Boolean(textures.ground && textures.sand && textures.sea && textures.road),
      `found=${Object.keys(textures).join(',')}`);

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
