import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Tuple

DATA_PATH = Path("design/data/buildings.json")
SAVE_PATH = Path("savegame.json")

RESOURCE_NAMES = {
    "W": "Wood",
    "S": "Stone",
    "E": "Energy",
    "F": "Food",
    "P": "Population",
}

DEFAULT_START = {
    "W": 40.0,
    "S": 25.0,
    "E": 5.0,
    "F": 35.0,
    "P": 12.0,
}

ERA_UNLOCK_SCALE = 3.0
MAX_RUN_STEPS = 1_000



def load_buildings() -> List[dict]:
    if not DATA_PATH.exists():
        sys.exit(f"Missing dataset at {DATA_PATH}. Generate it before launching the game.")
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def rate_baseline(era_index: int) -> float:
    return 0.1 * (3.6 ** (era_index - 1))


def sanitize_seconds(value: float) -> float:
    if not math.isfinite(value) or value <= 0:
        return 0.0
    return value


def format_value(value: float) -> str:
    if not math.isfinite(value):
        return "∞"
    if abs(value) >= 1_000_000_000:
        return f"{value/1_000_000_000:.2f}B"
    if abs(value) >= 1_000_000:
        return f"{value/1_000_000:.2f}M"
    if abs(value) >= 1_000:
        return f"{value/1_000:.2f}K"
    return f"{value:.2f}"


@dataclass
class Building:
    identifier: str
    name: str
    era: str
    era_index: int
    index_in_era: int
    tags: List[str]
    base_rate: float
    base_cost: float
    growth: float
    cost_shares: Dict[str, float]
    synergy_a: str
    synergy_b: str
    synergy_a_data: Dict[str, Any]
    synergy_b_data: Dict[str, Any]
    unique_upgrade: str

    def active_tags(self) -> List[str]:
        return self.tags or ["W"]


@dataclass
class BuildingState:
    building: Building
    owned: int = 0

    def cost_for(self, quantity: int) -> Dict[str, float]:
        g = self.building.growth
        current = self.building.base_cost * (g ** self.owned)
        if quantity == 1:
            total_cost = current
        else:
            total_cost = current * ((g ** quantity) - 1) / (g - 1)
        shares = self.building.cost_shares or {"W": 1.0}
        return {resource: portion * total_cost for resource, portion in shares.items()}


