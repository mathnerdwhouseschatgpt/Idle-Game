import json
import math
from pathlib import Path

resource_names = {
    "W": "Wood",
    "S": "Stone",
    "E": "Energy",
    "F": "Food",
    "P": "Population",
}

rate_baselines = [0.1 * (3.6 ** era) for era in range(20)]
cost_baselines = [10 * (9 ** era) for era in range(20)]
growth_values = [round(1.12 + math.floor(era / 2) * 0.01, 2) for era in range(20)]

rate_multipliers = [
    0.82,
    0.9,
    1.0,
    1.12,
    1.24,
    0.95,
    1.03,
    1.15,
    1.28,
    1.42,
    0.88,
    0.98,
    1.08,
    1.2,
    1.32,
    1.45,
    1.6,
    1.75,
    1.9,
    2.05,
    2.2,
    2.4,
    1.78,
    1.55,
    1.3,
]

cost_multipliers = [
    0.6,
    0.68,
    0.76,
    0.85,
    0.94,
    0.82,
    0.9,
    0.99,
    1.08,
    1.18,
    0.72,
    0.8,
    0.88,
    0.97,
    1.06,
    1.18,
    1.32,
    1.47,
    1.62,
    1.78,
    1.96,
    2.15,
    1.58,
    1.42,
    1.18,
]

upgrade_templates = [
    "Reinforced Framework: doubles base output.",
    "Optimized Labor Flow: +50% output while automated.",
    "Resource Reclaimer: refunds 5% of cost on purchase.",
    "Synergy Amplifier: synergy bonuses +50%.",
    "Efficiency Protocols: growth reduced by 0.02 (min 1.05).",
]

