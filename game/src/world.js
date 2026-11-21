// Vice Point — world assembly: sky, sun, ground, beach and sea.
// Builds the static stage the city sits on: a warm late-afternoon sun, a
// gradient sky dome, a sand beach and an animated ocean plane to the east.
// All textures are procedural canvas textures — no downloaded images.

import * as THREE from 'three';
import { CITY } from './config.js';

// A small canvas texture: asphalt with a faint speckle, or sand with grains.
export function makeGroundTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (kind === 'sand') {
    ctx.fillStyle = '#e8cf9e';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${140 + Math.random() * 60}, ${110 + Math.random() * 40}, 60, 0.25)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  } else {
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  return tex;
}

// A neon sign texture: glowing letters on a dark plate.
export function makeNeonTexture(text, color, sizePx) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0b14';
  ctx.fillRect(0, 0, 512, 160);
  ctx.font = `bold ${sizePx || 96}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 28;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 84);
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, 84);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

export function buildWorld(scene) {
  // Warm late-afternoon sun: the Vice Point look.
  const sun = new THREE.DirectionalLight(0xffe0b3, 2.6);
  sun.position.set(120, 160, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 520;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x9fd8ff, 0x8a6f4d, 0.9);
  scene.add(hemi);

  // Gradient sky dome (big sphere, shader-free vertex colours).
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
  });
  const colors = [];
  const pos = skyGeo.attributes.position;
  const top = new THREE.Color(0x2f7fd0);
  const horizon = new THREE.Color(0xffc98a);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 900;
    tmp.copy(horizon).lerp(top, Math.max(0, Math.min(1, y * 1.6 + 0.15)));
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Ground: asphalt city floor.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.groundSize, CITY.groundSize),
    new THREE.MeshStandardMaterial({ map: makeGroundTexture('asphalt'), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Beach strip and sea to the east.
  const sandTex = makeGroundTexture('sand');
  sandTex.repeat.set(6, 40);
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.beachWidth, CITY.groundSize),
    new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }),
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(CITY.oceanEdge + CITY.beachWidth / 2, 0.02, 0);
  beach.receiveShadow = true;
  scene.add(beach);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(320, CITY.groundSize),
    new THREE.MeshStandardMaterial({ color: 0x1e7fa8, roughness: 0.25, metalness: 0.35 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CITY.oceanEdge + CITY.beachWidth + 160, -0.4, 0);
  scene.add(sea);

  // Distant sun disc over the sea.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(34, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
  );
  sunDisc.position.set(560, 90, -40);
  sunDisc.lookAt(0, 90, -40);
  scene.add(sunDisc);

  return { sun, sea };
}
