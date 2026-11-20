// Vice Point — the procedural city. One seeded generator builds the whole
// of Vice Point the same way every run: a 6x6 grid of blocks with around a
// hundred low-poly buildings, 48 palm trees, neon signs, a beach, a pier and
// the sea. Nothing here is loaded from a file; the windows, road markings,
// neon, concrete, sand, sea and sidewalks are all drawn on canvas textures
// at build time — no surface in the city is a flat slab of colour.

import * as THREE from 'three';

// --- deterministic randomness: the city is identical on every load ---
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED = 20261121;
export const GRID = 6;
export const BLOCK = 36;
export const STREET = 14;
export const PITCH = BLOCK + STREET; // 50
export const CITY_MIN = -150;
export const CITY_MAX = 150;
export const BEACH_Z = 150;
export const SEA_Z = 200;

// Block centre coordinates: -125, -75, -25, 25, 75, 125.
export function blockCenter(i) {
  return -125 + PITCH * i;
}

const PALETTE = [
  0xf2c9a0, 0xe88f7a, 0x7fc4c9, 0xf6ead2, 0x9db8e8, 0xc9a8d8,
  0xa8d5a2, 0xe8d28a, 0xd98a9e, 0x8fb8a8, 0xf0b48a, 0xb8c4d8,
];

function makeWindowTexture(rand) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#d7dce0';
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 8; col++) {
      const lit = rand() < 0.24;
      g.fillStyle = lit ? (rand() < 0.5 ? '#ffd166' : '#9fd8ff') : '#232a33';
      g.fillRect(8 + col * 15, 8 + row * 15, 10, 11);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#33363b';
  g.fillRect(0, 0, 64, 256);
  // Asphalt grain: speckles so the road is never a flat slab of colour.
  for (let i = 0; i < 700; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    g.fillRect(Math.random() * 64, Math.random() * 256, 1.4, 1.4);
  }
  // A hairline crack or two per tile.
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1;
  for (let c = 0; c < 2; c++) {
    g.beginPath();
    let x = Math.random() * 64;
    let y = Math.random() * 256;
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      x += (Math.random() - 0.5) * 14;
      y += Math.random() * 22;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = '#c9a13b';
  g.fillRect(30, 16, 4, 48);
  g.fillRect(30, 144, 4, 48);
  g.fillStyle = '#e8e8e8';
  g.fillRect(2, 0, 2, 256);
  g.fillRect(60, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Concrete base for the whole city: grey with grain and faint cracks.
function makeGroundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#8f9296';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
  }
  g.strokeStyle = 'rgba(0,0,0,0.16)';
  g.lineWidth = 1;
  for (let c = 0; c < 5; c++) {
    g.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 40;
      y += (Math.random() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 28);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Beach sand: warm base, speckles, the odd shell fleck.
function makeSandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#e8d5a3';
  g.fillRect(0, 0, 256, 256);
  const dots = ['#d9c48f', '#f4e8c0', '#c9b078', '#e2d09a'];
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = dots[Math.floor(Math.random() * dots.length)];
    g.globalAlpha = 0.35 + Math.random() * 0.4;
    const r = 0.8 + Math.random() * 1.6;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Sea: deep blue with pale wave streaks running along the shore.
function makeSeaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#1e7fa8';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(120,200,230,0.12)';
    g.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * 256;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) {
      g.lineTo(x, y + Math.sin(x * 0.05 + i) * 4 + (Math.random() - 0.5) * 3);
    }
    g.stroke();
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Sidewalk pavers: a grid of slabs with grain, instead of flat beige.
function makeSidewalkTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#b9b3a4';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
    g.fillRect(Math.random() * 128, Math.random() * 128, 1.5, 1.5);
  }
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(i * 32, 0);
    g.lineTo(i * 32, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * 32);
    g.lineTo(128, i * 32);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeNeonTexture(word, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 512, 160);
  g.font = '900 96px "Trebuchet MS", Verdana, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 34;
  g.fillStyle = color;
  g.fillText(word, 256, 82);
  g.shadowBlur = 10;
  g.fillStyle = '#ffffff';
  g.fillText(word, 256, 82);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addNeon(scene, word, color, x, y, z, yaw, scale = 1) {
  const group = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(13 * scale, 4 * scale, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x14181f }),
  );
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(12.6 * scale, 3.9 * scale),
    new THREE.MeshBasicMaterial({ map: makeNeonTexture(word, color), transparent: true, side: THREE.DoubleSide }),
  );
  face.position.z = 0.3;
  group.add(back);
  group.add(face);
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  scene.add(group);
  return group;
}

