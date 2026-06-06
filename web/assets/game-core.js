export const RESOURCE_NAMES = {
    W: "Wood",
    S: "Stone",
    E: "Energy",
    F: "Food",
    P: "Population",
};
export const RESOURCE_KEYS = Object.keys(RESOURCE_NAMES);
const DEFAULT_START = {
    W: 40,
    S: 25,
    E: 5,
    F: 35,
    P: 12,
};
const OFFLINE_CAP = 60 * 60 * 8;
const ERA_UNLOCK_SCALE = 3.0;
const MAX_TICK_ITERATIONS = 100;
const AUTOMATION_INTERVAL = 0.5;
const AUTOMATION_MAX_BATCH = 50;
const MAX_AUTOMATION_PASSES = 5;
const AUTOSAVE_INTERVAL = 30;
export class BuildingDefinition {
    identifier;
    name;
    era;
    era_index;
    index_in_era;
    tags;
    base_rate;
    base_cost;
    growth;
    cost_shares;
    synergy_a;
    synergy_b;
    synergy_a_data;
    synergy_b_data;
    unique_upgrade;
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
export class BuildingState {
    definition;
    owned = 0;
    automation = false;
    constructor(definition) {
        this.definition = definition;
    }
}
export class Game {
    definitions;
    states;
    stateById = new Map();
    resources = createResourceMap();
    totalProduced = createResourceMap();
    eraUnlocked = 1;
    elapsedSeconds = 0;
    pendingUnlocks = [];
    lastSummary;
    autosaveEnabled = true;
    autosaveTimer = 0;
    automationTimer = 0;
    constructor(definitions) {
        this.definitions = definitions;
        this.states = definitions.map((def) => new BuildingState(def));
        for (const state of this.states) {
            this.stateById.set(state.definition.identifier, state);
        }
        this.lastSummary = emptyProductionSummary();
        this.reset();
    }
    reset() {
        this.resources = { ...DEFAULT_START };
        this.totalProduced = createResourceMap();
        this.eraUnlocked = 1;
        this.elapsedSeconds = 0;
        this.pendingUnlocks = [];
        this.autosaveTimer = 0;
        this.automationTimer = 0;
        for (const state of this.states) {
            state.owned = 0;
            state.automation = false;
        }
        this.seedStartingBuildings();
        this.lastSummary = this.computeProductionSummary();
    }
    serialize() {
        return {
            version: 2,
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
    load(payload) {
        if (!payload)
            return false;
        this.reset();
        this.resources = normalizeResourceMap({ ...DEFAULT_START, ...payload.resources });
        this.totalProduced = normalizeResourceMap({ ...this.totalProduced, ...payload.totalProduced });
        this.eraUnlocked = clamp(Math.floor(payload.eraUnlocked || 1), 1, 20);
        this.elapsedSeconds = sanitizeSeconds(payload.elapsedSeconds || 0);
        if (Array.isArray(payload.buildings)) {
            for (const saved of payload.buildings) {
                if (!isSerializedBuilding(saved))
                    continue;
                const state = this.stateById.get(saved.id);
                if (!state)
                    continue;
                state.owned = sanitizeOwned(saved.owned);
                state.automation = Boolean(saved.automation);
            }
        }
        this.lastSummary = this.computeProductionSummary();
        if (payload.timestamp) {
            const delta = Math.min(Math.max((Date.now() - payload.timestamp) / 1000, 0), OFFLINE_CAP);
            if (delta > 0)
                this.tickSeconds(delta, 1);
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
        if (remaining > 0)
            this.tick(remaining);
    }
    tick(deltaSeconds) {
        const delta = sanitizeSeconds(deltaSeconds);
        if (delta <= 0)
            return;
        const summary = this.computeProductionSummary();
        this.lastSummary = summary;
        for (const resource of RESOURCE_KEYS) {
            const gained = summary.rates[resource] * delta;
            this.resources[resource] += gained;
            this.totalProduced[resource] += gained;
        }
        this.elapsedSeconds += delta;
        this.automationTimer += delta;
        this.applyAutomation();
        this.updateEraUnlock(this.lastSummary.totalRate);
        this.autosaveTimer += delta;
    }
    computeProductionSummary() {
        const rates = createResourceMap();
        const buildingOutputs = new Map();
        for (const state of this.states) {
            if (state.owned <= 0)
                continue;
            const def = state.definition;
            const multiplier = productionMultiplier(this, state);
            const totalPerBuilding = def.base_rate * multiplier;
            const totalProduction = totalPerBuilding * state.owned;
            const perResource = totalPerBuilding / def.tags.length;
            for (const tag of def.tags) {
                rates[tag] += perResource * state.owned;
            }
            buildingOutputs.set(def.identifier, { total: totalProduction, multiplier });
        }
        const totalRate = RESOURCE_KEYS.reduce((acc, resource) => acc + rates[resource], 0);
        return { rates, buildingOutputs, totalRate };
    }
    attemptPurchase(identifier, quantity) {
        const state = this.stateById.get(identifier);
        const qty = Math.floor(quantity);
        if (!state)
            return { success: false, reason: "Unknown building." };
        if (qty <= 0)
            return { success: false, reason: "Quantity must be positive." };
        if (state.definition.era_index > this.eraUnlocked) {
            return { success: false, reason: "Building is locked in this era." };
        }
        const affordability = this.canAffordWithCost(state, qty);
        if (!affordability.afford) {
            return {
                success: false,
                reason: `Need more ${RESOURCE_NAMES[affordability.resource || "W"]}.`,
            };
        }
        this.spend(affordability.cost);
        state.owned += qty;
        this.lastSummary = this.computeProductionSummary();
        return { success: true, cost: affordability.cost, quantity: qty };
    }
    buyMax(identifier) {
        const state = this.stateById.get(identifier);
        if (!state)
            return { success: false, reason: "Unknown building." };
        const maxQty = this.maxAffordable(state);
        if (maxQty <= 0)
            return { success: false, reason: "Not enough resources for any purchase." };
        return this.attemptPurchase(identifier, maxQty);
    }
    toggleAutomation(identifier) {
        const state = this.stateById.get(identifier);
        if (!state)
            return { success: false, reason: "Unknown building." };
        if (state.definition.era_index > this.eraUnlocked) {
            return { success: false, reason: "Building is locked in this era." };
        }
        state.automation = !state.automation;
        return { success: true };
    }
    maxAffordable(state) {
        if (state.definition.era_index > this.eraUnlocked)
            return 0;
        if (!this.canAfford(state, 1))
            return 0;
        const def = state.definition;
        const growth = def.growth;
        const logGrowth = Math.log(growth);
        let limit = Number.POSITIVE_INFINITY;
        for (const [resource, share] of Object.entries(def.cost_shares)) {
            if (share <= 0)
                continue;
            const available = this.resources[resource] || 0;
            const firstUnitCost = def.base_cost * safePow(growth, state.owned) * share;
            if (!Number.isFinite(firstUnitCost) || firstUnitCost <= 0)
                return 0;
            let resourceLimit = 0;
            if (Math.abs(growth - 1) < 1e-9) {
                resourceLimit = Math.floor(available / firstUnitCost);
            }
            else {
                const affordableSeries = (available * (growth - 1)) / firstUnitCost + 1;
                resourceLimit = affordableSeries > 1 ? Math.floor(Math.log(affordableSeries) / logGrowth) : 0;
            }
            limit = Math.min(limit, resourceLimit);
        }
        if (!Number.isFinite(limit))
            limit = 0;
        let candidate = clamp(Math.floor(limit), 0, 1_000_000);
        while (candidate > 0 && !this.canAfford(state, candidate))
            candidate -= 1;
        while (candidate < 1_000_000 && this.canAfford(state, candidate + 1))
            candidate += 1;
        return candidate;
    }
    canAfford(state, quantity) {
        return this.canAffordWithCost(state, quantity).afford;
    }
    getKIndex() {
        const energyRate = this.lastSummary.rates.E || 0;
        const planetaryPower = Math.max(energyRate * 1000 + this.eraUnlocked * 1000, 1);
        const base = (Math.log10(planetaryPower) - 6) / 10;
        const k = base + (this.eraUnlocked - 1) * 0.02;
        return clamp(roundTo(k, 3), 0, 3);
    }
    getNextKThreshold() {
        const current = this.getKIndex();
        if (current >= 3)
            return 3;
        const thresholds = [0.2, 0.4, 0.6, 0.8, 1.0, 1.4, 1.8, 2.0, 2.4, 2.8, 3.0];
        return thresholds.find((value) => value > current) || 3;
    }
    requiredEnergyForK(targetK) {
        const base = targetK - (this.eraUnlocked - 1) * 0.02;
        const exponent = 10 * base + 6;
        const power = 10 ** exponent;
        const required = (power - this.eraUnlocked * 1000) / 1000;
        return Math.max(required, 0);
    }
    shouldAutosave() {
        if (!this.autosaveEnabled)
            return false;
        if (this.autosaveTimer >= AUTOSAVE_INTERVAL) {
            this.autosaveTimer = 0;
            return true;
        }
        return false;
    }
    takeUnlocks() {
        const unlocks = this.pendingUnlocks;
        this.pendingUnlocks = [];
        return unlocks;
    }
    snapshot(visibleEraIndices) {
        const nextK = this.getNextKThreshold();
        const requiredEnergy = this.requiredEnergyForK(nextK);
        const energyRate = this.lastSummary.rates.E || 0;
        const nextEra = this.eraUnlocked < 20 ? this.eraUnlocked + 1 : null;
        const nextEraThreshold = nextEra ? rateBaseline(nextEra) * ERA_UNLOCK_SCALE : 0;
        return {
            resources: { ...this.resources },
            rates: { ...this.lastSummary.rates },
            eraUnlocked: this.eraUnlocked,
            elapsedSeconds: this.elapsedSeconds,
            kIndex: this.getKIndex(),
            nextK,
            totalRate: this.lastSummary.totalRate,
            topProducers: this.topProducers(3),
            milestones: {
                nextEra,
                nextEraThreshold,
                nextEraProgress: nextEra ? clamp(this.lastSummary.totalRate / nextEraThreshold, 0, 1) : 1,
                nextK,
                requiredEnergy,
                energyRate,
                energyDelta: Math.max(requiredEnergy - energyRate, 0),
                kProgress: requiredEnergy === 0 ? 1 : clamp(energyRate / requiredEnergy, 0, 1),
            },
            cards: this.cardSnapshots(visibleEraIndices),
            unlocks: this.takeUnlocks(),
        };
    }
    cardSnapshots(visibleEraIndices) {
        const cards = [];
        for (const state of this.states) {
            const def = state.definition;
            if (!visibleEraIndices.has(def.era_index))
                continue;
            const locked = def.era_index > this.eraUnlocked;
            const outputData = this.lastSummary.buildingOutputs.get(def.identifier);
            const multiplier = outputData ? outputData.multiplier : 1;
            const perResourceBase = def.base_rate / def.tags.length;
            const perResourceCurrent = perResourceBase * multiplier;
            cards.push({
                id: def.identifier,
                eraIndex: def.era_index,
                owned: state.owned,
                automation: state.automation,
                locked,
                outputPerSecond: outputData ? outputData.total : 0,
                multiplier,
                production: def.tags.map((resource) => ({
                    resource,
                    perOwned: perResourceCurrent,
                    total: perResourceCurrent * state.owned,
                })),
                cost: costFor(def, state.owned, 1),
                maxQty: locked ? 0 : this.maxAffordable(state),
            });
        }
        return cards;
    }
    topProducers(limit) {
        return Array.from(this.lastSummary.buildingOutputs.entries())
            .map(([id, info]) => ({ id, total: info.total }))
            .filter((entry) => entry.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, limit)
            .map((entry) => ({
            ...entry,
            name: this.stateById.get(entry.id)?.definition.name || entry.id,
        }));
    }
    seedStartingBuildings() {
        let seeded = 0;
        for (const state of this.states) {
            if (state.definition.era_index === 1 && state.definition.index_in_era <= 5) {
                state.owned = Math.max(state.owned, 1);
                seeded += 1;
                if (seeded >= 5)
                    break;
            }
        }
    }
    applyAutomation() {
        if (this.automationTimer < AUTOMATION_INTERVAL)
            return;
        let needsRecalc = false;
        let passes = 0;
        while (this.automationTimer >= AUTOMATION_INTERVAL && passes < MAX_AUTOMATION_PASSES) {
            this.automationTimer -= AUTOMATION_INTERVAL;
            passes += 1;
            for (const state of this.states) {
                if (!state.automation || state.definition.era_index > this.eraUnlocked)
                    continue;
                const maxQty = this.maxAffordable(state);
                if (maxQty <= 0)
                    continue;
                const quantity = Math.min(maxQty, AUTOMATION_MAX_BATCH);
                const cost = costFor(state.definition, state.owned, quantity);
                this.spend(cost);
                state.owned += quantity;
                needsRecalc = true;
            }
        }
        if (this.automationTimer >= AUTOMATION_INTERVAL) {
            this.automationTimer %= AUTOMATION_INTERVAL;
        }
        if (needsRecalc) {
            this.lastSummary = this.computeProductionSummary();
        }
    }
    updateEraUnlock(totalRate) {
        while (this.eraUnlocked < 20) {
            const threshold = rateBaseline(this.eraUnlocked + 1) * ERA_UNLOCK_SCALE;
            if (totalRate >= threshold) {
                this.eraUnlocked += 1;
                this.pendingUnlocks.push(this.eraUnlocked);
            }
            else {
                break;
            }
        }
    }
    canAffordWithCost(state, quantity) {
        const cost = costFor(state.definition, state.owned, quantity);
        for (const [resource, amount] of Object.entries(cost)) {
            const available = this.resources[resource] || 0;
            if (available + 1e-9 < amount)
                return { afford: false, resource, cost };
        }
        return { afford: true, cost };
    }
    spend(cost) {
        for (const [resource, amount] of Object.entries(cost)) {
            this.resources[resource] = Math.max((this.resources[resource] || 0) - amount, 0);
        }
    }
}
export function costFor(definition, owned, quantity) {
    const qty = Math.max(Math.floor(quantity), 0);
    if (qty <= 0)
        return {};
    const growth = definition.growth;
    const base = definition.base_cost * safePow(growth, owned);
    const totalCost = qty === 1 || Math.abs(growth - 1) < 1e-9
        ? base * qty
        : base * ((safePow(growth, qty) - 1) / (growth - 1));
    const result = {};
    for (const [resource, share] of Object.entries(definition.cost_shares)) {
        result[resource] = totalCost * share;
    }
    return result;
}
export function productionMultiplier(game, state) {
    let multiplier = 1;
    const dataA = state.definition.synergy_a_data;
    if (dataA.type === "per_building" && dataA.target_identifier) {
        const target = game.stateById.get(dataA.target_identifier);
        if (target)
            multiplier *= 1 + (target.owned * (dataA.bonus_percent || 0)) / 100;
    }
    const dataB = state.definition.synergy_b_data;
    if (dataB.type === "stored_resource" && dataB.resource) {
        const current = game.resources[dataB.resource] || 0;
        if (current >= (dataB.threshold || 0)) {
            multiplier *= 1 + (dataB.bonus_percent || 0) / 100;
            if (dataB.secondary_bonus_percent) {
                multiplier *= 1 + dataB.secondary_bonus_percent / 100;
            }
        }
    }
    return multiplier;
}
export function rateBaseline(eraIndex) {
    return 0.1 * 3.6 ** (eraIndex - 1);
}
export function createResourceMap(value = 0) {
    return { W: value, S: value, E: value, F: value, P: value };
}
export function normalizeResourceMap(source) {
    const normalized = createResourceMap();
    for (const resource of RESOURCE_KEYS) {
        const value = Number(source[resource] || 0);
        normalized[resource] = Number.isFinite(value) ? Math.max(value, 0) : 0;
    }
    return normalized;
}
export function sanitizeSeconds(value) {
    return Number.isFinite(value) && value > 0 ? value : 0;
}
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
export function roundTo(value, precision) {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
}
function isSerializedBuilding(value) {
    return typeof value === "object" && value !== null && "id" in value;
}
function sanitizeOwned(value) {
    const owned = Math.floor(Number(value || 0));
    return Number.isFinite(owned) ? Math.max(owned, 0) : 0;
}
function emptyProductionSummary() {
    return {
        rates: createResourceMap(),
        buildingOutputs: new Map(),
        totalRate: 0,
    };
}
function safePow(base, exponent) {
    const result = base ** exponent;
    return Number.isFinite(result) ? result : Number.POSITIVE_INFINITY;
}
