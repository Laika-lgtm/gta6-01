// Vice Point — procedural city: buildings, roads, palms, neon signs.
// A 6x6 grid of blocks. Each block holds 1-4 low-poly buildings with pastel
// facades, rooftop boxes and lit windows (emissive canvas texture). Roads run
// between blocks with centre dashes, sidewalks ring each block, palms line
// the avenues, and neon signs glow over the main corners. Every building also
// registers an axis-aligned collider used by walking, driving and the camera.

import * as THREE from 'three';
import { CITY, NEON_SIGNS } from './config.js';
import { createRng, range, rangeInt, pick } from './random.js';
import { makeNeonTexture, makeGroundTexture } from './world.js';

const FACADE_COLORS = [
  0xffd9c0, 0xffc4d6, 0xaee3ff, 0xfff2a8, 0xc8f7c5, 0xf2d8ff,
  0xffe8b3, 0xd6ecff, 0xffb3a7, 0xe6ffe6,
];

const ROOF_COLORS = [0x5a4a3a, 0x3a4a5a, 0x6a5a6a, 0x4a5a4a];

// Four shared window textures: the same warm-lit look, but each variant
// has its own window size, spacing and lit colour, so facades stop reading
// as one repeated stamp. Seeded per variant, so the city is identical on
// every load with the same seed.
function makeWindowTexture(variant) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const rng = createRng(9000 + variant * 131);
  ctx.fillStyle = '#20242e';
  ctx.fillRect(0, 0, 128, 256);
  const litColors = ['#ffd98a', '#ffd98a', '#cfe8ff', '#ffb3c8'];
  const lit = litColors[variant % litColors.length];
  if (variant === 2) {
    // Horizontal strip windows: wide bands, few of them.
    for (let y = 14; y < 244; y += 34) {
      ctx.fillStyle = rng() < 0.6 ? lit : '#2c3442';
      ctx.fillRect(10, y, 108, 16);
    }
  } else if (variant === 3) {
    // Sparse windows, bigger panes.
    for (let y = 16; y < 240; y += 40) {
      for (let x = 14; x < 110; x += 36) {
        ctx.fillStyle = rng() < 0.4 ? lit : '#2c3442';
        ctx.fillRect(x, y, 22, 26);
      }
    }
  } else {
    const stepX = variant === 1 ? 26 : 20;
    const stepY = variant === 1 ? 28 : 22;
    const w = variant === 1 ? 16 : 12;
    const h = variant === 1 ? 18 : 14;
    const chance = variant === 1 ? 0.45 : 0.55;
    for (let y = 12; y < 244; y += stepY) {
      for (let x = 10; x < 118; x += stepX) {
        ctx.fillStyle = rng() < chance ? lit : '#2c3442';
        ctx.fillRect(x, y, w, h);
      }
    }
  }
  return new THREE.CanvasTexture(canvas);
}

// A simple palm: curved trunk segments plus flat fan leaves.
function makePalm() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  let y = 0;
  let lean = 0;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6), trunkMat);
    seg.position.set(lean, y + 0.8, 0);
    seg.rotation.z = -0.06 * i;
    lean += 0.1;
    y += 1.55;
    group.add(seg);
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f9e4f, roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.2), leafMat);
    const a = (i / 7) * Math.PI * 2;
    leaf.position.set(lean + Math.cos(a) * 1.1, y + 0.4, Math.sin(a) * 1.1);
    leaf.rotation.set(Math.sin(a) * 0.9 - 0.4, 0, Math.cos(a) * 0.9 + 0.4);
    leaf.rotation.y = -a;
    group.add(leaf);
  }
  const nuts = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a6a2f, roughness: 1 }),
  );
  nuts.position.set(lean, y + 0.2, 0);
  group.add(nuts);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

