Idle Civilization Design Document
=================================

## Vision
- **Premise**: Guide humanity from scattered foragers to a Kardashev Type III intergalactic civilization through exponential production, smart automation, and prestige-driven mastery.
- **Tone**: Clean, optimistic, lightly playful. Flavor text hints at history and sci-fi leaps without overwhelming mechanics.
- **Pacing**: Early actions feel punchy; midgame leans on automation and synergies; late game embraces astronomical scale with UI support for huge numbers.

## Core Loop
- Tap/build to convert resources into producers.
- Spend resources on upgrades, synergies, and population expansions to amplify outputs.
- Unlock new eras at milestones, introducing fresh producer pools and mechanics.
- Engage prestige layers when stuck to gain permanent multipliers and new tools.

## Resources
- **Wood (W)**: Early scaffolding, remains vital for biological & synthetic forestry.
- **Stone (S)**: Structural backbone transitioning into exotic alloys.
- **Energy (E)**: Starts as fire/heat, evolves into photons, antimatter, mindlight.
- **Food (F)**: Sustains population, becomes biochemical sustenance, then abstract feeding.
- **Population (P)**: Unlocks automation tiers, provides passive multipliers, required for certain buildings.
- Resource color coding: W `#8B5A2B`, S `#C4C4C4`, E `#F4C542`, F `#6BBF59`, P `#5B6EE1` (color-blind safe palette tuned through contrast testing).

## Production Formula
`production_per_tick = base_rate × (1 + local_upgrade_bonus) × (1 + global_multipliers) × synergy_multipliers × prestige_multipliers × automation_state`

- `base_rate`: defined per producer, scales by era and per-building multipliers.
- `local_upgrade_bonus`: sum of upgrades tied to that producer.
- `global_multipliers`: prestige, achievements, research, K-scale unlocks.
- `synergy_multipliers`: dynamic boosts from linked producers/resources.
- `automation_state`: buildings flagged “automated” gain +5% efficiency and auto-rebuy when resources allow.

## Cost Curves
- Standard producer cost: `current_cost = base_cost × (growth ^ owned)`.
- Growth ratios increase slowly with era depth (see table).
- Global inflation per era: upon entering a new era, all unreached era producer costs increase by +4% (multiplicative) to keep pacing tight.
- Batch buy options: x1, x10, x25, x100, max. Show both total bundle cost and resulting owned count.

## Eras & Milestones
- 20 eras, 25 producers each (total 500). Era unlock triggers:
  - Resource threshold (composite of W/S/E/F/P).
  - Minimum population requirement.
  - Kardashev threshold gating major transitions.
- Era rewards:
  - New producer pool with visual shift in cards.
  - Passive global bonus (e.g., Era 5 adds +10% to all W outputs).
  - New systems: Era 4 automation toggles, Era 7 research queue, Era 10 orbital expansion board, etc.
- Tutorial: 60-second guided steps in Era 1 culminating in first automation unlock hint.

## Kardashev Tracker
- Display current `K-index` prominently with meter and ETA to next threshold.
- Unlock thresholds:
  - K0.2: Auto-assign workers.
  - K0.4: Era fast-travel toggle (skip early era animations).
  - K0.6: Research queue extends to 3 slots.
  - K0.8: First prestige loop (“Ascend”) unlocks.
  - K1.0: Global automation + base 2× multiplier.
  - K1.4, K1.8, K2.0, etc. unlock advanced mechanics (Dyson segments, star lifting).
  - K3.0: Wormhole production grid, ultimate prestige “Transcend”.
- UI shows sparkline of K-index over last 10 minutes and estimated time to next major unlock.

## Prestige Layers
- **Ascend (Era 8+)**: Reset buildings/resources, keep achievements, earn **Insight**.
  - Insight spend on: global resource multipliers, synergy intensity, automation speed.
  - Insight gain scales with total logarithmic production over run.
- **Transcend (K2.0+)**: Resets insights, unlocks **Cosmic Wisdom** for universal boosts, allows toggling era modifiers, unlocks exotic buildings earlier.
- **Eternity (K3.0)**: Final loop for endless scaling; unlocks `Ansible Projects` that reconfigure synergy webs.
- Each prestige presents summary report and recommended goals for next run.