eras = [
    ("Proto/Forager", [
        ("Stick Pile", "W"),
        ("Stone Cache", "S"),
        ("Berry Bush", "F"),
        ("Fire Pit", "E"),
        ("Sleeping Hollow", "P"),
        ("Driftwood Racks", "W"),
        ("Flint Knappers", "S"),
        ("Mushroom Patch", "F"),
        ("Hot Ash Mound", "E"),
        ("Shelter Frame", "W+P"),
        ("River Reed Cut", "W"),
        ("Pebble Quarry", "S"),
        ("Root Garden", "F"),
        ("Ember Bed", "E"),
        ("Meeting Circle", "P"),
        ("Sap Tap", "F"),
        ("Drying Line", "F"),
        ("Cairn Field", "S"),
        ("Char Heap", "E"),
        ("Brush Hut", "W+P"),
        ("Bone Toolkit", "S"),
        ("Drift Net", "F"),
        ("Torch Rack", "E"),
        ("Camp Totem", "P"),
        ("Forager Trail", "F+P"),
    ]),
    ("Tribal", [
        ("Thatch Hut", "W+P"),
        ("Pit Kiln", "E"),
        ("Clay Pit", "S"),
        ("Communal Garden", "F"),
        ("Palisade", "W+S"),
        ("Smokehouse", "F"),
        ("Totem Workshop", "W"),
        ("Stone Ring", "S"),
        ("Tame Pen", "F+P"),
        ("Fire Circle", "E"),
        ("Canoe Yard", "W"),
        ("Shell Quarry", "S"),
        ("Maize Plot", "F"),
        ("Charcoal Mound", "E"),
        ("Clan Longhouse", "P"),
        ("Loom Shed", "W"),
        ("Knap Shed", "S"),
        ("Fish Weir", "F"),
        ("Ember Forge", "E"),
        ("Drum Plaza", "P"),
        ("Orchard Patch", "F"),
        ("Dry-Stone Wall", "S"),
        ("Resin Still", "E"),
        ("Watch Post", "P"),
        ("Coppice Wood", "W"),
    ]),
    ("Village", [
        ("Timber Yard", "W"),
        ("Stonecutters’ Guild", "S"),
        ("Mill Pond", "E"),
        ("Wheat Field", "F"),
        ("Cottage Row", "P"),
        ("Lumber Mill", "W"),
        ("Quarry Face", "S"),
        ("Waterwheel", "E"),
        ("Pasture", "F"),
        ("Townhouse", "P"),
        ("Charcoal Kiln", "E"),
        ("Orchard", "F"),
        ("Mason Lodge", "S"),
        ("Carpenters’ Hall", "W"),
        ("Smoke Kiln", "E"),
        ("Market Stall", "P"),
        ("Irrigation Ditch", "F"),
        ("Gravel Pit", "S"),
        ("Timber Wharf", "W"),
        ("Grain Silo", "F"),
        ("Saw Pit", "W"),
        ("Brick Clamp", "S"),
        ("Windmill", "E"),
        ("Bakery", "F"),
        ("Village Green", "P"),
    ]),
    ("Bronze Age", [
        ("Bronze Foundry", "E+S"),
        ("Copper Mine", "S"),
        ("Tin Mine", "S"),
        ("Terrace Farm", "F"),
        ("Beam Workshop", "W"),
        ("City Wall", "S"),
        ("Granary", "F"),
        ("Beacon Tower", "E"),
        ("Courtyard House", "P"),
        ("Shipwright", "W"),
        ("Stone Road", "S"),
        ("Olive Press", "F"),
        ("Kilnworks", "E"),
        ("Harbor Jetty", "W+S"),
        ("Aqueduct", "F"),
        ("Timber Reserve", "W"),
        ("Quarry Crane", "S"),
        ("Oil Lamp Guild", "E"),
        ("Festival Plaza", "P"),
        ("Vineyard", "F"),
        ("Carpenter’s Yard", "W"),
        ("Masonry Yard", "S"),
        ("Smelter Row", "E"),
        ("Fishery Docks", "F"),
        ("Insula Block", "P"),
    ]),
    ("Classical", [
        ("Marble Quarry", "S"),
        ("Olive Grove Estate", "F"),
        ("Waterworks", "E"),
        ("Villa District", "P"),
        ("Cedar Mill", "W"),
        ("Road Menders", "S"),
        ("Grain Estate", "F"),
        ("Lighthouse", "E"),
        ("Forum Residences", "P"),
        ("Timber Exchange", "W"),
        ("Stone Arch Yard", "S"),
        ("Hippodrome Kitchens", "F"),
        ("Beacon Fires", "E"),
        ("Collegium", "P"),
        ("Shipyard", "W"),
        ("Fortress Quarry", "S"),
        ("Amphora Press", "F"),
        ("Arc Furnace", "E"),
        ("Tenement Rows", "P"),
        ("Cedar Preserve", "W"),
        ("Monument Yard", "S"),
        ("Millrace", "E"),
        ("Granary Tower", "F"),
        ("Guild Hall", "P"),
        ("River Dock", "W+F"),
    ]),
    ("Medieval", [
        ("Forester’s Lodge", "W"),
        ("Stone Keep", "S"),
        ("Watermill", "E"),
        ("Rye Field", "F"),
        ("Hamlet Cottages", "P"),
        ("Timber Frame Shop", "W"),
        ("Quarry Camp", "S"),
        ("Tidal Mill", "E"),
        ("Dairy Pasture", "F"),
        ("Burg Ward", "P"),
        ("Charcoal House", "E"),
        ("Apiary", "F"),
        ("Cathedral Yard", "S"),
        ("Guild Street", "P"),
        ("Pallet Yard", "W"),
        ("Mason’s Shed", "S"),
        ("Wind Farm", "E"),
        ("Vineyard Hill", "F"),
        ("Market Ward", "P"),
        ("Boat Builder", "W"),
        ("Slate Quarry", "S"),
        ("Bakehouse", "F"),
        ("Bell Foundry", "E"),
        ("Scholar’s Close", "P"),
        ("Timber Fair", "W"),
    ]),
    ("Renaissance", [
        ("Managed Forest", "W"),
        ("Cut-Stone Atelier", "S"),
        ("Waterworks Hub", "E"),
        ("Crop Rotation Fields", "F"),
        ("Townhouses", "P"),
        ("Drydock", "W"),
        ("Canal Quarry", "S"),
        ("Clocktower Dynamo", "E"),
        ("Orchard Terraces", "F"),
        ("University Quarter", "P"),
        ("Print Shop", "E"),
        ("Botanical Garden", "F"),
        ("Piazza Block", "P"),
        ("Cabinetmaker", "W"),
        ("Marble Yard", "S"),
        ("Tannery", "F"),
        ("Coal Hearth", "E"),
        ("Merchant Row", "P"),
        ("Timber Exchange Hall", "W"),
        ("Granite Works", "S"),
        ("Aquaculture Pond", "F"),
        ("Loom Hall", "P"),
        ("Water Pump Stack", "E"),
        ("Vineyard Estate", "F"),
        ("Opera Residences", "P"),
    ]),
    ("Early Industrial", [
        ("Saw Mill Complex", "W"),
        ("Blast Quarry", "S"),
        ("Steam Engine House", "E"),
        ("Grain Elevator", "F"),
        ("Tenement Block", "P"),
        ("Pulp Yard", "W"),
        ("Cut-Stone Mill", "S"),
        ("Coal Plant", "E"),
        ("Meatpacking", "F"),
        ("Factory Dorms", "P"),
        ("Telegraph Station", "E"),
        ("Fish Cannery", "F"),
        ("Rail Tie Works", "W"),
        ("Cement Works", "S"),
        ("Dynamo Station", "E"),
        ("Sugar Refinery", "F"),
        ("Workers’ Row", "P"),
        ("Timber Wharf 2", "W"),
        ("Quarry Blaster", "S"),
        ("Hydropower Dam", "E"),
        ("Greenhouse Row", "F"),
        ("Company Town", "P"),
        ("Power Substation", "E"),
        ("Wheat Belt", "F"),
        ("Brick Row", "S+P"),
    ]),
    ("Electrical/Modernizing", [
        ("Managed Lumber Farm", "W"),
        ("Aggregate Crusher", "S"),
        ("Thermal Power Plant", "E"),
        ("Industrial Farms", "F"),
        ("Suburban Tract", "P"),
        ("Chipboard Plant", "W"),
        ("Concrete Plant", "S"),
        ("Wind Turbine Field", "E"),
        ("Refrigerated Silo", "F"),
        ("High-Rise Block", "P"),
        ("Transmission Yard", "E"),
        ("Aquaculture Farm", "F"),
        ("MDF Plant", "W"),
        ("Quarry Conveyor", "S"),
        ("Solar Array", "E"),
        ("Vertical Farm", "F"),
        ("Metro Housing", "P"),
        ("Battery Park", "E"),
        ("Fish Hatchery", "F"),
        ("Timber Genetics Lab", "W"),
        ("Stone Sinter Line", "S"),
        ("Geothermal Plant", "E"),
        ("Agro-Processing Hub", "F"),
        ("Tech Campus", "P"),
        ("Smart Grid Node", "E"),
    ]),
    ("Atomic/Space Dawn", [
        ("Particle Board Works", "W"),
        ("Basalt Mill", "S"),
        ("Nuclear Fission Plant", "E"),
        ("Nutrient Plant", "F"),
        ("Space Habitat", "P"),
        ("Biomass Burner", "E"),
        ("Regolith Yard", "S"),
        ("Fusion Testbed", "E"),
        ("Algae Vats", "F"),
        ("Orbital Housing", "P"),
        ("Offshore Wind Port", "E"),
        ("Desert Solar Farm", "E"),
        ("Hydroponic Greenhouse", "F"),
        ("Pressurized Timber Lab", "W"),
        ("Synthetic Stone Line", "S"),
        ("Microgrid Block", "E"),
        ("Cryo Store", "F"),
        ("Colony Module", "P"),
        ("Reactor Island", "E"),
        ("Aeroponics Tower", "F"),
        ("Timber Nanocoats", "W"),
        ("Crystal Quarry", "S"),
        ("Antimatter Trap", "E"),
        ("Protein Printer", "F"),
        ("O’Neill Cylinder Ring", "P"),
    ]),
    ("Early Spacefaring", [
        ("Orbital Lumber Foundry", "W"),
        ("Lunar Quarry", "S"),
        ("Helium-3 Plant", "E"),
        ("Comet Greenhouses", "F"),
        ("LEO Habitat Stack", "P"),
        ("Solar Sail Farm", "E"),
        ("Asteroid Crusher", "S"),
        ("Vacuum Kiln", "W"),
        ("Bioreactors", "F"),
        ("Ring Habitat", "P"),
        ("Microwave Power Beam", "E"),
        ("Ice Harvester", "F"),
        ("Space Timber Synth", "W"),
        ("Basalt Fiber Yard", "S"),
        ("Fusion Tokamak", "E"),
        ("Plankton Bloom Tank", "F"),
        ("Cycler Ship Quarters", "P"),
        ("Rectenna Field", "E"),
        ("Lunar Agripods", "F"),
        ("Orbital Habitat Garden", "P"),
        ("Graphite Yard", "W"),
        ("Regolith Brick Press", "S"),
        ("Antimatter Seeds", "E"),
        ("Mycoprotein Farm", "F"),
        ("Bernal Sphere", "P"),
    ]),
    ("Interplanetary", [
        ("Mars Lichen Farms", "F"),
        ("Phobos Regolith Press", "S"),
        ("Orbital Fusion Grid", "E"),
        ("Titan Methane Plant", "E"),
        ("Mars Dome", "P"),
        ("Venus Cloud Float", "E"),
        ("Ceres Ice Melt", "F"),
        ("Space Timber Polymers", "W"),
        ("Lunar Quarry 2", "S"),
        ("Solar Power Tower", "E"),
        ("Europa Brine Pod", "F"),
        ("Deimos Slab Yard", "S"),
        ("Magnetic Scoop", "E"),
        ("Orbital Orchards", "F"),
        ("Terraformer Barracks", "P"),
        ("Carbon Forest", "W"),
        ("Basalt Composite Works", "S"),
        ("Stellar Mirror", "E"),
        ("Cryo Grain Vats", "F"),
        ("Planetary Habitat Web", "P"),
        ("Helioharvester", "E"),
        ("Protein Nebulae Tanks", "F"),
        ("Polymer Lumber Yard", "W"),
        ("Igneous Print Farm", "S"),
        ("Starship Quarter-City", "P"),
    ]),
    ("Interstellar", [
        ("Interstellar Timber Forge", "W"),
        ("Rogue-Planet Quarry", "S"),
        ("Beam-Rider Power", "E"),
        ("Sleeper-Ship Hydrofarms", "F"),
        ("Generation Ark", "P"),
        ("Pulsar Collector", "E"),
        ("Planet-Cracker", "S"),
        ("Carbonwood Loom", "W"),
        ("Nebula Plankton", "F"),
        ("Cluster Habitat", "P"),
        ("Tritium Farm", "E"),
        ("Icebelt Aquifers", "F"),
        ("Voidwood Synth", "W"),
        ("Crystal Lattice Mines", "S"),
        ("Starlifter", "E"),
        ("Bio-domes", "F"),
        ("Colony Constellations", "P"),
        ("EM Scoop Net", "E"),
        ("Reefworld Farms", "F"),
        ("Dyson Swarm Yard", "E"),
        ("Silicate Reef Quarry", "S"),
        ("Muon Battery Field", "E"),
        ("Fungal Protein Arbors", "F"),
        ("Far-Hab Row", "P"),
        ("Interstellar Dock", "P"),
    ]),
    ("Dyson Era", [
        ("Dyson Sail Looms", "E"),
        ("Starshade Fab", "E"),
        ("Heliosheath Miner", "S"),
        ("Solar Wood Synth", "W"),
        ("Stellar Orchard", "F"),
        ("Swarm Habitat Stack", "P"),
        ("Flux-Beamer", "E"),
        ("Corona Skimmer", "E"),
        ("Star Smelter", "S"),
        ("Photonic Planter", "F"),
        ("Mat-Cable Yard", "W"),
        ("Swarm Segment Yard", "E"),
        ("Starforge Quarry", "S"),
        ("Radiation Gardens", "F"),
        ("Dyson Borough", "P"),
        ("Solar Wind Mills", "E"),
        ("Fusion Farm Belts", "E"),
        ("Lightleaf Forests", "W"),
        ("Plasma Reef", "F"),
        ("Corona Arcology", "P"),
        ("Photon Trap Rings", "E"),
        ("Stellar Stone Press", "S"),
        ("Radiant Farms", "F"),
        ("Orbital Timber Mesh", "W"),
        ("Sun-side Tenements", "P"),
    ]),
    ("Matrioshka", [
        ("Shell-Layer Foundry", "E"),
        ("Star-Brick Yard", "S"),
        ("Photonic Timber", "W"),
        ("Neutrino Farms", "F"),
        ("Shell-City", "P"),
        ("Magnetic Scoop Lattice", "E"),
        ("Core-Flux Quarry", "S"),
        ("Radiant Wood Mill", "W"),
        ("Heliogarden", "F"),
        ("Mat-Arcology", "P"),
        ("Photon Pressure Plant", "E"),
        ("Starfoam Works", "S"),
        ("Radiowood Synth", "W"),
        ("Photosynthetic Reef", "F"),
        ("Habitat Helix", "P"),
        ("Solar Boiler Towers", "E"),
        ("Stellar Aggregate", "S"),
        ("Luxwood Loom", "W"),
        ("Bio-light Farms", "F"),
        ("Hyper-Hab Stack", "P"),
        ("Flux Capacitor Farms", "E"),
        ("Quench-Press Quarry", "S"),
        ("Spectrum Timber", "W"),
        ("Plasma Orchards", "F"),
        ("Mat-Hab Borough", "P"),
    ]),
    ("Post-Biological", [
        ("Computronium Grove", "E"),
        ("Logic-Stone Foundry", "S"),
        ("Datawood Array", "W"),
        ("Nutrient Fog Vats", "F"),
        ("Substrate City", "P"),
        ("Heat-Sink Spires", "E"),
        ("Lattice Quarry", "S"),
        ("Nanoforest", "W"),
        ("Synthesis Gardens", "F"),
        ("Emulation Tower", "P"),
        ("Photonic Lattice Farm", "E"),
        ("Quantum Slab Yard", "S"),
        ("Carbon-Weave Woods", "W"),
        ("Feedstock Swarm", "F"),
        ("Mind-Cluster", "P"),
        ("Radiative Masts", "E"),
        ("Meta-Stone Press", "S"),
        ("Algorithmic Timber", "W"),
        ("Culture Vats", "F"),
        ("Avatar Block", "P"),
        ("Blackbody Farm", "E"),
        ("Crysteel Quarry", "S"),
        ("Simwood Nursery", "W"),
        ("Algae Cloud", "F"),
        ("Upload Borough", "P"),
    ]),
    ("Galactic", [
        ("Spiral Arm Harvester", "E"),
        ("Halo Quarry", "S"),
        ("Carbon Forest Nebula", "W"),
        ("Molecular Cloud Farms", "F"),
        ("Galactic Habitat Ring", "P"),
        ("Quasar Tap", "E"),
        ("Dark-Matter Stoneworks", "S"),
        ("Nebula Timber Loom", "W"),
        ("Star-Nursery Aquaponics", "F"),
        ("Bulge Arcologies", "P"),
        ("Magnetar Fence", "E"),
        ("Tidal Stone Press", "S"),
        ("Shock-Front Wood", "W"),
        ("Comet Reef Farms", "F"),
        ("Cluster Boroughs", "P"),
        ("Photonic Highway", "E"),
        ("Macro-Quarry", "S"),
        ("Resin Starwood", "W"),
        ("Protostar Gardens", "F"),
        ("Halo Hab Towers", "P"),
        ("Jet Collector", "E"),
        ("Crystalline Mantle Yard", "S"),
        ("Halo Timber Mesh", "W"),
        ("Biosphere Clouds", "F"),
        ("Merger Habitat", "P"),
    ]),
    ("Black-Hole & Exotic", [
        ("Accretion Disk Plant", "E"),
        ("Spaghettite Quarry", "S"),
        ("Hawking Wood Synth", "W"),
        ("Tidal Feeding Farms", "F"),
        ("Event-City", "P"),
        ("Penrose Mill", "E"),
        ("Quark-Stone Press", "S"),
        ("Phantom Timber", "W"),
        ("Degenerate Farms", "F"),
        ("Ergosphere Quarter", "P"),
        ("Cosmic String Lacer", "E"),
        ("Singularity Slab", "S"),
        ("Neutrino Wood", "W"),
        ("Strangelet Gardens", "F"),
        ("Horizon Hab", "P"),
        ("Frame-Drag Turbines", "E"),
        ("Planck-Stone Foundry", "S"),
        ("Shadowwood", "W"),
        ("Vacuum Farms", "F"),
        ("Ringdown Borough", "P"),
        ("Gamma Blade Array", "E"),
        ("Graviton Masonry", "S"),
        ("Afterglow Timber", "W"),
        ("False-Vacuum Tanks", "F"),
        ("Photon-Sphere City", "P"),
    ]),
    ("Transcension", [
        ("Thought-Forest", "W"),
        ("Idea-Stone Loom", "S"),
        ("Mind-Light Plant", "E"),
        ("Concept Orchards", "F"),
        ("Collective Self", "P"),
        ("Dream Turbines", "E"),
        ("Memory Mantle", "S"),
        ("Mythic Timber", "W"),
        ("Archetype Farms", "F"),
        ("Persona District", "P"),
        ("Insight Array", "E"),
        ("Truth Quarry", "S"),
        ("Storywood", "W"),
        ("Symbol Farms", "F"),
        ("Chorus City", "P"),
        ("Vision Stack", "E"),
        ("Principle Press", "S"),
        ("Rune-wood", "W"),
        ("Song-Farms", "F"),
        ("Accord Habitat", "P"),
        ("Epiphany Beam", "E"),
        ("Axiom Yard", "S"),
        ("Spiritwood", "W"),
        ("Meaning Vats", "F"),
        ("Nexus Borough", "P"),
    ]),
    ("Intergalactic", [
        ("Void Timber Loom", "W"),
        ("Supercluster Quarry", "S"),
        ("Hyperlane Power", "E"),
        ("Intergalactic Agricloud", "F"),
        ("Bridge-Worlds", "P"),
        ("Lyman-Alpha Farm", "E"),
        ("Filament Masonry", "S"),
        ("Dark-Forest Wood", "W"),
        ("Star-Sea Farms", "F"),
        ("Web-Hab Stacks", "P"),
        ("Horizon-Net", "E"),
        ("Filament Quarry 2", "S"),
        ("Phase-wood", "W"),
        ("Cosmic Reef", "F"),
        ("Gate-City", "P"),
        ("Universal Rectenna", "E"),
        ("Meta-Stone Combine", "S"),
        ("Allspace Timber", "W"),
        ("Pan-Biosphere", "F"),
        ("League of Worlds", "P"),
        ("Epoch Beamer", "E"),
        ("Deep-Void Stone", "S"),
        ("Endwood Synth", "W"),
        ("Anthropic Farms", "F"),
        ("Constellation Borough", "P"),
    ]),
]


