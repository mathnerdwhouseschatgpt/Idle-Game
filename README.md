# Idle Civilization Prototype

This repository contains design documentation, a command-line simulator, and a browser UI for exploring the Idle Civilization concept. The dataset covers all 20 eras and 500 producers with structured cost, synergy, and upgrade hooks.

## Requirements
- Python 3.9+ (for the CLI, data generation, and local web server)
- Modern browser with ES modules enabled
- Generated building data at `design/data/buildings.json` (provided; regenerate via `python tools/generate_buildings.py` if needed)

## Browser UI (recommended)
1. Launch a local web server from the repository root, for example:
   ```bash
   python -m http.server 8000
   ```
2. Open `http://localhost:8000/web/` in your browser.

### Key Features
- Real-time production loop with requestAnimationFrame pacing
- Resource panel with per-second deltas and scientific notation toggle
- Collapsible era sections (25 buildings each) with buy x1/x10/x100/max buttons and per-building automation
- Live Kardashev tracker, top producer list, milestone progress bars, and unlock notifications
- Auto-save (toggleable), local save/export/import (base64 string), and offline progress simulation (up to 8 hours)
- Accessibility-forward UI with keyboardable buttons, high-contrast palette, and reduced-motion defaults

## Command-Line Simulator
```bash
python src/idle_cli.py
```

The CLI mirrors the dataset and formulae used by the browser UI. Use the commands below to play:
- `status` — View current resources, production rates, era, and Kardashev index.
- `list` or `list <era>` — Inspect available buildings and costs.
- `tick [seconds]` — Advance time manually (default 1 second).
- `run <seconds> [step]` — Auto-tick for the given duration in fixed steps.
- `buy <id|name> [quantity]` — Purchase buildings (IDs shown in `list`).
- `save [path]` / `load [path]` — Persist or restore progress (defaults to `savegame.json`).
- `help` — Show all commands.
- `quit` — Exit safely.

## Additional Notes
- Starter resources ensure the first purchases are immediately available.
- Era progression unlocks automatically when aggregate production meets the next baseline.
- Kardashev index is derived from energy output and era depth; UI shows required delta per threshold.
- Costs split across resource tags; Population costs are funded via Food to model support overhead.

