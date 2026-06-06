const DATA_URL = "./data/buildings.json";
const SAVE_KEY = "idle-civ-save-v1";
const RESOURCE_NAMES = {
  W: "Wood",
  S: "Stone",
  E: "Energy",
  F: "Food",
  P: "Population",
};

const DEFAULT_START = {
  W: 40,
  S: 25,
  E: 5,
  F: 35,
  P: 12,
};

const TICK_STEP = 0.2; // seconds per simulation step
const MAX_TICKS_PER_FRAME = 5; // avoid spiral-of-death on slow machines
const MAX_FRAME_DELTA = 1; // seconds; cap catch-up after tab/app stalls
const MAX_TICK_ITERATIONS = 100; // hard limit for manual/offline catch-up loops
const AUTOSAVE_INTERVAL = 30; // seconds
const OFFLINE_CAP = 60 * 60 * 8; // 8 hours
const ERA_UNLOCK_SCALE = 3.0;
const AUTOMATION_INTERVAL = 0.5; // seconds between automation passes
const AUTOMATION_MAX_BATCH = 50; // max units purchased per building per pass
const MAX_AUTOMATION_PASSES = 5; // hard cap to keep catch-up work bounded
const RENDER_INTERVAL_MS = 250;
const HEAVY_RENDER_INTERVAL_MS = 1000;
const EVENT_LOG_LIMIT = 6;

class BuildingDefinition {
  constructor(data) {
    this.identifier = data.identifier;
    this.name = data.name;
    this.era = data.era;
    this.era_index = data.era_index;
    this.index_in_era = data.index_in_era;
    this.tags = data.tags;
    this.base_rate = Number(data.base_rate);
    this.base_cost = Number(data.base_cost);
    this.growth = Number(data.growth);
    this.cost_shares = data.cost_shares || { W: 1 };
    this.synergy_a = data.synergy_a;
    this.synergy_b = data.synergy_b;
    this.synergy_a_data = data.synergy_a_data || {};
    this.synergy_b_data = data.synergy_b_data || {};
    this.unique_upgrade = data.unique_upgrade;
  }
}

class BuildingState {
  constructor(definition) {
    this.definition = definition;
    this.owned = 0;
    this.automation = false;
  }
}

class Game {
  constructor(definitions) {
    this.definitions = definitions;
    this.states = definitions.map((def) => new BuildingState(def));
    this.stateById = new Map();
    for (const state of this.states) {
      this.stateById.set(state.definition.identifier, state);
    }
    this.reset();
    this.lastSummary = this.computeProductionSummary();
    this.autosaveEnabled = true;
    this._autosaveTimer = 0;
    this._automationTimer = 0;
  }

  _seedStartingBuildings() {
    let seeded = 0;
    for (const state of this.states) {
      if (state.definition.era_index === 1 && state.definition.index_in_era <= 5) {
        if (state.owned < 1) {
          state.owned = 1;
        }
        seeded += 1;
        if (seeded >= 5) break;
      }
    }
  }

  reset() {
    this.resources = { ...DEFAULT_START };
    this.totalProduced = Object.keys(RESOURCE_NAMES).reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
    this.eraUnlocked = 1;
    this.elapsedSeconds = 0;
    this.pendingUnlocks = [];
    for (const state of this.states) {
      state.owned = 0;
      state.automation = false;
    }
    this._seedStartingBuildings();
    this._automationTimer = 0;
    this.lastSummary = this.computeProductionSummary();
  }

  serialize() {
    return {
      version: 1,
      resources: this.resources,
      totalProduced: this.totalProduced,
      eraUnlocked: this.eraUnlocked,
      elapsedSeconds: this.elapsedSeconds,
      buildings: this.states.map((state) => ({
        id: state.definition.identifier,
        owned: state.owned,
        automation: state.automation,
      })),
      timestamp: Date.now(),
    };
  }

  saveToStorage() {
    if (typeof localStorage === "undefined") return false;
    const payload = this.serialize();
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  }

