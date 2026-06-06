import {
  BuildingData,
  BuildingDefinition,
  Game,
  GameSnapshot,
  PurchaseResult,
  SerializedGame,
} from "./game-core.js";

const DATA_URL = new URL("../data/buildings.json", import.meta.url);
const TICK_STEP = 0.2;
const MAX_TICKS_PER_FRAME = 5;
const MAX_FRAME_DELTA = 1;
const SNAPSHOT_INTERVAL = 0.25;
const LOOP_INTERVAL_MS = 50;

type SaveKind = "autosave" | "manual" | "export";

type MainToWorker =
  | { type: "init"; save?: Partial<SerializedGame>; visibleEras?: number[] }
  | { type: "setVisibleEras"; eras: number[] }
  | { type: "purchase"; id: string; quantity: number }
  | { type: "buyMax"; id: string }
  | { type: "toggleAuto"; id: string }
  | { type: "setAutosave"; enabled: boolean }
  | { type: "reset" }
  | { type: "importSave"; save: Partial<SerializedGame> }
  | { type: "saveNow" }
  | { type: "exportNow" }
  | { type: "requestSnapshot" };

type WorkerToMain =
  | {
      type: "ready";
      definitions: BuildingData[];
      snapshot: GameSnapshot;
    }
  | { type: "snapshot"; snapshot: GameSnapshot }
  | { type: "toast"; message: string; isError?: boolean }
  | { type: "savePayload"; kind: SaveKind; payload: SerializedGame }
  | { type: "fatal"; message: string };

let game: Game | null = null;
let definitions: BuildingDefinition[] = [];
let visibleEraIndices = new Set<number>([1]);
let lastTimestamp = performance.now();
let accumulator = 0;
let snapshotTimer = 0;
let loopHandle: number | null = null;

const workerGlobal = globalThis as unknown as {
  postMessage(message: WorkerToMain): void;
  addEventListener(type: "message", listener: (event: MessageEvent<MainToWorker>) => void): void;
  setInterval(handler: () => void, timeout?: number): number;
};

workerGlobal.addEventListener("message", (event) => {
  void handleMessage(event.data);
});

async function handleMessage(message: MainToWorker): Promise<void> {
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
          } else {
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
          } else {
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
  } catch (error) {
    postFatal(error instanceof Error ? error.message : "Worker command failed.");
  }
}

async function initialize(save?: Partial<SerializedGame>, eras?: number[]): Promise<void> {
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error("Failed to load buildings dataset.");

  const rawDefinitions = (await response.json()) as BuildingData[];
  definitions = rawDefinitions.map((entry) => new BuildingDefinition(entry));
  game = new Game(definitions);
  if (save) game.load(save);
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

function startLoop(): void {
  if (loopHandle !== null) return;
  loopHandle = workerGlobal.setInterval(() => {
    if (!game) return;
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

function postPurchaseResult(result: PurchaseResult, id: string): void {
  if (!game) return;
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

function withGame(callback: (current: Game) => void): void {
  if (!game) {
    postFatal("Simulation is not initialized.");
    return;
  }
  callback(game);
}

function postSnapshot(): void {
  if (!game) return;
  post({ type: "snapshot", snapshot: game.snapshot(visibleEraIndices) });
}

function postSave(kind: SaveKind): void {
  if (!game) return;
  post({ type: "savePayload", kind, payload: game.serialize() });
}

function postToast(message: string, isError = false): void {
  post({ type: "toast", message, isError });
}

function postFatal(message: string): void {
  post({ type: "fatal", message });
}

function post(message: WorkerToMain): void {
  workerGlobal.postMessage(message);
}

function normalizeEraSet(eras: number[]): Set<number> {
  const normalized = new Set<number>();
  for (const era of eras) {
    const value = Math.floor(Number(era));
    if (Number.isFinite(value) && value >= 1 && value <= 20) {
      normalized.add(value);
    }
  }
  if (normalized.size === 0) normalized.add(1);
  return normalized;
}
