// Vice Point — the round live minimap.
// A small canvas clipped to a circle: the city blocks as pale slabs, the
// ocean as blue on the east edge, roads as dark lines, the player as a white
// arrow, cars as dots, the police as a flashing blue-red dot, and the active
// mission as a pulsing yellow diamond. North is up; the view follows the
// player and rotates with nothing — it stays map-north, GTA style.

import { CITY, MISSIONS } from './config.js';

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const half = size / 2;
  const span = CITY.groundSize / 2 + 40; // world units shown across the disc
  const scale = half / span;

  function worldToMap(x, z) {
    return [half + x * scale, half + z * scale];
  }

  function draw(state, time) {
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.clip();

    // Ocean (east) and city floor.
    ctx.fillStyle = '#1e7fa8';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(0, 0, size, size);

    // Beach strip.
    const beachX = half + CITY.oceanEdge * scale;
    ctx.fillStyle = '#e8cf9e';
    ctx.fillRect(beachX, 0, CITY.beachWidth * scale + 2, size);

    // Buildings as pale blocks.
    ctx.fillStyle = '#c9bfae';
    for (const b of state.buildings) {
      const [bx, bz] = worldToMap(b.x - b.w / 2, b.z - b.d / 2);
      ctx.fillRect(bx, bz, Math.max(2, b.w * scale), Math.max(2, b.d * scale));
    }

    // Mission marker: pulsing yellow diamond.
    const mission = MISSIONS[state.missionIndex];
    if (mission) {
      const [mx, mz] = worldToMap(mission.marker.x, mission.marker.z);
      const pulse = 5 + Math.sin(time * 4) * 2;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(mx, mz - pulse);
      ctx.lineTo(mx + pulse, mz);
      ctx.lineTo(mx, mz + pulse);
      ctx.lineTo(mx - pulse, mz);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7a5b00';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Traffic + street cars as small dots.
    ctx.fillStyle = '#e8e8e8';
    for (const car of state.cars) {
      const [cx, cz] = worldToMap(car.x, car.z);
      ctx.beginPath();
      ctx.arc(cx, cz, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police: flashing blue/red.
    if (state.police) {
      const [px, pz] = worldToMap(state.police.x, state.police.z);
      ctx.fillStyle = Math.floor(time * 4) % 2 === 0 ? '#2e86ff' : '#ff3333';
      ctx.beginPath();
      ctx.arc(px, pz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player: white arrow pointing along the heading.
    const [px, pz] = worldToMap(state.x, state.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
    // Ring border.
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  return { draw };
}
