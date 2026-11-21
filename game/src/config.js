// Vice Point — central tuning and world constants.
// One place for every number the other modules share: city layout, player
// feel, vehicle handling, wanted levels and the save-game key.

export const GAME_TITLE = 'VICE POINT';
export const SAVE_KEY = 'vicepoint-save-v1';
export const GAME_VERSION = '1.0.0-r5s4';

// --- City layout ------------------------------------------------------------
export const CITY = {
  blocksX: 6,
  blocksZ: 6,
  blockSize: 42, // centre-to-centre distance of city blocks
  roadWidth: 14,
  sidewalkWidth: 3,
  buildingCount: 100,
  palmCount: 48,
  groundSize: 560, // ground plane side length
  oceanEdge: 190, // x beyond this is beach, then sea
  beachWidth: 34,
};

// --- Player -----------------------------------------------------------------
export const PLAYER = {
  walkSpeed: 5.2,
  runSpeed: 9.5,
  turnSpeed: 9.0,
  radius: 0.55,
  height: 1.8,
  maxHealth: 100,
  cameraDistance: 7.5,
  cameraHeight: 3.2,
  cameraMinDistance: 2.2,
};

// --- Vehicles ---------------------------------------------------------------
// Six stealable street cars. accel/topSpeed are in m/s units, handling is a
// 0..1 steering sharpness, grip damps sideways slide.
export const CAR_DEFS = [
  { id: 'sunset', name: 'Sunset GT', color: 0xff5a3c, topSpeed: 34, accel: 16, brake: 30, handling: 0.95, grip: 6.5, length: 4.6, width: 2.0 },
  { id: 'marlin', name: 'Marlin S', color: 0x2e86ff, topSpeed: 30, accel: 14, brake: 28, handling: 0.85, grip: 6.0, length: 4.4, width: 1.9 },
  { id: 'palmetto', name: 'Palmetto', color: 0xffd23f, topSpeed: 26, accel: 11, brake: 26, handling: 0.7, grip: 5.0, length: 4.2, width: 1.9 },
  { id: 'bayside', name: 'Bayside Van', color: 0x7ee081, topSpeed: 24, accel: 9, brake: 24, handling: 0.55, grip: 4.5, length: 5.2, width: 2.2 },
  { id: 'neon', name: 'Neon Coupe', color: 0xc44dff, topSpeed: 38, accel: 18, brake: 32, handling: 1.0, grip: 7.5, length: 4.3, width: 1.95 },
  { id: 'coral', name: 'Coral Cruiser', color: 0xff8fb3, topSpeed: 28, accel: 12, brake: 26, handling: 0.75, grip: 5.5, length: 4.8, width: 2.0 },
];

// Police pursuit car (not stealable in stage 1, it hunts the player).
// Tuned so the player CAN escape: top speed 34 m/s and gentle acceleration
// 6 m/s^2 — the fastest street car (Neon Coupe, 38) outruns it, and the
// player's much stronger acceleration (16-18) wins the launch. A 42 m/s
// Interceptor would be unescapable, so 34 is a hard cap, not a suggestion.
export const POLICE_DEF = {
  id: 'interceptor', name: 'Interceptor', color: 0x14181f, topSpeed: 34, accel: 6, brake: 34, handling: 1.0, grip: 7.0, length: 4.7, width: 2.0,
};

// --- Wanted -----------------------------------------------------------------
export const WANTED = {
  maxStars: 5,
  policeSpawnRadius: 42,
  policeDespawnRadius: 120,
  chaseSpeedBoost: 1.0, // chase cap equals POLICE_DEF.topSpeed: 34 m/s, never more
  // How many Interceptors hunt the player at each wanted level.
  policeCountByStars: { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 },
  heliAtStars: 4,
  // Wanted decays only while hidden: no police within hideRadius and no new
  // crime for crimeMemorySeconds; then one star every decaySeconds.
  hideRadius: 90,
  crimeMemorySeconds: 15,
  decaySeconds: 12,
  // Stealing a different car while wanted sheds one star (cooldown below).
  carSwapDecaySeconds: 20,
  bustedFine: 100,
  bustedTime: 1.5, // seconds cornered by police before BUSTED
  witnessRadius: 60, // police within this see a crime happen
  stealSeenRadius: 50, // police within this see a car being stolen
};

