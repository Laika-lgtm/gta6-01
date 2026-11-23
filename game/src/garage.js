// Vice Point — the garage, stage 4. A lock-up in Old Town where Ray's
// fleet lives: buy any of the six models outright (cash, with a 20%
// discount once Old Town standing hits 3), park the car he is driving,
// repaint it through eight factory colours for $50, and patch it up for
// $30. The garage is where stolen cars become Ray's cars — bought ones
// stay bought across saves.
import { CARS } from './config.js';

export const GARAGE_SPOT = { x: -150, z: 110 };

export const BUY_PRICES = {
  sunbeam: 1200,
  coral: 900,
  midnight: 2500,
  mango: 800,
  lagoon: 700,
  velvet: 1500,
};

export const REPAINT_COST = 50;
export const REPAIR_COST = 30;

export const PAINTS = [
  0xff5a3c, 0x2fd4c4, 0x1c2440, 0xffb020, 0x7fb2ff, 0xc23b8e, 0xf2f2f2, 0x141414,
];

export class Garage {
  constructor() {
    this.owned = new Set(); // car ids Ray owns
    this.paintIdx = {}; // car id -> index into PAINTS
    this.bought = 0;
    this.repaints = 0;
    this.repairsPaid = 0;
  }

  priceFor(carId, discount = 0) {
    const base = BUY_PRICES[carId] || 1000;
    return Math.round(base * (1 - discount));
  }

  isOwned(carId) { return this.owned.has(carId); }

  buy(carId, cash, discount = 0) {
    if (this.owned.has(carId)) return { ok: false, reason: 'already owned' };
    const price = this.priceFor(carId, discount);
    if (cash < price) return { ok: false, reason: 'not enough cash', price };
    this.owned.add(carId);
    this.bought++;
    return { ok: true, price };
  }

  // Cycle the car's paint to the next factory colour. The mesh body and
  // nose share the car's paint material, so recolouring any material that
  // currently matches the car's colour repaints the whole shell.
  repaint(car) {
    if (!car || !car.mesh) return null;
    const next = ((this.paintIdx[car.def.id] ?? PAINTS.indexOf(car.def.color)) + 1) % PAINTS.length;
    this.paintIdx[car.def.id] = next;
    const colour = PAINTS[next];
    car.mesh.traverse((m) => {
      if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === car.def.color) {
        m.material = m.material.clone();
        m.material.color.setHex(colour);
      }
    });
    car.def = { ...car.def, color: colour };
    this.repaints++;
    return colour;
  }

  serialize() {
    return { owned: [...this.owned], paintIdx: { ...this.paintIdx }, bought: this.bought, repaints: this.repaints, repairsPaid: this.repairsPaid };
  }
  restore(s) {
    if (!s) return;
    if (Array.isArray(s.owned)) this.owned = new Set(s.owned.filter((id) => BUY_PRICES[id] !== undefined));
    if (s.paintIdx) this.paintIdx = { ...s.paintIdx };
    if (typeof s.bought === 'number') this.bought = s.bought;
    if (typeof s.repaints === 'number') this.repaints = s.repaints;
    if (typeof s.repairsPaid === 'number') this.repairsPaid = s.repairsPaid;
  }
}
