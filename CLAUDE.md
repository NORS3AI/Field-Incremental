# CLAUDE.md

Guidance for Claude when working in this repo.

## What this is

A static-site incremental tap game (vanilla HTML/CSS/JS) hosted on GitHub Pages from `/docs`. The deployed URL is `https://nors3ai.github.io/Field-Incremental/`.

## Workflow

- **Push directly to `main`.** The user does not want PRs for this repo.
- **Update patch notes on every push.** Add an entry (or extend the latest entry) in `docs/js/patchnotes.js`. The newest version sits at index 0; the menu shows that version string. Use ISO date `YYYY-MM-DD`.
- After meaningful gameplay changes, bump the version (e.g. `0.1.0` → `0.1.1` for fixes, `0.2.0` for new features).

## Architecture

Everything lives in `docs/`:

- `index.html` — single page with sections per view (`menu`, `game`, `upgrades`, `settings`, `patchnotes`) plus a modal.
- `css/styles.css` — all styling. Text size is driven by the `--text-size` CSS variable on `body`.
- `js/patchnotes.js` — `window.PATCH_NOTES` array. Edit this every push.
- `js/storage.js` — namespaced localStorage helpers (`Storage2.load/save`). Namespace: `field-incremental/v1`.
- `js/audio.js` — Web Audio. Independent `musicGain` / `fxGain` through a `masterGain`. FX: `playTap`, `playHarvest`, `playPurchase`. Music: simple looping pentatonic pad.
- `js/game.js` — pure game model. Exposes `Game.{CROPS, UPGRADES, defaultState, derived, upgradeCost, generateField, applyTap, render}`. No DOM access here; render takes a canvas context.
- `js/app.js` — DOM + routing + persistence. Owns the single mutable `state` object.

## State

- Persisted: `gold`, `unlocks`, `upgrades` (in `Storage2`'s `state` key).
- Settings persisted separately in `settings` key.
- Ephemeral (regenerated each load): `energy`, `runGold`, `runHarvested`, `field`.

## Tuning knobs

- `Game.UPGRADES[key].baseCost / costMul` — upgrade pricing curves.
- `Game.UPGRADES[key].effect(level)` — effect per level.
- `Game.CROPS[key]` — HP, gold, unlock cost, visuals.
- Field size: `FIELD_COLS × FIELD_ROWS` (currently 10×10).
- Initial radius / damage / energy live in `Game.derived()` baselines (22 / 1 / 5).

## Adding a new crop

1. Add to `CROPS` in `game.js` with `hp`, `gold`, colors, `unlocked: false`, `unlockCost`.
2. Add a draw branch in `drawCrop` (or generalize).
3. Add to the unlock list in `app.js` (`renderUpgrades` iterates the unlock keys).
4. Update `runHarvested` initializers in both `game.js` (`defaultState`) and `app.js` (where it resets each run).
5. Patch notes.

## Adding a new upgrade

1. Add to `UPGRADES` in `game.js` with `name`, `desc`, `baseCost`, `costMul`, `effect(level)`.
2. If it changes a derived stat, extend `Game.derived()` so the rest of the game picks it up automatically.
3. Initialize the level in `Game.defaultState().upgrades`.
4. Patch notes.

## Audio gotchas

- Browsers block `AudioContext` until a user gesture. `Audio2.unlock()` is called on every navigation click, which is the safe spot.
- Don't autoplay music before a gesture — it will silently fail.

## Testing the loop

Before pushing, sanity-check by opening `docs/index.html` (or via a local server) and running the full loop: Play → tap until energy=0 → modal → Continue → buy an upgrade → Continue → next run. Verify Rye appears at 50g and Cotton at 200g once unlocked.

## Do not

- Don't open PRs against this repo.
- Don't introduce build tooling (no bundler, no TypeScript) unless the user asks. This stays as plain static files so GitHub Pages serves it directly.
- Don't commit large binary assets; audio is procedural by design.
