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
  chaseSpeed: 30,
  heliHeight: 46,
  heliSpeed: 18,
  catchDistance: 3.2,
};

export const TRAFFIC = {
  count: 10,
  speed: 9,
};

export const PEDS = {
  count: 14,
  speed: 1.6,
};

export const SAVE_KEY = 'vice-point.save.v1';

export const MISSIONS = [
  { id: 'debt', title: 'DEBT COLLECTOR', text: 'Meet Marisol at Pier 9. The debt won\'t pay itself.', pay: 400 },
  { id: 'pickup', title: 'THE PICKUP', text: 'Grab the package on Coral Way and bring it to the marina.', pay: 650 },
  { id: 'getaway', title: 'THE GETAWAY', text: 'Lose the cops, then lay low at the safehouse on 5th.', pay: 900 },
];

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
