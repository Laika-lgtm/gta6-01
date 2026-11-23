// Vice Point — crew, stage 4. Three specialists Ray recruits across Act 2,
// each with a real, measurable gameplay effect — not a cosmetic badge.
// Dara drives: the heat bleeds off twice as fast while she rides along.
// Kiko hacks: once per mission she can black out the PD for 20 seconds.
// Bima wrenches: crash damage is halved, and he can patch the car up to
// full on the spot. Only recruited crew can be picked, and only one rides
// shotgun at a time (C cycles).
export const CREW_DEFS = [
  { id: 'dara', name: 'Dara', role: 'Driver', perk: 'Wanted cools 2x faster', mission: 4 },
  { id: 'kiko', name: 'Kiko', role: 'Hacker', perk: 'K: black out the PD for 20s, once per mission', mission: 5 },
  { id: 'bima', name: 'Bima', role: 'Mechanic', perk: 'Crash damage halved · B: instant repair', mission: 6 },
];

export class Crew {
  constructor() {
    this.recruited = { dara: false, kiko: false, bima: false };
    this.active = null; // id of the riding crew member, or null
    this.jamLeft = 0; // seconds of PD blackout remaining
    this.jamUsedStage = -1; // mission stage the jam was spent on
    this.jamsUsed = 0;
    this.repairs = 0;
  }

  recruit(id) {
    if (!this.recruited[id]) {
      this.recruited[id] = true;
      if (!this.active) this.active = id;
      return true;
    }
    return false;
  }

  get recruitedList() { return CREW_DEFS.filter((c) => this.recruited[c.id]); }
  get activeDef() { return CREW_DEFS.find((c) => c.id === this.active) || null; }

  select(id) {
    if (id && !this.recruited[id]) return false;
    this.active = id || null;
    return true;
  }

  // C cycles: none -> first recruited -> next recruited -> none.
  cycle() {
    const list = this.recruitedList;
    if (list.length === 0) return null;
    if (!this.active) { this.active = list[0].id; return this.activeDef; }
    const i = list.findIndex((c) => c.id === this.active);
    if (i < 0 || i === list.length - 1) { this.active = null; return null; }
    this.active = list[i + 1].id;
    return this.activeDef;
  }

  // Dara: wanted update runs on double time.
  wantedDtMult() { return this.active === 'dara' ? 2 : 1; }

  // Kiko: one blackout per mission stage.
  jamReady(stage) {
    return this.active === 'kiko' && this.jamLeft <= 0 && this.jamUsedStage !== stage;
  }
  useJam(stage) {
    if (!this.jamReady(stage)) return false;
    this.jamLeft = 20;
    this.jamUsedStage = stage;
    this.jamsUsed++;
    return true;
  }
  get jamming() { return this.jamLeft > 0; }

  // Bima: crash damage multiplier.
  damageMult() { return this.active === 'bima' ? 0.5 : 1; }
  get bimaActive() { return this.active === 'bima'; }

  update(dt) {
    if (this.jamLeft > 0) this.jamLeft = Math.max(0, this.jamLeft - dt);
  }

  label() {
    if (!this.activeDef) return 'Crew: none (C to pick)';
    const d = this.activeDef;
    return `Crew: ${d.name} — ${d.role} · ${d.perk}`;
  }

  serialize() {
    return { recruited: { ...this.recruited }, active: this.active, jamsUsed: this.jamsUsed, repairs: this.repairs };
  }
  restore(s) {
    if (!s) return;
    if (s.recruited) for (const k of Object.keys(this.recruited)) this.recruited[k] = !!s.recruited[k];
    if (typeof s.active === 'string' || s.active === null) this.active = this.recruited[s.active] ? s.active : null;
    if (typeof s.jamsUsed === 'number') this.jamsUsed = s.jamsUsed;
    if (typeof s.repairs === 'number') this.repairs = s.repairs;
  }
}
