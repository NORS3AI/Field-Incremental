// Patch notes — newest first. Every push should add or update an entry here.
window.PATCH_NOTES = [
  {
    version: "0.3.0",
    date: "2026-05-14",
    notes: [
      "Crops: added 7 new plants — Carrot (400g), Pumpkin (800g), Corn (1,500g), Sugarcane (3,000g), Tomato (6,000g), Sunflower (12,000g), Watermelon (25,000g). Each scales in HP and gold.",
      "Trees: harvesting crops has a small per-tier chance to drop a rare seed that plants a tree on that tile. 7 species — Pine, Apple, Maple, Oak, Peach, Cactus, Willow.",
      "Trees take 6 energy to fell (100g) and leave a stump worth 50g that takes 4 more energy to clear. Trees and stumps persist across runs.",
      "Dev panel: gold-injection buttons for +50, +100, +500, +1000 (all visible in HUD and Settings), plus +1 Tap Radius and +1 Resource Worth controls in Settings.",
      "End-of-run breakdown now lists every harvested crop type plus felled trees and cleared stumps."
    ]
  },
  {
    version: "0.2.0",
    date: "2026-05-14",
    notes: [
      "Music: replaced the ambient pad with a step-sequenced synthwave bed (Am–F–C–G, 96 BPM) with drums, detuned-saw bass, dotted-eighth delayed lead, and a saw pad.",
      "Settings: added a Developer section with a Dev Panel toggle.",
      "Dev: when Dev Panel is on, a +50g button appears in the HUD (and inside Settings) for quick gold injection."
    ]
  },
  {
    version: "0.1.0",
    date: "2026-05-14",
    notes: [
      "Initial release.",
      "Main Menu: Play, Settings, Patch Notes.",
      "Settings: music volume, FX volume, mute, text size (10/12/14/16pt).",
      "Core loop: tap the field to harvest crops; each tap spends 1 energy.",
      "Start with 5 energy and a small tap radius.",
      "Out-of-energy popup with run total; Continue opens upgrade shop.",
      "Upgrades: max energy, tap radius, tap damage, gold multiplier.",
      "Unlocks: Rye at 50g (2 HP, 2g), Cotton at 200g (3 HP, 5g).",
      "Generative ambient music + tap/harvest FX.",
      "Progress auto-saves to localStorage."
    ]
  }
];
