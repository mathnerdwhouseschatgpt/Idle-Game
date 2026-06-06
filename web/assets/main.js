import { RESOURCE_ICONS, RESOURCE_KEYS, RESOURCE_NAMES, } from "./game-core.js";
const SAVE_KEYS = ["idle-civ-save-v3", "idle-civ-save-v2", "idle-civ-save-v1"];
const WRITE_SAVE_KEY = SAVE_KEYS[0];
const EVENT_LOG_LIMIT = 6;
class UI {
    elements;
    worker;
    definitions = [];
    definitionById = new Map();
    eras = new Map();
    eraSections = new Map();
    resourceViews = new Map();
    cardViews = new Map();
    visibleEraIndices = new Set([1]);
    formatMode = "standard";
    lastSnapshot = null;
    toastTimer = null;
    pendingSaveToast = false;
    constructor() {
        this.elements = this.cacheElements();
        this.worker = new Worker(new URL("./sim-worker.js", import.meta.url), { type: "module" });
    }
    init() {
        this.renderResourcePanel();
        this.attachEvents();
        this.worker.addEventListener("message", (event) => {
            void this.handleWorkerMessage(event.data);
        });
        this.worker.addEventListener("error", (event) => {
            this.showToast(`Simulation worker failed: ${event.message}`, true);
        });
        this.postWorker({
            type: "init",
            save: loadSavedGame(),
            visibleEras: Array.from(this.visibleEraIndices),
        });
    }
    cacheElements() {
        return {
            rankDisplay: requireElement("era-display"),
            kIndex: requireElement("k-index"),
            kNext: requireElement("k-next"),
            elapsed: requireElement("elapsed-time"),
            resourcePanel: requireElement("resource-panel"),
            buildingsPanel: requireElement("buildings-panel"),
            topProducers: requireElement("top-producers"),
            milestones: requireElement("milestones"),
            eventLog: requireElement("event-log"),
            toast: requireElement("toast"),
            formatSelect: requireElement("format-select", HTMLSelectElement),
            autosaveToggle: requireElement("autosave-toggle", HTMLInputElement),
            saveBtn: requireElement("save-btn", HTMLButtonElement),
            exportBtn: requireElement("export-btn", HTMLButtonElement),
            importBtn: requireElement("import-btn", HTMLButtonElement),
            resetBtn: requireElement("reset-btn", HTMLButtonElement),
        };
    }
    async handleWorkerMessage(message) {
        switch (message.type) {
            case "ready":
                this.definitions = message.definitions;
                this.definitionById = new Map(this.definitions.map((definition) => [definition.identifier, definition]));
                this.buildEraIndex();
                this.renderEraShells();
                this.updateFromSnapshot(message.snapshot);
                break;
            case "snapshot":
                this.updateFromSnapshot(message.snapshot);
                break;
            case "toast":
                this.showToast(message.message, Boolean(message.isError));
                break;
            case "savePayload":
                await this.handleSavePayload(message.kind, message.payload);
                break;
            case "fatal":
                this.showToast(message.message, true);
                break;
        }
    }
    buildEraIndex() {
        this.eras.clear();
        this.eras.set(1, { name: "Control Modules", definitions: [...this.definitions] });
    }
    renderResourcePanel() {
        const fragment = document.createDocumentFragment();
        for (const resource of RESOURCE_KEYS) {
            const entry = document.createElement("div");
            entry.className = "resource-entry";
            entry.dataset.resource = resource;
            const icon = createResourceIcon(resource);
            icon.classList.add("resource-entry-icon");
            const name = document.createElement("span");
            name.className = "name";
            name.textContent = RESOURCE_NAMES[resource];
            const amount = document.createElement("span");
            amount.className = "amount";
            amount.textContent = "0";
            const delta = document.createElement("span");
            delta.className = "delta";
            delta.textContent = "+0/s";
            entry.append(icon, name, amount, delta);
            fragment.appendChild(entry);
            this.resourceViews.set(resource, { amount, delta });
        }
        this.elements.resourcePanel.replaceChildren(fragment);
    }
    renderEraShells() {
        this.elements.buildingsPanel.replaceChildren();
        this.cardViews.clear();
        const fragment = document.createDocumentFragment();
        for (const definition of this.definitions) {
            const card = this.createBuildingCard(definition);
            fragment.appendChild(card.card);
            this.cardViews.set(definition.identifier, card);
        }
        this.elements.buildingsPanel.appendChild(fragment);
    }
    ensureEraCards(eraIndex) {
        const section = this.eraSections.get(eraIndex);
        const era = this.eras.get(eraIndex);
        if (!section || !era || section.rendered)
            return;
        const fragment = document.createDocumentFragment();
        for (const definition of era.definitions) {
            const card = this.createBuildingCard(definition);
            fragment.appendChild(card.card);
            this.cardViews.set(definition.identifier, card);
        }
        section.container.replaceChildren(fragment);
        section.rendered = true;
    }
    clearEraCards(eraIndex) {
        const section = this.eraSections.get(eraIndex);
        const era = this.eras.get(eraIndex);
        if (!section || !era || !section.rendered)
            return;
        section.container.replaceChildren();
        section.rendered = false;
        for (const definition of era.definitions) {
            this.cardViews.delete(definition.identifier);
        }
    }
    createBuildingCard(definition) {
        const card = document.createElement("article");
        card.className = "building-card";
        card.dataset.identifier = definition.identifier;
        const header = document.createElement("div");
        header.className = "building-header";
        const titleWrap = document.createElement("div");
        titleWrap.className = "module-title-wrap";
        const indicator = document.createElement("span");
        indicator.className = "indicator";
        indicator.setAttribute("aria-hidden", "true");
        const title = document.createElement("h3");
        title.textContent = definition.name;
        titleWrap.append(indicator, title);
        const tags = document.createElement("div");
        tags.className = "tag-list";
        for (const tag of definition.tags) {
            const badge = document.createElement("span");
            badge.className = "tag resource-chip";
            badge.dataset.resource = tag;
            badge.append(createResourceIcon(tag), document.createTextNode(RESOURCE_NAMES[tag]));
            tags.appendChild(badge);
        }
        header.append(titleWrap, tags);
        const stats = document.createElement("div");
        stats.className = "stats";
        const owned = document.createElement("span");
        owned.className = "owned";
        owned.textContent = "Level: 0";
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
        const buy1 = createButton("+1", definition.identifier, "buy", "1");
        const buy10 = createButton("+10", definition.identifier, "buy", "10");
        const buy100 = createButton("+100", definition.identifier, "buy", "100");
        const buyMax = createButton("Max", definition.identifier, "buy-max");
        const autoToggle = createButton("Auto: Off", definition.identifier, "auto");
        controls.append(buy1, buy10, buy100, buyMax, autoToggle);
        const detailsDrawer = document.createElement("details");
        detailsDrawer.className = "building-details";
        const detailsSummary = document.createElement("summary");
        detailsSummary.textContent = "Module Intel";
        const synergyA = document.createElement("p");
        synergyA.textContent = definition.synergy_a;
        const synergyB = document.createElement("p");
        synergyB.textContent = definition.synergy_b;
        const upgrade = document.createElement("p");
        upgrade.textContent = definition.unique_upgrade;
        detailsDrawer.append(detailsSummary, synergyA, synergyB, upgrade);
        card.append(header, stats, production, cost, controls, detailsDrawer);
        return {
            card,
            title,
            indicator,
            owned,
            output,
            multiplier,
            production,
            cost,
            buy1,
            buy10,
            buy100,
            buyMax,
            autoToggle,
            lastLocked: null,
        };
    }
    attachEvents() {
        this.elements.buildingsPanel.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement))
                return;
            const action = target.dataset.action;
            const id = target.dataset.id;
            if (!action || !id)
                return;
            if (action === "buy") {
                this.postWorker({
                    type: "purchase",
                    id,
                    quantity: Number(target.dataset.quantity || "1"),
                });
            }
            else if (action === "buy-max") {
                this.postWorker({ type: "buyMax", id });
            }
            else if (action === "auto") {
                this.postWorker({ type: "toggleAuto", id });
            }
        });
        this.elements.formatSelect.addEventListener("change", () => {
            this.formatMode = this.elements.formatSelect.value === "scientific" ? "scientific" : "standard";
            if (this.lastSnapshot)
                this.updateFromSnapshot(this.lastSnapshot);
        });
        this.elements.autosaveToggle.addEventListener("change", () => {
            this.postWorker({ type: "setAutosave", enabled: this.elements.autosaveToggle.checked });
        });
        this.elements.saveBtn.addEventListener("click", () => {
            this.pendingSaveToast = true;
            this.postWorker({ type: "saveNow" });
        });
        this.elements.exportBtn.addEventListener("click", () => {
            this.postWorker({ type: "exportNow" });
        });
        this.elements.importBtn.addEventListener("click", () => {
            const code = prompt("Paste your export code:");
            if (!code)
                return;
            try {
                this.postWorker({ type: "importSave", save: decodeSave(code) });
            }
            catch (error) {
                console.error(error);
                this.showToast("Failed to import save.", true);
            }
        });
        this.elements.resetBtn.addEventListener("click", () => {
            const confirmReset = confirm("Reset all module levels and return to command rank 0? This cannot be undone.");
            if (!confirmReset)
                return;
            this.visibleEraIndices = new Set([1]);
            this.postWorker({ type: "reset" });
        });
    }
    updateFromSnapshot(snapshot) {
        this.lastSnapshot = snapshot;
        this.updateHeader(snapshot);
        this.updateResources(snapshot);
        this.updateCards(snapshot.cards);
        this.updateTopProducers(snapshot);
        this.updateMilestones(snapshot);
        this.handleUnlocks(snapshot.unlocks);
    }
    updateHeader(snapshot) {
        setText(this.elements.rankDisplay, String(snapshot.commandRank));
        setText(this.elements.kIndex, `K${snapshot.commandRank.toFixed(0)} / ${formatNumber(snapshot.totalRate, this.formatMode)}/s`);
        setText(this.elements.kNext, `Next K${snapshot.milestones.nextK.toFixed(2)}`);
        setText(this.elements.elapsed, formatDuration(snapshot.elapsedSeconds));
    }
    updateResources(snapshot) {
        for (const resource of RESOURCE_KEYS) {
            const view = this.resourceViews.get(resource);
            if (!view)
                continue;
            const rate = snapshot.rates[resource] || 0;
            setText(view.amount, formatNumber(snapshot.resources[resource] || 0, this.formatMode));
            setText(view.delta, `${rate >= 0 ? "+" : ""}${formatNumber(rate, this.formatMode)}/s`);
        }
    }
    updateEraSections(snapshot) {
        for (const [eraIndex, section] of this.eraSections.entries()) {
            const unlocked = eraIndex <= snapshot.eraUnlocked;
            const base = section.valueEl.dataset.base || "";
            setText(section.valueEl, unlocked ? base : `${base} (Locked)`);
            section.details.dataset.unlocked = unlocked ? "true" : "false";
            if (!unlocked && section.details.open) {
                section.details.open = false;
            }
        }
    }
    updateCards(cards) {
        for (const card of cards) {
            const view = this.cardViews.get(card.id);
            if (!view)
                continue;
            if (view.lastLocked !== card.locked) {
                view.card.classList.toggle("locked", card.locked);
                view.lastLocked = card.locked;
            }
            setText(view.title, card.locked ? `${card.displayName} (Locked)` : card.displayName);
            view.indicator.classList.toggle("active", card.activeBoost && !card.locked);
            setText(view.owned, `Level: ${card.level} • Prestige: ${card.prestige} • Next in ${card.nextPrestigeIn}`);
            setText(view.output, `Primary readout: ${formatNumber(card.outputPerSecond, this.formatMode)}/s`);
            setText(view.multiplier, `Stat multiplier: ${card.multiplier.toFixed(2)}x`);
            setText(view.production, card.production.length
                ? `Produces: ${card.production
                    .map((line) => `${formatResource(line.resource)} ${formatNumber(line.perOwned, this.formatMode)}/s per, ${formatNumber(line.total, this.formatMode)}/s total`)
                    .join(" | ")}`
                : "Produces: -");
            setText(view.cost, card.locked ? `Locked: requires total module level ${card.unlockRequirement}` : `Upgrade cost: ${formatCost(card.cost, this.formatMode)}`);
            view.buy1.disabled = card.locked || card.maxQty < 1;
            view.buy10.disabled = card.locked || card.maxQty < 10;
            view.buy100.disabled = card.locked || card.maxQty < 100;
            view.buyMax.disabled = card.locked || card.maxQty === 0;
            view.autoToggle.disabled = card.locked;
            setText(view.buyMax, card.maxQty > 0 ? `Max (${formatInteger(card.maxQty)})` : "Max");
            setText(view.autoToggle, card.locked ? "Auto: -" : `Auto: ${card.automation ? "On" : "Off"}`);
        }
    }
    updateTopProducers(snapshot) {
        const fragment = document.createDocumentFragment();
        if (snapshot.topProducers.length === 0) {
            const placeholder = document.createElement("li");
            placeholder.textContent = "No production yet.";
            fragment.appendChild(placeholder);
        }
        else {
            for (const producer of snapshot.topProducers) {
                const item = document.createElement("li");
                item.textContent = `${producer.name}: ${formatNumber(producer.total, this.formatMode)}/s`;
                fragment.appendChild(item);
            }
        }
        this.elements.topProducers.replaceChildren(fragment);
    }
    updateMilestones(snapshot) {
        const fragment = document.createDocumentFragment();
        const milestone = snapshot.milestones;
        if (milestone.nextBuilding) {
            fragment.appendChild(createMilestone(`Next Module: ${milestone.nextBuilding}`, `Reach total module level ${formatNumber(milestone.nextBuildingThreshold, this.formatMode)}`, milestone.nextBuildingProgress));
        }
        else {
            fragment.appendChild(createMilestone("All Modules Online", "All 20 cockpit modules are unlocked.", 1));
        }
        fragment.appendChild(createMilestone(`Next K Threshold (K${milestone.nextK.toFixed(2)})`, milestone.energyDelta > 0
            ? `Need +${formatNumber(milestone.energyDelta, this.formatMode)} Energy/s`
            : "Threshold achieved!", milestone.kProgress));
        this.elements.milestones.replaceChildren(fragment);
    }
    handleUnlocks(unlocks) {
        if (unlocks.length === 0)
            return;
        let needsVisibleUpdate = false;
        for (const era of unlocks) {
            needsVisibleUpdate = true;
            this.showToast(`Module ${era} unlocked and online.`);
        }
        if (needsVisibleUpdate) {
            this.postWorker({ type: "requestSnapshot" });
        }
    }
    async handleSavePayload(kind, payload) {
        if (kind === "export") {
            await this.exportSave(payload);
            return;
        }
        saveGame(payload);
        if (kind === "manual" && this.pendingSaveToast) {
            this.pendingSaveToast = false;
            this.showToast("Game saved.");
        }
    }
    async exportSave(payload) {
        const exportString = encodeSave(payload);
        try {
            await navigator.clipboard.writeText(exportString);
            this.showToast("Export code copied to clipboard.");
        }
        catch (error) {
            console.warn(error);
            prompt("Copy this export code:", exportString);
            this.showToast("Export code ready. Copy from prompt.");
        }
    }
    showToast(message, isError = false) {
        setText(this.elements.toast, message);
        this.elements.toast.classList.toggle("error", isError);
        this.elements.toast.classList.add("show");
        if (this.toastTimer !== null)
            window.clearTimeout(this.toastTimer);
        this.toastTimer = window.setTimeout(() => {
            this.elements.toast.classList.remove("show");
        }, 3000);
        this.addEventLog(message);
    }
    addEventLog(message) {
        const item = document.createElement("li");
        item.textContent = message;
        this.elements.eventLog.prepend(item);
        while (this.elements.eventLog.children.length > EVENT_LOG_LIMIT) {
            this.elements.eventLog.lastElementChild?.remove();
        }
    }
    postVisibleEras() {
        this.postWorker({ type: "setVisibleEras", eras: Array.from(this.visibleEraIndices) });
    }
    postWorker(message) {
        this.worker.postMessage(message);
    }
}
function requireElement(id, constructor) {
    const element = document.getElementById(id);
    if (!element)
        throw new Error(`Missing required element: #${id}`);
    if (constructor && !(element instanceof constructor)) {
        throw new Error(`Element #${id} has the wrong type.`);
    }
    return element;
}
function createResourceIcon(resource) {
    const icon = document.createElement("span");
    icon.className = "resource-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = RESOURCE_ICONS[resource];
    return icon;
}
function formatResource(resource) {
    return `${RESOURCE_ICONS[resource]} ${RESOURCE_NAMES[resource]}`;
}
function createButton(label, id, action, quantity) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.id = id;
    button.dataset.action = action;
    if (quantity)
        button.dataset.quantity = quantity;
    return button;
}
function createMilestone(title, subtitle, progress) {
    const wrapper = document.createElement("div");
    wrapper.className = "milestone";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const description = document.createElement("p");
    description.textContent = subtitle;
    const bar = document.createElement("div");
    bar.className = "progress-bar";
    const span = document.createElement("span");
    span.style.width = `${Math.max(0, Math.min(progress, 1)) * 100}%`;
    bar.appendChild(span);
    wrapper.append(heading, description, bar);
    return wrapper;
}
function formatNumber(value, mode = "standard") {
    if (!Number.isFinite(value))
        return "Inf";
    if (value === 0)
        return "0";
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
        if (abs >= unit.value)
            return `${(value / unit.value).toFixed(2)}${unit.suffix}`;
    }
    if (abs >= 100)
        return value.toFixed(0);
    if (abs >= 10)
        return value.toFixed(1);
    return value.toFixed(2);
}
function formatInteger(value) {
    if (!Number.isFinite(value))
        return "Inf";
    if (value < 1000)
        return String(Math.floor(value));
    return formatNumber(value);
}
function formatCost(cost, mode) {
    const entries = Object.entries(cost);
    if (entries.length === 0)
        return "-";
    return entries.map(([resource, amount]) => `${formatResource(resource)} ${formatNumber(amount, mode)}`).join(", ");
}
function formatDuration(seconds) {
    const s = Math.floor(seconds);
    if (s < 60)
        return `${s}s`;
    const minutes = Math.floor(s / 60);
    const sec = s % 60;
    if (minutes < 60)
        return `${minutes}m ${sec}s`;
    const hours = Math.floor(minutes / 60);
    const min = minutes % 60;
    return `${hours}h ${min}m`;
}
function setText(element, text) {
    if (element.textContent !== text)
        element.textContent = text;
}
function loadSavedGame() {
    if (typeof localStorage === "undefined")
        return undefined;
    for (const key of SAVE_KEYS) {
        const raw = localStorage.getItem(key);
        if (!raw)
            continue;
        try {
            return JSON.parse(raw);
        }
        catch (error) {
            console.warn(`Failed to parse save ${key}:`, error);
        }
    }
    return undefined;
}
function saveGame(payload) {
    if (typeof localStorage === "undefined")
        return;
    localStorage.setItem(WRITE_SAVE_KEY, JSON.stringify(payload));
}
function encodeSave(payload) {
    return btoa(encodeURIComponent(JSON.stringify(payload)));
}
function decodeSave(code) {
    return JSON.parse(decodeURIComponent(atob(code.trim())));
}
new UI().init();
