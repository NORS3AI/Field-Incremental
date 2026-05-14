// Field Incremental — core game model & render
(function () {
  // ---- Crop definitions ----
  const CROPS = {
    wheat:  { name: "Wheat",  hp: 1, gold: 1, color: "#f0c049", stalk: "#7c5a18", emoji: "🌾", unlocked: true,  unlockCost: 0   },
    rye:    { name: "Rye",    hp: 2, gold: 2, color: "#b9803b", stalk: "#5e3a14", emoji: "🌿", unlocked: false, unlockCost: 50  },
    cotton: { name: "Cotton", hp: 3, gold: 5, color: "#f4f0e6", stalk: "#7a8c4b", emoji: "☁️", unlocked: false, unlockCost: 200 }
  };

  // ---- Upgrade catalog ----
  // baseCost grows by costMul^level. Effect computed in derived().
  const UPGRADES = {
    energy: {
      name: "Max Energy",
      desc: "+1 energy per run.",
      baseCost: 10, costMul: 1.8,
      effect: lvl => lvl // +lvl max energy
    },
    radius: {
      name: "Tap Radius",
      desc: "Wider tap area to hit more crops.",
      baseCost: 20, costMul: 1.9,
      effect: lvl => lvl * 5 // +5px radius per level
    },
    damage: {
      name: "Tap Damage",
      desc: "More damage to each crop per tap.",
      baseCost: 60, costMul: 2.4,
      effect: lvl => lvl // +1 damage per level (expensive)
    },
    multiplier: {
      name: "Gold Multiplier",
      desc: "+25% gold per harvest.",
      baseCost: 40, costMul: 2.0,
      effect: lvl => lvl * 0.25 // additive multiplier increment
    }
  };

  const FIELD_COLS = 10;
  const FIELD_ROWS = 10;
  const FIELD_PX = 400;
  const CELL = FIELD_PX / FIELD_COLS;

  // ---- Default state ----
  function defaultState() {
    return {
      gold: 0,
      runGold: 0,
      runHarvested: { wheat: 0, rye: 0, cotton: 0 },
      energy: 5,
      unlocks: { wheat: true, rye: false, cotton: false },
      upgrades: { energy: 0, radius: 0, damage: 0, multiplier: 0 },
      field: [],          // array of crop instances
      fieldSeed: null     // not yet seeded
    };
  }

  // ---- Derived stats ----
  function derived(state) {
    return {
      maxEnergy: 5 + UPGRADES.energy.effect(state.upgrades.energy),
      radius:    22 + UPGRADES.radius.effect(state.upgrades.radius),
      damage:    1 + UPGRADES.damage.effect(state.upgrades.damage),
      goldMult:  1 + UPGRADES.multiplier.effect(state.upgrades.multiplier)
    };
  }

  function upgradeCost(key, level) {
    const u = UPGRADES[key];
    return Math.floor(u.baseCost * Math.pow(u.costMul, level));
  }

  // ---- Field generation ----
  function generateField(state) {
    const types = ["wheat"];
    if (state.unlocks.rye)    types.push("rye");
    if (state.unlocks.cotton) types.push("cotton");

    // Weights: keep wheat dominant; less common for higher-tier crops.
    const weight = { wheat: 5, rye: 3, cotton: 2 };

    const out = [];
    for (let r = 0; r < FIELD_ROWS; r++) {
      for (let c = 0; c < FIELD_COLS; c++) {
        const type = weightedPick(types, weight);
        const def = CROPS[type];
        out.push({
          x: c * CELL + CELL / 2,
          y: r * CELL + CELL / 2,
          type,
          hp: def.hp,
          maxHp: def.hp,
          harvested: false,
          // small jitter for visual variety
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
    for (const t of types) total += weights[t];
    let r = Math.random() * total;
    for (const t of types) {
      r -= weights[t];
      if (r <= 0) return t;
    }
    return types[0];
  }

  // ---- Tap handling ----
  // Returns { harvestedCrops, goldGained } for this tap.
  function applyTap(state, tapX, tapY) {
    const d = derived(state);
    const r2 = d.radius * d.radius;
    const harvested = [];
    let goldGained = 0;

    for (const crop of state.field) {
      if (crop.harvested) continue;
      const dx = crop.x - tapX;
      const dy = crop.y - tapY;
      if (dx * dx + dy * dy <= r2) {
        crop.hp -= d.damage;
        if (crop.hp <= 0) {
          crop.harvested = true;
          const def = CROPS[crop.type];
          const g = Math.max(1, Math.round(def.gold * d.goldMult));
          goldGained += g;
          state.runGold += g;
          state.gold += g;
          state.runHarvested[crop.type]++;
          harvested.push(crop);
        }
      }
    }

    state.energy = Math.max(0, state.energy - 1);
    return { harvested, goldGained };
  }

  // ---- Rendering ----
  function render(ctx, state, hoverPos) {
    ctx.clearRect(0, 0, FIELD_PX, FIELD_PX);

    // dirt rows
    for (let r = 0; r < FIELD_ROWS; r++) {
      const shade = r % 2 === 0 ? "#7a5a22" : "#6e511e";
      ctx.fillStyle = shade;
      ctx.fillRect(0, r * CELL, FIELD_PX, CELL);
    }
    // subtle plow lines
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= FIELD_COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, FIELD_PX);
      ctx.stroke();
    }

    // crops
    for (const crop of state.field) {
      if (crop.harvested) {
        drawStub(ctx, crop);
      } else {
        drawCrop(ctx, crop);
      }
    }

    // tap-radius hover ring
    if (hoverPos) {
      const d = derived(state);
      ctx.beginPath();
      ctx.arc(hoverPos.x, hoverPos.y, d.radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawCrop(ctx, crop) {
    const def = CROPS[crop.type];
    const cx = crop.x + crop.jx;
    const cy = crop.y + crop.jy;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(crop.rot);

    if (crop.type === "wheat") {
      // stalk
      ctx.strokeStyle = def.stalk;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(0, -10);
      ctx.stroke();
      // head
      ctx.fillStyle = def.color;
      for (let i = 0; i < 3; i++) {
        const yy = -10 + i * 5;
        ctx.beginPath();
        ctx.ellipse(-3, yy, 2.5, 4, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(3, yy, 2.5, 4, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (crop.type === "rye") {
      // taller, browner
      ctx.strokeStyle = def.stalk;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(0, -14);
      ctx.stroke();
      ctx.fillStyle = def.color;
      for (let i = 0; i < 4; i++) {
        const yy = -14 + i * 5;
        ctx.beginPath();
        ctx.ellipse(-3, yy, 2.2, 3.5, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(3, yy, 2.2, 3.5, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // hp pip
      drawHpPips(ctx, crop, def.maxHp || def.hp);
    } else if (crop.type === "cotton") {
      // green stem
      ctx.strokeStyle = def.stalk;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(0, 0);
      ctx.stroke();
      // white puffs
      ctx.fillStyle = def.color;
      [[-4,-2],[4,-2],[0,-8],[-2,-12],[2,-12]].forEach(([px,py]) => {
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      });
      drawHpPips(ctx, crop, CROPS.cotton.hp);
    }

    ctx.restore();
  }

  function drawHpPips(ctx, crop, maxHp) {
    const remaining = crop.hp;
    const total = maxHp;
    const w = 12;
    const pipW = w / total;
    ctx.save();
    ctx.translate(-w / 2, 16);
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i < remaining ? "#cfe680" : "#3a2710";
      ctx.fillRect(i * pipW, 0, pipW - 1, 3);
    }
    ctx.restore();
  }

  function drawStub(ctx, crop) {
    ctx.save();
    ctx.translate(crop.x + crop.jx, crop.y + crop.jy);
    ctx.fillStyle = "#3a2710";
    ctx.fillRect(-3, 12, 6, 3);
    ctx.restore();
  }

  // ---- Expose ----
  window.Game = {
    CROPS, UPGRADES,
    FIELD_COLS, FIELD_ROWS, FIELD_PX, CELL,
    defaultState, derived, upgradeCost,
    generateField, applyTap, render
  };
})();