// Builds the city into `scene`. Returns the data the game loop needs:
// building colliders (AABBs), drivable-car spots, the spawn point and the
// mission marker spots.
export function buildCity(scene) {
  const rand = mulberry32(SEED);
  const colliders = [];
  const buildings = [];

  scene.background = new THREE.Color(0x87b5d9);
  scene.fog = new THREE.Fog(0x9fc5e8, 230, 760);

  const sun = new THREE.DirectionalLight(0xfff2d8, 1.25);
  sun.position.set(140, 200, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7f6a, 0.6));

  // --- ground: concrete base, roads, sidewalks ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  const roadTex = makeRoadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const streetLines = [-100, -50, 0, 50, 100];
  for (const c of streetLines) {
    for (const vertical of [true, false]) {
      const tex = roadTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1, 10);
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(STREET, 330),
        new THREE.MeshLambertMaterial({ map: tex }),
      );
      road.name = 'road';
      road.rotation.x = -Math.PI / 2;
      if (!vertical) road.rotation.z = Math.PI / 2;
      road.position.set(vertical ? c : 0, 0.02, vertical ? 0 : c);
      road.receiveShadow = true;
      scene.add(road);
    }
  }
  // Perimeter ring road.
  const ringMat = new THREE.MeshLambertMaterial({ color: 0x33363b });
  const ringN = new THREE.Mesh(new THREE.PlaneGeometry(330, 12), ringMat);
  ringN.rotation.x = -Math.PI / 2;
  ringN.position.set(0, 0.02, -156);
  scene.add(ringN);
  const ringS = ringN.clone();
  ringS.position.z = 156;
  scene.add(ringS);
  const ringW = new THREE.Mesh(new THREE.PlaneGeometry(12, 330), ringMat);
  ringW.rotation.x = -Math.PI / 2;
  ringW.position.set(-156, 0.02, 0);
  scene.add(ringW);
  const ringE = ringW.clone();
  ringE.position.x = 156;
  scene.add(ringE);

  // --- beach + sea ---
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 52),
    new THREE.MeshLambertMaterial({ map: makeSandTexture() }),
  );
  sand.name = 'sand';
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, 178);
  sand.receiveShadow = true;
  scene.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 340),
    new THREE.MeshLambertMaterial({ map: makeSeaTexture(), transparent: true, opacity: 0.94 }),
  );
  sea.name = 'sea';
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.01, 374);
  scene.add(sea);
  const foam = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 2.5),
    new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.75 }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.set(0, 0.05, 203);
  scene.add(foam);

  // --- pier: planks flush with the sand so Ray can walk out on it ---
  const pierDeck = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.3, 74),
    new THREE.MeshLambertMaterial({ color: 0x8a6a44 }),
  );
  pierDeck.position.set(0, 0.15, 228);
  pierDeck.castShadow = true;
  pierDeck.receiveShadow = true;
  scene.add(pierDeck);
  const postGeo = new THREE.CylinderGeometry(0.4, 0.4, 3, 6);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x5d4630 });
  for (const dz of [198, 214, 230, 246, 260]) {
    for (const dx of [-6.5, 6.5]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(dx, 0.4, dz);
      scene.add(post);
    }
  }

  // --- sidewalks + buildings, block by block ---
  const windowTex = makeWindowTexture(rand);
  const sidewalkMat = new THREE.MeshLambertMaterial({ map: makeSidewalkTexture() });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  let buildingCount = 0;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const cx = blockCenter(i);
      const cz = blockCenter(j);
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK + 4, BLOCK + 4), sidewalkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(cx, 0.04, cz);
      walk.receiveShadow = true;
      scene.add(walk);

      // 2-4 buildings per block, in 2x2 slots, so ~100 in total.
      const slots = [[-9, -9], [9, -9], [-9, 9], [9, 9]];
      const n = 2 + Math.floor(rand() * 3);
      for (let s = 0; s < n; s++) {
        const slot = slots.splice(Math.floor(rand() * slots.length), 1)[0];
        const w = 11 + rand() * 6;
        const d = 11 + rand() * 6;
        const distCenter = Math.hypot(cx, cz) / 180;
        const h = 8 + Math.pow(rand(), 1.6) * 52 * (1.25 - distCenter * 0.55);
        const geo = boxGeo.clone();
        const uv = geo.attributes.uv;
        for (let u = 0; u < uv.count; u++) {
          uv.setXY(u, uv.getX(u) * (w / 7), uv.getY(u) * (h / 7));
        }
        const color = PALETTE[Math.floor(rand() * PALETTE.length)];
        const mat = new THREE.MeshLambertMaterial({ map: windowTex, color });
        const b = new THREE.Mesh(geo, mat);
        b.scale.set(w, h, d);
        const bx = cx + slot[0] + (rand() - 0.5) * 2;
        const bz = cz + slot[1] + (rand() - 0.5) * 2;
        b.position.set(bx, h / 2, bz);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
        buildings.push({ x: bx, z: bz, w, d, h });
        buildingCount++;
        // Rooftop clutter: AC box or antenna.
        if (rand() < 0.35) {
          const ac = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 1.1, 2.4),
            new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }),
          );
          ac.position.set(bx + (rand() - 0.5) * w * 0.4, h + 0.55, bz + (rand() - 0.5) * d * 0.4);
          ac.castShadow = true;
          scene.add(ac);
        } else if (rand() < 0.2) {
          const ant = new THREE.Mesh(
            new THREE.CylinderGeometry(0.08, 0.12, 6, 5),
            new THREE.MeshLambertMaterial({ color: 0x555a60 }),
          );
          ant.position.set(bx, h + 3, bz);
          scene.add(ant);
        }
      }
    }
  }

  // --- palm trees: 48, along the beach and the sidewalks ---
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondGeo = new THREE.BoxGeometry(0.55, 0.07, 2.6);
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const nutGeo = new THREE.SphereGeometry(0.28, 6, 5);
  const nutMat = new THREE.MeshLambertMaterial({ color: 0x6b4a26 });
  const palmSpots = [];
  for (let k = 0; k < 20; k++) palmSpots.push([-140 + k * 14.5 + (rand() - 0.5) * 4, 168 + rand() * 22]);
  for (let k = 0; k < 28; k++) {
    const cx = blockCenter(Math.floor(rand() * GRID));
    const cz = blockCenter(Math.floor(rand() * GRID));
    palmSpots.push([cx + (rand() < 0.5 ? -20 : 20), cz + (rand() - 0.5) * 34]);
  }
  for (const [px, pz] of palmSpots) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3;
    trunk.castShadow = true;
    palm.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(frondGeo, frondMat);
      const a = (f / 5) * Math.PI * 2 + rand() * 0.4;
      frond.position.set(Math.sin(a) * 0.9, 6.1, Math.cos(a) * 0.9);
      frond.rotation.y = a;
      frond.rotation.x = -0.5;
      frond.castShadow = true;
      palm.add(frond);
    }
    for (let c = 0; c < 3; c++) {
      const nut = new THREE.Mesh(nutGeo, nutMat);
      nut.position.set((rand() - 0.5) * 0.8, 5.8, (rand() - 0.5) * 0.8);
      palm.add(nut);
    }
    palm.position.set(px, 0, pz);
    palm.rotation.y = rand() * Math.PI * 2;
    palm.scale.setScalar(0.9 + rand() * 0.35);
    scene.add(palm);
  }

  // --- neon signs, pinned to real building faces so none of them floats ---
  // VICE goes on the tallest building of the city's southernmost row's
  // FRONT rank (z in 130..150), facing the beach: nothing stands south of
  // that rank, so the sightline from the sand is clear. It sits low so the
  // chase camera (which looks down) keeps it inside the frame.
  const tallestDowntown = buildings
    .filter((b) => Math.abs(b.x) <= 25 && b.z >= 130 && b.z <= 150)
    .sort((a, b) => b.h - a.h)[0];
  addNeon(scene, 'VICE', '#ff5da2', tallestDowntown.x, Math.min(tallestDowntown.h * 0.35, 6),
    tallestDowntown.z + tallestDowntown.d / 2 + 0.4, 0, 1.0);
  const tallestWest = buildings
    .filter((b) => b.x < -60 && b.h >= 12)
    .sort((a, b) => b.h - a.h)[0];
  addNeon(scene, 'TACOS', '#ffd166', tallestWest.x + tallestWest.w / 2 + 0.4,
    Math.min(tallestWest.h * 0.5, 16), tallestWest.z, Math.PI / 2, 0.9);
  const tallestEast = buildings
    .filter((b) => b.x > 60 && b.h >= 12)
    .sort((a, b) => b.h - a.h)[0];
  addNeon(scene, 'HOTEL', '#37e0c8', tallestEast.x - tallestEast.w / 2 - 0.4,
    Math.min(tallestEast.h * 0.5, 18), tallestEast.z, -Math.PI / 2, 1.1);
  addNeon(scene, 'PIER 9', '#ffd166', 0, 9, 262, Math.PI, 1.0);

  // --- streetlights along the main avenues ---
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c3136 });
  const lampGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const lx of [-100, -50, 0, 50, 100]) {
    for (const lz of [-125, -25, 75]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(lx + 7.5, 3.5, lz);
      pole.castShadow = true;
      scene.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(lx + 7.5, 7.1, lz);
      scene.add(lamp);
    }
  }

  return {
    colliders,
    // Full 3D building boxes, for the chase camera's anti-clip raycast:
    // the 2D colliders alone cannot tell a low roof from a tower.
    buildings,
    buildingCount,
    spawnPoint: { x: 6, z: 96, yaw: Math.PI },
    // Drop-off for the Mara Voss pickup: on the street outside the HOTEL
    // sign's west face, so the marker sits in front of the hotel itself.
    // The face plus 9 m always lands in the street strip between blocks.
    hotelSpot: { x: tallestEast.x - tallestEast.w / 2 - 9, z: tallestEast.z },
    carSpots: [
      { x: 8, z: 60, yaw: Math.PI, color: 0xd83a2e },
      { x: -8, z: -40, yaw: 0, color: 0xf2b705 },
      { x: 58, z: 10, yaw: Math.PI / 2, color: 0x2e8f86 },
      { x: -58, z: 80, yaw: -Math.PI / 2, color: 0xe8e4da },
      { x: 108, z: -60, yaw: 0, color: 0x7a4fd0 },
      { x: -108, z: 20, yaw: Math.PI, color: 0xe8722a },
    ],
    pierSpot: { x: 0, z: 215 },
    downtownSpot: { x: 0, z: 0 },
  };
}