  loadFromStorage() {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      const payload = JSON.parse(raw);
      return this.load(payload);
    } catch (err) {
      console.warn("Failed to parse save:", err);
      return false;
    }
  }

  load(payload) {
    if (!payload) return false;
    this.reset();
    this.resources = { ...DEFAULT_START, ...payload.resources };
    this.totalProduced = { ...this.totalProduced, ...payload.totalProduced };
    this.eraUnlocked = Math.min(Math.max(payload.eraUnlocked || 1, 1), 20);
    this.elapsedSeconds = payload.elapsedSeconds || 0;

    if (Array.isArray(payload.buildings)) {
      for (const saved of payload.buildings) {
        const state = this.stateById.get(saved.id);
        if (!state) continue;
        state.owned = Math.max(saved.owned || 0, 0);
        state.automation = Boolean(saved.automation);
      }
    }

    this.lastSummary = this.computeProductionSummary();

    if (payload.timestamp) {
      const delta = Math.min(
        Math.max((Date.now() - payload.timestamp) / 1000, 0),
        OFFLINE_CAP
      );
      if (delta > 0) {
        this.tickSeconds(delta, 1);
      }
    }

    return true;
  }

  tickSeconds(totalSeconds, step = 1) {
    let remaining = sanitizeSeconds(totalSeconds);
    const safeStep = Math.max(sanitizeSeconds(step), 0.1);
    let iterations = 0;
    while (remaining > 0 && iterations < MAX_TICK_ITERATIONS) {
      const delta = Math.min(safeStep, remaining);
      this.tick(delta);
      remaining -= delta;
      iterations += 1;
    }
    if (remaining > 0) {
      this.tick(remaining);
    }
  }

  tick(deltaSeconds) {
    deltaSeconds = sanitizeSeconds(deltaSeconds);
    if (deltaSeconds <= 0) return;
    const summary = this.computeProductionSummary();
    this.lastSummary = summary;
    for (const [resource, perSecond] of Object.entries(summary.rates)) {
      const gained = perSecond * deltaSeconds;
      this.resources[resource] = (this.resources[resource] || 0) + gained;
      this.totalProduced[resource] =
        (this.totalProduced[resource] || 0) + gained;
    }
    this.elapsedSeconds += deltaSeconds;
    this._automationTimer += deltaSeconds;
    this._applyAutomation();
    this._updateEraUnlock(summary.totalRate);
    this._autosaveTimer += deltaSeconds;
  }

  computeProductionSummary() {
    const rates = Object.keys(RESOURCE_NAMES).reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
    const buildingOutputs = new Map();

    for (const state of this.states) {
      if (state.owned <= 0) continue;
      const def = state.definition;
      const multiplier = productionMultiplier(this, state);
      const totalPerBuilding = def.base_rate * multiplier;
      const totalProduction = totalPerBuilding * state.owned;
      const perResource = totalPerBuilding / def.tags.length;

      for (const tag of def.tags) {
        rates[tag] += perResource * state.owned;
      }

      buildingOutputs.set(def.identifier, {
        total: totalProduction,
        multiplier,
      });
    }

    const totalRate = Object.values(rates).reduce((acc, value) => acc + value, 0);
    return { rates, buildingOutputs, totalRate };
  }

  attemptPurchase(identifier, quantity) {
    const state = this.stateById.get(identifier);
    if (!state) {
      return { success: false, reason: "Unknown building." };
    }
    if (quantity <= 0) {
      return { success: false, reason: "Quantity must be positive." };
    }
    if (state.definition.era_index > this.eraUnlocked) {
      return { success: false, reason: "Building is locked in this era." };
    }
    const affordability = this._canAfford(state, quantity);
    if (!affordability.afford) {
      return {
        success: false,
        reason: `Need more ${RESOURCE_NAMES[affordability.resource]}.`,
      };
    }

    this._spend(affordability.cost);
    state.owned += quantity;
    this.lastSummary = this.computeProductionSummary();
    return { success: true, cost: affordability.cost };
  }

  maxAffordable(state) {
    if (state.definition.era_index > this.eraUnlocked) {
      return 0;
    }
    if (!this._canAfford(state, 1).afford) {
      return 0;
    }
    let low = 0;
    let high = 1;
    while (this._canAfford(state, high).afford) {
      low = high;
      high *= 2;
      if (high > 1_000_000) break;
    }
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (this._canAfford(state, mid).afford) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  canAfford(state, quantity) {
    return this._canAfford(state, quantity).afford;
  }

  currentRates() {
    return this.lastSummary.rates;
  }

  totalProductionRate() {
    return this.lastSummary.totalRate;
  }

  getKIndex() {
    const energyRate = this.lastSummary.rates.E || 0;
    const planetaryPower = Math.max(
      energyRate * 1000 + this.eraUnlocked * 1000,
      1
    );
    const base = (Math.log10(planetaryPower) - 6) / 10;
    const k = base + (this.eraUnlocked - 1) * 0.02;
    return clamp(roundTo(k, 3), 0, 3);
  }

  getNextKThreshold() {
    const current = this.getKIndex();
    if (current >= 3) return 3;
    const thresholds = [
      0.2, 0.4, 0.6, 0.8, 1.0, 1.4, 1.8, 2.0, 2.4, 2.8, 3.0,
    ];
    for (const value of thresholds) {
      if (value > current) return value;
    }
    return 3;
  }

  requiredEnergyForK(targetK) {
    const base = targetK - (this.eraUnlocked - 1) * 0.02;
    const exponent = 10 * base + 6;
    const power = 10 ** exponent;
    const required = (power - this.eraUnlocked * 1000) / 1000;
    return Math.max(required, 0);
  }

  shouldAutosave() {
    if (!this.autosaveEnabled) return false;
    if (this._autosaveTimer >= AUTOSAVE_INTERVAL) {
      this._autosaveTimer = 0;
      return true;
    }
    return false;
  }

  _applyAutomation() {
    if (this._automationTimer < AUTOMATION_INTERVAL) return;
    let needsRecalc = false;
    let passes = 0;
    while (
      this._automationTimer >= AUTOMATION_INTERVAL &&
      passes < MAX_AUTOMATION_PASSES
    ) {
      this._automationTimer -= AUTOMATION_INTERVAL;
      passes += 1;
      for (const state of this.states) {
        if (!state.automation || state.definition.era_index > this.eraUnlocked) {
          continue;
        }
        const maxQty = this.maxAffordable(state);
        if (maxQty <= 0) continue;
        const quantity = Math.min(maxQty, AUTOMATION_MAX_BATCH);
        if (quantity <= 0) continue;
        const cost = costFor(state.definition, state.owned, quantity);
        this._spend(cost);
        state.owned += quantity;
        needsRecalc = true;
      }
    }
    if (this._automationTimer >= AUTOMATION_INTERVAL) {
      this._automationTimer %= AUTOMATION_INTERVAL;
    }
    if (needsRecalc) {
      this.lastSummary = this.computeProductionSummary();
    }
  }

  _updateEraUnlock(totalRate) {
    while (this.eraUnlocked < 20) {
      const threshold = rateBaseline(this.eraUnlocked + 1) * ERA_UNLOCK_SCALE;
      if (totalRate >= threshold) {
        this.eraUnlocked += 1;
        if (!this.pendingUnlocks) this.pendingUnlocks = [];
        this.pendingUnlocks.push(this.eraUnlocked);
      } else {
        break;
      }
    }
  }

  _canAfford(state, quantity) {
    const cost = costFor(state.definition, state.owned, quantity);
    for (const [resource, amount] of Object.entries(cost)) {
      const available = this.resources[resource] || 0;
      if (available + 1e-9 < amount) {
        return { afford: false, resource, required: amount, available, cost };
      }
    }
    return { afford: true, cost };
  }

  _spend(cost) {
    for (const [resource, amount] of Object.entries(cost)) {
      this.resources[resource] = Math.max(
        (this.resources[resource] || 0) - amount,
        0
      );
    }
  }
}

