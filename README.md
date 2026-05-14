# Field Incremental

A small incremental tap game. Harvest the field, spend gold on upgrades, unlock new crops.

**Play:** https://nors3ai.github.io/Field-Incremental/

## How it plays

- Tap (or click) the field. Each tap spends 1 energy.
- The tap radius covers a small area, so you harvest ~1-2 crops per tap.
- When energy hits 0, you get a run summary and an upgrade shop.
- Spend gold on upgrades (energy, radius, damage, gold multiplier).
- Unlock new crops as you grow:
  - **Wheat** — 1 HP, 1g (start)
  - **Rye** — 2 HP, 2g (unlock at 50g)
  - **Cotton** — 3 HP, 5g (unlock at 200g)

Higher-tier crops mix into the field once unlocked. Tap damage upgrades become important to one-shot tougher crops.

## Settings

Music volume, FX volume, mute, and text size (10/12/14/16pt). Settings and progress save to `localStorage`.

## Hosting

The game is served from `/docs` for GitHub Pages.

1. Push to `main`.
2. In repo Settings → Pages: set Source = `Deploy from branch`, Branch = `main`, Folder = `/docs`.
3. Site URL: `https://nors3ai.github.io/Field-Incremental/`.

A `.nojekyll` file in `/docs` keeps GitHub Pages from running Jekyll on the static files.

## Project layout

```
docs/
  index.html          # app shell + screen sections
  css/styles.css
  js/
    patchnotes.js     # patch notes data (updated every push)
    storage.js        # localStorage wrapper
    audio.js          # generative music + procedural FX
    game.js           # crop / upgrade definitions + field logic
    app.js            # routing, settings, shop, game loop
  .nojekyll
README.md
CLAUDE.md
```

## Patch notes

The full list lives in `docs/js/patchnotes.js` and is shown in-app on the **Patch Notes** screen. Every push should add or update an entry there.
