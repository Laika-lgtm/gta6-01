// The live round minimap: a small canvas in the HUD corner, redrawn every
// frame. Roads are grey lines, the beach is sand, the sea is blue, the
// player is a white arrow, cars are dots, the police Interceptor is red,
// the helicopter is a yellow cross, and the mission marker is a pink star.
import { CITY } from './config.js';

export function createMinimap() {
  const canvas = document.getElementById('minimap-canvas');
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const half = CITY.halfSize + 90;
  const scale = size / (half * 2);

  function toMap(x, z) {
    return [size / 2 + x * scale, size / 2 + z * scale];
  }

  function draw(state) {
    ctx.clearRect(0, 0, size, size);
    // Sea and sand on the east edge.
    ctx.fillStyle = '#0e5a80';
    const [seaX] = toMap(CITY.seaX + 60, 0);
    ctx.fillRect(seaX, 0, size - seaX, size);
    ctx.fillStyle = '#e8d3a2';
    const [sandX] = toMap(CITY.beachX - 10, 0);
    ctx.fillRect(sandX, 0, seaX - sandX, size);
    // City ground.
    ctx.fillStyle = '#3d3a38';
    ctx.fillRect(0, 0, sandX, size);
    // Road grid.
    ctx.strokeStyle = '#6a655e';
    ctx.lineWidth = 4;
    const pitch = CITY.blockSize + CITY.roadWidth;
    const origin = -(CITY.blocks / 2) * pitch + pitch / 2;
    for (let i = 0; i <= CITY.blocks; i += 1) {
      const at = origin - pitch / 2 + i * pitch;
      const [mx] = toMap(at, 0);
      const [, mz] = toMap(0, at);
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, mz);
      ctx.lineTo(size, mz);
      ctx.stroke();
    }
    // Mission marker.
    const [tx, ty] = toMap(state.missionTarget.x, state.missionTarget.z);
    ctx.fillStyle = '#ff4d8d';
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', tx, ty);
    // Cars as pale dots.
    ctx.fillStyle = '#dfe8ff';
    for (const car of state.cars) {
      const [cx, cy] = toMap(car.x, car.z);
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police Interceptor as a red dot, helicopter as a yellow cross.
    if (state.wanted >= 2) {
      const [px, py] = toMap(state.police.x, state.police.z);
      ctx.fillStyle = '#ff2222';
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.wanted >= 4) {
      const [hx, hy] = toMap(state.heli.x, state.heli.z);
      ctx.strokeStyle = '#ffd23e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx - 7, hy);
      ctx.lineTo(hx + 7, hy);
      ctx.moveTo(hx, hy - 7);
      ctx.lineTo(hx, hy + 7);
      ctx.stroke();
    }
    // Player arrow, rotated to the heading.
    const [ux, uy] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(ux, uy);
    ctx.rotate(state.player.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  return { draw };
}