## Synergies
- Simple, readable pairings; each producer lists two synergy hooks.
- Types:
  - **Direct**: “Gains +4% per X owned.”
  - **Resource-based**: “+1% output per 1k current F.”
  - **Era aura**: “While at least 5 Bronze era buildings automated, +20%.”
- Synergy tooltips highlight current bonus and next breakpoint.

## Upgrades & Research
- **Per-producer upgrades**: 3–4 ranks, purchased in tiers, unlock outcome (double base rate, reduce cost growth).
- **Global upgrades**: purchased with resource bundles or Insight; show dependencies.
- **Batch toggles**: auto-purchase per building, open per era via milestone. UI indicates resource drain if auto-buy active.
- **Research Board** (Era 7+): allocate scientists (portion of Population). Research provides wide multipliers or unlocks new synergy links.

## Automation
- **Workers** (Era 2): manual assignment per building, convert population to +10% output w/ diminishing returns.
- **Machines** (Era 5): auto-buy toggles, require Energy maintenance.
- **Drones/AI** (Era 9/12/16): escalate automation, enabling queueing of upgrades, dynamic rebalancing.
- **Post-biological** automation (Era 16): scriptable behaviors; players can set simple IF/THEN rules via UI macros.

## Achievements
- Tiered per era (5 achievements each) plus meta sets (speedrun, efficiency).
- Reward small Insight, resource multipliers, cosmetic badges.
- Achievement toast: minimal animation, fades after 3 s, accessible log with filters.

## Feedback & UX
- Single-screen dashboard with collapsible panels:
  - Left: resource bars with rates (per second, per minute), toggle to scientific notation.
  - Center: producer cards grouped by era, top three producers pinned at top.
  - Right: Kardashev tracker, milestone queue, active boosts, achievements, tutorial/help.
- Card design:
  - Minimalist icon, name, era badge, production output, cost, owned, buttons for buy x1/x10/x100/max, automation toggle, upgrade button.
  - Hover shows synergy text, upgrade tree, flavor line.
- Visuals:
  - Subtle gradients, calm particle bursts when purchasing.
  - Sparklines show 60 s production history per resource.
  - Logarithmic chart option for late-game scaling.
- Accessibility:
  - Color-blind palette presets, slider for animation intensity, reduced motion mode replacing particles with static icons.
  - Keyboard shortcuts for navigation and purchases (configurable).

## Offline Progress
- Player sets offline simulation window (default 8 hours, up to 24 with Insight).
- Upon return, display report with resource gains, best producers, achievements triggered.
- Allow partial claiming (e.g., take 50%) if player wants slower pacing.

## Save & Cloud
- Auto-save locally every 30 seconds and on major actions.
- Cloud sync optional; manual export/import string via base64 zipped JSON.
- Conflict resolution: latest timestamp wins, previous save stored for 24 h restore.

## Balancing Guidelines
- Ensure next era floor producers become viable after ~5–7 purchases of current era top tier.
- Maintain exponential pacing by gradually increasing production multipliers and cost growth.
- Softcaps: apply smooth logarithmic reductions when single resource > 70% of total production to encourage diversified builds.
- Insight and higher prestiges provide multiplicative boosts instead of reset-proof absolute values.

## Data Schema
- Producers stored in structured data (JSON/CSV). Fields:
  - `name` (string)
  - `era` (int 1–20)
  - `tags` (array of resource codes)
  - `base_rate` (float, unit: resource per second)
  - `base_cost` (float, resource-agnostic reference cost paid in resource mix appropriate to era)
  - `growth` (float, per-purchase multiplier)
  - `synergy_a` (string description)
  - `synergy_b` (string description)
  - `unique_upgrade` (string description)
- Base rates and costs scale by era multiplicatively (see `Producer Scaling` table).

## Producer Scaling (Era Baselines)
- Era baseline base_rate: `0.1 × 3.6^(era-1)`
- Era baseline base_cost: `10 × 9^(era-1)`
- Era baseline growth: starts 1.12, increases by 0.01 every two eras (capped at 1.32).
- Individual producers apply multipliers between 0.8× and 2.4× to baseline to create variety.

## Buildings Dataset
The complete dataset of 500 producers (20 eras × 25 buildings) is available at `design/data/buildings.json`. Each entry includes era metadata, tags, base rates/costs derived from the scaling rules, cost growth, two synergies, and a unique upgrade hook for implementation. Use this file to seed in-game balancing spreadsheets or import directly into the simulation.


