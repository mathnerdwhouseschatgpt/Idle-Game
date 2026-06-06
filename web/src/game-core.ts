export const RESOURCE_NAMES = {
  W: "Wood",
  S: "Stone",
  E: "Energy",
  F: "Food",
  P: "Population",
} as const;

export const RESOURCE_ICONS = {
  W: "🌲",
  S: "⛰️",
  E: "⚡",
  F: "🌾",
  P: "👥",
} as const satisfies Record<keyof typeof RESOURCE_NAMES, string>;

export const RESOURCE_KEYS = Object.keys(RESOURCE_NAMES) as ResourceKey[];

export type ResourceKey = keyof typeof RESOURCE_NAMES;
export type ResourceMap = Record<ResourceKey, number>;

export interface SynergyData {
  type?: "per_building" | "stored_resource";
  target_identifier?: string;
  resource?: ResourceKey;
  threshold?: number;
  bonus_percent?: number;
  secondary_resource?: ResourceKey;
  secondary_bonus_percent?: number;
}

export interface BuildingData {
  identifier: string;
  name: string;
  era: string;
  era_index: number;
  index_in_era: number;
  tags: ResourceKey[];
  base_rate: number;
  base_cost: number;
  growth: number;
  cost_shares: Partial<ResourceMap>;
  synergy_a: string;
  synergy_b: string;
  synergy_a_data: SynergyData;
  synergy_b_data: SynergyData;
  unique_upgrade: string;
}

export interface SerializedBuilding {
  id: string;
  owned: number;
  automation: boolean;
}

export interface SerializedGame {
  version: 2;
  resources: Partial<ResourceMap>;
  totalProduced: Partial<ResourceMap>;
  eraUnlocked: number;
  elapsedSeconds: number;
  buildings: SerializedBuilding[];
  timestamp: number;
}

export interface BuildingOutput {
  total: number;
  multiplier: number;
}

export interface ProductionSummary {
  rates: ResourceMap;
  buildingOutputs: Map<string, BuildingOutput>;
  totalRate: number;
}

export interface PurchaseResult {
  success: boolean;
  reason?: string;
  cost?: Partial<ResourceMap>;
  quantity?: number;
}

export interface ProductionLineSnapshot {
  resource: ResourceKey;
  perOwned: number;
  total: number;
}

export interface CardSnapshot {
  id: string;
  eraIndex: number;
  owned: number;
  automation: boolean;
  locked: boolean;
  outputPerSecond: number;
  multiplier: number;
  production: ProductionLineSnapshot[];
  cost: Partial<ResourceMap>;
  maxQty: number;
}

export interface TopProducerSnapshot {
  id: string;
  name: string;
  total: number;
}

export interface MilestoneSnapshot {
  nextEra: number | null;
  nextEraThreshold: number;
  nextEraProgress: number;
  nextK: number;
  requiredEnergy: number;
  energyRate: number;
  energyDelta: number;
  kProgress: number;
}

export interface GameSnapshot {
  resources: ResourceMap;
  rates: ResourceMap;
  eraUnlocked: number;
  elapsedSeconds: number;
  kIndex: number;
  nextK: number;
  totalRate: number;
  topProducers: TopProducerSnapshot[];
  milestones: MilestoneSnapshot;
  cards: CardSnapshot[];
  unlocks: number[];
}

