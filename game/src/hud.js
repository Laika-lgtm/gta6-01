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
  let toastTimer = null;

  function showToast(text, ms) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2600);
  }

  function render(state) {
    hud.classList.toggle('hidden', !state.started);
    moneyEl.textContent = `$${Math.floor(state.money).toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < state.wanted ? '★' : '☆';
    starsEl.textContent = stars;
    starsEl.classList.toggle('hot', state.wanted >= 3);
    const mission = MISSIONS[state.missionIndex] || MISSIONS[0];
    missionEl.innerHTML = `<b>${mission.title}</b> — ${mission.objective}<br><span>${mission.giver} · $${mission.reward}</span>`;
    speedEl.textContent = state.inCar
      ? `${Math.round(Math.abs(state.speed) * 2.237)} mph`
      : '— mph';
    const hp = Math.max(0, Math.round(state.health));
    healthEl.textContent = `${hp}`;
    healthBarEl.style.width = `${hp}%`;
    healthBarEl.classList.toggle('low', hp <= 30);
    carEl.textContent = state.inCar ? state.carName : 'On foot — press E near a car';
  }

  function showStart() {
    startEl.classList.remove('hidden');
    titleEl.textContent = 'VICE POINT';
  }

  function hideStart() {
    startEl.classList.add('hidden');
  }

  function showGameOver() {
    overEl.classList.remove('hidden');
  }

  function hideGameOver() {
    overEl.classList.add('hidden');
  }

  return { render, showToast, showStart, hideStart, showGameOver, hideGameOver };
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
