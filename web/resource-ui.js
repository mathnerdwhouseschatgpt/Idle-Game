const RESOURCE_ICONS = {
  W: { icon: "🌲", label: "Wood", description: "Raw material for early structures and tools." },
  S: { icon: "⛰️", label: "Stone", description: "Durable material for infrastructure and monuments." },
  E: { icon: "⚡", label: "Energy", description: "Power for advanced production chains." },
  F: { icon: "🌾", label: "Food", description: "Sustains growth and keeps civilization expanding." },
  P: { icon: "👥", label: "Population", description: "People available to build, gather, and innovate." },
};

function enhanceResourcePanel() {
  const panel = document.getElementById("resource-panel");
  if (!panel) return;

  const entries = panel.querySelectorAll(".resource-entry");
  for (const entry of entries) {
    if (!(entry instanceof HTMLElement) || entry.dataset.enhanced === "true") continue;

    const resource = entry.dataset.resource;
    const config = resource ? RESOURCE_ICONS[resource] : undefined;
    if (!config) continue;

    const name = entry.querySelector(".name");
    const amount = entry.querySelector(".amount");
    const delta = entry.querySelector(".delta");
    if (!name || !amount || !delta) continue;

    const icon = document.createElement("span");
    icon.className = "resource-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = config.icon;

    const copy = document.createElement("span");
    copy.className = "resource-copy";
    copy.append(name, amount);

    const info = document.createElement("span");
    info.className = "resource-info";
    info.textContent = config.description;

    entry.setAttribute("role", "listitem");
    entry.setAttribute("aria-label", `${config.label}: ${amount.textContent ?? "0"}; ${delta.textContent ?? "+0/s"}`);
    entry.replaceChildren(icon, copy, delta, info);
    entry.dataset.enhanced = "true";
  }
}

function syncAccessibleResourceLabels() {
  const panel = document.getElementById("resource-panel");
  if (!panel) return;

  for (const entry of panel.querySelectorAll(".resource-entry")) {
    if (!(entry instanceof HTMLElement)) continue;
    const resource = entry.dataset.resource;
    const config = resource ? RESOURCE_ICONS[resource] : undefined;
    const amount = entry.querySelector(".amount")?.textContent ?? "0";
    const delta = entry.querySelector(".delta")?.textContent ?? "+0/s";
    if (config) entry.setAttribute("aria-label", `${config.label}: ${amount}; ${delta}`);
  }
}

function observeResourcePanel() {
  const panel = document.getElementById("resource-panel");
  if (!panel) return;

  const observer = new MutationObserver(() => {
    enhanceResourcePanel();
    syncAccessibleResourceLabels();
  });
  observer.observe(panel, { childList: true, subtree: true, characterData: true });
}

enhanceResourcePanel();
syncAccessibleResourceLabels();
observeResourcePanel();
