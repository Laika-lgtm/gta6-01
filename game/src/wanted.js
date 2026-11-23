// Vice Point — the wanted system. Heat comes in stars, 0 to 5: crimes add
// it, calm takes it away. Cooling off is deliberately slow — one star per
// 25 seconds of quiet — and hiding from the law only doubles that pace, so
// a hot escape still has to be earned. The level itself never lies: the HUD
// reads it straight from here.
export class Wanted {
  constructor(onChange) {
    this.stars = 0;
    this.calmFor = 0;   // seconds since the last crime
    this.coolTimer = 0; // accumulates toward losing one star
    this.hidden = false;
    this.onChange = onChange || null;
  }

  get level() { return this.stars; }

  setLevel(n) {
    const next = Math.max(0, Math.min(5, Math.round(n)));
    if (next !== this.stars) {
      this.stars = next;
      this.calmFor = 0;
      this.coolTimer = 0;
      if (this.onChange) this.onChange(this.stars);
    }
  }

  add(n) {
    if (n <= 0) return;
    this.setLevel(this.stars + n);
  }

  // A crime just happened: the clock restarts and the heat is on.
  commit(n = 1) {
    this.add(n);
    this.calmFor = 0;
    this.coolTimer = 0;
  }

  update(dt, hidden) {
    this.hidden = hidden;
    if (this.stars === 0) { this.calmFor += dt; return; }
    this.calmFor += dt;
    // No fresh crime for a while: stars bleed away, slowly.
    if (this.calmFor < 8) return;
    this.coolTimer += dt;
    const perStar = hidden ? 12 : 25;
    if (this.coolTimer >= perStar) {
      this.coolTimer = 0;
      this.setLevel(this.stars - 1);
    }
  }
}
