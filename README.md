# Thought Experiments

Five short browser games, each built around one idea from modern physics.

Live site: https://thoughtexperiments.app

## The games

The games are being released one at a time.

- **Antidote Run**: special relativity and time dilation, with the Lorentz factor γ = 1/√(1−v²/c²).
- **Slingshot**: gravity, a = GM/r², with a black-hole finale that uses a general-relativity approximation.
- **Entangled Maze**: quantum entanglement. Results are correlated but individually random, and no signal can be sent.
- **Uncertain Fire**: the uncertainty principle, Δx·Δp ≥ ħ/2, and how a measured position spreads over time.
- **Collider**: particle collisions, with E = γmc² and the conservation laws.

The guiding rule: every mechanic is physically correct, or the game says openly where it simplifies.

## For teachers

The site is free and needs no sign-up. No accounts, no cookies, nothing that identifies anyone; we only count anonymous visits and finished levels. Adding `?classroom` to the address unlocks every level and saves nothing.

## Run locally

```
npm install
npm run dev
npm test
npm run build
```

## Project layout

```
index.html, about/, 404.html   pages
src/shared/                    progress store (with classroom mode), analytics helper
src/site/                      home, tiles, about and 404 scripts
src/art/                       SVG art drawn in code
src/styles/                    stylesheets
public/                        static files (CNAME)
docs/                          design notes and plans
```

## Physics tests

Physics functions are unit-tested with Vitest. As each game lands, its tests check physical behaviour, for example that a two-body orbit stays closed.

Made by Muhammad Saad Ahmad.

Developed with the help of Claude (Anthropic) as a coding assistant.
