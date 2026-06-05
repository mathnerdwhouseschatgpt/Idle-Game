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
2. Open `http://localhost:8000/` in your browser. The repository-root `index.html` redirects to the browser game in `web/`, matching the default GitHub Pages URL.

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

## Desktop Build / Steam Preparation
The repository includes an Electron wrapper so you can ship the browser UI as a desktop executable suitable for Steam.

### Prerequisites
- Python 3.9+
- Node.js 18+
- Windows build tools (for NSIS) if you plan to deploy on Windows

### Build Steps
```bash
npm install            # installs electron + electron-builder
npm run dist           # regenerates data and creates packaged builds in dist/
```

The default configuration outputs:
- `dist/win-unpacked` and `dist/Idle Civilization Setup.exe` (Windows NSIS installer)
- Platform-specific bundles when run on macOS or Linux

Upload the generated executable/folder through Steam’s partner portal (SteamPipe). The game stores saves in Electron’s per-user storage, so the distributed build ships without pre-existing saves.

## Web Build for itch.io
You can package the browser version as a static ZIP for HTML5 distribution on itch.io.

```bash
npm run web:build
```

This command regenerates data, copies the `web/` folder into `dist/web/`, and produces `dist/idle-civilization-web.zip`.

### Uploading to itch.io
1. Create or edit your project on itch.io and set **Kind of project** to **HTML**.
2. Upload `dist/idle-civilization-web.zip`.
3. Check **"This file will be played in the browser."**
4. Configure the embed size (e.g., 1280×720) and publish or keep private for testing.

The zip contains `index.html` plus the `data/` directory, so the game runs entirely client-side once itch.io unpacks it.

## GitHub Pages Deployment
The browser UI can be deployed directly to GitHub Pages using the included workflow.

1. In GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
2. Push a branch containing this workflow, or run the **Deploy GitHub Pages** workflow manually from the Actions tab.
3. The workflow runs `npm run pages:build`, publishes `dist/web/`, and serves the game from the Pages URL.

For a local preview of the exact Pages artifact:
```bash
npm run pages:build
python -m http.server 8000 --directory dist/web
```
Then open `http://localhost:8000/`.
