// Vice Point — central tuning and world constants.
// One place for every number the other modules share: city layout, player
// feel, vehicle handling, wanted levels and the save-game key.

export const GAME_TITLE = 'VICE POINT';
export const SAVE_KEY = 'vicepoint-save-v1';
export const GAME_VERSION = '1.0.0-r5s2';

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
// The Mara Voss chain: three linked jobs, paid in order. Balances check out
// as $250 -> $550 -> $950 -> $1,550. Types: 'reach' (arrive at the marker),
// 'escape' (lose the cops; marker is null on purpose — the old game-breaking
// bug was an escape objective with no target throwing every frame, so every
// consumer of a mission must guard `mission.marker` before using it),
// 'getaway' (arrive at the marker in one specific car).
export const MISSIONS = [
  { id: 'm1-pickup', title: 'The Pickup', giver: 'Mara Voss', type: 'reach', objective: "Deliver Mara's package to Hotel VICE", marker: { x: -42, z: -42 }, reward: 300 },
  { id: 'm2-heat', title: 'Heat', giver: 'Mara Voss', type: 'escape', objective: 'Lose the cops — get your wanted level to zero', marker: null, reward: 400 },
  { id: 'm3-getaway', title: 'The Getaway Car', giver: 'Mara Voss', type: 'getaway', objective: 'Steal the Neon Coupe and bring it to Pier 9', marker: { x: 214, z: 96 }, reward: 600, carId: 'neon' },
];

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
];