const DEFAULT_START: ResourceMap = {
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
const MAX_BULK_PURCHASE = 1_000_000;
const EPSILON = 1e-9;

export class BuildingDefinition implements BuildingData {
  identifier: string;
  name: string;
  era: string;
  era_index: number;
  index_in_era: number;
  tags: ResourceKey[];
  base_rate: number;
  base_cost: number;
  growth: number;
  cost_shares: Partial<ResourceMap>;
  synergy_a: string;
  synergy_b: string;
  synergy_a_data: SynergyData;
  synergy_b_data: SynergyData;
  unique_upgrade: string;

  constructor(data: BuildingData) {
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
  definition: BuildingDefinition;
  owned = 0;
  automation = false;

  constructor(definition: BuildingDefinition) {
    this.definition = definition;
  }
}

export class Game {
  definitions: BuildingDefinition[];
  states: BuildingState[];
  stateById = new Map<string, BuildingState>();
  resources: ResourceMap = createResourceMap();
  totalProduced: ResourceMap = createResourceMap();
  eraUnlocked = 1;
  elapsedSeconds = 0;
  pendingUnlocks: number[] = [];
  lastSummary: ProductionSummary;
  autosaveEnabled = true;
  private autosaveTimer = 0;
  private automationTimer = 0;
  private productionDirty = true;
  private storedResourceThresholds = new Map<ResourceKey, number[]>();
  private storedResourceBuckets: ResourceMap = createResourceMap(-1);

  constructor(definitions: BuildingDefinition[]) {
    this.definitions = definitions;
    this.states = definitions.map((def) => new BuildingState(def));
    for (const state of this.states) {
      this.stateById.set(state.definition.identifier, state);
    }
    this.storedResourceThresholds = buildStoredResourceThresholds(definitions);
    this.lastSummary = emptyProductionSummary();
    this.reset();
  }

  reset(): void {
    this.resources = { ...DEFAULT_START };
    this.totalProduced = createResourceMap();
    this.eraUnlocked = 1;
    this.elapsedSeconds = 0;
    this.pendingUnlocks = [];
    this.autosaveTimer = 0;
    this.automationTimer = 0;
    this.storedResourceBuckets = createResourceMap(-1);
    for (const state of this.states) {
      state.owned = 0;
      state.automation = false;
    }
    this.seedStartingBuildings();
    this.markProductionDirty();
    this.rebuildStoredResourceBuckets();
    this.recomputeProductionIfDirty();
  }

  serialize(): SerializedGame {
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

  load(payload: Partial<SerializedGame> | null | undefined): boolean {
    if (!payload) return false;
    this.reset();
    this.resources = normalizeResourceMap({ ...DEFAULT_START, ...payload.resources });
    this.totalProduced = normalizeResourceMap({ ...this.totalProduced, ...payload.totalProduced });
    this.eraUnlocked = clamp(Math.floor(payload.eraUnlocked || 1), 1, 20);
    this.elapsedSeconds = sanitizeSeconds(payload.elapsedSeconds || 0);

    if (Array.isArray(payload.buildings)) {
      for (const saved of payload.buildings) {
        if (!isSerializedBuilding(saved)) continue;
        const state = this.stateById.get(saved.id);
        if (!state) continue;
        state.owned = sanitizeOwned(saved.owned);
        state.automation = Boolean(saved.automation);
      }
    }

    this.markProductionDirty();
    this.rebuildStoredResourceBuckets();
    this.recomputeProductionIfDirty();

    if (payload.timestamp) {
      const delta = Math.min(Math.max((Date.now() - payload.timestamp) / 1000, 0), OFFLINE_CAP);
      if (delta > 0) this.tickSeconds(delta, 1);
    }

    return true;
  }

  tickSeconds(totalSeconds: number, step = 1): void {
    let remaining = sanitizeSeconds(totalSeconds);
    const safeStep = Math.max(sanitizeSeconds(step), 0.1);
    let iterations = 0;
    while (remaining > 0 && iterations < MAX_TICK_ITERATIONS) {
      const delta = Math.min(safeStep, remaining);
      this.tick(delta);
      remaining -= delta;
      iterations += 1;
    }
    if (remaining > 0) this.tick(remaining);
  }

  tick(deltaSeconds: number): void {
    const delta = sanitizeSeconds(deltaSeconds);
    if (delta <= 0) return;

    const summary = this.recomputeProductionIfDirty();
    this.addResources(summary.rates, delta);
    if (this.storedResourceBucketChanged()) {
      this.markProductionDirty();
      this.recomputeProductionIfDirty();
    }

    this.elapsedSeconds += delta;
    this.automationTimer += delta;
    this.applyAutomation();
    this.updateEraUnlock(this.lastSummary.totalRate);
    this.autosaveTimer += delta;
  }

  computeProductionSummary(): ProductionSummary {
    for (const resource of RESOURCE_KEYS) {
      this.lastSummary.rates[resource] = 0;
    }
    this.lastSummary.buildingOutputs.clear();

    for (const state of this.states) {
      if (state.owned <= 0) continue;
      const def = state.definition;
      const multiplier = productionMultiplier(this, state);
      const totalPerBuilding = def.base_rate * multiplier;
      const totalProduction = totalPerBuilding * state.owned;
      const perResource = totalPerBuilding / def.tags.length;

      for (const tag of def.tags) {
        this.lastSummary.rates[tag] += perResource * state.owned;
      }

      this.lastSummary.buildingOutputs.set(def.identifier, { total: totalProduction, multiplier });
    }

    this.lastSummary.totalRate = totalRate(this.lastSummary.rates);
    this.productionDirty = false;
    return this.lastSummary;
  }

  attemptPurchase(identifier: string, quantity: number): PurchaseResult {
    const state = this.stateById.get(identifier);
    const qty = Math.floor(quantity);
    if (!state) return { success: false, reason: "Unknown building." };
    if (qty <= 0) return { success: false, reason: "Quantity must be positive." };
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
    this.trackStoredResourceThresholds();
    this.markProductionDirty();
    this.recomputeProductionIfDirty();
    return { success: true, cost: affordability.cost, quantity: qty };
  }

  buyMax(identifier: string): PurchaseResult {
    const state = this.stateById.get(identifier);
    if (!state) return { success: false, reason: "Unknown building." };
    const maxQty = this.maxAffordable(state);
    if (maxQty <= 0) return { success: false, reason: "Not enough resources for any purchase." };
    return this.attemptPurchase(identifier, maxQty);
  }

  toggleAutomation(identifier: string): PurchaseResult {
    const state = this.stateById.get(identifier);
    if (!state) return { success: false, reason: "Unknown building." };
    if (state.definition.era_index > this.eraUnlocked) {
      return { success: false, reason: "Building is locked in this era." };
    }
    state.automation = !state.automation;
    return { success: true };
  }

  maxAffordable(state: BuildingState): number {
    if (state.definition.era_index > this.eraUnlocked) return 0;
    if (!this.canAfford(state, 1)) return 0;

    const estimatedLimit = this.estimateMaxAffordable(state);
    const upperBound = this.findAffordableUpperBound(state, estimatedLimit);
    let low = 0;
    let high = upperBound;

    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.canAfford(state, mid)) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return low;
  }

  canAfford(state: BuildingState, quantity: number): boolean {
    return this.canAffordWithCost(state, quantity).afford;
  }

  getKIndex(): number {
    const energyRate = this.lastSummary.rates.E || 0;
    const planetaryPower = Math.max(energyRate * 1000 + this.eraUnlocked * 1000, 1);
    const base = (Math.log10(planetaryPower) - 6) / 10;
    const k = base + (this.eraUnlocked - 1) * 0.02;
    return clamp(roundTo(k, 3), 0, 3);
  }

  getNextKThreshold(): number {
    const current = this.getKIndex();
    if (current >= 3) return 3;
    const thresholds = [0.2, 0.4, 0.6, 0.8, 1.0, 1.4, 1.8, 2.0, 2.4, 2.8, 3.0];
    return thresholds.find((value) => value > current) || 3;
  }

  requiredEnergyForK(targetK: number): number {
    const base = targetK - (this.eraUnlocked - 1) * 0.02;
    const exponent = 10 * base + 6;
    const power = 10 ** exponent;
    const required = (power - this.eraUnlocked * 1000) / 1000;
    return Math.max(required, 0);
  }

  shouldAutosave(): boolean {
    if (!this.autosaveEnabled) return false;
    if (this.autosaveTimer >= AUTOSAVE_INTERVAL) {
      this.autosaveTimer = 0;
      return true;
    }
    return false;
  }

  takeUnlocks(): number[] {
    const unlocks = this.pendingUnlocks;
    this.pendingUnlocks = [];
    return unlocks;
  }

  snapshot(visibleEraIndices: Set<number>): GameSnapshot {
    this.recomputeProductionIfDirty();

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

  private cardSnapshots(visibleEraIndices: Set<number>): CardSnapshot[] {
    const cards: CardSnapshot[] = [];
    for (const state of this.states) {
      const def = state.definition;
      if (!visibleEraIndices.has(def.era_index)) continue;
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

  private topProducers(limit: number): TopProducerSnapshot[] {
    const producers: TopProducerSnapshot[] = [];
    for (const [id, info] of this.lastSummary.buildingOutputs.entries()) {
      if (info.total <= 0) continue;
      producers.push({
        id,
        total: info.total,
        name: this.stateById.get(id)?.definition.name || id,
      });
    }

    return producers.sort((a, b) => b.total - a.total).slice(0, limit);
  }

  private seedStartingBuildings(): void {
    let seeded = 0;
    for (const state of this.states) {
      if (state.definition.era_index === 1 && state.definition.index_in_era <= 5) {
        state.owned = Math.max(state.owned, 1);
        seeded += 1;
        if (seeded >= 5) break;
      }
    }
  }

  private applyAutomation(): void {
    if (this.automationTimer < AUTOMATION_INTERVAL) return;
    let needsRecalc = false;
    let passes = 0;

    while (this.automationTimer >= AUTOMATION_INTERVAL && passes < MAX_AUTOMATION_PASSES) {
      this.automationTimer -= AUTOMATION_INTERVAL;
      passes += 1;
      for (const state of this.states) {
        if (!state.automation || state.definition.era_index > this.eraUnlocked) continue;
        const maxQty = this.maxAffordable(state);
        if (maxQty <= 0) continue;
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
      this.trackStoredResourceThresholds();
      this.markProductionDirty();
      this.recomputeProductionIfDirty();
    }
  }

  private updateEraUnlock(totalRate: number): void {
    while (this.eraUnlocked < 20) {
      const threshold = rateBaseline(this.eraUnlocked + 1) * ERA_UNLOCK_SCALE;
      if (totalRate >= threshold) {
        this.eraUnlocked += 1;
        this.pendingUnlocks.push(this.eraUnlocked);
      } else {
        break;
      }
    }
  }

  private canAffordWithCost(state: BuildingState, quantity: number): {
    afford: boolean;
    resource?: ResourceKey;
    cost: Partial<ResourceMap>;
  } {
    const cost = costFor(state.definition, state.owned, quantity);
    for (const [resource, amount] of Object.entries(cost) as [ResourceKey, number][]) {
      const available = this.resources[resource] || 0;
      if (available + EPSILON < amount) return { afford: false, resource, cost };
    }
    return { afford: true, cost };
  }

  private spend(cost: Partial<ResourceMap>): void {
    for (const [resource, amount] of Object.entries(cost) as [ResourceKey, number][]) {
      this.resources[resource] = Math.max((this.resources[resource] || 0) - amount, 0);
    }
  }

  private addResources(rates: ResourceMap, delta: number): void {
    for (const resource of RESOURCE_KEYS) {
      const gained = rates[resource] * delta;
      this.resources[resource] += gained;
      this.totalProduced[resource] += gained;
    }
  }

  private markProductionDirty(): void {
    this.productionDirty = true;
  }

  private recomputeProductionIfDirty(): ProductionSummary {
    if (this.productionDirty) return this.computeProductionSummary();
    return this.lastSummary;
  }

  private rebuildStoredResourceBuckets(): void {
    for (const resource of RESOURCE_KEYS) {
      this.storedResourceBuckets[resource] = computeStoredResourceBucket(
        this.resources[resource],
        this.storedResourceThresholds.get(resource) || [],
      );
    }
  }

  private storedResourceBucketChanged(): boolean {
    let changed = false;
    for (const resource of RESOURCE_KEYS) {
      const nextBucket = computeStoredResourceBucket(
        this.resources[resource],
        this.storedResourceThresholds.get(resource) || [],
      );
      if (nextBucket !== this.storedResourceBuckets[resource]) {
        this.storedResourceBuckets[resource] = nextBucket;
        changed = true;
      }
    }
    return changed;
  }

  private trackStoredResourceThresholds(): void {
    this.rebuildStoredResourceBuckets();
  }

  private estimateMaxAffordable(state: BuildingState): number {
    const def = state.definition;
    const growth = def.growth;
    const logGrowth = Math.log(growth);
    let limit = Number.POSITIVE_INFINITY;

    for (const [resource, share] of positiveCostShareEntries(def.cost_shares)) {
      const available = this.resources[resource] || 0;
      const firstUnitCost = def.base_cost * safePow(growth, state.owned) * share;
      if (!Number.isFinite(firstUnitCost) || firstUnitCost <= 0) return 0;

      let resourceLimit = 0;
      if (Math.abs(growth - 1) < EPSILON) {
        resourceLimit = Math.floor(available / firstUnitCost);
      } else {
        const affordableSeries = (available * (growth - 1)) / firstUnitCost + 1;
        resourceLimit = affordableSeries > 1 ? Math.floor(Math.log(affordableSeries) / logGrowth) : 0;
      }
      limit = Math.min(limit, resourceLimit);
    }

    return Number.isFinite(limit) ? clamp(Math.floor(limit), 0, MAX_BULK_PURCHASE) : 0;
  }

  private findAffordableUpperBound(state: BuildingState, estimate: number): number {
    let high = clamp(Math.max(estimate, 1), 1, MAX_BULK_PURCHASE);

    while (high < MAX_BULK_PURCHASE && this.canAfford(state, high)) {
      const next = Math.min(high * 2, MAX_BULK_PURCHASE);
      if (next === high) break;
      high = next;
    }

    if (this.canAfford(state, high)) return high;

    let low = 1;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (this.canAfford(state, mid)) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return Math.max(low, 1);
  }
}

export function costFor(definition: BuildingDefinition, owned: number, quantity: number): Partial<ResourceMap> {
  const qty = Math.max(Math.floor(quantity), 0);
  if (qty <= 0) return {};

  const growth = definition.growth;
  const base = definition.base_cost * safePow(growth, owned);
  const totalCost =
    qty === 1 || Math.abs(growth - 1) < EPSILON
      ? base * qty
      : base * ((safePow(growth, qty) - 1) / (growth - 1));

  const result: Partial<ResourceMap> = {};
  for (const [resource, share] of Object.entries(definition.cost_shares) as [ResourceKey, number][]) {
    result[resource] = totalCost * share;
  }
  return result;
}

export function productionMultiplier(game: Game, state: BuildingState): number {
  let multiplier = 1;
  const dataA = state.definition.synergy_a_data;
  if (dataA.type === "per_building" && dataA.target_identifier) {
    const target = game.stateById.get(dataA.target_identifier);
    if (target) multiplier *= 1 + (target.owned * (dataA.bonus_percent || 0)) / 100;
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

export function rateBaseline(eraIndex: number): number {
  return 0.1 * 3.6 ** (eraIndex - 1);
}

export function createResourceMap(value = 0): ResourceMap {
  return { W: value, S: value, E: value, F: value, P: value };
}

export function normalizeResourceMap(source: Partial<ResourceMap>): ResourceMap {
  const normalized = createResourceMap();
  for (const resource of RESOURCE_KEYS) {
    const value = Number(source[resource] || 0);
    normalized[resource] = Number.isFinite(value) ? Math.max(value, 0) : 0;
  }
  return normalized;
}

export function sanitizeSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function isSerializedBuilding(value: unknown): value is Partial<SerializedBuilding> {
  return typeof value === "object" && value !== null && "id" in value;
}

function sanitizeOwned(value: unknown): number {
  const owned = Math.floor(Number(value || 0));
  return Number.isFinite(owned) ? Math.max(owned, 0) : 0;
}

function emptyProductionSummary(): ProductionSummary {
  return {
    rates: createResourceMap(),
    buildingOutputs: new Map<string, BuildingOutput>(),
    totalRate: 0,
  };
}

function totalRate(rates: ResourceMap): number {
  let total = 0;
  for (const resource of RESOURCE_KEYS) {
    total += rates[resource];
  }
  return total;
}

function buildStoredResourceThresholds(definitions: BuildingDefinition[]): Map<ResourceKey, number[]> {
  const thresholds = new Map<ResourceKey, Set<number>>();
  for (const definition of definitions) {
    const data = definition.synergy_b_data;
    if (data.type !== "stored_resource" || !data.resource) continue;
    const threshold = Number(data.threshold || 0);
    if (!Number.isFinite(threshold) || threshold <= 0) continue;
    if (!thresholds.has(data.resource)) thresholds.set(data.resource, new Set<number>());
    thresholds.get(data.resource)?.add(threshold);
  }

  const result = new Map<ResourceKey, number[]>();
  for (const [resource, values] of thresholds.entries()) {
    result.set(
      resource,
      Array.from(values).sort((a, b) => a - b),
    );
  }
  return result;
}

function computeStoredResourceBucket(amount: number, thresholds: number[]): number {
  let bucket = 0;
  for (const threshold of thresholds) {
    if (amount + EPSILON < threshold) break;
    bucket += 1;
  }
  return bucket;
}

function positiveCostShareEntries(costShares: Partial<ResourceMap>): [ResourceKey, number][] {
  return (Object.entries(costShares) as [ResourceKey, number][]).filter(([, share]) => share > 0);
}

function safePow(base: number, exponent: number): number {
  const result = base ** exponent;
  return Number.isFinite(result) ? result : Number.POSITIVE_INFINITY;
}
