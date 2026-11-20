// Vice Point — the beach garage. Drive a car onto the lot and press G
// to store it; press G on foot to take the last stored car back out.
// Stored cars survive in the save file, so the garage is a real stash,
// not a parking spot that forgets. The getaway car cannot be stored
// while Mara still needs it for THE GETAWAY CAR.

import * as THREE from 'three';

export const GARAGE_SPOT = { x: 60, z: 170, radius: 10 };

function makeGarageSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#14181f';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#ffd166';
  g.lineWidth = 6;
  g.strokeRect(6, 6, 500, 116);
  g.font = '900 64px "Trebuchet MS", Verdana, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd166';
  g.fillText('GARAGE', 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class GarageManager {
  // `cars` is the game's drivable-car list ({ group, color, parked });
  // `isGetawayCar` guards the mission car. The manager only stores
  // colours; the game loop owns entering, exiting and saving.
  constructor(scene, cars, isGetawayCar = () => false) {
    this.scene = scene;
    this.cars = cars;
    this.isGetawayCar = isGetawayCar;
    this.stored = []; // colours, most recent last
    this.spot = GARAGE_SPOT;
    this.buildLot();
  }

  buildLot() {
    // Concrete pad on the sand, with a low back wall and a sign.
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.3, 18),
      new THREE.MeshLambertMaterial({ color: 0x6a6e73 }),
    );
    pad.position.set(this.spot.x, 0.15, this.spot.z);
    pad.receiveShadow = true;
    this.scene.add(pad);
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(24, 2.2, 0.8), wallMat);
    wall.position.set(this.spot.x, 1.1, this.spot.z - 8.6);
    wall.castShadow = true;
    this.scene.add(wall);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 2.5),
      new THREE.MeshBasicMaterial({ map: makeGarageSignTexture() }),
    );
    sign.position.set(this.spot.x, 4.2, this.spot.z - 8.1);
    this.scene.add(sign);
    // Painted parking bays on the pad.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
    for (const bx of [-8, 0, 8]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 12), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(this.spot.x + bx, 0.32, this.spot.z);
      this.scene.add(line);
    }
  }

  inZone(x, z) {
    const dx = x - this.spot.x;
    const dz = z - this.spot.z;
    return dx * dx + dz * dz <= this.spot.radius * this.spot.radius;
  }

  // Store the car Ray is driving. Returns { ok, msg } for the toast, or
  // null when the car cannot be stored at all.
  store(carIndex) {
    const car = this.cars[carIndex];
    if (!car || car.parked) return null;
    if (this.isGetawayCar(carIndex)) {
      return { ok: false, msg: 'Mara needs that car — finish the job first' };
    }
    if (this.stored.length >= 6) return { ok: false, msg: 'Garage is full' };
    car.parked = true;
    car.speed = 0;
    car.group.visible = false;
    this.stored.push(car.color);
    return { ok: true, msg: `Stored in the garage (${this.stored.length} parked)` };
  }

  // Take the most recently stored car back out onto the lot. Returns the
  // car object, or null when the garage is empty.
  retrieve() {
    if (this.stored.length === 0) return null;
    const color = this.stored.pop();
    const car = this.cars.find((c) => c.color === color && c.parked);
    if (!car) return null;
    car.parked = false;
    car.group.visible = true;
    car.group.position.set(this.spot.x, 0, this.spot.z + 2);
    car.group.rotation.y = 0;
    car.yaw = 0;
    car.speed = 0;
    return car;
  }

  // New game: every car back on the street, garage empty.
  reset() {
    this.stored = [];
    for (const car of this.cars) {
      car.parked = false;
      car.group.visible = true;
    }
  }

  serialize() {
    return { stored: [...this.stored] };
  }

  restore(data) {
    if (!data || !Array.isArray(data.stored)) return;
    this.stored = [...data.stored];
    for (const color of this.stored) {
      const car = this.cars.find((c) => c.color === color && !c.parked);
      if (car) {
        car.parked = true;
        car.speed = 0;
        car.group.visible = false;
      }
    }
  }
}
