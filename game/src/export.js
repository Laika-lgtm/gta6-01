// Vice Point — vehicle export at the Docks, stage 4. Steal a car, drive it
// down to the export crane at the far end of the Docks, press V, and the
// car ships out for cash. The payout follows the model — a Midnight GT is
// worth three Mango Pickups — and the car itself goes back to its parking
// spot afterwards (the island's chop shops are honest that way). Exports
// pay standing in the Docks and a bump of respect.
import * as THREE from 'three';

export const EXPORT_SPOT = { x: -268, z: -252 };

export const EXPORT_PRICES = {
  sunbeam: 400,
  coral: 350,
  midnight: 900,
  mango: 300,
  lagoon: 280,
  velvet: 500,
};

export class ExportPoint {
  constructor(scene) {
    this.scene = scene;
    this.exports = 0;
    this.earned = 0;
    this._buildMarker();
  }

  _buildMarker() {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xb46bff, transparent: true, opacity: 0.25,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 34, 12, 1, true), beamMat);
    beam.position.y = 17;
    g.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 4.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xb46bff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    g.add(ring);
    // A crate stack marks the dock office.
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(5, 2.4, 3),
      new THREE.MeshLambertMaterial({ color: 0xc23b3b }),
    );
    crate.position.set(8, 1.2, 0);
    g.add(crate);
    g.position.set(EXPORT_SPOT.x, 0, EXPORT_SPOT.z);
    this.scene.add(g);
    this.marker = g;
  }

  near(pos, radius = 11) {
    return Math.hypot(pos.x - EXPORT_SPOT.x, pos.z - EXPORT_SPOT.z) < radius;
  }

  priceFor(carId) { return EXPORT_PRICES[carId] || 250; }

  // Records the sale. The caller moves the car home and pays the driver.
  sell(carId) {
    const price = this.priceFor(carId);
    this.exports++;
    this.earned += price;
    return price;
  }

  serialize() { return { exports: this.exports, earned: this.earned }; }
  restore(s) {
    if (!s) return;
    if (typeof s.exports === 'number') this.exports = s.exports;
    if (typeof s.earned === 'number') this.earned = s.earned;
  }
}
