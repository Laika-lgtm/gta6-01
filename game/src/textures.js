// Vice Point — procedural canvas textures, stage 4. Every surface in the
// city is painted by code at load time: district facades with lit and dark
// windows, cracked asphalt for the road grid, tiled concrete for the
// sidewalks, and the glowing neon signs. No image file is ever fetched —
// the same seed always paints the same walls, so the city stays
// deterministic across runs.
import * as THREE from 'three';
import { makeRng } from './config.js';

function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  paint(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${gg},${b})`;
}

// A building face: flat district colour, a grid of windows (some warm-lit,
// some dark), a darker ground-floor band, and vertical grime streaks so no
// two districts read the same. `variant` picks a different window rhythm.
export function makeFacadeTexture(district, variant = 0) {
  const rng = makeRng(hashStr(district.id) + variant * 131);
  const base = '#' + district.color.toString(16).padStart(6, '0');
  const lit = district.id === 'neon' ? '#ff9de2' : '#ffd98a';
  return canvasTex(256, 256, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    // Subtle horizontal floor bands.
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = shade(base, -14);
      g.fillRect(0, y, 256, 2);
    }
    // Window grid, jittered per building variant.
    const cols = 5 + (variant % 2);
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const x = 14 + cIdx * ((256 - 28) / cols) + (rng() - 0.5) * 4;
        const y = 12 + r * ((256 - 24) / rows);
        const w = 22 + rng() * 8;
        const h = 14 + rng() * 4;
        const roll = rng();
        if (roll < 0.42) g.fillStyle = lit;
        else if (roll < 0.5) g.fillStyle = '#9fe8ff';
        else g.fillStyle = '#1d212b';
        g.fillRect(x, y, w, h);
        // Window frame.
        g.strokeStyle = shade(base, -38);
        g.lineWidth = 2;
        g.strokeRect(x, y, w, h);
      }
    }
    // Grime streaks running down from the roofline.
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < 9; i++) {
      const x = rng() * 256;
      g.fillRect(x, 0, 3 + rng() * 6, 40 + rng() * 120);
    }
    // Dark ground-floor band: shops and doors.
    g.fillStyle = shade(base, -46);
    g.fillRect(0, 228, 256, 28);
    g.fillStyle = '#20242e';
    for (let i = 0; i < 3; i++) g.fillRect(24 + i * 84, 232, 26, 24);
  });
}

// Asphalt: near-black with speckle noise, faint tyre-polish bands and a
// pale edge line on each side so the road reads against the sidewalk.
export function makeRoadTexture() {
  const rng = makeRng(90210);
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#33373e';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 40 + Math.floor(rng() * 40);
      g.fillStyle = `rgba(${v},${v},${v + 6},0.5)`;
      g.fillRect(rng() * 256, rng() * 256, 1.6, 1.6);
    }
    // Tyre-polish bands where wheels run.
    g.fillStyle = 'rgba(0,0,0,0.16)';
    g.fillRect(52, 0, 44, 256);
    g.fillRect(160, 0, 44, 256);
    // Edge lines.
    g.fillStyle = 'rgba(216,210,160,0.85)';
    g.fillRect(4, 0, 3, 256);
    g.fillRect(249, 0, 3, 256);
    // A couple of tar cracks.
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      let x = rng() * 256, y = rng() * 200;
      g.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (rng() - 0.5) * 36; y += 10 + rng() * 14; g.lineTo(x, y); }
      g.stroke();
    }
  });
}

// Sidewalk: warm concrete tiles with grout lines and speckle.
export function makeSidewalkTexture() {
  const rng = makeRng(5150);
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#a8a294';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      const v = 140 + Math.floor(rng() * 50);
      g.fillStyle = `rgba(${v},${v - 4},${v - 14},0.55)`;
      g.fillRect(rng() * 256, rng() * 256, 2, 2);
    }
    g.strokeStyle = 'rgba(60,58,50,0.7)';
    g.lineWidth = 2;
    for (let x = 0; x <= 256; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
    for (let y = 0; y <= 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  });
}

// Neon sign panel: glowing word on a dark plate, double-struck for bloom.
export function makeNeonTexture(word, fg, bg) {
  return canvasTex(512, 160, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 160);
    g.font = 'bold 92px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = fg;
    g.shadowBlur = 34;
    g.fillStyle = fg;
    g.fillText(word, 256, 84);
    g.shadowBlur = 8;
    g.fillStyle = '#ffffff';
    g.fillText(word, 256, 84);
  });
}

// Container rust: flat paint plus darker patches and a stencil stripe.
export function makeContainerTexture(colorHex) {
  const rng = makeRng(hashStr(colorHex) + 77);
  return canvasTex(128, 128, (g) => {
    g.fillStyle = colorHex;
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(30,20,10,${0.08 + rng() * 0.2})`;
      const w = 8 + rng() * 30, h = 4 + rng() * 16;
      g.fillRect(rng() * 128, rng() * 128, w, h);
    }
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(0, 14, 128, 5);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 8; x < 128; x += 16) g.fillRect(x, 0, 2, 128);
  });
}
