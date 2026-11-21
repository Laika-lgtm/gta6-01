# Vice Point

[![Vice Point](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Laika-lgtm/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Laika-lgtm/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game set in Vice Point, a sun-soaked coastal
city of neon, palms and trouble. Play as Ray Delgado, a driver-for-hire who
came back to the city to pay off a debt — and stayed because the city pays
better than it forgives.

Referral code: `w2e3vyyb`

## How to play

Serve the game locally and open it in desktop Chrome:

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network request at runtime: every script, model and sound
is a file under `game/` or a `data:` URI. Click the start screen to begin.
Walk the streets, steal a car with E, outrun the Vice Point police, and work
through the mission line. Money, wanted stars, health and speed are always
on the HUD, with a live round minimap in the corner.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Walk / drive |
| Mouse | Look around (click to lock the pointer) |
| Shift | Run / faster driving |
| Space | Brake (in a car) / jump on foot |
| E | Enter / exit the nearest car |
| P or Esc | Pause |
| M | Mute sound |
| Enter | Confirm on menus |

## Structure

- `main.ts` — hands the game in: copies `game/` and `screenshots/` to
  `/output` (or `MAKEFUN_OUTPUT_DIR`) and writes `dossier.json`.
- `serve.ts` — tiny static server for `game/` on port 8080.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `game/index.html` — the page, import map, HUD and start screen.
- `game/src/config.js` — every tuning constant in one place.
- `game/src/random.js` — seeded RNG (mulberry32) for a repeatable city.
- `game/src/render.js` — renderer, camera rig and lighting.
- `game/src/world.js` — sky, sun, ground, beach and ocean.
- `game/src/city.js` — buildings, roads, palms, neon signs, colliders.
- `game/src/player.js` — Ray Delgado, third-person walker and camera.
- `game/src/vehicles.js` — six stealable cars, traffic and police stubs.
- `game/src/input.js` — keyboard and mouse input.
- `game/src/audio.js` — procedural WebAudio: engine, footsteps, UI.
- `game/src/hud.js` — HUD, wanted stars, mission line, save/load.
- `game/src/minimap.js` — live round minimap.
- `game/src/shots.js` — staged screenshot scenes (`?shot=chase|mission|drive|street`).
- `game/src/main.js` — boot and the game loop.
- `game/vendor/three.module.min.js` — vendored three.js 0.160.0.
- `screenshots/` — renders of the game itself; the first by name is the cover.