@dataclass
class GameState:
    buildings: List[BuildingState]
    resources: Dict[str, float] = field(default_factory=lambda: DEFAULT_START.copy())
    total_produced: Dict[str, float] = field(default_factory=lambda: {key: 0.0 for key in RESOURCE_NAMES})
    era_unlocked: int = 1
    elapsed_seconds: float = 0.0
    _state_lookup: Dict[str, BuildingState] = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._reindex()

    def to_json(self) -> dict:
        return {
            "resources": self.resources,
            "total_produced": self.total_produced,
            "era_unlocked": self.era_unlocked,
            "elapsed_seconds": self.elapsed_seconds,
            "owned": {state.building.identifier: state.owned for state in self.buildings},
        }

    @classmethod
    def from_json(cls, data: dict, building_lookup: Dict[str, Building]) -> "GameState":
        states: List[BuildingState] = []
        for building in building_lookup.values():
            owned = data.get("owned", {}).get(building.identifier, 0)
            states.append(BuildingState(building=building, owned=owned))
        game = cls(
            buildings=states,
            resources=data.get("resources", DEFAULT_START.copy()),
            total_produced=data.get("total_produced", {key: 0.0 for key in RESOURCE_NAMES}),
            era_unlocked=data.get("era_unlocked", 1),
            elapsed_seconds=data.get("elapsed_seconds", 0.0),
        )
        game._reindex()
        return game

    def current_rates(self) -> Dict[str, float]:
        rates = {key: 0.0 for key in RESOURCE_NAMES}
        for state in self.buildings:
            if state.owned <= 0:
                continue
            building = state.building
            multiplier = self._production_multiplier(state)
            per_resource = building.base_rate / len(building.active_tags())
            for tag in building.active_tags():
                rates[tag] += per_resource * state.owned * multiplier
        return rates

    def k_index(self) -> float:
        energy_rate = self.current_rates()["E"]
        planetary_power = max(energy_rate * 1_000 + (self.era_unlocked * 1_000), 1.0)
        k_val = (math.log10(planetary_power) - 6) / 10
        k_val += (self.era_unlocked - 1) * 0.02
        return max(0.0, min(3.0, round(k_val, 3)))

    def next_k_threshold(self) -> float:
        current = self.k_index()
        if current >= 3.0:
            return 3.0
        thresholds = [
            0.2,
            0.4,
            0.6,
            0.8,
            1.0,
            1.4,
            1.8,
            2.0,
            2.4,
            2.8,
            3.0,
        ]
        for value in thresholds:
            if value > current:
                return value
        return 3.0

    def tick(self, seconds: float) -> Dict[str, float]:
        seconds = sanitize_seconds(seconds)
        rates = self.current_rates()
        gains = {}
        for resource, per_second in rates.items():
            gained = per_second * seconds
            self.resources[resource] += gained
            self.total_produced[resource] += gained
            gains[resource] = gained
        self.elapsed_seconds += seconds
        self._update_era_unlocks(rates)
        return gains

    def _update_era_unlocks(self, rates: Dict[str, float]) -> None:
        total_rate = sum(rates.values())
        while self.era_unlocked < 20:
            threshold = rate_baseline(self.era_unlocked + 1) * ERA_UNLOCK_SCALE
            if total_rate >= threshold:
                self.era_unlocked += 1
                print(f"\n>>> Era unlocked: {self.era_unlocked} — new buildings available!\n")
            else:
                break

    def attempt_purchase(self, target: BuildingState, quantity: int) -> Tuple[bool, str]:
        if target.building.era_index > self.era_unlocked:
            return False, f"{target.building.name} is locked. Reach Era {target.building.era_index} first."
        if quantity <= 0:
            return False, "Quantity must be positive."
        cost = target.cost_for(quantity)

        for resource, price in cost.items():
            if self.resources.get(resource, 0.0) < price:
                readable = RESOURCE_NAMES[resource]
                return False, f"Not enough {readable}. Need {format_value(price)}, have {format_value(self.resources.get(resource, 0.0))}."

        for resource, price in cost.items():
            self.resources[resource] -= price

        target.owned += quantity
        return True, f"Purchased {quantity} × {target.building.name}."

    def _reindex(self) -> None:
        self._state_lookup = {state.building.identifier: state for state in self.buildings}

    def _production_multiplier(self, state: BuildingState) -> float:
        multiplier = 1.0

        data_a = state.building.synergy_a_data or {}
        if data_a.get("type") == "per_building":
            target_identifier = data_a.get("target_identifier")
            bonus = data_a.get("bonus_percent", 0)
            target_state = self._state_lookup.get(target_identifier)
            if target_state:
                multiplier *= 1 + target_state.owned * (bonus / 100)

        data_b = state.building.synergy_b_data or {}
        if data_b.get("type") == "stored_resource":
            resource = data_b.get("resource")
            threshold = data_b.get("threshold", float("inf"))
            if resource and self.resources.get(resource, 0.0) >= threshold:
                multiplier *= 1 + data_b.get("bonus_percent", 0) / 100
                secondary_bonus = data_b.get("secondary_bonus_percent", 0)
                if secondary_bonus:
                    multiplier *= 1 + secondary_bonus / 100

        return multiplier