// --- Missions ---------------------------------------------------------------
// The Mara Voss chain: eight linked jobs, paid in order. Balances check out
// as $250 -> $550 -> $950 -> $1,550 -> $2,350 -> $3,550 -> $4,950 -> $6,550
// -> $8,550. Types: 'reach' (arrive at the marker), 'escape' (lose the cops;
// marker is null on purpose — the old game-breaking bug was an escape
// objective with no target throwing every frame, so every consumer of a
// mission must guard `mission.marker` before using it), 'getaway' (arrive at
// the marker in one specific car), 'timed' (reach the marker before the
// clock runs out — too slow and Mara hands you a fresh clock, not a fail
// screen), 'tail' (stay on the mark's bumper: get within range of the moving
// target car), 'survey' (snap all three photo spots in order) and 'heist'
// (two phases: reach the bank, then lose the heat it brings). `startWanted`
// is the heat a job opens with; `roadblocks` lets the VCPD barricade the
// roads during it; `minRespect` gates a job behind the respect score.
export const MISSIONS = [
  { id: 'm1-pickup', title: 'The Pickup', giver: 'Mara Voss', type: 'reach', objective: "Deliver Mara's package to Hotel VICE", marker: { x: -42, z: -42 }, reward: 300 },
  { id: 'm2-heat', title: 'Heat', giver: 'Mara Voss', type: 'escape', objective: 'Lose the cops — get your wanted level to zero', marker: null, reward: 400, startWanted: 2 },
  { id: 'm3-getaway', title: 'The Getaway Car', giver: 'Mara Voss', type: 'getaway', objective: 'Steal the Neon Coupe and bring it to Pier 9', marker: { x: 214, z: 96 }, reward: 600, carId: 'neon' },
  { id: 'm4-drop', title: 'The Drop', giver: 'Mara Voss', type: 'timed', objective: 'Drop the package at the north depot — beat the clock', marker: { x: 84, z: -84 }, reward: 800, timeLimit: 75 },
  { id: 'm5-tail', title: 'Tail the Mark', giver: 'Mara Voss', type: 'tail', objective: 'Tail the orange mark — get on his bumper', marker: null, reward: 1200 },
  { id: 'm6-survey', title: 'The Survey', giver: 'Mara Voss', type: 'survey', objective: 'Snap all three photo spots for Mara', marker: { x: -84, z: 84 }, markers: [{ x: -84, z: 84 }, { x: 0, z: -84 }, { x: 126, z: 42 }], reward: 1400, minRespect: 20 },
  { id: 'm7-roadblock', title: 'Roadblock Run', giver: 'Mara Voss', type: 'escape', objective: 'Lose the cops — they are barricading the roads', marker: null, reward: 1600, startWanted: 3, roadblocks: true },
  { id: 'm8-heist', title: 'The Big Heist', giver: 'Mara Voss', type: 'heist', objective: 'Hit the Vice Bank, then lose the heat', marker: { x: -126, z: 126 }, reward: 2000, startWanted: 3, roadblocks: true, minRespect: 30 },
];

// --- Weapons ----------------------------------------------------------------
// Fists are free; the pistol and SMG are hitscan (one ray per shot, nearest
// target inside a narrow cone wins). Ammo only comes back by finishing jobs.
export const WEAPONS = {
  fists: { id: 'fists', name: 'FISTS', range: 0, arcCos: 0, cooldown: 0, startAmmo: Infinity },
  pistol: { id: 'pistol', name: 'PISTOL', range: 40, arcCos: 0.94, cooldown: 0.28, startAmmo: 24, refill: 12 },
  smg: { id: 'smg', name: 'SMG', range: 36, arcCos: 0.92, cooldown: 0.09, startAmmo: 60, refill: 30 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg'];

// --- Helicopter -------------------------------------------------------------
export const HELI = {
  health: 5, // hits to bring Air One down
  downReward: 500,
  respawnSeconds: 25, // back in the air this long after a shoot-down (wanted >= 4 only)
  warningEvery: 2.2, // seconds between warning shots at wanted >= 4
  shootRange: 55, // how far a bullet can reach the heli
};

// --- Garage -----------------------------------------------------------------
// One lot east of the grid, on the open asphalt by the beach: store a car,
// buy a fresh one, or lay low — pulling in sheds a star (cooldown below).
export const GARAGE = {
  x: 168,
  z: 0,
  radius: 18, // the pad in front of the door sits 15 m out — it must be inside
  buyPrice: 800,
  discountRespect: 50, // respect at/above this buys at the discounted price
  discount: 0.25,
  decayCooldown: 30, // seconds between garage heat sheds
};

// --- Respect ----------------------------------------------------------------
// 0..100, earned by working for Mara and by loud moves (heli down, smashing
// a roadblock). Gates the later jobs and discounts the garage.
export const RESPECT = {
  perMission: 5,
  heliDown: 2,
  roadblockSmash: 1,
  max: 100,
};

// --- Radio ------------------------------------------------------------------
export const RADIO = {
  stations: ['VICE FM', 'NEON 98', 'PIRATE 107'],
};

export const START = {
  money: 250,
  position: { x: 0, z: 24 },
  heading: Math.PI,
};

// Neon signs painted on the city (procedural canvas textures, no images).
export const NEON_SIGNS = [
  { text: 'VICE', color: '#ff2e88', x: 0, z: 0, y: 26, size: 9 },
  { text: 'TACOS', color: '#ffb400', x: 42, z: 42, y: 12, size: 4 },
  { text: 'HOTEL', color: '#37e0ff', x: -42, z: -42, y: 18, size: 5 },
  { text: 'PIER 9', color: '#7dff6a', x: 214, z: 96, y: 10, size: 4 },
  { text: 'GARAGE', color: '#ff9f1c', x: 168, z: 0, y: 9, size: 4 },
];
