# Vice Point

[![Vice Point](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Laika-lgtm/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Laika-lgtm/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game set on **Vice Point**, a sun-soaked invented island
city of seven districts — Docks, Marina, Old Town, Neon Strip, Hills, Airport
and Beachfront. You are **Ray Delgado**, a driver-for-hire trying to make rent
in a city that never stops glowing.

Explore on foot or steal one of six cars, cruise the neon strip at dusk, watch
the palm-lined beachfront from the pier, and build your name district by
district. The game runs entirely offline in a desktop browser — no network
requests, no build step. Every texture is painted procedurally on canvas;
every radio station is synthesized live with WebAudio.

## The chain — Mara Voss, 8 jobs, 3 acts

Act 1: pick Mara up at Pier 9, lose the heat, steal the Midnight GT.
Act 2: a hot delivery from the Marina, a rescue at the Airport, a warehouse
heist at the Docks — each job recruits one crew member: **Dara** (driver,
wanted cools twice as fast), **Kiko** (hacker, blacks out the PD for 20s
once per mission), **Bima** (mechanic, half crash damage, free field
repair). Act 3: a five-checkpoint chase across the island, then the final
heist — the Velvet Cruiser, four stars, one last run to the Docks. The full
chain runs **$250 to $8,550**. Getting busted mid-escape fails the job.

## Around the island

- **District standing** (0–5 per district, T to view) — earned from jobs,
  caches, exports and race wins. Old Town 3+ cuts garage prices 20%.
- **Respect** (0–100) — the island-wide score, up from every job, cache,
  export and win.
- **12 hidden caches** — gold beams light up when you get close; $100 each.
- **Export dock** (Docks) — drive a stolen car in, press V, get paid by model.
- **3 street races** — Strip Sprint, Beach Run, Airport Loop; press Y on a
  start pad and beat the target time.
- **Weapons** — pistol + SMG on the wheel (Q, 1/2, X to fire). Shooting
  anyone is a crime.
- **Radio** — VICE FM synthwave and PALM 87 beach drift (R to switch).
- **Garage** (Old Town) — buy cars, repaint ($50), repair ($30).

## How to play

- **WASD** — walk / run (hold **Shift** to sprint)
- **Mouse** — look around (click to lock the pointer)
- **E** — get in / out of a car
- **W / S** — drive forward / reverse, **A / D** — steer, **Space** — handbrake
- **F** — punch · **X** — shoot · **Q** — weapon wheel (1/2 pick a gun)
- **R** — radio station · **C** — cycle crew · **K** — Kiko's PD blackout
- **B** — Bima field repair · **G** — garage · **V** — export car
- **Y** — start a race · **T** — district standing · **M** — mute
- **Esc** — pause

Progress (cash, mission progress, crew, standing, respect, caches, garage,
weapons and position) autosaves to localStorage.
Serve the `game/` folder with any static server, e.g. `node serve.ts`, then
open http://localhost:8080.

Built for the make.fun **gta6-01** bounty with vendored three.js (r160).
