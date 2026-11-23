// Vice Point — close combat. F throws a punch: half a second of cooldown,
// a two-metre reach in front of Ray, a swing of the arm and a thud. It
// lands on pedestrians and on police cruisers pulled up close — and
// hitting either one is a crime, so the heat goes up with the fist.
export class Combat {
  constructor(sounds) {
    this.sounds = sounds;
    this.cooldown = 0;
    this.swing = 0; // 0..1 arm-swing progress for the animation
  }

  get ready() { return this.cooldown <= 0; }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.swing = Math.max(0, this.swing - dt * 3.2);
  }

  // Ray's right arm swings with the punch; the walker reads this.
  armAngle() {
    if (this.swing <= 0) return 0;
    return -Math.sin(this.swing * Math.PI) * 1.5;
  }

  // Try a punch. Returns 'ped' | 'police' | 'miss' | 'cooldown'.
  punch(playerPos, yaw, peds, police, onCrime) {
    if (this.cooldown > 0) return 'cooldown';
    this.cooldown = 0.5;
    this.swing = 1;
    if (this.sounds) this.sounds.punch();
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const inFront = (x, z, reach) => {
      const dx = x - playerPos.x, dz = z - playerPos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      return along > 0 && along < reach && side < 1.3;
    };
    if (peds) {
      const ped = peds.nearest(playerPos, 2.6);
      if (ped && inFront(ped.pos.x, ped.pos.z, 2.6)) {
        peds.punchDown(ped);
        if (onCrime) onCrime(1);
        return 'ped';
      }
    }
    if (police) {
      for (const u of police.units) {
        if (inFront(u.pos.x, u.pos.z, 3.0)) {
          if (onCrime) onCrime(1);
          return 'police';
        }
      }
    }
    return 'miss';
  }
}
