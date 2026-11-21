// The built city: a 6x6 grid of blocks, about a hundred low-poly buildings
// with lit windows, grid roads with sidewalks and lane paint, 48 palms, and
// neon signs reading VICE, TACOS, HOTEL and PIER 9. Colliders are simple
// axis-aligned boxes so the player and cars can be kept out of walls.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { createRandom, pick, range } from './random.js';

const NEON_TEXTS = [
  { text: 'VICE', color: PALETTE.neonPink, size: 7 },
  { text: 'TACOS', color: PALETTE.neonYellow, size: 6 },
  { text: 'HOTEL', color: PALETTE.neonCyan, size: 6 },
  { text: 'PIER 9', color: PALETTE.neonGreen, size: 6 },
];

function neonTexture(text, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, 512, 128);
  const css = `#${colorHex.toString(16).padStart(6, '0')}`;
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = css;
  ctx.shadowBlur = 26;
  ctx.fillStyle = css;
  ctx.fillText(text, 256, 66);
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCity(scene) {
  const random = createRandom(CITY.seed);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  const pitch = CITY.blockSize + CITY.roadWidth;
  const origin = -(CITY.blocks / 2) * pitch + pitch / 2;

  // Roads: dark strips along every grid line, plus sidewalk slabs and
  // dashed centre lines so the grid reads as streets from above and below.
  const roadMat = new THREE.MeshStandardMaterial({ color: PALETTE.road, roughness: 0.95 });
  const walkMat = new THREE.MeshStandardMaterial({ color: PALETTE.sidewalk, roughness: 1 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf0e0a0 });
  const span = CITY.blocks * pitch + CITY.roadWidth;
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const at = origin - pitch / 2 + i * pitch - CITY.roadWidth / 2;
    const roadV = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, span), roadMat);
    roadV.rotation.x = -Math.PI / 2;
    roadV.position.set(at + CITY.roadWidth / 2, 0.06, 0);
    roadV.receiveShadow = true;
    group.add(roadV);
    const roadH = new THREE.Mesh(new THREE.PlaneGeometry(span, CITY.roadWidth), roadMat);
    roadH.rotation.x = -Math.PI / 2;
    roadH.position.set(0, 0.06, at + CITY.roadWidth / 2);
    roadH.receiveShadow = true;
    group.add(roadH);
    for (let d = -span / 2 + 6; d < span / 2; d += 12) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 4), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(at + CITY.roadWidth / 2, 0.09, d);
      group.add(dash);
    }
  }

  // Buildings: one or two per block, varied heights, flat roofs with a
  // parapet, window grids on the faces, and a neon sign on some rooftops.
  const windowMat = new THREE.MeshStandardMaterial({ color: PALETTE.glass, roughness: 0.3, metalness: 0.4, emissive: 0x223344, emissiveIntensity: 0.5 });
  const litMat = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffc860, emissiveIntensity: 1.4 });
  let built = 0;
  let neonIndex = 0;
  const neonLights = [];
  for (let bx = 0; bx < CITY.blocks && built < CITY.buildingCount; bx += 1) {
    for (let bz = 0; bz < CITY.blocks && built < CITY.buildingCount; bz += 1) {
      const cx = origin + bx * pitch;
      const cz = origin + bz * pitch;
      const lots = random() < 0.45 ? 2 : 1;
      for (let lot = 0; lot < lots && built < CITY.buildingCount; lot += 1) {
        const w = range(random, 16, 26);
        const d = range(random, 16, 26);
        const h = range(random, 9, 42);
        const ox = lots === 2 ? (lot === 0 ? -14 : 14) : 0;
        const oz = lots === 2 ? (lot === 0 ? -14 : 14) : 0;
        const x = cx + ox;
        const z = cz + oz;
        const paint = pick(random, PALETTE.building);
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          new THREE.MeshStandardMaterial({ color: paint, roughness: 0.85 }),
        );
        body.position.set(x, h / 2, z);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w + 1, 1, d + 1),
          new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 1 }),
        );
        roof.position.set(x, h + 0.5, z);
        group.add(roof);
        // Window grid on the two street-facing sides.
        const floors = Math.max(1, Math.floor(h / 4));
        const cols = Math.max(2, Math.floor(w / 5));
        for (let f = 0; f < floors; f += 1) {
          for (let c = 0; c < cols; c += 1) {
            const lit = random() < 0.35;
            const win = new THREE.Mesh(
              new THREE.PlaneGeometry(1.8, 2.2),
              lit ? litMat : windowMat,
            );
            win.position.set(x - w / 2 + 3 + c * ((w - 6) / Math.max(1, cols - 1)), 3 + f * 4, z + d / 2 + 0.06);
            group.add(win);
          }
        }
        // A neon sign on roughly every eighth building.
        if (built % 8 === 3) {
          const spec = NEON_TEXTS[neonIndex % NEON_TEXTS.length];
          neonIndex += 1;
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(spec.size * 1.9, spec.size * 0.48),
            new THREE.MeshBasicMaterial({ map: neonTexture(spec.text, spec.color) }),
          );
          sign.position.set(x, h + 3.4, z + d / 2 + 0.2);
          group.add(sign);
          const glow = new THREE.PointLight(spec.color, 30, 34, 1.8);
          glow.position.set(x, h + 3, z + d / 2 + 4);
          group.add(glow);
          neonLights.push(glow);
        }
        // Colliders carry their height too, so the camera can be kept out
        // of the buildings as well as the player and the cars.
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: 0, maxY: h });
        built += 1;
      }
      // Sidewalk slab for the block.
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(CITY.blockSize, CITY.blockSize), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(cx, 0.04, cz);
      walk.receiveShadow = true;
      group.add(walk);
    }
  }

  // Palms along the sidewalks and the beachfront, trunks leaning slightly.
  const trunkMat = new THREE.MeshStandardMaterial({ color: PALETTE.palmTrunk, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: PALETTE.palmLeaf, roughness: 0.9 });
  for (let i = 0; i < CITY.palmCount; i += 1) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 7, 7), trunkMat);
    trunk.position.y = 3.5;
    trunk.rotation.z = range(random, -0.08, 0.08);
    trunk.castShadow = true;
    palm.add(trunk);
    for (let f = 0; f < 6; f += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.4, 4), leafMat);
      const angle = (f / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(angle) * 1.6, 7.2, Math.sin(angle) * 1.6);
      leaf.rotation.z = Math.cos(angle) * 1.1;
      leaf.rotation.x = -Math.sin(angle) * 1.1;
      leaf.castShadow = true;
      palm.add(leaf);
    }
    let px;
    let pz;
    if (i % 3 === 0) {
      px = CITY.beachX - 6 + range(random, -2, 2);
      pz = range(random, -CITY.halfSize, CITY.halfSize);
    } else {
      px = origin + Math.floor(random() * CITY.blocks) * pitch + range(random, -30, 30);
      pz = origin + Math.floor(random() * CITY.blocks) * pitch + range(random, -30, 30);
    }
    palm.position.set(px, 0, pz);
    group.add(palm);
  }

  // Street lamps: warm pools of light down the main avenues.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.6 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let i = 0; i < 18; i += 1) {
    const lamp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 6.5, 6), lampMat);
    pole.position.y = 3.25;
    lamp.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), bulbMat);
    bulb.position.y = 6.6;
    lamp.add(bulb);
    const light = new THREE.PointLight(0xffd9a0, 12, 22, 1.8);
    light.position.y = 6.4;
    lamp.add(light);
    lamp.position.set(origin + (i % 6) * pitch, 0, origin + Math.floor(i / 6) * pitch * 2 - 40);
    group.add(lamp);
  }

  // A freestanding VICE pylon sign on Coral Way, facing west down the
  // avenue, so the chase route always has neon in frame.
  const pylon = new THREE.Group();
  const pylonPole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 12, 8), lampMat);
  pylonPole.position.y = 6;
  pylonPole.castShadow = true;
  pylon.add(pylonPole);
  const pylonSign = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 3.2),
    new THREE.MeshBasicMaterial({ map: neonTexture('VICE', PALETTE.neonPink) }),
  );
  pylonSign.position.y = 14;
  pylonSign.rotation.y = -Math.PI / 2;
  pylon.add(pylonSign);
  const pylonBack = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 3.2),
    new THREE.MeshBasicMaterial({ map: neonTexture('VICE', PALETTE.neonPink) }),
  );
  pylonBack.position.y = 14;
  pylonBack.rotation.y = Math.PI / 2;
  pylon.add(pylonBack);
  const pylonGlow = new THREE.PointLight(PALETTE.neonPink, 40, 40, 1.8);
  pylonGlow.position.y = 14;
  pylon.add(pylonGlow);
  pylon.position.set(10, 0, 40);
  group.add(pylon);
  neonLights.push(pylonGlow);

  function update(time) {
    // Neon signs breathe: a slow pulse so the signs feel alive, not painted.
    for (let i = 0; i < neonLights.length; i += 1) {
      neonLights[i].intensity = 24 + Math.sin(time * 2.4 + i * 1.7) * 9;
    }
  }

  return { colliders, buildingCount: built, update };
}
