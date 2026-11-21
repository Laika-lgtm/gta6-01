// Vice Point — entry program (Node 22, standard library only).
//
// The game is the plain static files in this directory's game/ folder: a
// three.js open world that runs offline from game/index.html, with no build
// step and no network request at runtime. This program hands it in: it copies
// game/ and screenshots/ beside this file into /output (or the directory
// named by MAKEFUN_OUTPUT_DIR) and writes /output/dossier.json, the summary
// the judge reads, using the kit's buildDossier library.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//   node serve.ts   # play it at http://localhost:8080

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail fast with a readable error when the entry is incomplete, instead of
// letting the dossier builder report a bare missing directory.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('Vice Point: game/index.html is missing — the game cannot be handed in.');
}
if (!existsSync(join(here, 'screenshots'))) {
  throw new Error('Vice Point: screenshots/ is missing — at least 3 screenshots are required.');
}

// Start from an empty output directory so a stale file from an earlier run
// can never ride along with this entry.
mkdirSync(outDir, { recursive: true });
for (const name of ['game', 'screenshots', 'dossier.json']) {
  const target = join(outDir, name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}

cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}
const shotCount = readdirSync(join(outDir, 'screenshots')).filter((n) => !n.startsWith('.')).length;
if (shotCount < 3 || shotCount > 4) {
  throw new Error(`Vice Point: screenshots/ holds ${shotCount} images — the gate needs 3 or 4.`);
}

// The scorer's own caps (from the bounty gate): only text_max_bytes shapes
// the dossier bytes; the others make this program fail exactly where the
// scorer would refuse the entry (more than 4 screenshots or one over
// 256 KiB; more than 993 entries in game/ or 48 MiB of game files, or a
// game path over 1000 bytes — game/ counts beside /output's own cap of
// 1000 entries, shared with screenshots/ and dossier.json).
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Vice Point handed in to ${outDir} (${dossier.length} byte dossier).`);
