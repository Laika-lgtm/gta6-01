// Vice Point — procedural island city builder. Lays out a 6x6 block grid on
// the island, raises ~100 low-poly buildings tinted per district, plants 48
// palms along the beachfront and avenues, hangs glowing neon signs (VICE,
// TACOS, HOTEL, PIER 9), and builds the pier, the runway and the sea. Returns
// the axis-aligned colliders the walker and cars use, plus a district lookup.
import * as THREE from 'three';
import { CITY_SEED, CITY_HALF, DISTRICTS, districtAt, makeRng } from './config.js';

function neonTexture(word, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 160);
  g.font = 'bold 92px Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = fg; g.shadowBlur = 34;
  g.fillStyle = fg;
  g.fillText(word, 256, 84);
  g.shadowBlur = 8;
  g.fillStyle = '#ffffff';
  g.fillText(word, 256, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  const rng = makeRng(base.length * 977 + 11);
  for (let y = 12; y < 244; y += 22) {
    for (let x = 10; x < 118; x += 26) {
      g.fillStyle = rng() < 0.45 ? lit : '#20242e';
      g.fillRect(x, y, 16, 13);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildCity(scene) {
  const rng = makeRng(CITY_SEED);
  const colliders = [];
  const box = (w, h, d, color, x, y, z, opts = {}) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color, ...(opts.emissive ? { emissive: opts.emissive } : {}) }),
    );
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    scene.add(m);
    return m;
  };

  // Sun, sky and sea.
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 320, 900);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.position.set(180, 260, 120);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshLambertMaterial({ color: 0x1d7fa8 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.4;
  scene.add(sea);

  // Island ground + sand rim on the south edge.
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_HALF * 2 + 40, 2, CITY_HALF * 2 + 40),
    new THREE.MeshLambertMaterial({ color: 0x9aa08e }),
  );
  ground.position.y = -1;
  scene.add(ground);
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(CITY_HALF * 2 + 40, 1.2, 70),
    new THREE.MeshLambertMaterial({ color: 0xe8c98a }),
  );
  sand.position.set(0, -0.6, CITY_HALF - 10);
  scene.add(sand);

  // Roads: a 6x6 grid of dark strips with pale dashes.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x3a3f46 });
  const dashMat = new THREE.MeshLambertMaterial({ color: 0xd8d2a0 });
  const gridLines = [-250, -150, -50, 50, 150, 250];
  for (const v of gridLines) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(CITY_HALF * 2, 12), roadMat);
    h.rotation.x = -Math.PI / 2; h.position.set(0, 0.05, v); scene.add(h);
    const vv = new THREE.Mesh(new THREE.PlaneGeometry(12, CITY_HALF * 2), roadMat);
    vv.rotation.x = -Math.PI / 2; vv.position.set(v, 0.05, 0); scene.add(vv);
    for (let d = -280; d < 290; d += 24) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.7), dashMat);
      dash.rotation.x = -Math.PI / 2; dash.position.set(d, 0.08, v); scene.add(dash);
      const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 5), dashMat);
      dash2.rotation.x = -Math.PI / 2; dash2.position.set(v, 0.08, d); scene.add(dash2);
    }
  }

  // Buildings: one per block cell, jittered, height by district character.
  const facadeCache = new Map();
  const facadeFor = (dist) => {
    const key = dist.id;
    if (!facadeCache.has(key)) {
      const base = '#' + new THREE.Color(dist.color).getHexString();
      const tex = windowTexture(base, '#ffd98a');
      tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 1);
      facadeCache.set(key, tex);
    }
    return facadeCache.get(key);
  };
  let built = 0;
  for (let gx = -2; gx <= 2; gx++) {
    for (let gz = -2; gz <= 2; gz++) {
      const cx = gx * 100 + (rng() - 0.5) * 18;
      const cz = gz * 100 + (rng() - 0.5) * 18;
      const dist = districtAt(cx, cz);
      const tall = dist.id === 'neon' || dist.id === 'hills';
      const h = tall ? 26 + rng() * 46 : 10 + rng() * 22;
      const w = 26 + rng() * 14;
      const d = 26 + rng() * 14;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ map: facadeFor(dist) }),
      );
      mesh.position.set(cx, h / 2, cz);
      scene.add(mesh);
      colliders.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2 });
      built++;
      // Rooftop box on taller towers, plus a second smaller block on some lots.
      if (h > 40) box(8, 6, 8, 0x666e78, cx + w / 4, h + 3, cz - d / 4);
      if (rng() < 0.45) {
        const w2 = 14 + rng() * 10, h2 = 6 + rng() * 9, d2 = 14 + rng() * 10;
        const x2 = cx + (rng() < 0.5 ? -1 : 1) * (w / 2 + w2 / 2 + 6);
        const z2 = cz + (rng() - 0.5) * 30;
        const m2 = new THREE.Mesh(
          new THREE.BoxGeometry(w2, h2, d2),
          new THREE.MeshLambertMaterial({ map: facadeFor(dist) }),
        );
        m2.position.set(x2, h2 / 2, z2);
        scene.add(m2);
        colliders.push({ x0: x2 - w2 / 2, z0: z2 - d2 / 2, x1: x2 + w2 / 2, z1: z2 + d2 / 2 });
        built++;
      }
    }
  }
  // Fill the remaining lots so the count lands near one hundred.
  while (built < 100) {
    const x = (rng() * 2 - 1) * 280;
    const z = (rng() * 2 - 1) * 280;
    if (Math.abs(x % 100) < 22 || Math.abs(z % 100) < 22) continue;
    const dist = districtAt(x, z);
    const w = 16 + rng() * 12, h = 8 + rng() * 16, d = 16 + rng() * 12;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ map: facadeFor(dist) }),
    );
    m.position.set(x, h / 2, z);
    scene.add(m);
    colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
    built++;
  }

  // Neon signs on the Strip.
  const signs = [
    { word: 'VICE', fg: '#ff2fb3', bg: '#1a0b2e', x: -60, y: 30, z: -58, ry: 0 },
    { word: 'TACOS', fg: '#ffe14d', bg: '#3d1a05', x: 30, y: 18, z: -20, ry: Math.PI / 2 },
    { word: 'HOTEL', fg: '#7fe3ff', bg: '#0b2233', x: -20, y: 42, z: 20, ry: Math.PI },
    { word: 'PIER 9', fg: '#2fd4ff', bg: '#08222e', x: 40, y: 10, z: 268, ry: Math.PI },
  ];
  for (const s of signs) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 9.4),
      new THREE.MeshBasicMaterial({ map: neonTexture(s.word, s.fg, s.bg) }),
    );
    panel.position.set(s.x, s.y, s.z);
    panel.rotation.y = s.ry;
    scene.add(panel);
    const glow = new THREE.PointLight(new THREE.Color(s.fg), 60, 90);
    glow.position.set(s.x, s.y, s.z + 6);
    scene.add(glow);
  }

  // The pier: planks out over the water at the south edge.
  for (let i = 0; i < 14; i++) {
    box(10, 0.8, 6, 0x7a5a38, 40, 0.6, 300 + i * 6);
  }
  box(2, 8, 2, 0x5a4630, 34, 4, 372);
  box(2, 8, 2, 0x5a4630, 46, 4, 372);

  // Airport runway + a parked jet silhouette.
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 190),
    new THREE.MeshLambertMaterial({ color: 0x2c313a }),
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(215, 0.07, 40);
  scene.add(runway);
  for (let z = -40; z < 120; z += 20) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(2, 8), dashMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(215, 0.1, z);
    scene.add(stripe);
  }
  const jet = new THREE.Group();
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 26, 10), new THREE.MeshLambertMaterial({ color: 0xe8ecf2 }));
  fus.rotation.z = Math.PI / 2;
  jet.add(fus);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 22), new THREE.MeshLambertMaterial({ color: 0xc23b8e }));
  jet.add(wing);
  jet.position.set(255, 3, 60);
  jet.rotation.y = 0.4;
  scene.add(jet);

  // Docks cranes + containers.
  for (let i = 0; i < 3; i++) {
    const cx = -260 + i * 60;
    box(4, 42, 4, 0xd86a2a, cx, 21, -260);
    box(30, 4, 4, 0xd86a2a, cx + 12, 40, -260);
    box(6, 6, 3, 0x333a44, cx + 24, 36, -260);
  }
  const contColors = [0xc23b3b, 0x2f7fc2, 0x3ba65a, 0xd8a02a];
  for (let i = 0; i < 12; i++) {
    box(12, 3.4, 3.4, contColors[i % 4], -270 + (i % 4) * 16, 1.7 + Math.floor(i / 4) * 3.6, -200 + Math.floor(i / 4) * 8);
  }

  // 48 palms: beachfront row + avenue rows.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a42 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e8b4a });
  let palms = 0;
  const palmSpots = [];
  for (let x = -280; x <= 280; x += 40) palmSpots.push([x, 252]);
  for (let x = -260; x <= 260; x += 52) palmSpots.push([x, 96]);
  for (let z = -240; z <= 60; z += 60) palmSpots.push([-282, z]);
  for (let z = -240; z <= 60; z += 60) palmSpots.push([282, z]);
  for (let x = -260; x <= 260; x += 52) palmSpots.push([x, 200]);
  for (const [px, pz] of palmSpots) {
    if (palms >= 48) break;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 9, 7), trunkMat);
    trunk.position.set(px, 4.5, pz);
    trunk.rotation.z = (rng() - 0.5) * 0.16;
    scene.add(trunk);
    for (let l = 0; l < 6; l++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5.5, 4), leafMat);
      const a = (l / 6) * Math.PI * 2;
      leaf.position.set(px + Math.cos(a) * 1.8, 9.6, pz + Math.sin(a) * 1.8);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      scene.add(leaf);
    }
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 5), new THREE.MeshLambertMaterial({ color: 0x6a4a22 }));
    nut.position.set(px, 9.1, pz);
    scene.add(nut);
    palms++;
  }

  // A few benches and street lamps for the beachfront promenade.
  for (let x = -240; x <= 240; x += 60) {
    box(1, 5, 1, 0x2c313a, x, 2.5, 240);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    lamp.position.set(x, 5.4, 240);
    scene.add(lamp);
  }

  return { colliders, buildingCount: built, palmCount: palms };
}
