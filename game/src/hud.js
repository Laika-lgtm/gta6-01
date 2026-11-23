// Vice Point — HUD and live round minimap, stage 4. The HUD is DOM (cash,
// district, objective line, speed, hints, wanted stars, dialog) plus the
// stage-4 readouts: crew, respect, cache count, weapon, radio station and
// race timer, a district-standing panel (T), the weapon wheel (Q) and the
// garage panel (G). The minimap is a 2D canvas redrawn every frame showing
// district blocks, the player arrow, parked cars, traffic, police, peds,
// the objective marker and — when one is close — the nearest cache.
import { DISTRICTS, districtAt } from './config.js';

export class Hud {
  constructor() {
    this.cashEl = document.getElementById('hud-cash');
    this.distEl = document.getElementById('hud-district');
    this.objEl = document.getElementById('hud-objective');
    this.speedEl = document.getElementById('hud-speed');
    this.hintEl = document.getElementById('hud-hint');
    this.map = document.getElementById('minimap');
    this.mctx = this.map.getContext('2d');
    this.wantedEl = document.getElementById('hud-wanted');
    this.dialogEl = document.getElementById('dialog');
    this.dialogNameEl = document.getElementById('dialog-name');
    this.dialogTextEl = document.getElementById('dialog-text');
    this.dialogDone = null;
    this.dialogShown = false;
    this.crewEl = document.getElementById('hud-crew');
    this.respectEl = document.getElementById('hud-respect');
    this.cachesEl = document.getElementById('hud-caches');
    this.weaponEl = document.getElementById('hud-weapon');
    this.radioEl = document.getElementById('hud-radio');
    this.raceEl = document.getElementById('hud-race');
    this.standingEl = document.getElementById('hud-standing');
    this.wheelEl = document.getElementById('wheel');
    this.garageEl = document.getElementById('garage');
    this.garageInfoEl = document.getElementById('garage-info');
    this.standingShown = false;
  }

  setCash(n) { this.cashEl.textContent = '$' + n; }
  setObjective(text) { this.objEl.textContent = text; }
  setHint(text) { this.hintEl.textContent = text; }
  setCrew(text) { if (this.crewEl) this.crewEl.textContent = text; }
  setRespect(text) { if (this.respectEl) this.respectEl.textContent = text; }
  setCaches(n, total) { if (this.cachesEl) this.cachesEl.textContent = `Caches ${n}/${total}`; }
  setWeapon(text) { if (this.weaponEl) this.weaponEl.textContent = text; }
  setRadio(text) { if (this.radioEl) this.radioEl.textContent = '♪ ' + text; }
  setRace(text) { if (this.raceEl) this.raceEl.textContent = text; }

  setWanted(n) {
    if (!this.wantedEl) return;
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.wantedEl.textContent = s;
    this.wantedEl.style.color = n === 0 ? 'rgba(255,255,255,0.55)' : '#ffd23b';
  }

  showDialog(name, text, onDone) {
    if (!this.dialogEl) { if (onDone) onDone(); return; }
    this.dialogNameEl.textContent = name;
    this.dialogTextEl.textContent = text;
    this.dialogEl.style.display = 'block';
    this.dialogDone = onDone || null;
    this.dialogShown = true;
  }
  advanceDialog() {
    if (!this.dialogShown) return false;
    this.dialogEl.style.display = 'none';
    this.dialogShown = false;
    const cb = this.dialogDone;
    this.dialogDone = null;
    if (cb) cb();
    return true;
  }

  // Standing panel: a line per district with its level as stars.
  setStanding(summary) {
    if (!this.standingEl) return;
    this.standingEl.innerHTML = '<b>DISTRICT STANDING</b><br>' + summary.map((s) => {
      let stars = '';
      for (let i = 0; i < 5; i++) stars += i < s.level ? '★' : '☆';
      return `${s.name}: ${stars}`;
    }).join('<br>');
  }
  toggleStanding() {
    if (!this.standingEl) return false;
    this.standingShown = !this.standingShown;
    this.standingEl.style.display = this.standingShown ? 'block' : 'none';
    return this.standingShown;
  }

