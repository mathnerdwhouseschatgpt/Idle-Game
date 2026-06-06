import { BuildingDefinition, Game, } from "./game-core.js";
const DATA_URL = new URL("../data/buildings.json", import.meta.url);
const TICK_STEP = 0.2;
const MAX_TICKS_PER_FRAME = 5;
const MAX_FRAME_DELTA = 1;
const SNAPSHOT_INTERVAL = 0.25;
const LOOP_INTERVAL_MS = 50;
let game = null;
let definitions = [];
let visibleEraIndices = new Set([1]);
let lastTimestamp = performance.now();
let accumulator = 0;
let snapshotTimer = 0;
let loopHandle = null;
const workerGlobal = globalThis;
workerGlobal.addEventListener("message", (event) => {
    void handleMessage(event.data);
});
async function handleMessage(message) {
    try {
        switch (message.type) {
            case "init":
                await initialize(message.save, message.visibleEras);
                break;
            case "setVisibleEras":
                visibleEraIndices = normalizeEraSet(message.eras);
                postSnapshot();
                break;
            case "purchase":
                withGame((current) => {
                    const result = current.attemptPurchase(message.id, message.quantity);
                    postPurchaseResult(result, message.id);
                });
                break;
            case "buyMax":
                withGame((current) => {
                    const result = current.buyMax(message.id);
                    postPurchaseResult(result, message.id);
                });
                break;
            case "toggleAuto":
                withGame((current) => {
                    const state = current.stateById.get(message.id);
                    const result = current.toggleAutomation(message.id);
                    if (result.success && state) {
                        postToast(`${state.definition.name} automation ${state.automation ? "enabled" : "disabled"}.`);
                    }
                    else {
                        postToast(result.reason || "Unable to toggle automation.", true);
                    }
                    postSnapshot();
                });
                break;
            case "setAutosave":
                withGame((current) => {
                    current.autosaveEnabled = message.enabled;
                });
                break;
            case "reset":
                withGame((current) => {
                    current.reset();
                    postToast("Progress reset.");
                    postSave("manual");
                    postSnapshot();
                });
                break;
            case "importSave":
                withGame((current) => {
                    if (current.load(message.save)) {
                        postToast("Save imported.");
                        postSave("manual");
                        postSnapshot();
                    }
                    else {
                        postToast("Failed to import save.", true);
                    }
                });
                break;
            case "saveNow":
                postSave("manual");
                break;
            case "exportNow":
                postSave("export");
                break;
            case "requestSnapshot":
                postSnapshot();
                break;
        }
    }
    catch (error) {
        postFatal(error instanceof Error ? error.message : "Worker command failed.");
    }
}
async function initialize(save, eras) {
    const response = await fetch(DATA_URL);
    if (!response.ok)
        throw new Error("Failed to load buildings dataset.");
    const rawDefinitions = (await response.json());
    definitions = rawDefinitions.map((entry) => new BuildingDefinition(entry));
    game = new Game(definitions);
    if (save)
        game.load(save);
    visibleEraIndices = normalizeEraSet(eras || [1]);
    lastTimestamp = performance.now();
    accumulator = 0;
    snapshotTimer = 0;
    startLoop();
    post({
        type: "ready",
        definitions: rawDefinitions,
        snapshot: game.snapshot(visibleEraIndices),
    });
}
function startLoop() {
    if (loopHandle !== null)
        return;
    loopHandle = workerGlobal.setInterval(() => {
        if (!game)
            return;
        const now = performance.now();
        const delta = Math.min(Math.max((now - lastTimestamp) / 1000, 0), MAX_FRAME_DELTA);
        lastTimestamp = now;
        accumulator = Math.min(accumulator + delta, MAX_FRAME_DELTA);
        let ticks = 0;
        while (accumulator >= TICK_STEP && ticks < MAX_TICKS_PER_FRAME) {
            game.tick(TICK_STEP);
            accumulator -= TICK_STEP;
            ticks += 1;
        }
        if (accumulator >= TICK_STEP) {
            accumulator %= TICK_STEP;
        }
        if (game.shouldAutosave()) {
            postSave("autosave");
        }
        snapshotTimer += delta;
        if (snapshotTimer >= SNAPSHOT_INTERVAL) {
            snapshotTimer = 0;
            postSnapshot();
        }
    }, LOOP_INTERVAL_MS);
}
function postPurchaseResult(result, id) {
    if (!game)
        return;
    if (!result.success) {
        postToast(result.reason || "Purchase failed.", true);
        postSnapshot();
        return;
    }
    const state = game.stateById.get(id);
    const quantity = result.quantity || 0;
    postToast(`Purchased ${quantity} x ${state?.definition.name || "building"}.`);
    postSnapshot();
}
function withGame(callback) {
    if (!game) {
        postFatal("Simulation is not initialized.");
        return;
    }
    callback(game);
}
function postSnapshot() {
    if (!game)
        return;
    post({ type: "snapshot", snapshot: game.snapshot(visibleEraIndices) });
}
function postSave(kind) {
    if (!game)
        return;
    post({ type: "savePayload", kind, payload: game.serialize() });
}
function postToast(message, isError = false) {
    post({ type: "toast", message, isError });
}
function postFatal(message) {
    post({ type: "fatal", message });
}
function post(message) {
    workerGlobal.postMessage(message);
}
function normalizeEraSet(eras) {
    const normalized = new Set();
    for (const era of eras) {
        const value = Math.floor(Number(era));
        if (Number.isFinite(value) && value >= 1 && value <= 20) {
            normalized.add(value);
        }
    }
    if (normalized.size === 0)
        normalized.add(1);
    return normalized;
}