class UI {
  constructor(game) {
    this.game = game;
    this.elements = {};
    this.buildingViews = new Map();
    this.eraSections = new Map();
    this.formatMode = "standard";
    this.lastRender = 0;
    this.lastHeavyRender = 0;
    this.toastTimer = null;
    this.resourceViews = new Map();
  }

  init() {
    this.cacheElements();
    this.renderResourcePanel();
    this.renderBuildingList();
    this.attachEvents();
    this.render(true);
  }

  cacheElements() {
    this.elements.eraDisplay = document.getElementById("era-display");
    this.elements.kIndex = document.getElementById("k-index");
    this.elements.kNext = document.getElementById("k-next");
    this.elements.elapsed = document.getElementById("elapsed-time");
    this.elements.resourcePanel = document.getElementById("resource-panel");
    this.elements.buildingsPanel = document.getElementById("buildings-panel");
    this.elements.topProducers = document.getElementById("top-producers");
    this.elements.milestones = document.getElementById("milestones");
    this.elements.eventLog = document.getElementById("event-log");
    this.elements.toast = document.getElementById("toast");
    this.elements.formatSelect = document.getElementById("format-select");
    this.elements.autosaveToggle = document.getElementById("autosave-toggle");
    this.elements.saveBtn = document.getElementById("save-btn");
    this.elements.exportBtn = document.getElementById("export-btn");
    this.elements.importBtn = document.getElementById("import-btn");
    this.elements.resetBtn = document.getElementById("reset-btn");
  }

