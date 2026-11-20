# Vice Point

![Vice Point](https://make.fun/badge/gta6-01.svg)
![Rank](https://make.fun/badge/gta6-01/Laika-lgtm/gta6-01/rank.svg)
![Reward](https://make.fun/badge/gta6-01/Laika-lgtm/gta6-01/reward.svg)

An open-world crime game in the spirit of GTA 6, running offline in a desktop
browser from static files. Explore the sun-soaked coastal city of Vice Point
on foot and by car, steal cars, run missions for cash, and watch the city
breathe — traffic on the avenues, pedestrians on the sidewalks, neon over the
boulevard, and the sea at the end of every street.

You are **Ray Delgado**, a driver-for-hire who just got back to Vice Point
with an empty wallet and a reputation to rebuild. Take jobs, earn cash, and
own the streets — one mission at a time.

## Play

Serve `game/` with any static server and open `index.html`:

```sh
node serve.ts
# game/ is on http://localhost:8080
```

No build step, no network request while playing. Keyboard and mouse.

| Key | Action |
| --- | --- |
| W A S D | Walk / drive |
| Mouse drag | Orbit camera |
| Shift | Run |
| Space | Jump |
| E | Enter / exit a car |
| M | Mute sound |
| Esc | Pause menu |

Progress saves to `localStorage` automatically — position, cash and missions —
so you can pick up where you left off with **Continue** on the start screen.

## The city

Vice Point is a procedural low-poly coastal city: a 6×6 grid of blocks with
around a hundred buildings, 48 palm trees, neon signs (VICE, TACOS, HOTEL,
PIER 9), a beach, a pier and the open sea. Six cars wait on the streets to be
borrowed. Traffic cruises the avenues and pedestrians wander the sidewalks.

## Files

- `game/` — the playable game (three.js vendored under `game/vendor/`)
- `game/src/main.js` — game loop, player, cars, camera, HUD, minimap, save
- `game/src/city.js` — procedural city, beach, pier, neon, palms
- `game/src/traffic.js` — traffic cars and pedestrians
- `game/src/missions.js` — mission chain and objective markers
- `game/src/audio.js` — procedural WebAudio sound (engine, steps, UI)
- `screenshots/` — renders of the game itself
- `main.ts` — hands the entry in (copies `game/` + `screenshots/`, writes `dossier.json`)

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Built for the make.fun `gta6-01` competition. All city, characters, vehicles,
names, story, art and sound are original.
