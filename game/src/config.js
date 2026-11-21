// Vice Point tuning: every number and colour in one place. The city is a
// 6x6 block grid on a 480-unit square; the beach and ocean sit to the east
// (positive X). Nothing here depends on the screen size.

export const STEP = 1 / 60;

export const CITY = {
  seed: 7,
  halfSize: 240,
  blocks: 6,
  blockSize: 72,
  roadWidth: 14,
  buildingCount: 100,
  palmCount: 48,
  beachX: 252,
  seaX: 300,
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 11,
  radius: 0.7,
  height: 1.8,
  turnSpeed: 2.6,
  startX: -8,
  startZ: 8,
  punchRange: 2.4,
  punchCooldown: 0.45,
};

export const CAR = {
  count: 6,
  accel: 22,
  brake: 34,
  maxSpeed: 42,
  reverseMax: 12,
  steer: 1.9,
  grip: 3.2,
};

export const POLICE = {
  // The Interceptor is fast but not faster than a good getaway car: it
  // tops out at 34 m/s and only gains 6 m/s per second, so a clean driver
  // can pull away and a sloppy one gets caught.
  chaseSpeed: 34,
  chaseAccel: 6,
  heliHeight: 46,
  heliSpeed: 18,
  catchDistance: 3.2,
  // Air One takes 5 hits to bring down; a downed heli pays $500.
  heliHealth: 5,
  heliReward: 500,
  heliRespawn: 45,
  // A knocked-out Interceptor is back on the road after 8 seconds, and it
  // always respawns snapped onto a road inside the grid — never inside a
  // building or off the map.
  respawnDelay: 8,
  // Lose the cops for 20 seconds of game time and one star decays — but
  // the fleet returns with it, respawning back on your tail.
  lostCopsSeconds: 20,
  // Warning shots start at wanted 4: Air One fires at Ray every few
  // seconds while he is on foot.
  warningShotWanted: 4,
  warningShotInterval: 2.5,
  warningShotDamage: 2,
};

// Weapons: fists are free forever; the pistol starts with 24 rounds and
// the SMG with 60. F fires whatever is armed; Q cycles, 1/2/3 pick one.
export const WEAPONS = {
  order: ['fists', 'pistol', 'smg'],
  fists: { name: 'FISTS', range: 2.4, damage: 1, ammo: Infinity },
  pistol: { name: 'PISTOL', range: 30, damage: 1, ammo: 24 },
  smg: { name: 'SMG', range: 26, damage: 1, ammo: 60 },
};

// Radio: three procedural WebAudio stations, switchable with R, audible
// only while Ray is in a car.
export const RADIO_STATIONS = [
  { name: 'VICE FM', notes: [220, 277, 330, 415, 330, 277], tempo: 0.32, wave: 'triangle' },
  { name: 'NEON NIGHTS', notes: [196, 247, 294, 392, 370, 294], tempo: 0.26, wave: 'sawtooth' },
  { name: 'PALM TALK', notes: [262, 330, 392, 523, 392, 330], tempo: 0.42, wave: 'sine' },
];

// The garage on Driftwood Lane: $800, or $600 once Ray's respect is 50+.
// Parking a car inside (G) hides it; walking in while wanted drops a star,
// once every 30 seconds.
export const GARAGE = {
  x: -200,
  z: 180,
  price: 800,
  discountPrice: 600,
  discountRespect: 50,
  hideCooldown: 30,
};

export const TRAFFIC = {
  count: 10,
  speed: 9,
};

export const PEDS = {
  count: 14,
  speed: 1.6,
};

// Respect 0-100: +5 per finished mission, +5 for shooting down Air One,
// +1 for stealing a car, +1 for cooling a star off. Missions 6 and 8 are
// gated on it — the gate is reachable by playing, never a dead end.
export const RESPECT = {
  perMission: 5,
  perHeliDown: 5,
  perCarStolen: 1,
  perStarCooled: 1,
  max: 100,
};

export const SAVE_KEY = 'vice-point.save.v1';

// Mara Voss's chain, in order. The pays are the whole economy: Ray starts
// on $250, so the chain runs $250 -> $550 -> $950 -> $1,550 -> $2,350 ->
// $3,450 -> $4,950 -> $6,650 -> $8,550.
export const MISSIONS = [
  { id: 'pickup', title: 'THE PICKUP', text: "Mara Voss: grab the package at Pier 9. Don't keep her waiting.", pay: 300, type: 'goto' },
  { id: 'heat', title: 'HEAT ESCAPE', text: 'Mara Voss: the heat is on — shake the cops and reach the safehouse.', pay: 400, type: 'escape' },
  { id: 'getaway', title: 'GETAWAY CAR', text: 'Mara Voss: steal the gold getaway car, then drive it to the marina drop.', pay: 600, type: 'getaway' },
  { id: 'drop', title: 'THE DROP', text: 'Mara Voss: run the package across town in 75 seconds. No excuses.', pay: 800, type: 'timed', timeLimit: 75 },
  { id: 'tail', title: 'TAIL THE MARK', text: 'Mara Voss: follow the mark. Stay close, but never let him spot you.', pay: 1100, type: 'tail' },
  { id: 'survey', title: 'THE SURVEY', text: 'Mara Voss: scope the bank on Ocean Drive. Respect 20 to take this job.', pay: 1500, type: 'survey', respect: 20 },
  { id: 'roadblock', title: 'ROADBLOCK RUN', text: 'Mara Voss: the whole precinct is out. Smash through and reach the safehouse.', pay: 1700, type: 'escape' },
  { id: 'heist', title: 'THE BIG HEIST', text: 'Mara Voss: the vault job. Respect 30 to take this one — then get out clean.', pay: 1900, type: 'heist', respect: 30 },
];

// Where each mission points: Pier 9, the safehouse in the north-west
// corner, the marina drop on the north-east shore, the drop point in the
// south-west, the survey spot on Ocean Drive, and the bank vault.
export const MISSION_TARGETS = [
  { x: 296, z: 120 },
  { x: -160, z: -160 },
  { x: 180, z: -140 },
  { x: -200, z: 160 },
  { x: 0, z: 0 },
  { x: 120, z: 180 },
  { x: -160, z: -160 },
  { x: 200, z: 60 },
];

// The heist's second leg: back to the safehouse after the vault.
export const HEIST_ESCAPE_TARGET = { x: -160, z: -160 };

// The getaway car is the gold Marina Hatch, parked on Coral Way.
export const GETAWAY_CAR_INDEX = 2;

// The mark for the tail mission drives the loop around the central blocks.
export const MARK_CAR_INDEX = 4;

export const PALETTE = {
  sky: 0x87bfe8,
  sun: 0xfff2c8,
  ground: 0x3d3a38,
  sidewalk: 0x9a938a,
  road: 0x2e2c30,
  sand: 0xe8d3a2,
  sea: 0x1d7fa8,
  seaDeep: 0x0e5a80,
  grass: 0x4f8f5a,
  building: [0xd8c9b8, 0xc9b8a8, 0xb8c4d8, 0xe0b8c0, 0xf0e0c0, 0xa8c8b8, 0xd0a0a0, 0x8fb8d8],
  glass: 0x2a4a66,
  neonPink: 0xff4d8d,
  neonCyan: 0x33e0ff,
  neonYellow: 0xffd23e,
  neonGreen: 0x4ade80,
  palmTrunk: 0x8a6a44,
  palmLeaf: 0x2f9e4f,
  carPaint: [0xd83a3a, 0x2a6fd8, 0xf0c030, 0x30b8a0, 0xe8e8e8, 0x7a4fd8],
  policePaint: 0x1a1a22,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
