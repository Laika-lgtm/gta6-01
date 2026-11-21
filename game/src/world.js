// The natural world: gradient sky dome, low sun, the ground plane, the
// beach and the ocean east of the city. Built once from the seeded RNG;
// the sea animates gently in the loop via update().
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

export function createWorld(scene) {
  // Sky dome: a big sphere with a vertical gradient baked into vertex
  // colours, so the horizon glows warm and the zenith stays deep blue.
  const skyGeo = new THREE.SphereGeometry(700, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
  const positions = skyGeo.attributes.position;
  const colours = new Float32Array(positions.count * 3);
  const top = new THREE.Color(0x3d7ac8);
  const mid = new THREE.Color(PALETTE.sky);
  const low = new THREE.Color(0xffd9a0);
  const tmp = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i) / 700;
    if (y > 0.25) tmp.lerpColors(mid, top, Math.min(1, (y - 0.25) * 2));
    else tmp.lerpColors(low, mid, Math.max(0, (y + 0.1) / 0.35));
    colours[i * 3] = tmp.r;
    colours[i * 3 + 1] = tmp.g;
    colours[i * 3 + 2] = tmp.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // Sun disc + a few flat cartoon clouds drifting slowly.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false }),
  );
  sunDisc.position.set(320, 260, -180);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);
  const clouds = [];
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  for (let i = 0; i < 9; i += 1) {
    const group = new THREE.Group();
    const puffs = 3 + (i % 3);
    for (let p = 0; p < puffs; p += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(9 + p * 3, 10, 8), cloudMat);
      puff.position.set(p * 12 - puffs * 6, (p % 2) * 3, 0);
      puff.scale.y = 0.45;
      group.add(puff);
    }
    group.position.set(-320 + i * 78, 130 + (i % 4) * 14, -220 + (i % 3) * 170);
    scene.add(group);
    clouds.push(group);
  }

  // Ground: one big asphalt-coloured plane for the city, then sand and sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.halfSize * 2 + 40, CITY.halfSize * 2 + 40),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(90, CITY.halfSize * 2 + 40),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.beachX + 22, 0.05, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const seaGeo = new THREE.PlaneGeometry(320, CITY.halfSize * 2 + 400, 24, 24);
  const sea = new THREE.Mesh(
    seaGeo,
    new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.25, metalness: 0.1 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CITY.seaX + 190, 0.02, 0);
  scene.add(sea);
  const seaBase = seaGeo.attributes.position.array.slice();

  // A wooden pier jutting into the sea at Pier 9, with a neon sign.
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9 });
  const pier = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(70, 1.2, 10), pierMat);
  deck.position.set(CITY.seaX + 55, 1.4, 120);
  deck.castShadow = true;
  deck.receiveShadow = true;
  pier.add(deck);
  for (let i = 0; i < 8; i += 1) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3, 8), pierMat);
    post.position.set(CITY.seaX + 24 + i * 9, 0, 120 + (i % 2 === 0 ? -4.4 : 4.4));
    pier.add(post);
  }
  scene.add(pier);

  function update(dt, time) {
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 380) cloud.position.x = -380;
    }
    // Gentle swell: the sea plane's vertices breathe with two sine waves.
    const pos = seaGeo.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const x = seaBase[i * 3];
      const y = seaBase[i * 3 + 1];
      pos.setZ(i, Math.sin(x * 0.08 + time * 0.9) * 0.35 + Math.cos(y * 0.06 + time * 0.6) * 0.3);
    }
    pos.needsUpdate = true;
    seaGeo.computeVertexNormals();
  }

  return { update, pierPosition: new THREE.Vector3(CITY.seaX + 80, 2, 120) };
}
