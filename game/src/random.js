// Vice Point — deterministic seeded random numbers.
// mulberry32: tiny, fast, and reproducible from one integer seed, so the city
// layout, car placement and traffic are identical on every load with the same
// seed (screenshots included). `?seed=N` in the URL picks the seed.

export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function rangeInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Read `?seed=N` from the page URL; fall back to the default seed 1.
export function seedFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = Number.parseInt(params.get('seed') ?? '', 10);
  return Number.isFinite(raw) ? raw : 1;
}