def parse_tags(tag_str):
    return tag_str.split("+")


def cost_tags_for(tags):
    cost_tags = []
    for tag in tags:
        if tag == "P":
            cost_tags.append("F")
        else:
            cost_tags.append(tag)
    if not cost_tags:
        cost_tags = ["W"]
    return cost_tags


extra_cost_cycle = ["W", "S", "F", "E", "P"]


def select_extra_resource(existing, avoid_energy=False):
    existing_set = set(existing)
    for resource in extra_cost_cycle:
        if avoid_energy and resource == "E":
            continue
        if resource not in existing_set:
            return resource
    for resource in extra_cost_cycle:
        if avoid_energy and resource == "E":
            continue
        return resource
    return "W"


def build_cost_shares(tags, era_index, idx, force_non_energy=False):
    cost_tags = cost_tags_for(tags)

    if force_non_energy:
        cost_tags = [tag for tag in cost_tags if tag != "E"]
        if not cost_tags:
            cost_tags = ["S" if (era_index + idx) % 2 == 0 else "W"]

    era = era_index + 1
    base_tags = cost_tags_for(tags)

    if era == 1 and idx < 5:
        primary = cost_tags[0] if cost_tags else "W"
        shares = {primary: 1.0}
        return shares

    desired_total = len(cost_tags)
    if era <= 3:
        if len(cost_tags) == 1 and idx % 8 == 0 and idx >= 4:
            desired_total = 2
    elif era <= 6:
        if len(cost_tags) == 1 and idx % 3 == 0:
            desired_total = 2
        if idx % 10 == 0:
            desired_total = max(desired_total, 3)
    elif era <= 10:
        desired_total = max(desired_total, 2)
        if idx % 4 == 0:
            desired_total = max(desired_total, 3)
        if idx % 11 == 0:
            desired_total = max(desired_total, 4)
    else:
        desired_total = max(desired_total, 2)
        if idx % 3 == 0:
            desired_total = max(desired_total, 3)
        if idx % 7 == 0:
            desired_total = max(desired_total, 4)
        if idx % 15 == 0:
            desired_total = max(desired_total, 5)

    while len(cost_tags) < desired_total:
        candidate = select_extra_resource(cost_tags, avoid_energy=force_non_energy)
        if candidate not in cost_tags:
            cost_tags.append(candidate)
        else:
            break

    produced_tags = set(cost_tags_for(tags))
    if set(cost_tags).issubset(produced_tags):
        candidate = select_extra_resource(cost_tags, avoid_energy=force_non_energy)
        if candidate not in cost_tags:
            cost_tags.append(candidate)

    shares = {}
    for tag in cost_tags:
        shares[tag] = shares.get(tag, 0.0) + 1.0
    total = sum(shares.values())
    for tag in shares:
        shares[tag] = round(shares[tag] / total, 4)
    return shares


