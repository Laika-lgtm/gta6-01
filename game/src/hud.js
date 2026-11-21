// Vice Point — the HUD: money, wanted stars, mission, speed, health.
// Plain DOM over the canvas: big readable numbers, a star row that flashes
// when the heat is on, a mission card top-left, and a start screen overlay.
// Also owns the save/load round-trip to localStorage.

import { SAVE_KEY, MISSIONS, START } from './config.js';

export function createHud(documentRef) {
  const doc = documentRef;
  const hud = doc.getElementById('hud');
  const moneyEl = doc.getElementById('hud-money');
  const starsEl = doc.getElementById('hud-stars');
  const missionEl = doc.getElementById('hud-mission');
  const speedEl = doc.getElementById('hud-speed');
  const healthEl = doc.getElementById('hud-health');
  const healthBarEl = doc.getElementById('hud-health-bar');
  const carEl = doc.getElementById('hud-car');
  const toastEl = doc.getElementById('hud-toast');
  const startEl = doc.getElementById('start-screen');
  const titleEl = doc.getElementById('start-title');
  const overEl = doc.getElementById('game-over');
  const overFineEl = doc.getElementById('game-over-fine');
  const pauseEl = doc.getElementById('pause-screen');
  const arrowEl = doc.getElementById('hud-arrow');
  const arrowCharEl = doc.getElementById('hud-arrow-char');
  const arrowDistEl = doc.getElementById('hud-arrow-dist');
  let toastTimer = null;

  function showToast(text, ms) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2600);
  }

  function render(state, extra) {
    hud.classList.toggle('hidden', !state.started);
    moneyEl.textContent = `$${Math.floor(state.money).toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.classList.toggle('hot', state.wanted >= 3);
    const mission = MISSIONS[state.missionIndex];
    if (!mission) {
      missionEl.innerHTML = `<b>Mara's chain complete</b> — free roam<br><span>All three jobs done · $${state.money}</span>`;
    } else {
      const extraLine = mission.type === 'escape'
        ? `<br><span>★ Lose the cops to finish — hide until the stars fade</span>`
        : (state.missionNote ? `<br><span>${state.missionNote}</span>` : '');
      missionEl.innerHTML = `<b>${mission.title}</b> — ${mission.objective}${extraLine}<br><span>${mission.giver} · $${mission.reward}</span>`;
    }
    speedEl.textContent = state.inCar
      ? `${Math.round(Math.abs(state.speed) * 2.237)} mph`
      : '— mph';
    const hp = Math.max(0, Math.round(state.health));
    healthEl.textContent = `${hp}`;
    healthBarEl.style.width = `${hp}%`;
    healthBarEl.classList.toggle('low', hp <= 30);
    carEl.textContent = state.inCar ? state.carName : 'On foot — press E near a car';

    // Objective arrow: points at the marker relative to the camera, with
    // the distance in metres. Escape missions have no marker (null on
    // purpose), so the arrow hides and the stars do the talking.
    const marker = extra && extra.marker ? extra.marker : null;
    if (marker && arrowEl) {
      const dx = marker.x - state.x;
      const dz = marker.z - state.z;
      const bearing = Math.atan2(dx, dz);
      const camForward = (extra.cameraYaw || 0) + Math.PI;
      let rel = bearing - camForward;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      arrowEl.classList.remove('hidden');
      arrowCharEl.style.transform = `rotate(${rel}rad)`;
      arrowDistEl.textContent = `${Math.round(Math.hypot(dx, dz))} m`;
    } else if (arrowEl) {
      arrowEl.classList.add('hidden');
    }
  }

  function showStart() {
    startEl.classList.remove('hidden');
    titleEl.textContent = 'VICE POINT';
  }

  function hideStart() {
    startEl.classList.add('hidden');
  }

  function showGameOver(fineText) {
    if (overFineEl) overFineEl.textContent = fineText || '';
    overEl.classList.remove('hidden');
  }

  function hideGameOver() {
    overEl.classList.add('hidden');
  }

  function showPause() {
    if (pauseEl) pauseEl.classList.remove('hidden');
  }

  function hidePause() {
    if (pauseEl) pauseEl.classList.add('hidden');
  }

  return { render, showToast, showStart, hideStart, showGameOver, hideGameOver, showPause, hidePause };
}

// Save: money, missions completed, player position and current car.
export function saveGame(state) {
  try {
    const data = {
      version: 1,
      money: state.money,
      missionIndex: state.missionIndex,
      missionsDone: state.missionsDone,
      x: state.x,
      z: state.z,
      heading: state.heading,
      wanted: state.wanted,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Load: null when nothing was saved yet.
export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.money !== 'number') return null;
    return {
      money: data.money,
      missionIndex: data.missionIndex || 0,
      missionsDone: data.missionsDone || [],
      x: data.x ?? START.position.x,
      z: data.z ?? START.position.z,
      heading: data.heading ?? START.heading,
      wanted: data.wanted || 0,
    };
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage may be unavailable; the game still runs.
  }
}