export function buildCity(scene, seed) {
  const rng = createRng(seed);
  const colliders = []; // {minX, maxX, minZ, maxZ}
  const buildings = []; // {x, z, w, d, h, color} for the minimap
  const group = new THREE.Group();
  scene.add(group);

  const windowTexs = [makeWindowTexture(0), makeWindowTexture(1), makeWindowTexture(2), makeWindowTexture(3)];
  const half = (CITY.blocksX - 1) / 2;

  // --- Roads: dark asphalt strips BETWEEN blocks, with dashed centre lines -
  // Road centres sit on the grid lines between blocks: -126, -84, -42, 0, 42,
  // 84, 126. Block centres are offset by half a block (21) from those lines,
  // so buildings never stand in a road. Two asphalt materials — one tiled
  // along the strip, one across it — so the speckle reads the same on both
  // orientations instead of stretching into streaks.
  const roadTexV = makeGroundTexture('asphalt');
  roadTexV.repeat.set(2, 24);
  const roadTexH = makeGroundTexture('asphalt');
  roadTexH.repeat.set(24, 2);
  const roadMatV = new THREE.MeshStandardMaterial({ map: roadTexV, roughness: 0.95 });
  const roadMatH = new THREE.MeshStandardMaterial({ map: roadTexH, roughness: 0.95 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf5d76e, roughness: 0.8 });
  const span = CITY.blocksX * CITY.blockSize;
  for (let i = 0; i <= CITY.blocksX; i++) {
    const c = (i - CITY.blocksX / 2) * CITY.blockSize;
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(CITY.roadWidth, span + CITY.roadWidth), roadMatV);
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(c, 0.03, 0);
    vRoad.receiveShadow = true;
    group.add(vRoad);
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(span + CITY.roadWidth, CITY.roadWidth), roadMatH);
    hRoad.rotation.x = -Math.PI / 2;
    hRoad.position.set(0, 0.03, c);
    hRoad.receiveShadow = true;
    group.add(hRoad);
    for (let d = -span / 2; d < span / 2; d += 8) {
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3), dashMat);
      dashV.rotation.x = -Math.PI / 2;
      dashV.position.set(c, 0.05, d);
      group.add(dashV);
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.5), dashMat);
      dashH.rotation.x = -Math.PI / 2;
      dashH.position.set(d, 0.05, c);
      group.add(dashH);
    }
  }

  // --- Sidewalks: pale slabs ringing each block -----------------------------
  // Two tones alternating per block, so the pavement reads as poured slabs
  // rather than one flat sheet.
  const walkMatA = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 1 });
  const walkMatB = new THREE.MeshStandardMaterial({ color: 0xa89e8c, roughness: 1 });
  const blockInner = CITY.blockSize - CITY.roadWidth;
  for (let bx = 0; bx < CITY.blocksX; bx++) {
    for (let bz = 0; bz < CITY.blocksZ; bz++) {
      const cx = (bx - half) * CITY.blockSize;
      const cz = (bz - half) * CITY.blockSize;
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(blockInner, blockInner), (bx + bz) % 2 === 0 ? walkMatA : walkMatB);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(cx, 0.04, cz);
      slab.receiveShadow = true;
      group.add(slab);
    }
  }

  // --- Buildings -------------------------------------------------------------
  let placed = 0;
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let bx = 0; bx < CITY.blocksX && placed < CITY.buildingCount; bx++) {
    for (let bz = 0; bz < CITY.blocksZ && placed < CITY.buildingCount; bz++) {
      const cx = (bx - half) * CITY.blockSize;
      const cz = (bz - half) * CITY.blockSize;
      const count = rangeInt(rng, 2, 3);
      const slots = [[-9, -8], [9, 8], [0, 0]];
      for (let b = 0; b < count && placed < CITY.buildingCount; b++) {
        const w = range(rng, 10, 15);
        const d = range(rng, 10, 15);
        const h = range(rng, 9, 42);
        const ox = slots[b][0] + range(rng, -2, 2);
        const oz = slots[b][1] + range(rng, -2, 2);
        const x = cx + ox;
        const z = cz + oz;
        const color = pick(rng, FACADE_COLORS);
        const variant = rangeInt(rng, 0, 3);
        const mat = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.85,
          emissive: 0xffffff,
          emissiveMap: windowTexs[variant],
          emissiveIntensity: 0.55,
        });
        const mesh = new THREE.Mesh(buildingGeo, mat);
        mesh.scale.set(w, h, d);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        // Rooftop box (AC unit / penthouse).
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.3, 2.2, d * 0.3),
          new THREE.MeshStandardMaterial({ color: pick(rng, ROOF_COLORS), roughness: 1 }),
        );
        roof.position.set(x + w * 0.2, h + 1.1, z - d * 0.15);
        roof.castShadow = true;
        group.add(roof);
        // One building in four gets a rooftop water tank, so the skyline
        // varies in silhouette as well as in windows.
        if (rng() < 0.25) {
          const tank = new THREE.Mesh(
            new THREE.CylinderGeometry(1.4, 1.4, 2.6, 10),
            new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 1 }),
          );
          tank.position.set(x - w * 0.25, h + 1.3, z + d * 0.2);
          tank.castShadow = true;
          group.add(tank);
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        buildings.push({ x, z, w, d, h, color, variant });
        placed++;
      }
    }
  }

  // --- Palms along the avenues ----------------------------------------------
  for (let i = 0; i < CITY.palmCount; i++) {
    const palm = makePalm();
    const along = range(rng, -span / 2, span / 2);
    // Palms line the roads: avenue is a road centre line, offset 9 puts the
    // palm on the sidewalk edge, clear of both road and buildings.
    const avenue = (Math.floor(range(rng, 0, CITY.blocksX + 1)) - CITY.blocksX / 2) * CITY.blockSize;
    const horizontal = rng() < 0.5;
    palm.position.set(
      horizontal ? along : avenue + (rng() < 0.5 ? -1 : 1) * (CITY.roadWidth / 2 + 2),
      0,
      horizontal ? avenue + (rng() < 0.5 ? -1 : 1) * (CITY.roadWidth / 2 + 2) : along,
    );
    palm.rotation.y = rng() * Math.PI * 2;
    const s = range(rng, 0.85, 1.25);
    palm.scale.set(s, s, s);
    group.add(palm);
  }

  // --- Neon signs ------------------------------------------------------------
  const neonMeshes = [];
  for (const sign of NEON_SIGNS) {
    const tex = makeNeonTexture(sign.text, sign.color, 92);
    const aspect = 512 / 160;
    const height = sign.size;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(height * aspect, height),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    mesh.position.set(sign.x, sign.y, sign.z);
    mesh.rotation.y = Math.PI / 4;
    group.add(mesh);
    neonMeshes.push(mesh);
  }

  // --- Pier 9: wooden deck stretching into the sea ---------------------------
  const pierGroup = new THREE.Group();
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 3.4), plankMat);
    plank.position.set(CITY.oceanEdge + CITY.beachWidth + 4 + i * 3.6, 0.8, 96);
    plank.castShadow = true;
    pierGroup.add(plank);
  }
  for (const px of [CITY.oceanEdge + CITY.beachWidth + 6, CITY.oceanEdge + CITY.beachWidth + 52]) {
    for (const pz of [92.5, 99.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3.4, 8), plankMat);
      post.position.set(px, 0.4, pz);
      pierGroup.add(post);
    }
  }
  group.add(pierGroup);

  return { group, colliders, buildings, neonMeshes, span };
}

// Circle (x,z,r) vs building AABBs: push the circle out of any overlap.
// Returns the corrected position. Used by the player, cars and the camera.
export function resolveCircleCollisions(x, z, radius, colliders) {
  let nx = x;
  let nz = z;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(nx, c.maxX));
    const cz = Math.max(c.minZ, Math.min(nz, c.maxZ));
    const dx = nx - cx;
    const dz = nz - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        nx = cx + (dx / dist) * radius;
        nz = cz + (dz / dist) * radius;
      } else {
        // Centre inside the box: shove out along the smallest penetration.
        const pushL = nx - (c.minX - radius);
        const pushR = (c.maxX + radius) - nx;
        const pushT = nz - (c.minZ - radius);
        const pushB = (c.maxZ + radius) - nz;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) nx = c.minX - radius;
        else if (m === pushR) nx = c.maxX + radius;
        else if (m === pushT) nz = c.minZ - radius;
        else nz = c.maxZ + radius;
      }
    }
  }
  return { x: nx, z: nz };
}

// True when the point is inside any building footprint (camera test).
export function pointInsideBuildings(x, z, colliders) {
  for (const c of colliders) {
    if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
  }
  return false;
}