  renderResourcePanel() {
    const fragment = document.createDocumentFragment();
    for (const resource of Object.keys(RESOURCE_NAMES)) {
      const entry = document.createElement("div");
      entry.className = "resource-entry";
      entry.dataset.resource = resource;

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = RESOURCE_NAMES[resource];

      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = "0";

      const delta = document.createElement("span");
      delta.className = "delta";
      delta.textContent = "+0/s";

      entry.append(name, amount, delta);
      fragment.appendChild(entry);

      this.resourceViews.set(resource, { amount, delta });
    }
    this.elements.resourcePanel.appendChild(fragment);
  }

  renderBuildingList() {
    const eras = new Map();
    for (const def of this.game.definitions) {
      if (!eras.has(def.era_index)) {
        eras.set(def.era_index, { name: def.era, definitions: [] });
      }
      eras.get(def.era_index).definitions.push(def);
    }

    const fragment = document.createDocumentFragment();
    for (const [eraIndex, info] of Array.from(eras.entries()).sort(
      (a, b) => a[0] - b[0]
    )) {
      const details = document.createElement("details");
      details.className = "era-group";
      if (eraIndex === 1) details.open = true;
      details.addEventListener("toggle", () => this.render(true));

      const summary = document.createElement("summary");
      const summaryContent = document.createElement("div");
      summaryContent.className = "era-summary";

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = `Era ${eraIndex}`;

      const value = document.createElement("span");
      value.className = "value";
      value.textContent = info.name;
      value.dataset.base = info.name;

      summaryContent.append(label, value);
      summary.appendChild(summaryContent);
      details.appendChild(summary);
      details.dataset.eraIndex = String(eraIndex);
      details.dataset.unlocked = eraIndex === 1 ? "true" : "false";

      const container = document.createElement("div");
      container.className = "building-stack";

      for (const def of info.definitions) {
        const card = document.createElement("article");
        card.className = "building-card";
        card.dataset.identifier = def.identifier;

        const header = document.createElement("div");
        header.className = "building-header";
        const title = document.createElement("h3");
        title.textContent = def.name;

        const tags = document.createElement("div");
        tags.className = "tag-list";
        for (const tag of def.tags) {
          const badge = document.createElement("span");
          badge.className = "tag";
          badge.textContent = tag;
          tags.appendChild(badge);
        }

        header.append(title, tags);

        const stats = document.createElement("div");
        stats.className = "stats";
        const owned = document.createElement("span");
        owned.className = "owned";
        owned.textContent = "Owned: 0";

        const output = document.createElement("span");
        output.className = "output";
        output.textContent = "Output: 0/s";

        const multiplier = document.createElement("span");
        multiplier.className = "multiplier";
        multiplier.textContent = "Multiplier: 1.00x";

        stats.append(owned, output, multiplier);

      const production = document.createElement("div");
      production.className = "production";
      production.textContent = "Produces: -";

        const cost = document.createElement("div");
        cost.className = "cost";
        cost.textContent = "Cost: -";

        const controls = document.createElement("div");
        controls.className = "controls";
        const buy1 = createButton("+1");
        const buy10 = createButton("+10");
        const buy100 = createButton("+100");
        const buyMax = createButton("Max");
        const autoToggle = createButton("Auto: Off");

        buy1.dataset.action = "buy";
        buy1.dataset.quantity = "1";
        buy10.dataset.action = "buy";
        buy10.dataset.quantity = "10";
        buy100.dataset.action = "buy";
        buy100.dataset.quantity = "100";
        buyMax.dataset.action = "buy-max";
        autoToggle.dataset.action = "auto";

        controls.append(buy1, buy10, buy100, buyMax, autoToggle);

        const detailsDrawer = document.createElement("details");
        detailsDrawer.className = "building-details";
        const detailsSummary = document.createElement("summary");
        detailsSummary.textContent = "Upgrades";
        const synergyA = document.createElement("p");
        synergyA.textContent = def.synergy_a;
        const synergyB = document.createElement("p");
        synergyB.textContent = def.synergy_b;
        const upgrade = document.createElement("p");
        upgrade.textContent = def.unique_upgrade;
        detailsDrawer.append(detailsSummary, synergyA, synergyB, upgrade);

        card.append(header, stats, production, cost, controls, detailsDrawer);
        container.appendChild(card);

        this.buildingViews.set(def.identifier, {
          card,
          lastLocked: null,
          owned,
          output,
          multiplier,
          production,
          cost,
          controls: {
            buy1,
            buy10,
            buy100,
            buyMax,
            autoToggle,
          },
        });
      }

      details.appendChild(container);
      fragment.appendChild(details);
      this.eraSections.set(eraIndex, { details, valueEl: value });
    }

    this.elements.buildingsPanel.appendChild(fragment);
  }

