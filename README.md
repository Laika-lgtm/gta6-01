# Vice Point

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Laika-lgtm/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Laika-lgtm/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime game in the spirit of GTA 6, running offline in a desktop
browser from static files. Explore the sun-soaked coastal city of Vice Point
on foot and by car, steal cars, run missions for cash, and watch the city
breathe — traffic on the avenues, pedestrians on the sidewalks, neon over the
boulevard, and the sea at the end of every street.

You are **Ray Delgado**, a driver-for-hire who just got back to Vice Point
with $250 in his pocket and a reputation to rebuild. Take jobs for Mara
Voss — pick her up, lose the cops, grab the getaway car, run a timed drop,
tail a debtor, sabotage a rival, pull a hot pickup and the big heist —
earn cash and respect, and own the streets, one mission at a time. Mind
the wanted level: hit cars and pedestrians and the Interceptors come for
you, roadblocks go up at 3 stars and Air One circles overhead at 4.
Get busted and it costs $100 plus the job, if the job was Heat.

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
| F | Punch (on foot) |
| Click | Shoot the current weapon |
| Right mouse (hold) | Aim (pitch up to shoot at Air One) |
| Q (hold) | Weapon wheel — pistol / SMG |
| 1 / 2 | Switch weapon directly |
| R | Change radio station (in the car) |
| G | Store / retrieve a car at the beach garage |
| M | Mute sound |
| Esc | Pause menu |

Progress saves to `localStorage` automatically — position, cash, respect,
missions, garage cars, weapon ammo and radio station — so you can pick up
where you left off with **Continue** on the start screen.

## The missions

Eight jobs for Mara Voss, $250 → $8,550:

1. **THE PICKUP** (+$300) — pick Mara up, drive her to Hotel VICE.
2. **HEAT** (+$400) — lose the cops who show up right after.
3. **THE GETAWAY CAR** (+$600) — get to the white car and get in.
4. **THE DROP** (+$800) — a package on the pier in 45 seconds, or retry.
5. **THE TAIL** (+$1,200) — stay on the pink coupe.
6. **SABOTAGE** (+$1,500) — hold still 3 seconds at the rival warehouse.
7. **THE HOT PICKUP** (+$1,800, needs 30 respect) — pick a guy up while the heat is on.
8. **THE BIG ONE** (+$1,700, needs 50 respect) — grab the cash downtown, run for the pier under Air One.

Respect grows with finished jobs (+10), dropped Interceptors (+3), a downed
heli (+10) and laying low (+2), and falls with every bust (−15). High
respect opens the later jobs; the garage on the beach stores up to six
cars between sessions.

## The city

Vice Point is a procedural low-poly coastal city: a 6×6 grid of blocks with
around a hundred buildings, 48 palm trees, neon signs (VICE, TACOS, HOTEL,
PIER 9), a beach, a pier and the open sea. Six cars wait on the streets to be
borrowed. Ten traffic cars cruise the avenues — stopping at intersections and
braking for the car ahead — and fourteen pedestrians wander the sidewalks.
Police Interceptors chase Ray when the wanted level rises, roadblocks go
up across the road from 3 stars, and Air One circles overhead with a
spotlight from 4 stars — it can be shot down. The chase camera never
clips through a building, and no surface is a flat colour: concrete, sand,
sea, sidewalks and asphalt are all canvas-generated textures.

## Files

- `game/` — the playable game (three.js vendored under `game/vendor/`)
- `game/src/main.js` — game loop, player, cars, camera, HUD, minimap, save
- `game/src/city.js` — procedural city, beach, pier, neon, palms, canvas textures
- `game/src/traffic.js` — traffic cars and pedestrians
- `game/src/missions.js` — the 8-job Mara Voss chain and objective markers
- `game/src/police.js` — wanted level 0–5, Interceptor pursuit, roadblocks, busts
- `game/src/weapons.js` — pistol + SMG, weapon wheel, lock-on shooting
- `game/src/heli.js` — Air One police helicopter, spotlight, shoot-down
- `game/src/garage.js` — beach garage: store and retrieve cars
- `game/src/audio.js` — procedural WebAudio sound (engine, steps, UI, siren, punch, radio)
- `screenshots/` — renders of the game itself
- `main.ts` — hands the entry in (copies `game/` + `screenshots/`, writes `dossier.json`)

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Built for the make.fun `gta6-01` competition — see
https://make.fun/bounty/gta6-01 (referral code: `w2e3vyyb`). All city,
characters, vehicles, names, story, art and sound are original.
