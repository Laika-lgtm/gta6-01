// Vice Point — headless playtest + screenshot capture (Node, Playwright).
// Serves game/ with serve.ts, opens it in the stock Playwright Chromium
// (SwiftShader WebGL; game time there runs ~0.1x real time, so waits are
// generous), then plays: walk, enter a car, exit it, and takes the four
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

  if (!SHOTS_ONLY) {
    // --- interactive playtest ---
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await waitReady();
    check('game loads and renders first frame', true);
    await page.click('#btnNew');
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => ({ x: window.__vp.player.position.x, z: window.__vp.player.position.z }));
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(10000);
    await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => ({ x: window.__vp.player.position.x, z: window.__vp.player.position.z }));
    const walked = Math.hypot(after.x - before.x, after.z - before.z);
    check('walk with W moves the player', walked > 0.2, `moved ${walked.toFixed(2)} m`);
    notes.push(`walked ${walked.toFixed(2)} m in 10 s real time (SwiftShader ~0.01x, ~1 fps)`);

    // Enter the red car parked at (8, 60), then exit it.
    await page.evaluate(() => window.__vp.teleport(10, 60));
    await page.waitForTimeout(400);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
    const inCar = await page.evaluate(() => window.__vp.state.inCar);
    check('E enters the car', inCar === true);
    const mission = await page.evaluate(() => ({ index: window.__vp.missions.index, cash: window.__vp.state.cash }));
    check('entering a car completes mission 1', mission.index === 1 && mission.cash === 150, `index=${mission.index} cash=${mission.cash}`);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
    const outCar = await page.evaluate(() => window.__vp.state.inCar);
    check('E exits the car', outCar === false);

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
