// Vice Point — world configuration: the island's seed, its seven districts
// (each with an id, bounds and a palette the later district-standing system
// reads), the six drivable cars and the player start. Everything procedural
// in the game derives from CITY_SEED, so the same seed rebuilds the same city.
export const CITY_SEED = 7319;
export const SAVE_KEY = 'vicepoint-r8-save-v1';
export const CITY_HALF = 300; // island spans -300..300 on x and z

export const DISTRICTS = [
  { id: 'docks',     name: 'Docks',      color: 0x8a6f4d, accent: 0xffb347, x0: -300, z0: -300, x1: -120, z1: -60,  mood: 'cranes, containers and rust' },
  { id: 'marina',    name: 'Marina',     color: 0x2e6f8e, accent: 0x7fe3ff, x0: -120, z0: -300, x1:   60, z1: -140, mood: 'yachts, white decks, salt air' },
  { id: 'oldtown',   name: 'Old Town',   color: 0xc98f5f, accent: 0xffd27f, x0: -300, z0:  -60, x1: -140, z1:  120, mood: 'stucco, awnings and plazas' },
  { id: 'neon',      name: 'Neon Strip', color: 0x7a2ea6, accent: 0xff2fb3, x0: -140, z0: -140, x1:  120, z1:   60, mood: 'neon, casinos and late nights' },
  { id: 'hills',     name: 'Hills',      color: 0x4d7a4a, accent: 0xb8ff9e, x0:  120, z0: -300, x1:  300, z1:  -60, mood: 'mansions above the bay' },
  { id: 'airport',   name: 'Airport',    color: 0x5a6470, accent: 0xffe14d, x0:  120, z0:  -60, x1:  300, z1:  140, mood: 'runway, hangars and jets' },
  { id: 'beach',     name: 'Beachfront', color: 0xe8c98a, accent: 0x2fd4ff, x0: -300, z0:  120, x1:  300, z1:  300, mood: 'sand, palms and the pier' },
];

export const CARS = [
  { id: 'sunbeam',  name: 'Sunbeam Coupe',  color: 0xff5a3c, top: 34, accel: 16, grip: 2.6 },
  { id: 'coral',    name: 'Coral Sedan',    color: 0x2fd4c4, top: 28, accel: 13, grip: 2.2 },
  { id: 'midnight', name: 'Midnight GT',    color: 0x1c2440, top: 40, accel: 19, grip: 3.0 },
  { id: 'mango',    name: 'Mango Pickup',   color: 0xffb020, top: 26, accel: 12, grip: 2.0 },
  { id: 'lagoon',   name: 'Lagoon Van',     color: 0x7fb2ff, top: 24, accel: 11, grip: 1.8 },
  { id: 'velvet',   name: 'Velvet Cruiser', color: 0xc23b8e, top: 31, accel: 14, grip: 2.4 },
];

export const PLAYER_START = { x: -20, z: 10, yaw: Math.PI * 0.75 };
export const START_CASH = 250;

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d;
  }
  return DISTRICTS[3];
}

// Tiny deterministic RNG (mulberry32) so the city rebuilds identically.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