def format_amount(value):
    scales = [
        (1e18, "Qi"),
        (1e15, "Qa"),
        (1e12, "T"),
        (1e9, "B"),
        (1e6, "M"),
        (1e3, "K"),
    ]
    for threshold, suffix in scales:
        if value >= threshold:
            return f"{value / threshold:.2f}{suffix}"
    return f"{value:.0f}"


def build_synergies(era_name, prev_name, prev_identifier, current_name, identifier, tags, era_index, idx):
    synergy_a_bonus = 4 + (idx % 4) * 2
    synergy_a = f"+{synergy_a_bonus}% output per {prev_name} owned."
    synergy_a_data = {
        "type": "per_building",
        "target_identifier": prev_identifier,
        "bonus_percent": synergy_a_bonus,
    }

    primary_tag = tags[0]
    bonus_scale = 3 + (idx % 5) * 3
    threshold_value = cost_baselines[era_index] * cost_multipliers[idx] * 0.45
    threshold = format_amount(threshold_value)
    synergy_b = (
        f"+{bonus_scale}% {resource_names[primary_tag]} output while stored {resource_names[primary_tag]} ≥ {threshold}."
    )

    synergy_b_data = {
        "type": "stored_resource",
        "resource": primary_tag,
        "threshold": round(threshold_value, 2),
        "bonus_percent": bonus_scale,
    }

    if len(tags) > 1:
        secondary_tag = tags[1]
        synergy_b += f" Additional +{bonus_scale//2}% {resource_names[secondary_tag]} output."
        synergy_b_data["secondary_resource"] = secondary_tag
        synergy_b_data["secondary_bonus_percent"] = bonus_scale // 2

    upgrade = f"{current_name} — {upgrade_templates[idx % len(upgrade_templates)]}"
    return synergy_a, synergy_b, upgrade, synergy_a_data, synergy_b_data