class CommandLoop:
    def __init__(self) -> None:
        dataset = load_buildings()
        self.buildings, self.index_lookup, self.name_lookup = self._prepare_buildings(dataset)
        self.state = GameState(buildings=[BuildingState(building=b) for b in self.buildings])
        self._seed_starting_buildings()

    @staticmethod
    def _prepare_buildings(dataset: List[dict]) -> Tuple[List[Building], Dict[str, Building], Dict[str, Building]]:
        buildings: List[Building] = []
        index_lookup: Dict[str, Building] = {}
        name_lookup: Dict[str, Building] = {}
        for entry in dataset:
            identifier = entry.get("identifier")
            if not identifier:
                # Fallback for legacy datasets
                era_index = entry["era_index"]
                index_in_era = entry.get("index_in_era")
                if index_in_era is None:
                    index_in_era = len([b for b in buildings if b.era_index == era_index]) + 1
                identifier = f"{era_index:02d}-{index_in_era:02d}"
            building = Building(
                identifier=identifier,
                name=entry["name"],
                era=entry["era"],
                era_index=entry["era_index"],
                index_in_era=entry.get("index_in_era", int(identifier.split("-")[1])),
                tags=entry["tags"],
                base_rate=entry["base_rate"],
                base_cost=entry["base_cost"],
                growth=entry["growth"],
                cost_shares=entry.get("cost_shares", {}),
                synergy_a=entry["synergy_a"],
                synergy_b=entry["synergy_b"],
                synergy_a_data=entry.get("synergy_a_data", {}),
                synergy_b_data=entry.get("synergy_b_data", {}),
                unique_upgrade=entry["unique_upgrade"],
            )
            buildings.append(building)
            index_lookup[identifier] = building
            name_lookup[building.name.lower()] = building
        return buildings, index_lookup, name_lookup

    def _seed_starting_buildings(self) -> None:
        seeded = 0
        for state in self.state.buildings:
            if state.building.era_index == 1 and state.building.index_in_era <= 5:
                if state.owned < 1:
                    state.owned = 1
                seeded += 1
                if seeded >= 5:
                    break
        self.state._reindex()

    def run(self) -> None:
        self._print_intro()
        while True:
            try:
                raw = input("idle> ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nExiting. Use 'save' to persist progress next time.")
                break
            if not raw:
                continue
            parts = raw.split()
            command = parts[0].lower()
            args = parts[1:]

            if command in {"quit", "exit"}:
                print("Goodbye.")
                break
            elif command == "help":
                self._print_help()
            elif command == "status":
                self._print_status()
            elif command == "list":
                self._print_buildings(args)
            elif command == "tick":
                self._tick_command(args)
            elif command == "buy":
                self._buy_command(args)
            elif command == "save":
                self._save_command(args)
            elif command == "load":
                self._load_command(args)
            elif command == "run":
                self._run_command(args)
            else:
                print("Unknown command. Type 'help' for a list of actions.")

    def _print_intro(self) -> None:
        print("=== Idle Civilization CLI Prototype ===")
        print("Guide your people from foragers to an intergalactic empire.")
        print("Type 'help' to see available commands.\n")

    def _print_help(self) -> None:
        print("Commands:")
        print("  help                  Show this message.")
        print("  status                Display current resources and production.")
        print("  list [era]           List available buildings (current era or specific).")
        print("  tick [seconds]       Advance time manually (default 1s).")
        print("  run <seconds> [step] Auto-step time (step default 1s).")
        print("  buy <id|name> [qty]  Purchase producers.")
        print("  save [path]          Save progress (default savegame.json).")
        print("  load [path]          Load progress.")
        print("  quit                 Exit the game.\n")

    def _print_status(self) -> None:
        rates = self.state.current_rates()
        print(f"Era: {self.state.era_unlocked}")
        print(f"Kardashev Index: {self.state.k_index()} (next goal {self.state.next_k_threshold()})")
        print(f"Elapsed: {format_value(self.state.elapsed_seconds)} seconds\n")
        print("Resources:")
        for key, value in self.state.resources.items():
            name = RESOURCE_NAMES[key]
            print(f"  {name:<12}: {format_value(value)}  (+{format_value(rates[key])}/s)")
        print("")

    def _print_buildings(self, args: List[str]) -> None:
        if args:
            try:
                era_filter = int(args[0])
            except ValueError:
                print("Era must be an integer (1-20).")
                return
        else:
            era_filter = self.state.era_unlocked
        print(f"Buildings — Era {era_filter}")
        print("ID     Owned   Rate/s   Next Cost")
        for building_state in self.state.buildings:
            building = building_state.building
            if building.era_index != era_filter:
                continue
            multiplier = self.state._production_multiplier(building_state)
            rate_value = building.base_rate * building_state.owned * multiplier
            rate = format_value(rate_value)
            cost = building_state.cost_for(1)
            cost_desc = ", ".join(f"{RESOURCE_NAMES[tag]} {format_value(amount)}" for tag, amount in cost.items())
            lock = "" if building.era_index <= self.state.era_unlocked else " (locked)"
            print(
                f"{building.identifier:<6} {building_state.owned:<6} {rate:<8} {cost_desc}{lock}"
            )
            per_resource = building.base_rate / len(building.active_tags())
            outputs = []
            for tag in building.active_tags():
                per_owned = per_resource * multiplier
                total = per_owned * building_state.owned
                outputs.append(
                    f"{RESOURCE_NAMES[tag]} {format_value(per_owned)}/s per, {format_value(total)}/s total"
                )
            print(f"       Produces: {' | '.join(outputs)}")
        print("")

    def _tick_command(self, args: List[str]) -> None:
        seconds = 1.0
        if args:
            try:
                seconds = float(args[0])
            except ValueError:
                print("Seconds must be numeric.")
                return
        if not math.isfinite(seconds) or seconds <= 0:
            print("Seconds must be a positive finite number.")
            return
        gains = self.state.tick(seconds)
        gain_text = ", ".join(
            f"{RESOURCE_NAMES[key]} {format_value(value)}"
            for key, value in gains.items()
            if value > 0
        )
        if gain_text:
            print(f"Advanced {format_value(seconds)}s. Gains: {gain_text}")
        else:
            print(f"Advanced {format_value(seconds)}s. No production yet.")

    def _run_command(self, args: List[str]) -> None:
        if not args:
            print("Usage: run <seconds> [step]")
            return
        try:
            total = float(args[0])
        except ValueError:
            print("Seconds must be numeric.")
            return
        if not math.isfinite(total) or total <= 0:
            print("Seconds must be a positive finite number.")
            return
        step = 1.0
        if len(args) > 1:
            try:
                step = float(args[1])
            except ValueError:
                print("Step must be numeric.")
                return
        if not math.isfinite(step) or step <= 0:
            print("Step must be a positive finite number.")
            return
        elapsed = 0.0
        steps = 0
        while elapsed < total and steps < MAX_RUN_STEPS:
            delta = min(step, total - elapsed)
            self.state.tick(delta)
            elapsed += delta
            steps += 1
        if elapsed < total:
            self.state.tick(total - elapsed)
        print(f"Auto-ran {format_value(total)}s.")
        self._print_status()

    def _buy_command(self, args: List[str]) -> None:
        if not args:
            print("Usage: buy <id|name> [qty]")
            return
        quantity = 1
        if len(args) > 1:
            try:
                quantity = int(args[-1])
                target_key_parts = args[:-1]
            except ValueError:
                target_key_parts = args
            else:
                if quantity <= 0:
                    print("Quantity must be positive.")
                    return
        else:
            target_key_parts = args
        target_key = " ".join(target_key_parts).lower()
        building = self.index_lookup.get(target_key.upper())
        if building is None:
            building = self.name_lookup.get(target_key)
        if building is None:
            print("Building not found. Use 'list' to view identifiers.")
            return
        state = next(state for state in self.state.buildings if state.building.identifier == building.identifier)
        success, message = self.state.attempt_purchase(state, quantity)
        print(message)

    def _save_command(self, args: List[str]) -> None:
        path = Path(args[0]) if args else SAVE_PATH
        data = self.state.to_json()
        path.write_text(json.dumps(data, indent=2))
        print(f"Saved to {path}.")

    def _load_command(self, args: List[str]) -> None:
        path = Path(args[0]) if args else SAVE_PATH
        if not path.exists():
            print(f"No save file at {path}.")
            return
        data = json.loads(path.read_text())
        building_lookup = {building.identifier: building for building in self.buildings}
        self.state = GameState.from_json(data, building_lookup)
        print(f"Loaded save from {path}.")


def main() -> None:
    loop = CommandLoop()
    loop.run()


if __name__ == "__main__":
    main()

