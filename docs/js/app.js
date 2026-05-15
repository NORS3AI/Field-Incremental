// App shell: routing, settings, patch notes, game loop, upgrade shop.
(function () {
  const body = document.body;
  const hud = document.getElementById("hud");
  const canvas = document.getElementById("field");
  const ctx = canvas.getContext("2d");

  // ---- Persisted slices ----
  const settings = Object.assign(
    { musicVolume: 50, fxVolume: 50, muted: false, textSize: 14, dev: false },
    Storage2.load("settings", {})
  );

  // game state — preserve persisted progress fields, freshen ephemeral ones.
  const saved = Storage2.load("state", {}) || {};
  const state = Game.defaultState();
  if (typeof saved.gold === "number") state.gold = saved.gold;
  if (saved.unlocks) Object.assign(state.unlocks, saved.unlocks);
  if (saved.upgrades) Object.assign(state.upgrades, saved.upgrades);
  if (typeof saved.worthBonus === "number") state.worthBonus = saved.worthBonus;
  if (typeof saved.radiusBonus === "number") state.radiusBonus = saved.radiusBonus;
  if (saved.persistent && typeof saved.persistent === "object") state.persistent = saved.persistent;
  // Always start a fresh run on load (don't store half-played field); trees persist.
  state.energy = Game.derived(state).maxEnergy;
  state.runGold = 0;
  state.runHarvested = Game.defaultState().runHarvested;
  state.field = Game.generateField(state);

  // ---- Routing ----
  function go(view) {
    body.dataset.view = view;
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-" + view).classList.add("active");

    const inPlay = (view === "game" || view === "upgrades");
    hud.classList.toggle("hidden", !inPlay);

    // unlock audio on first navigation (gesture)
    Audio2.unlock();
    if (inPlay || view === "menu" || view === "patchnotes" || view === "settings") {
      Audio2.startMusic();
    }

    if (view === "game") {
      // close any open modal when entering game fresh
      hideEndModal();
      ensureFreshRun();
      paint();
      updateHud();
    }
    if (view === "upgrades") renderUpgrades();
    if (view === "patchnotes") renderPatchNotes();
    if (view === "settings") syncSettingsUI();
  }

  document.querySelectorAll("[data-go]").forEach(b => {
    b.addEventListener("click", () => go(b.dataset.go));
  });

  document.getElementById("hud-menu").addEventListener("click", () => go("menu"));

  // ---- Patch notes ----
  function renderPatchNotes() {
    const list = document.getElementById("patch-list");
    list.innerHTML = "";
    for (const p of window.PATCH_NOTES) {
      const card = document.createElement("div");
      card.className = "patch";
      card.innerHTML =
        `<h3>v${escapeHtml(p.version)}</h3>` +
        `<div class="date">${escapeHtml(p.date)}</div>` +
        `<ul>${p.notes.map(n => `<li>${escapeHtml(n)}</li>`).join("")}</ul>`;
      list.appendChild(card);
    }
  }
  // tag menu version with latest patch
  document.getElementById("menu-version").textContent =
    (window.PATCH_NOTES[0] && window.PATCH_NOTES[0].version) || "0.0.0";

  // ---- Settings ----
  function syncSettingsUI() {
    document.getElementById("music-volume").value = settings.musicVolume;
    document.getElementById("music-volume-val").textContent = settings.musicVolume;
    document.getElementById("fx-volume").value = settings.fxVolume;
    document.getElementById("fx-volume-val").textContent = settings.fxVolume;
    document.getElementById("mute").checked = !!settings.muted;
    document.getElementById("dev-mode").checked = !!settings.dev;
    document.querySelectorAll("[data-text-size]").forEach(b => {
      b.classList.toggle("on", Number(b.dataset.textSize) === Number(settings.textSize));
    });
    applySettings();
  }

  function applySettings() {
    body.style.setProperty("--text-size", settings.textSize + "pt");
    Audio2.setMusicVolume(settings.musicVolume / 100);
    Audio2.setFxVolume(settings.fxVolume / 100);
    Audio2.setMuted(!!settings.muted);
    body.dataset.dev = settings.dev ? "1" : "0";
    document.querySelectorAll(".dev-only").forEach(el => {
      el.classList.toggle("hidden", !settings.dev);
    });
    refreshDevReadouts();
    Storage2.save("settings", settings);
  }

  function refreshDevReadouts() {
    const r = document.getElementById("dev-radius-val");
    const w = document.getElementById("dev-worth-val");
    if (r) r.textContent = Game.derived(state).radius;
    if (w) w.textContent = "+" + (state.worthBonus || 0);
  }

  document.getElementById("music-volume").addEventListener("input", e => {
    settings.musicVolume = Number(e.target.value);
    document.getElementById("music-volume-val").textContent = settings.musicVolume;
    applySettings();
  });
  document.getElementById("fx-volume").addEventListener("input", e => {
    settings.fxVolume = Number(e.target.value);
    document.getElementById("fx-volume-val").textContent = settings.fxVolume;
    applySettings();
  });
  document.getElementById("mute").addEventListener("change", e => {
    settings.muted = !!e.target.checked;
    applySettings();
  });
  document.getElementById("dev-mode").addEventListener("change", e => {
    settings.dev = !!e.target.checked;
    applySettings();
  });

  function addDevGold(amount) {
    state.gold += amount;
    state.runGold += amount;
    Audio2.playPurchase();
    persist();
    updateHud();
    if (body.dataset.view === "upgrades") renderUpgrades();
    toast(`+${amount} gold (dev)`);
  }
  document.querySelectorAll("[data-dev-gold]").forEach(b => {
    b.addEventListener("click", () => addDevGold(Number(b.dataset.devGold)));
  });

  document.getElementById("dev-radius").addEventListener("click", () => {
    state.radiusBonus = (state.radiusBonus || 0) + 1;
    Audio2.playPurchase();
    persist();
    refreshDevReadouts();
    paint();
    toast(`Radius +1 (now ${Game.derived(state).radius})`);
  });
  document.getElementById("dev-worth").addEventListener("click", () => {
    state.worthBonus = (state.worthBonus || 0) + 1;
    Audio2.playPurchase();
    persist();
    refreshDevReadouts();
    toast(`Worth bonus +1 (now +${state.worthBonus})`);
  });
  document.querySelectorAll("[data-text-size]").forEach(b => {
    b.addEventListener("click", () => {
      settings.textSize = Number(b.dataset.textSize);
      syncSettingsUI();
    });
  });

  // apply on boot
  applySettings();

  // ---- Game loop ----
  let hoverPos = null;

  function ensureFreshRun() {
    // If no energy or no field, start a fresh run.
    if (state.energy <= 0) {
      // Modal handles transition; this is a safety net.
      return;
    }
    if (!state.field || state.field.length === 0) {
      state.field = Game.generateField(state);
    }
  }

  function paint() {
    Game.render(ctx, state, hoverPos);
  }

  function updateHud() {
    const d = Game.derived(state);
    document.getElementById("hud-gold").textContent = state.gold;
    document.getElementById("hud-energy").textContent = state.energy;
    document.getElementById("hud-energy-max").textContent = d.maxEnergy;
    document.getElementById("hud-run-gold").textContent = state.runGold;
  }

  function canvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const cx = (evt.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (evt.clientY - rect.top) * (canvas.height / rect.height);
    return { x: cx, y: cy };
  }

  function onTap(evt) {
    if (body.dataset.view !== "game") return;
    if (state.energy <= 0) return;

    evt.preventDefault();
    const pos = canvasPos(evt);

    const { harvested, seedsDropped, goldGained } = Game.applyTap(state, pos.x, pos.y);
    Audio2.unlock();
    Audio2.playTap();
    if (harvested.length) {
      const first = harvested[0].type;
      // Higher pitch for rarer crops; lower pitch for trees/stumps.
      const pitch = harvestPitch(first);
      Audio2.playHarvest(pitch);
    }
    if (seedsDropped && seedsDropped.length) {
      const tree = seedsDropped[0].tree;
      const name = Game.TREES[tree] && Game.TREES[tree].name;
      Audio2.playPurchase();
      toast(`Rare ${name} seed!`);
    }

    // If every crop tile is cleared, regenerate fresh crops (trees/stumps stay).
    if (Game.cropsAllCleared(state)) {
      state.field = Game.generateField(state);
      toast("New field!");
    }

    persist();
    paint();
    updateHud();

    if (state.energy <= 0) {
      showEndModal();
    }
  }

  function harvestPitch(type) {
    if (Game.isCrop(type)) {
      const tier = Game.CROP_KEYS.indexOf(type);
      return 440 + tier * 50; // climbs with crop tier
    }
    if (Game.isTree(type)) return 220;
    if (Game.isStump(type)) return 180;
    return 660;
  }

  function onMove(evt) {
    if (body.dataset.view !== "game") return;
    hoverPos = canvasPos(evt);
    paint();
  }
  function onLeave() { hoverPos = null; paint(); }

  canvas.addEventListener("pointerdown", onTap);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  // ---- End-of-run modal ----
  const endModal = document.getElementById("end-modal");

  function showEndModal() {
    document.getElementById("end-gold").textContent = state.runGold;
    const breakdown = document.getElementById("end-breakdown");
    breakdown.innerHTML = "";
    const rows = [];
    for (const k of Game.CROP_KEYS) {
      if (state.runHarvested[k] > 0) rows.push([Game.CROPS[k].name, state.runHarvested[k]]);
    }
    for (const k of Game.TREE_KEYS) {
      if (state.runHarvested[k] > 0) rows.push([Game.TREES[k].name + " tree", state.runHarvested[k]]);
    }
    if (state.runHarvested.stump > 0) rows.push(["Stumps", state.runHarvested.stump]);
    for (const [label, n] of rows) {
      const li = document.createElement("li");
      li.textContent = `${label}: ${n}`;
      breakdown.appendChild(li);
    }
    endModal.classList.remove("hidden");
  }
  function hideEndModal() { endModal.classList.add("hidden"); }

  document.getElementById("end-continue").addEventListener("click", () => {
    hideEndModal();
    go("upgrades");
  });

  // ---- Upgrade shop ----
  function renderUpgrades() {
    const list = document.getElementById("upgrade-list");
    list.innerHTML = "";
    for (const key of Object.keys(Game.UPGRADES)) {
      const u = Game.UPGRADES[key];
      const lvl = state.upgrades[key];
      const cost = Game.upgradeCost(key, lvl);
      const card = document.createElement("div");
      card.className = "upgrade";
      card.innerHTML =
        `<div class="name">${escapeHtml(u.name)}</div>` +
        `<button type="button" data-buy="${key}" ${state.gold < cost ? "disabled" : ""}>Buy ${cost}g</button>` +
        `<div class="level">Level ${lvl}</div>` +
        `<div class="desc">${escapeHtml(u.desc)}</div>`;
      list.appendChild(card);
    }
    list.querySelectorAll("[data-buy]").forEach(b => {
      b.addEventListener("click", () => buyUpgrade(b.dataset.buy));
    });

    const unlocks = document.getElementById("unlock-list");
    unlocks.innerHTML = "";
    const unlockKeys = Game.CROP_KEYS.filter(k => k !== "wheat");
    for (const key of unlockKeys) {
      const def = Game.CROPS[key];
      const owned = state.unlocks[key];
      const card = document.createElement("div");
      card.className = "upgrade";
      const action = owned
        ? `<button class="locked" disabled>Unlocked</button>`
        : `<button type="button" data-unlock="${key}" ${state.gold < def.unlockCost ? "disabled" : ""}>Unlock ${def.unlockCost}g</button>`;
      card.innerHTML =
        `<div class="name">Unlock ${escapeHtml(def.name)}</div>` +
        action +
        `<div class="desc">${cropBlurb(key)}</div>`;
      unlocks.appendChild(card);
    }
    unlocks.querySelectorAll("[data-unlock]").forEach(b => {
      b.addEventListener("click", () => unlockCrop(b.dataset.unlock));
    });

    updateHud();
  }

  function cropBlurb(key) {
    const def = Game.CROPS[key];
    const seedPct = Math.round((def.seedChance || 0) * 100);
    return `${def.hp} HP · ${def.gold}g per harvest. Seed drop ~${seedPct}%. Mixes into the field once unlocked.`;
  }

  function buyUpgrade(key) {
    const lvl = state.upgrades[key];
    const cost = Game.upgradeCost(key, lvl);
    if (state.gold < cost) return;
    state.gold -= cost;
    state.upgrades[key] = lvl + 1;
    Audio2.playPurchase();
    persist();
    renderUpgrades();
  }

  function unlockCrop(key) {
    const def = Game.CROPS[key];
    if (state.unlocks[key]) return;
    if (state.gold < def.unlockCost) return;
    state.gold -= def.unlockCost;
    state.unlocks[key] = true;
    Audio2.playPurchase();
    toast(`${def.name} unlocked!`);
    persist();
    renderUpgrades();
  }

  document.getElementById("upgrades-continue").addEventListener("click", () => {
    // Start fresh run with refilled energy + regenerated field.
    const d = Game.derived(state);
    state.energy = d.maxEnergy;
    state.runGold = 0;
    state.runHarvested = Game.defaultState().runHarvested;
    state.field = Game.generateField(state);
    persist();
    go("game");
  });

  // ---- Persistence ----
  function persist() {
    Storage2.save("state", {
      gold: state.gold,
      unlocks: state.unlocks,
      upgrades: state.upgrades,
      worthBonus: state.worthBonus,
      radiusBonus: state.radiusBonus,
      persistent: state.persistent
    });
  }

  // ---- Toast ----
  let toastTimer = null;
  const toastEl = document.getElementById("toast");
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 1400);
  }

  // ---- Util ----
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // ---- Boot ----
  go("menu");
  paint();
  updateHud();
})();