  attachEvents() {
    this.elements.buildingsPanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      if (!action) return;
      const card = target.closest(".building-card");
      if (!card) return;
      const id = card.dataset.identifier;
      const state = this.game.stateById.get(id);
      if (!state) return;

      if (action === "buy") {
        const quantity = Number(target.dataset.quantity || "1");
        const result = this.game.attemptPurchase(id, quantity);
        if (!result.success) {
          this.showToast(result.reason, true);
        } else {
          this.showToast(`Purchased ${quantity} x ${state.definition.name}.`);
          this.render(true);
        }
      } else if (action === "buy-max") {
        const maxQty = this.game.maxAffordable(state);
        if (maxQty <= 0) {
          this.showToast("Not enough resources for any purchase.", true);
          return;
        }
        const result = this.game.attemptPurchase(id, maxQty);
        if (!result.success) {
          this.showToast(result.reason, true);
        } else {
          this.showToast(`Purchased ${maxQty} x ${state.definition.name}.`);
          this.render(true);
        }
      } else if (action === "auto") {
        state.automation = !state.automation;
        this.showToast(
          `${state.definition.name} automation ${state.automation ? "enabled" : "disabled"}.`
        );
        this.render(true);
      }
    });

    this.elements.formatSelect.addEventListener("change", (event) => {
      this.formatMode = event.target.value;
      this.render(true);
    });

    this.elements.autosaveToggle.addEventListener("change", (event) => {
      this.game.autosaveEnabled = event.target.checked;
    });

    this.elements.saveBtn.addEventListener("click", () => {
      const success = this.game.saveToStorage();
      this.showToast(success ? "Game saved." : "Unable to save.", !success);
    });

    this.elements.exportBtn.addEventListener("click", async () => {
      const payload = this.game.serialize();
      const exportString = btoa(encodeURIComponent(JSON.stringify(payload)));
      try {
        await navigator.clipboard.writeText(exportString);
        this.showToast("Export code copied to clipboard.");
      } catch (err) {
        prompt("Copy this export code:", exportString);
        this.showToast("Export code ready. Copy from prompt.");
      }
    });

    this.elements.importBtn.addEventListener("click", () => {
      const code = prompt("Paste your export code:");
      if (!code) return;
      try {
        const json = decodeURIComponent(atob(code.trim()));
        const payload = JSON.parse(json);
        this.game.load(payload);
        this.showToast("Save imported.");
        this.render(true);
      } catch (err) {
        console.error(err);
        this.showToast("Failed to import save.", true);
      }
    });

    this.elements.resetBtn.addEventListener("click", () => {
      const confirmReset = confirm(
        "Reset progress and return to Era 1? This cannot be undone."
      );
      if (!confirmReset) return;
      this.game.reset();
      this.showToast("Progress reset.");
      this.render(true);
    });
  }

  render(force = false) {
    const now = performance.now();
    if (!force && now - this.lastRender < RENDER_INTERVAL_MS) return;
    this.lastRender = now;

    this.updateHeader();
    this.updateResources();
    this.updateEraSections();
    this.updateBuildings();
    if (force || now - this.lastHeavyRender >= HEAVY_RENDER_INTERVAL_MS) {
      this.lastHeavyRender = now;
      this.updateTopProducers();
      this.updateMilestones();
    }
    if (this.game.pendingUnlocks && this.game.pendingUnlocks.length > 0) {
      while (this.game.pendingUnlocks.length > 0) {
        const era = this.game.pendingUnlocks.shift();
        const section = this.eraSections.get(era);
        if (section) {
          section.details.open = true;
          section.details.dataset.unlocked = "true";
          section.valueEl.textContent = section.valueEl.dataset.base;
        }
        this.showToast(`Era ${era} unlocked!`);
      }
    }
  }

  updateHeader() {
    const era = this.game.eraUnlocked;
    setText(this.elements.eraDisplay, String(era));
    const kIndex = this.game.getKIndex();
    const nextK = this.game.getNextKThreshold();
    setText(this.elements.kIndex, `K${kIndex.toFixed(2)}`);
    setText(this.elements.kNext, `(Next K${nextK.toFixed(2)})`);
    setText(this.elements.elapsed, formatDuration(this.game.elapsedSeconds));
  }

  updateResources() {
    for (const resource of Object.keys(RESOURCE_NAMES)) {
      const entry = this.resourceViews.get(resource);
      if (!entry) continue;
      const amountEl = entry.amount;
      const deltaEl = entry.delta;
      setText(amountEl, formatNumber(
        this.game.resources[resource] || 0,
        this.formatMode
      ));
      const rate = this.game.lastSummary.rates[resource] || 0;
      const prefix = rate >= 0 ? "+" : "";
      setText(deltaEl, `${prefix}${formatNumber(rate, this.formatMode)}/s`);
    }
  }

  updateEraSections() {
    for (const [eraIndex, data] of this.eraSections.entries()) {
      const unlocked = eraIndex <= this.game.eraUnlocked;
      const details = data.details;
      const valueEl = data.valueEl;
      const base = valueEl.dataset.base;
      setText(valueEl, unlocked ? base : `${base} (Locked)`);
      details.dataset.unlocked = unlocked ? "true" : "false";
      if (!unlocked) {
        details.open = false;
      }
    }
  }

  updateBuildings() {
    for (const state of this.game.states) {
      const view = this.buildingViews.get(state.definition.identifier);
      if (!view || !view.card) continue;
      const def = state.definition;
      const locked = def.era_index > this.game.eraUnlocked;
      const eraSection = this.eraSections.get(def.era_index);
      const isVisibleEra = eraSection?.details.open || def.era_index === 1;

      if (view.lastLocked !== locked) {
        view.card.classList.toggle("locked", locked);
        for (const button of Object.values(view.controls)) {
          button.disabled = locked;
        }
        view.lastLocked = locked;
      }

      if (locked || !isVisibleEra) {
        setText(view.controls.autoToggle, locked ? "Auto: -" : `Auto: ${state.automation ? "On" : "Off"}`);
        continue;
      }

      setText(view.owned, `Owned: ${state.owned}`);
      const outputData = this.game.lastSummary.buildingOutputs.get(def.identifier);
      const outputPerSecond = outputData ? outputData.total : 0;
      setText(view.output, `Output: ${formatNumber(
        outputPerSecond,
        this.formatMode
      )}/s`);

      const multiplier = outputData ? outputData.multiplier : 1;
      setText(view.multiplier, `Multiplier: ${multiplier.toFixed(2)}x`);

      const perResourceBase = def.base_rate / def.tags.length;
      const perResourceCurrent = perResourceBase * multiplier;
      const productionLines = def.tags.map((tag) => {
        const perOwned = perResourceCurrent;
        const total = perOwned * state.owned;
        return `${RESOURCE_NAMES[tag]} ${formatNumber(
          perOwned,
          this.formatMode
        )}/s per, ${formatNumber(total, this.formatMode)}/s total`;
      });
      setText(view.production,
        productionLines.length > 0
          ? `Produces: ${productionLines.join(" | ")}`
          : "Produces: -"
      );

      const cost = costFor(def, state.owned, 1);
      setText(view.cost, `Cost: ${formatCost(cost, this.formatMode)}`);

      const controls = view.controls;
      const maxQty = this.game.maxAffordable(state);
      controls.buy1.disabled = maxQty < 1;
      controls.buy10.disabled = maxQty < 10;
      controls.buy100.disabled = maxQty < 100;
      controls.buyMax.disabled = maxQty === 0;
      setText(controls.buyMax, maxQty > 0 ? `Max (${maxQty})` : "Max");
      setText(controls.autoToggle, `Auto: ${state.automation ? "On" : "Off"}`);
    }
  }

  updateTopProducers() {
    const entries = Array.from(this.game.lastSummary.buildingOutputs.entries())
      .map(([id, info]) => ({
        id,
        total: info.total,
      }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);

    this.elements.topProducers.innerHTML = "";
    if (entries.length === 0) {
      const placeholder = document.createElement("li");
      placeholder.textContent = "No production yet.";
      this.elements.topProducers.appendChild(placeholder);
      return;
    }

    for (const entry of entries) {
      const li = document.createElement("li");
      const def = this.game.stateById.get(entry.id).definition;
      li.textContent = `${def.name}: ${formatNumber(
        entry.total,
        this.formatMode
      )}/s`;
      this.elements.topProducers.appendChild(li);
    }
  }

  updateMilestones() {
    const container = this.elements.milestones;
    container.innerHTML = "";
    const totalRate = this.game.totalProductionRate();

    if (this.game.eraUnlocked < 20) {
      const nextEra = this.game.eraUnlocked + 1;
      const threshold = rateBaseline(nextEra) * ERA_UNLOCK_SCALE;
      const progress = clamp(totalRate / threshold, 0, 1);
      const milestone = createMilestone(
        `Next Era (${nextEra})`,
        `Reach total production ${formatNumber(
          threshold,
          this.formatMode
        )}/s`,
        progress
      );
      container.appendChild(milestone);
    } else {
      const milestone = createMilestone(
        "Max Era",
        "All eras unlocked.",
        1
      );
      container.appendChild(milestone);
    }

    const nextK = this.game.getNextKThreshold();
    const requiredEnergy = this.game.requiredEnergyForK(nextK);
    const currentEnergy = this.game.lastSummary.rates.E || 0;
    const delta = Math.max(requiredEnergy - currentEnergy, 0);
    const progressK = requiredEnergy === 0 ? 1 : clamp(currentEnergy / requiredEnergy, 0, 1);
    const milestoneK = createMilestone(
      `Next K Threshold (K${nextK.toFixed(2)})`,
      delta > 0
        ? `Need +${formatNumber(delta, this.formatMode)} Energy/s`
        : "Threshold achieved!",
      progressK
    );
    container.appendChild(milestoneK);
  }

  showToast(message, isError = false) {
    const toast = this.elements.toast;
    setText(toast, message);
    toast.classList.toggle("error", isError);
    toast.classList.add("show");
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
    this.addEventLog(message);
  }

  addEventLog(message) {
    const log = this.elements.eventLog;
    if (!log) return;
    const item = document.createElement("li");
    item.textContent = message;
    log.prepend(item);
    while (log.children.length > EVENT_LOG_LIMIT) {
      log.lastElementChild?.remove();
    }
  }
}

