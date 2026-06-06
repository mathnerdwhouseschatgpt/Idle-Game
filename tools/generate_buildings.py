import json
from pathlib import Path

resource_names = {
    "W": "Wood",
    "S": "Stone",
    "E": "Energy",
    "F": "Food",
    "P": "Population",
}

buildings = [
    ("Habitation", ["House", "Town", "City", "Metropolis", "Arcology"], "W+P"),
    ("Lumber Operation", ["Woodlot", "Lumber Camp", "Sawmill", "Timberworks", "Megaforest"], "W"),
    ("Stone Operation", ["Stone Pit", "Quarry", "Mason Guild", "Granite Complex", "Planetary Mine"], "S"),
    ("Food Operation", ["Garden", "Farm", "Agri-District", "Hydroponic Grid", "Biosphere"], "F"),
    ("Energy Operation", ["Fire Pit", "Generator", "Power Plant", "Fusion Grid", "Dyson Relay"], "E"),
    ("Workshop", ["Tool Bench", "Workshop", "Factory", "Automated Foundry", "Matter Printer"], "W+S"),
    ("Storehouse", ["Storehouse", "Depot", "Logistics Hub", "Continental Port", "Orbital Warehouse"], "W+F"),
    ("Waterworks", ["Well", "Canal", "Aqueduct", "Pumping Network", "Atmospheric Condenser"], "F+E"),
    ("Market", ["Market Stall", "Market", "Trade Exchange", "Global Bazaar", "Interstellar Exchange"], "P+F"),
    ("Barracks", ["Watch Hut", "Barracks", "Fortress", "Defense Grid", "Planetary Shield"], "S+P"),
    ("School", ["Tutor Hut", "School", "Academy", "Research Campus", "Cognition Core"], "P+E"),
    ("Road Network", ["Trail", "Road", "Highway", "Maglev Spine", "Orbital Transit"], "W+S+P"),
    ("Mine", ["Surface Mine", "Deep Mine", "Strip Mine", "Core Bore", "Asteroid Mine"], "S+E"),
    ("Harbor", ["Dock", "Harbor", "Shipyard", "Mega Port", "Starport"], "W+F+P"),
    ("Temple", ["Shrine", "Temple", "Cathedral", "Civic Monument", "Unity Beacon"], "P"),
    ("Observatory", ["Lookout", "Observatory", "Radio Array", "Deep Space Lab", "Quantum Telescope"], "E+P"),
    ("Laboratory", ["Alchemy Table", "Laboratory", "Research Institute", "Nanotech Lab", "Singularity Lab"], "E+S+P"),
    ("Habitat Ring", ["Tenement", "Habitat Block", "Habitat Ring", "Orbital City", "Ringworld Segment"], "P+E+W"),
    ("Terraformer", ["Irrigation Crew", "Terraformer", "Climate Engine", "Gaia Network", "Stellar Seeder"], "F+E+S"),
    ("Command Nexus", ["Signal Post", "Town Hall", "Command Center", "Planetary Nexus", "Galactic Core"], "W+S+E+F+P"),
]

cost_shares_by_tag = {
    "W": {"W": 1.0},
    "S": {"S": 1.0},
    "F": {"F": 1.0},
    "E": {"W": 0.55, "S": 0.45},
    "P": {"F": 1.0},
}

def tags_from_spec(spec):
    return spec.split("+")


def cost_shares(tags):
    shares = {}
    for tag in tags:
        for resource, amount in cost_shares_by_tag[tag].items():
            shares[resource] = shares.get(resource, 0) + amount / len(tags)
    total = sum(shares.values()) or 1
    return {resource: round(amount / total, 3) for resource, amount in shares.items()}


def main():
    data = []
    for index, (base_name, prestige_names, spec) in enumerate(buildings, start=1):
        tags = tags_from_spec(spec)
        predecessor = f"B{max(index - 1, 1):02d}"
        stored = tags[0]
        base_rate = round(0.08 * (1.38 ** (index - 1)) * (1 + (len(tags) - 1) * 0.18), 4)
        base_cost = round(8 * (1.62 ** (index - 1)))
        growth = round(1.18 + min(index, 18) * 0.006, 3)
        data.append({
            "identifier": f"B{index:02d}",
            "name": base_name,
            "era": "Dashboard",
            "era_index": 1,
            "index_in_era": index,
            "tags": tags,
            "base_rate": base_rate,
            "base_cost": base_cost,
            "growth": growth,
            "cost_shares": cost_shares(tags),
            "prestige_names": prestige_names,
            "synergy_a": f"+{4 + index % 6}% output per level in {buildings[max(index - 2, 0)][0]}.",
            "synergy_b": f"+{6 + (index % 5) * 3}% output while stored {resource_names[stored]} reaches this module's calibration threshold.",
            "synergy_a_data": {
                "type": "per_building",
                "target_identifier": predecessor,
                "bonus_percent": 4 + index % 6,
            },
            "synergy_b_data": {
                "type": "stored_resource",
                "resource": stored,
                "threshold": round(base_cost * 0.55, 2),
                "bonus_percent": 6 + (index % 5) * 3,
            },
            "unique_upgrade": "Every 5 levels triggers prestige: the module evolves, doubles output, and strengthens its active boost profile.",
        })

    for output in [Path("web/data/buildings.json"), Path("design/data/buildings.json")]:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(data, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