  // Weapon wheel: three slots, the current one highlighted.
  showWheel(open, current) {
    if (!this.wheelEl) return;
    if (!open) { this.wheelEl.style.display = 'none'; return; }
    const slot = (id, label) => `<div class="wheel-slot${current === id ? ' on' : ''}">${label}<br><span>${id === 'pistol' ? '1' : '2'}</span></div>`;
    this.wheelEl.innerHTML = `<div class="wheel-title">WEAPONS</div>${slot('pistol', 'Pistol')}${slot('smg', 'SMG')}<div class="wheel-hint">1 / 2 to pick · Q to close · X to fire</div>`;
    this.wheelEl.style.display = 'block';
  }

  // Garage panel: info line plus buttons wired by main.
  showGarage(open, info) {
    if (!this.garageEl) return;
    if (info !== undefined && this.garageInfoEl) this.garageInfoEl.textContent = info;
    this.garageEl.style.display = open ? 'block' : 'none';
  }

  drawMinimap(playerPos, playerYaw, cars, objective, extras) {
    const g = this.mctx;
    const S = this.map.width;
    const toMap = (x, z) => [((x + 300) / 600) * S, ((z + 300) / 600) * S];
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#0e2a3a';
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
    for (const d of DISTRICTS) {
      const [x0, y0] = toMap(d.x0, d.z0);
      const [x1, y1] = toMap(d.x1, d.z1);
      g.fillStyle = '#' + d.color.toString(16).padStart(6, '0');
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1;
    for (let v = -250; v <= 250; v += 100) {
      const [ax] = toMap(v, 0);
      const [, ay] = toMap(0, v);
      g.beginPath(); g.moveTo(ax, 0); g.lineTo(ax, S); g.stroke();
      g.beginPath(); g.moveTo(0, ay); g.lineTo(S, ay); g.stroke();
    }
    // Sea rim at the bottom (south = beachfront).
    g.fillStyle = '#1d7fa8';
    g.fillRect(0, toMap(0, 300)[1] - 4, S, 8);
    if (objective) {
      const [ox, oy] = toMap(objective.x, objective.z);
      g.fillStyle = '#ffd23b';
      g.beginPath(); g.arc(ox, oy, 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.arc(ox, oy, 9, 0, Math.PI * 2); g.stroke();
    }
    // A nearby cache shows as a gold diamond on the map.
    if (extras && extras.cache) {
      const [kx, ky] = toMap(extras.cache.x, extras.cache.z);
      g.fillStyle = '#ffd23b';
      g.save();
      g.translate(kx, ky);
      g.rotate(Math.PI / 4);
      g.fillRect(-4, -4, 8, 8);
      g.restore();
    }
    for (const car of cars) {
      const [cx, cy] = toMap(car.pos.x, car.pos.z);
      g.fillStyle = '#' + car.def.color.toString(16).padStart(6, '0');
      g.fillRect(cx - 3, cy - 3, 6, 6);
    }
    if (extras) {
      if (extras.traffic) {
        g.fillStyle = 'rgba(200,200,200,0.85)';
        for (const car of extras.traffic) {
          const [cx, cy] = toMap(car.pos.x, car.pos.z);
          g.fillRect(cx - 2, cy - 2, 4, 4);
        }
      }
      if (extras.police) {
        g.fillStyle = '#3a86ff';
        for (const u of extras.police) {
          const [cx, cy] = toMap(u.pos.x, u.pos.z);
          g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
        }
      }
      if (extras.peds) {
        g.fillStyle = 'rgba(255,255,255,0.6)';
        for (const p of extras.peds) {
          const [cx, cy] = toMap(p.pos.x, p.pos.z);
          g.fillRect(cx - 1, cy - 1, 2, 2);
        }
      }
      if (extras.race) {
        const [rx, ry] = toMap(extras.race.x, extras.race.z);
        g.fillStyle = '#2fd4ff';
        g.beginPath(); g.arc(rx, ry, 5, 0, Math.PI * 2); g.fill();
      }
    }
    const [px, py] = toMap(playerPos.x, playerPos.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.atan2(Math.sin(playerYaw), Math.cos(playerYaw)) + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath();
    g.fill();
    g.restore();
    g.restore();
    const d = districtAt(playerPos.x, playerPos.z);
    this.distEl.textContent = d.name;
    this.distEl.style.color = '#' + d.accent.toString(16).padStart(6, '0');
  }

  setSpeed(kmh, driving) {
    this.speedEl.textContent = driving ? Math.round(kmh * 3.2) + ' km/h' : '';
  }
}