function productionMultiplier(game, state) {
  let multiplier = 1;
  const dataA = state.definition.synergy_a_data || {};
  if (dataA.type === "per_building") {
    const target = game.stateById.get(dataA.target_identifier);
    if (target) {
      multiplier *= 1 + (target.owned * (dataA.bonus_percent || 0)) / 100;
    }
  }

  const dataB = state.definition.synergy_b_data || {};
  if (dataB.type === "stored_resource") {
    const resource = dataB.resource;
    if (resource) {
      const current = game.resources[resource] || 0;
      if (current >= (dataB.threshold || 0)) {
        multiplier *= 1 + (dataB.bonus_percent || 0) / 100;
        if (dataB.secondary_bonus_percent) {
          multiplier *= 1 + dataB.secondary_bonus_percent / 100;
        }
      }
    }
  }

  return multiplier;
}

function costFor(definition, owned, quantity) {
  const growth = definition.growth;
  const base = definition.base_cost * growth ** owned;
  const totalCost =
    quantity === 1
      ? base
      : base * ((growth ** quantity - 1) / (growth - 1));
  const result = {};
  for (const [resource, share] of Object.entries(definition.cost_shares)) {
    result[resource] = totalCost * share;
  }
  return result;
}

function formatNumber(value, mode = "standard") {
  if (!Number.isFinite(value)) return "Inf";
  if (value === 0) return "0";
  if (mode === "scientific") {
    const exponent = Math.floor(Math.log10(Math.abs(value)));
    const mantissa = value / 10 ** exponent;
    return `${mantissa.toFixed(2)}e${exponent}`;
  }
  const abs = Math.abs(value);
  const units = [
    { value: 1e12, suffix: "T" },
    { value: 1e9, suffix: "B" },
    { value: 1e6, suffix: "M" },
    { value: 1e3, suffix: "K" },
  ];
  for (const unit of units) {
    if (abs >= unit.value) {
      return `${(value / unit.value).toFixed(2)}${unit.suffix}`;
    }
  }
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatCost(cost, mode) {
  return Object.entries(cost)
    .map(
      ([resource, amount]) =>
        `${RESOURCE_NAMES[resource]} ${formatNumber(amount, mode)}`
    )
    .join(", ");
}

function formatDuration(seconds) {
  const s = Math.floor(seconds);
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  const sec = s % 60;
  if (minutes < 60) return `${minutes}m ${sec}s`;
  const hours = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${hours}h ${min}m`;
}

function rateBaseline(eraIndex) {
  return 0.1 * 3.6 ** (eraIndex - 1);
}

function sanitizeSeconds(value) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function createButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  return button;
}

function setText(element, text) {
  if (element && element.textContent !== text) {
    element.textContent = text;
  }
}

function createMilestone(title, subtitle, progress) {
  const wrapper = document.createElement("div");
  wrapper.className = "milestone";

  const heading = document.createElement("h3");
  heading.textContent = title;
  wrapper.appendChild(heading);

  const description = document.createElement("p");
  description.textContent = subtitle;
  wrapper.appendChild(description);

  const bar = document.createElement("div");
  bar.className = "progress-bar";
  const span = document.createElement("span");
  span.style.width = `${clamp(progress, 0, 1) * 100}%`;
  bar.appendChild(span);
  wrapper.appendChild(bar);
  return wrapper;
}

async function loadDefinitions() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error("Failed to load buildings dataset.");
  }
  const data = await response.json();
  return data.map((entry) => new BuildingDefinition(entry));
}

async function bootstrap() {
  const definitions = await loadDefinitions();
  const game = new Game(definitions);
  game.loadFromStorage();
  const ui = new UI(game);
  ui.init();

  let lastTimestamp = performance.now();
  let accumulator = 0;

  function loop(timestamp) {
    const rawDelta = (timestamp - lastTimestamp) / 1000;
    const delta = Math.min(sanitizeSeconds(rawDelta), MAX_FRAME_DELTA);
    lastTimestamp = timestamp;
    accumulator = Math.min(accumulator + delta, MAX_FRAME_DELTA);

    let ticks = 0;
    while (accumulator >= TICK_STEP && ticks < MAX_TICKS_PER_FRAME) {
      game.tick(TICK_STEP);
      accumulator -= TICK_STEP;
      ticks += 1;
    }

    if (accumulator >= TICK_STEP) {
      // Drop any remaining backlog instead of trying to catch up all at once.
      accumulator = accumulator % TICK_STEP;
    }

    if (game.shouldAutosave()) {
      game.saveToStorage();
    }

    ui.render();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

bootstrap().catch((err) => {
  console.error(err);
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = "Failed to start game. Check console for details.";
    toast.classList.add("show");
  }
});
