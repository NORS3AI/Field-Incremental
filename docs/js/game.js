// Field Incremental — core game model & render
(function () {
  // ---- Crop definitions ----
  // seedChance is the per-harvest probability of dropping a rare tree seed.
  const CROPS = {
    wheat:      { name: "Wheat",      hp: 1,  gold: 1,   unlockCost: 0,     seedChance: 0.01,
                  color: "#f0c049", stalk: "#7c5a18" },
    rye:        { name: "Rye",        hp: 2,  gold: 2,   unlockCost: 50,    seedChance: 0.02,
                  color: "#b9803b", stalk: "#5e3a14" },
    cotton:     { name: "Cotton",     hp: 3,  gold: 5,   unlockCost: 200,   seedChance: 0.03,
                  color: "#f4f0e6", stalk: "#7a8c4b" },
    carrot:     { name: "Carrot",     hp: 3,  gold: 8,   unlockCost: 400,   seedChance: 0.04,
                  color: "#e07a2c", stalk: "#3a8a2c" },
    pumpkin:    { name: "Pumpkin",    hp: 4,  gold: 14,  unlockCost: 800,   seedChance: 0.05,
                  color: "#e08a25", stalk: "#3a6a14" },
    corn:       { name: "Corn",       hp: 5,  gold: 22,  unlockCost: 1500,  seedChance: 0.06,
                  color: "#f5d22a", stalk: "#3a7a18" },
    sugarcane:  { name: "Sugarcane",  hp: 6,  gold: 35,  unlockCost: 3000,  seedChance: 0.07,
                  color: "#cfe680", stalk: "#3a5a14" },
    tomato:     { name: "Tomato",     hp: 7,  gold: 55,  unlockCost: 6000,  seedChance: 0.08,
                  color: "#d22a2a", stalk: "#3a6a14" },
    sunflower:  { name: "Sunflower",  hp: 9,  gold: 85,  unlockCost: 12000, seedChance: 0.10,
                  color: "#f5c422", stalk: "#3a6a14" },
    watermelon: { name: "Watermelon", hp: 12, gold: 130, unlockCost: 25000, seedChance: 0.12,
                  color: "#2c8a3a", stalk: "#1a5a22" }
  };
  const CROP_KEYS = Object.keys(CROPS);

  // ---- Tree definitions ----
  // All trees share HP/gold, only visuals differ.
  const TREE_HP = 6;
  const TREE_GOLD = 100;
  const STUMP_HP = 4;
  const STUMP_GOLD = 50;
  const TREES = {
    "tree-pine":   { name: "Pine",   hp: TREE_HP, gold: TREE_GOLD, foliage: "#1f5a2a", trunk: "#5a3a18" },
    "tree-apple":  { name: "Apple",  hp: TREE_HP, gold: TREE_GOLD, foliage: "#4a9a3a", trunk: "#5a3a18", fruit: "#d22a2a" },
    "tree-maple":  { name: "Maple",  hp: TREE_HP, gold: TREE_GOLD, foliage: "#d2622a", trunk: "#5a3a18" },
    "tree-oak":    { name: "Oak",    hp: TREE_HP, gold: TREE_GOLD, foliage: "#3a7a2a", trunk: "#6a4a22" },
    "tree-peach":  { name: "Peach",  hp: TREE_HP, gold: TREE_GOLD, foliage: "#6a9a4a", trunk: "#5a3a18", fruit: "#f5a48a" },
    "tree-cactus": { name: "Cactus", hp: TREE_HP, gold: TREE_GOLD, foliage: "#3aaa5a", trunk: "#3aaa5a" },
    "tree-willow": { name: "Willow", hp: TREE_HP, gold: TREE_GOLD, foliage: "#a2c25a", trunk: "#6a4a22" }
  };
  const TREE_KEYS = Object.keys(TREES);
  const STUMP = { name: "Stump", hp: STUMP_HP, gold: STUMP_GOLD };

  function isCrop(type) { return CROPS.hasOwnProperty(type); }
  function isTree(type) { return TREES.hasOwnProperty(type); }
  function isStump(type) { return type === "stump"; }
  function entityDef(type) {
    if (isCrop(type)) return CROPS[type];
    if (isTree(type)) return TREES[type];
    if (isStump(type)) return STUMP;
    return null;
  }

  // ---- Upgrade catalog ----
  const UPGRADES = {
    energy: {
      name: "Max Energy", desc: "+1 energy per run.",
      baseCost: 10, costMul: 1.8,
      effect: lvl => lvl
    },
    radius: {
      name: "Tap Radius", desc: "Wider tap area to hit more crops.",
      baseCost: 20, costMul: 1.9,
      effect: lvl => lvl * 5
    },
    damage: {
      name: "Tap Damage", desc: "More damage to each crop per tap.",
      baseCost: 60, costMul: 2.4,
      effect: lvl => lvl
    },
    multiplier: {
      name: "Gold Multiplier", desc: "+25% gold per harvest.",
      baseCost: 40, costMul: 2.0,
      effect: lvl => lvl * 0.25
    }
  };

  const FIELD_COLS = 10;
  const FIELD_ROWS = 10;
  const FIELD_PX = 400;
  const CELL = FIELD_PX / FIELD_COLS;

  // ---- Default state ----
  function emptyHarvested() {
    const out = {};
    for (const k of CROP_KEYS) out[k] = 0;
    for (const k of TREE_KEYS) out[k] = 0;
    out.stump = 0;
    return out;
  }

  function defaultState() {
    const unlocks = {};
    for (const k of CROP_KEYS) unlocks[k] = (k === "wheat");
    return {
      gold: 0,
      runGold: 0,
      runHarvested: emptyHarvested(),
      energy: 5,
      unlocks,
      upgrades: { energy: 0, radius: 0, damage: 0, multiplier: 0 },
      worthBonus: 0,                   // dev/upgrade additive bonus on every entity's gold
      radiusBonus: 0,                  // dev additive bonus on tap radius (pixels)
      persistent: {},                  // map "row,col" -> { type, hp, maxHp }
      field: [],
      fieldSeed: null
    };
  }

  // ---- Derived stats ----
  function derived(state) {
    return {
      maxEnergy: 5 + UPGRADES.energy.effect(state.upgrades.energy),
      radius:    22 + UPGRADES.radius.effect(state.upgrades.radius) + (state.radiusBonus || 0),
      damage:    1 + UPGRADES.damage.effect(state.upgrades.damage),
      goldMult:  1 + UPGRADES.multiplier.effect(state.upgrades.multiplier)
    };
  }

  function upgradeCost(key, level) {
    const u = UPGRADES[key];
    return Math.floor(u.baseCost * Math.pow(u.costMul, level));
  }

  // ---- Field generation ----
  // Persistent tiles (trees/stumps) keep their state; everything else gets a fresh crop.
  function generateField(state) {
    const types = CROP_KEYS.filter(k => state.unlocks[k]);
    // Weight ordering: earlier crops more common.
    const weights = {
      wheat: 16, rye: 12, cotton: 9, carrot: 7, pumpkin: 6,
      corn: 5, sugarcane: 4, tomato: 3, sunflower: 2, watermelon: 1
    };

    const out = [];
    for (let r = 0; r < FIELD_ROWS; r++) {
      for (let c = 0; c < FIELD_COLS; c++) {
        const key = r + "," + c;
        const px = c * CELL + CELL / 2;
        const py = r * CELL + CELL / 2;
        const persisted = state.persistent && state.persistent[key];
        if (persisted) {
          out.push({
            x: px, y: py, row: r, col: c,
            type: persisted.type,
            hp: persisted.hp,
            maxHp: persisted.maxHp,
            dead: false,
            jx: 0, jy: 0, rot: 0
          });
          continue;
        }
        const type = weightedPick(types, weights);
        const def = CROPS[type];
        out.push({
          x: px, y: py, row: r, col: c,
          type, hp: def.hp, maxHp: def.hp,
          dead: false,
          jx: (Math.random() - 0.5) * (CELL * 0.25),
          jy: (Math.random() - 0.5) * (CELL * 0.25),
          rot: (Math.random() - 0.5) * 0.4
        });
      }
    }
    return out;
  }

  function weightedPick(types, weights) {
    let total = 0;
    for (const t of types) total += (weights[t] || 1);
    let r = Math.random() * total;
    for (const t of types) {
      r -= (weights[t] || 1);
      if (r <= 0) return t;
    }
    return types[0];
  }

  function pickTreeSpecies() {
    return TREE_KEYS[Math.floor(Math.random() * TREE_KEYS.length)];
  }

  function persistKey(e) { return e.row + "," + e.col; }

  // ---- Tap handling ----
  function applyTap(state, tapX, tapY) {
    const d = derived(state);
    const r2 = d.radius * d.radius;
    const harvested = [];
    const seedsDropped = [];
    let goldGained = 0;

    for (const e of state.field) {
      if (e.dead) continue;
      const dx = e.x - tapX;
      const dy = e.y - tapY;
      if (dx * dx + dy * dy > r2) continue;

      e.hp -= d.damage;

      if (e.hp <= 0) {
        const def = entityDef(e.type);
        const baseGold = (def.gold || 0) + (state.worthBonus || 0);
        const g = Math.max(1, Math.round(baseGold * d.goldMult));
        goldGained += g;
        state.runGold += g;
        state.gold += g;
        state.runHarvested[e.type] = (state.runHarvested[e.type] || 0) + 1;
        harvested.push({ type: e.type, x: e.x, y: e.y, gold: g });

        if (isCrop(e.type)) {
          e.dead = true;
          const def2 = CROPS[e.type];
          if (Math.random() < (def2.seedChance || 0)) {
            const tree = pickTreeSpecies();
            const tdef = TREES[tree];
            e.type = tree;
            e.hp = tdef.hp;
            e.maxHp = tdef.hp;
            e.dead = false;
            e.jx = 0; e.jy = 0; e.rot = 0;
            state.persistent[persistKey(e)] = { type: tree, hp: tdef.hp, maxHp: tdef.hp };
            seedsDropped.push({ tree, x: e.x, y: e.y });
          }
        } else if (isTree(e.type)) {
          // Convert in-place to stump.
          e.type = "stump";
          e.hp = STUMP.hp;
          e.maxHp = STUMP.hp;
          state.persistent[persistKey(e)] = { type: "stump", hp: STUMP.hp, maxHp: STUMP.hp };
        } else if (isStump(e.type)) {
          e.dead = true;
          delete state.persistent[persistKey(e)];
        }
      } else {
        // Partial damage — sync persistent HP if applicable.
        const k = persistKey(e);
        if (state.persistent[k]) {
          state.persistent[k].hp = e.hp;
        }
      }
    }

    state.energy = Math.max(0, state.energy - 1);
    return { harvested, seedsDropped, goldGained };
  }

  // True when every crop tile has been cleared (trees/stumps don't count).
  function cropsAllCleared(state) {
    return state.field.every(e => e.dead || !isCrop(e.type));
  }

  // ---- Rendering ----
  function render(ctx, state, hoverPos) {
    ctx.clearRect(0, 0, FIELD_PX, FIELD_PX);

    for (let r = 0; r < FIELD_ROWS; r++) {
      ctx.fillStyle = r % 2 === 0 ? "#7a5a22" : "#6e511e";
      ctx.fillRect(0, r * CELL, FIELD_PX, CELL);
    }
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= FIELD_COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, FIELD_PX); ctx.stroke();
    }

    for (const e of state.field) {
      if (e.dead) { drawCleared(ctx, e); continue; }
      if (isCrop(e.type)) drawCrop(ctx, e);
      else if (isTree(e.type)) drawTree(ctx, e);
      else if (isStump(e.type)) drawStump(ctx, e);
    }

    if (hoverPos) {
      const d = derived(state);
      ctx.beginPath();
      ctx.arc(hoverPos.x, hoverPos.y, d.radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawCrop(ctx, e) {
    const def = CROPS[e.type];
    const cx = e.x + e.jx;
    const cy = e.y + e.jy;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(e.rot);
    switch (e.type) {
      case "wheat":      drawWheat(ctx, def); break;
      case "rye":        drawRye(ctx, def); break;
      case "cotton":     drawCotton(ctx, def); break;
      case "carrot":     drawCarrot(ctx, def); break;
      case "pumpkin":    drawPumpkin(ctx, def); break;
      case "corn":       drawCorn(ctx, def); break;
      case "sugarcane":  drawSugarcane(ctx, def); break;
      case "tomato":     drawTomato(ctx, def); break;
      case "sunflower":  drawSunflower(ctx, def); break;
      case "watermelon": drawWatermelon(ctx, def); break;
    }
    ctx.restore();
    if (e.maxHp > 1) drawHpPips(ctx, e);
  }

  function drawWheat(ctx, def) {
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -10); ctx.stroke();
    ctx.fillStyle = def.color;
    for (let i = 0; i < 3; i++) {
      const yy = -10 + i * 5;
      ctx.beginPath(); ctx.ellipse(-3, yy, 2.5, 4, -0.4, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, yy, 2.5, 4, 0.4, 0, Math.PI*2); ctx.fill();
    }
  }
  function drawRye(ctx, def) {
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -14); ctx.stroke();
    ctx.fillStyle = def.color;
    for (let i = 0; i < 4; i++) {
      const yy = -14 + i * 5;
      ctx.beginPath(); ctx.ellipse(-3, yy, 2.2, 3.5, -0.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, yy, 2.2, 3.5, 0.5, 0, Math.PI*2); ctx.fill();
    }
  }
  function drawCotton(ctx, def) {
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, 0); ctx.stroke();
    ctx.fillStyle = def.color;
    [[-4,-2],[4,-2],[0,-8],[-2,-12],[2,-12]].forEach(([px,py]) => {
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI*2); ctx.fill();
    });
  }
  function drawCarrot(ctx, def) {
    // Green tuft
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i += 3) {
      ctx.beginPath(); ctx.moveTo(i, -8); ctx.lineTo(i * 0.5, -14); ctx.stroke();
    }
    // Orange triangle
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(-5, -8); ctx.lineTo(5, -8); ctx.lineTo(0, 8); ctx.closePath(); ctx.fill();
    // Ridges
    ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke();
  }
  function drawPumpkin(ctx, def) {
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -12); ctx.stroke();
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.ellipse(0, 2, 10, 8, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1;
    [-6, -2, 2, 6].forEach(x => {
      ctx.beginPath();
      ctx.ellipse(x, 2, 1.5, 7, 0, 0, Math.PI*2);
      ctx.stroke();
    });
  }
  function drawCorn(ctx, def) {
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -14); ctx.stroke();
    // Leaves
    ctx.fillStyle = def.stalk;
    ctx.beginPath(); ctx.ellipse(-5, 0, 6, 2, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(5, -4, 6, 2, 0.3, 0, Math.PI*2); ctx.fill();
    // Cob
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.ellipse(0, -6, 3, 8, 0, 0, Math.PI*2); ctx.fill();
    // Kernels
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (let y = -12; y <= 0; y += 3) {
      ctx.fillRect(-2, y, 1, 1); ctx.fillRect(1, y, 1, 1);
    }
  }
  function drawSugarcane(ctx, def) {
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 3;
    [-4, 0, 4].forEach(x => {
      ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x, -14); ctx.stroke();
    });
    ctx.fillStyle = def.color;
    [-4, 0, 4].forEach(x => {
      for (let y = -14; y <= 14; y += 5) {
        ctx.fillRect(x - 2, y - 1, 4, 2);
      }
    });
  }
  function drawTomato(ctx, def) {
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -2); ctx.stroke();
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(0, 4, 8, 0, Math.PI*2); ctx.fill();
    // Sepals (green star top)
    ctx.fillStyle = def.stalk;
    [[-6,-2],[0,-6],[6,-2],[-3,-4],[3,-4]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.ellipse(x, y, 2.5, 1.5, 0, 0, Math.PI*2); ctx.fill();
    });
    // Highlight
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath(); ctx.ellipse(-3, 1, 2, 1.5, -0.6, 0, Math.PI*2); ctx.fill();
  }
  function drawSunflower(ctx, def) {
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, -4); ctx.stroke();
    // Petals
    ctx.fillStyle = def.color;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = Math.cos(a) * 8;
      const py = Math.sin(a) * 8 - 4;
      ctx.beginPath();
      ctx.ellipse(px, py, 3, 5, a, 0, Math.PI*2);
      ctx.fill();
    }
    // Center
    ctx.fillStyle = "#4a2a14";
    ctx.beginPath(); ctx.arc(0, -4, 4, 0, Math.PI*2); ctx.fill();
  }
  function drawWatermelon(ctx, def) {
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(-1, -10); ctx.stroke();
    // Body
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.ellipse(0, 4, 11, 9, 0, 0, Math.PI*2); ctx.fill();
    // Stripes
    ctx.strokeStyle = def.stalk; ctx.lineWidth = 1.2;
    for (let i = -8; i <= 8; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, -3); ctx.quadraticCurveTo(i * 1.2, 4, i, 11);
      ctx.stroke();
    }
  }

  function drawTree(ctx, e) {
    const def = TREES[e.type];
    const cx = e.x;
    const cy = e.y;
    ctx.save();
    ctx.translate(cx, cy);
    // Trunk
    ctx.fillStyle = def.trunk;
    ctx.fillRect(-3, 4, 6, 14);
    // Foliage by species
    switch (e.type) {
      case "tree-pine":   drawPine(ctx, def); break;
      case "tree-apple":  drawRoundFoliage(ctx, def, true); break;
      case "tree-maple":  drawRoundFoliage(ctx, def, false); break;
      case "tree-oak":    drawOakFoliage(ctx, def); break;
      case "tree-peach":  drawRoundFoliage(ctx, def, true); break;
      case "tree-cactus": drawCactus(ctx, def); break;
      case "tree-willow": drawWillow(ctx, def); break;
    }
    ctx.restore();
    drawHpPips(ctx, e);
  }

  function drawPine(ctx, def) {
    ctx.fillStyle = def.foliage;
    [[-9,2],[-7,-4],[-5,-10],[-3,-16]].forEach(([w, y]) => {
      ctx.beginPath();
      ctx.moveTo(w, y); ctx.lineTo(-w, y); ctx.lineTo(0, y - 6);
      ctx.closePath(); ctx.fill();
    });
  }
  function drawRoundFoliage(ctx, def, withFruit) {
    ctx.fillStyle = def.foliage;
    ctx.beginPath(); ctx.arc(0, -6, 10, 0, Math.PI*2); ctx.fill();
    if (withFruit && def.fruit) {
      ctx.fillStyle = def.fruit;
      [[-5,-4],[4,-8],[-2,-10],[5,-2],[-6,-9]].forEach(([x,y]) => {
        ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI*2); ctx.fill();
      });
    }
  }
  function drawOakFoliage(ctx, def) {
    ctx.fillStyle = def.foliage;
    [[-7,-4],[7,-4],[0,-12],[-4,-9],[4,-9]].forEach(([x,y]) => {
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI*2); ctx.fill();
    });
  }
  function drawCactus(ctx, def) {
    ctx.fillStyle = def.foliage;
    ctx.fillRect(-3, -16, 6, 22);
    ctx.fillRect(-9, -8, 6, 4);
    ctx.fillRect(-9, -8, 4, -6);
    ctx.fillRect(3, -10, 6, 4);
    ctx.fillRect(5, -16, 4, 6);
    ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1;
    for (let y = -14; y <= 4; y += 4) {
      ctx.beginPath(); ctx.moveTo(-3, y); ctx.lineTo(3, y); ctx.stroke();
    }
  }
  function drawWillow(ctx, def) {
    ctx.fillStyle = def.foliage;
    ctx.beginPath(); ctx.arc(0, -10, 9, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = def.foliage; ctx.lineWidth = 1.5;
    for (let i = -8; i <= 8; i += 3) {
      ctx.beginPath();
      ctx.moveTo(i, -6); ctx.lineTo(i + (Math.abs(i) > 4 ? 2 : 0), 4);
      ctx.stroke();
    }
  }

  function drawStump(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    // Stump face
    ctx.fillStyle = "#6a4a22";
    ctx.beginPath(); ctx.ellipse(0, 4, 8, 5, 0, 0, Math.PI*2); ctx.fill();
    // Rings
    ctx.strokeStyle = "#3a2710"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 4, 5, 3, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 4, 2.5, 1.5, 0, 0, Math.PI*2); ctx.stroke();
    // Lower body
    ctx.fillStyle = "#4a2a14";
    ctx.fillRect(-6, 8, 12, 4);
    ctx.restore();
    drawHpPips(ctx, e);
  }

  function drawCleared(ctx, e) {
    // Empty harvested tile — just a tiny mark on the dirt.
    ctx.save();
    ctx.translate(e.x + (e.jx || 0), e.y + (e.jy || 0));
    ctx.fillStyle = "#3a2710";
    ctx.fillRect(-3, 12, 6, 3);
    ctx.restore();
  }

  function drawHpPips(ctx, e) {
    const total = e.maxHp || 1;
    if (total <= 1) return;
    const w = Math.min(20, 4 + total * 2);
    const pipW = w / total;
    ctx.save();
    ctx.translate(e.x - w / 2, e.y + 18);
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i < e.hp ? "#cfe680" : "#3a2710";
      ctx.fillRect(i * pipW, 0, pipW - 1, 3);
    }
    ctx.restore();
  }

  // ---- Expose ----
  window.Game = {
    CROPS, TREES, STUMP, CROP_KEYS, TREE_KEYS,
    UPGRADES,
    FIELD_COLS, FIELD_ROWS, FIELD_PX, CELL,
    defaultState, derived, upgradeCost,
    generateField, applyTap, render,
    cropsAllCleared, isCrop, isTree, isStump, entityDef
  };
})();
