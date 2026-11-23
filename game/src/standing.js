// Vice Point — district standing + respect, stage 4. Every district keeps
// its own standing, 0 to 5, fed by work done on its streets: missions that
// start or end there, caches found there, exports and race wins. Standing
// is not a trophy — level 3 in Old Town cuts garage prices by a fifth, and
// every level is shown on the panel (T). Respect is the island-wide score,
// 0 to 100: missions, caches, exports and wins all push it up, and the HUD
// carries it next to the cash so Ray always knows how loud his name is.
import { DISTRICTS } from './config.js';

export const STANDING_XP_PER_LEVEL = 2; // 2 xp = 1 level, cap 5 (10 xp)

export class Standing {
  constructor() {
    this.xp = {};
    for (const d of DISTRICTS) this.xp[d.id] = 0;
  }

  gain(districtId, n = 1) {
    if (!(districtId in this.xp)) return 0;
    const before = this.level(districtId);
    this.xp[districtId] = Math.min(10, this.xp[districtId] + n);
    return this.level(districtId) - before; // levels gained (0 or more)
  }

  level(districtId) {
    const x = this.xp[districtId] || 0;
    return Math.min(5, Math.floor(x / STANDING_XP_PER_LEVEL));
  }

  get district() { return this.xp; }

  // Old Town level 3+ = 20% off at the garage.
  garageDiscount() { return this.level('oldtown') >= 3 ? 0.2 : 0; }

  summary() {
    return DISTRICTS.map((d) => ({ id: d.id, name: d.name, level: this.level(d.id), xp: this.xp[d.id] }));
  }

  line() {
    return this.summary().map((s) => `${s.name} ${s.level}`).join(' · ');
  }

  serialize() { return { ...this.xp }; }
  restore(s) {
    if (!s) return;
    for (const d of DISTRICTS) if (typeof s[d.id] === 'number') this.xp[d.id] = Math.max(0, Math.min(10, s[d.id]));
  }
}

const RESPECT_TITLES = [
  [0, 'Nobody'], [15, 'Small Name'], [30, 'Known Face'], [50, 'Heavy Hitter'],
  [70, 'Vice Royalty'], [90, 'Island Legend'],
];

export class Respect {
  constructor() { this.score = 0; }
  add(n) { this.score = Math.max(0, Math.min(100, this.score + n)); return this.score; }
  get title() {
    let t = RESPECT_TITLES[0][1];
    for (const [min, name] of RESPECT_TITLES) if (this.score >= min) t = name;
    return t;
  }
  label() { return `Respect ${this.score}/100 — ${this.title}`; }
  serialize() { return this.score; }
  restore(n) { if (typeof n === 'number') this.score = Math.max(0, Math.min(100, n)); }
}
