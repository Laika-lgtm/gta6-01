// The HUD: money, wanted stars, respect, the mission line and timer,
// weapon and ammo, radio station, speed and health, plus save/load through
// localStorage. The DOM elements live in index.html; this module only
// writes their text, so a frame never rebuilds the page.
import { MISSIONS, SAVE_KEY, WEAPONS } from './config.js';

export function createHud() {
  const moneyEl = document.getElementById('money-value');
  const starsEl = document.getElementById('stars');
  const missionEl = document.getElementById('mission-text');
  const speedEl = document.getElementById('speed-value');
  const speedLabelEl = document.getElementById('speed-label');
  const healthEl = document.getElementById('health-fill');
  const toastEl = document.getElementById('toast');
  const screenEl = document.getElementById('screen');
  const statusEl = document.getElementById('status');
  const respectEl = document.getElementById('respect-value');
  const weaponEl = document.getElementById('weapon-value');
  const radioEl = document.getElementById('radio-value');
  const timerEl = document.getElementById('mission-timer');
  let toastTimer = 0;

  function update(state) {
    moneyEl.textContent = String(Math.floor(state.money));
    starsEl.textContent = '★'.repeat(state.wanted) + '☆'.repeat(Math.max(0, 5 - state.wanted));
    starsEl.style.visibility = state.wanted > 0 ? 'visible' : 'hidden';
    const mission = MISSIONS[state.missionIndex % MISSIONS.length];
    // A mission phase can override the line — the getaway leg names the
    // car and the drop instead of the generic mission text.
    missionEl.textContent = state.missionText ?? mission.text;
    if (respectEl) respectEl.textContent = `RESPECT ${state.respect ?? 0}`;
    if (weaponEl) {
      const spec = WEAPONS[state.weapon ?? 'fists'];
      const ammo = state.weapon === 'fists' ? '∞' : String(state.ammo ?? 0);
      weaponEl.textContent = `${spec.name} ${ammo} — Q SWITCH · F FIRE`;
    }
    if (radioEl) {
      radioEl.textContent = state.driving && state.radioStation
        ? `♪ ${state.radioStation} — R TO CHANGE`
        : '';
    }
    if (timerEl) {
      if (state.missionTimeLeft !== null && state.missionTimeLeft !== undefined) {
        timerEl.textContent = `⏱ ${Math.ceil(state.missionTimeLeft)}s`;
        timerEl.style.color = state.missionTimeLeft <= 15 ? '#ff6a6a' : '#ffd23e';
      } else {
        timerEl.textContent = '';
      }
    }
    speedEl.textContent = String(Math.round(Math.abs(state.speed) * 2.2));
    speedLabelEl.textContent = state.driving ? `${state.carName ?? 'CAR'} — E TO EXIT` : 'ON FOOT — E NEAR A CAR';
    healthEl.style.width = `${Math.max(0, Math.min(100, state.health))}%`;
    healthEl.style.background = state.health > 50 ? '#4ade80' : state.health > 25 ? '#f0c030' : '#e5534b';
  }

  function toast(message, ms = 2600) {
    toastEl.textContent = message;
    toastEl.style.display = 'block';
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.style.display = 'none';
    }, ms);
  }

  function showScreen(html, buttonText, onStart) {
    screenEl.innerHTML = html;
    screenEl.style.display = 'flex';
    const btn = screenEl.querySelector('button');
    if (btn) {
      btn.textContent = buttonText;
      btn.addEventListener('click', onStart);
    }
  }

  function hideScreen() {
    screenEl.style.display = 'none';
  }

  function announce(message) {
    statusEl.textContent = message;
  }

  function save(state) {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: state.money,
        missionIndex: state.missionIndex,
        wanted: state.wanted,
        respect: state.respect ?? 0,
        weapon: state.weapon ?? 'fists',
        ammo: state.ammo ?? { pistol: 24, smg: 60 },
        garageOwned: state.garageOwned ?? false,
        radioStation: state.radioStation ?? 0,
        x: state.x,
        z: state.z,
        savedAt: Date.now(),
      }));
      return true;
    } catch {
      return false;
    }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.money !== 'number') return null;
      return data;
    } catch {
      return null;
    }
  }

  return { update, toast, showScreen, hideScreen, announce, save, load };
}
