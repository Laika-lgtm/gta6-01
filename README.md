# VICE POINT — an open-world crime game in the spirit of GTA 6

[![Vice Point](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Vice Point rank](https://make.fun/badge/gta6-01/Laika-lgtm/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Vice Point reward](https://make.fun/badge/gta6-01/Laika-lgtm/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

https://make.fun/bounty/gta6-01

Referral code w2e3vyyb — https://make.fun/r/w2e3vyyb

Sun, neon and trouble: an original open-world crime game that runs offline in
a desktop browser from its own static files. Ray Delgado walks and drives
through Vice Point — a procedural 6x6 low-poly city with a beach, a pier,
palms and neon signs — stealing six different cars, dodging the VCPD wanted
system, and running missions for Mara Voss.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

- **WASD** walk, **Shift** run, **mouse** look, **E** steal / exit a car,
  **Space** brake, **M** mission hint. Progress saves automatically.
- Screenshot modes: `?shot=chase` (police chase cover), `?shot=mission`,
  `?shot=drive`, `?shot=street`.

## What is in the game

- Procedural city: ~100 buildings, 48 palms, neon VICE / TACOS / HOTEL /
  PIER 9 signs, beach + ocean, grid roads with sidewalks.
- Third-person Ray Delgado with an anti-clip camera, six stealable cars with
  arcade handling, traffic cars and pedestrians.
- Wanted stars with a police Interceptor chase and the Air One helicopter.
- Missions with a marker beacon, HUD (money, stars, mission, speed, health)
  and a live round minimap.
- Procedural WebAudio sound (engine, footsteps, UI) — no audio files.
- Start screen and localStorage save.

## Structure

- `game/index.html` — page shell, HUD, start screen
- `game/src/main.js` — bootstrap, game loop, game state, save
- `game/src/world.js` — sky, sun, ground, beach, sea
- `game/src/city.js` — buildings, roads, palms, neon, colliders
- `game/src/player.js` — Ray, walking, third-person camera
- `game/src/vehicles.js` — cars, traffic, police, helicopter
- `game/src/input.js` — keyboard + mouse
- `game/src/audio.js` — procedural WebAudio
- `game/src/hud.js` — HUD + save/load
- `game/src/minimap.js` — round live minimap
- `game/src/shots.js` — `?shot=` screenshot modes
- `game/src/config.js` — tuning constants
- `game/src/random.js` — seeded RNG
- `game/src/render.js` — renderer + camera setup
- `game/vendor/three.module.min.js` — three.js 0.160.0 (vendored)

## Entry

Built for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) (gta6-01).
`main.ts` copies `game/` and `screenshots/` to `/output` and writes
`dossier.json` with the vendored make.fun library.