def main():
    dataset = []
    total_buildings = 0

    for era_index, (era_name, buildings) in enumerate(eras):
        rate_base = rate_baselines[era_index]
        cost_base = cost_baselines[era_index]
        growth = growth_values[era_index]
        energy_offgrid_supplied = False

        for idx, (name, tag_str) in enumerate(buildings):
            tags = parse_tags(tag_str)
            prev_idx = idx - 1 if idx > 0 else len(buildings) - 1
            prev_name = buildings[prev_idx][0]

            identifier = f"{era_index + 1:02d}-{idx + 1:02d}"
            prev_identifier = f"{era_index + 1:02d}-{prev_idx + 1:02d}"

            base_rate = round(rate_base * rate_multipliers[idx], 6)
            base_cost = round(cost_base * cost_multipliers[idx])

            synergy_a, synergy_b, upgrade, synergy_a_data, synergy_b_data = build_synergies(
                era_name, prev_name, prev_identifier, name, identifier, tags, era_index, idx
            )

            force_non_energy = False
            if "E" in tags and not energy_offgrid_supplied:
                force_non_energy = True
                energy_offgrid_supplied = True

            dataset.append(
                {
                    "identifier": identifier,
                    "name": name,
                    "era": era_name,
                    "era_index": era_index + 1,
                    "index_in_era": idx + 1,
                    "tags": tags,
                    "base_rate": base_rate,
                    "base_cost": base_cost,
                    "growth": growth,
                    "cost_shares": build_cost_shares(tags, era_index, idx, force_non_energy=force_non_energy),
                    "synergy_a": synergy_a,
                    "synergy_b": synergy_b,
                    "synergy_a_data": synergy_a_data,
                    "synergy_b_data": synergy_b_data,
                    "unique_upgrade": upgrade,
                }
            )
            total_buildings += 1

    output_path = Path("design/data/buildings.json")
    output_path.write_text(json.dumps(dataset, indent=2))
    print(f"Wrote {total_buildings} buildings to {output_path}")


if __name__ == "__main__":
    main()

