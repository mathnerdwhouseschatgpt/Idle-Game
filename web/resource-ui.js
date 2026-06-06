const RESOURCE_ICONS = {
  W: {
    label: "Wood",
    description: "Raw material for early structures and tools.",
    svg: `<svg viewBox="0 0 24 24" role="img" focusable="false"><path d="M12 3 5 14h4l-3 5h12l-3-5h4L12 3Z"/><path d="M12 17v4"/></svg>`,
  },
  S: {
    label: "Stone",
    description: "Durable material for infrastructure and monuments.",
    svg: `<svg viewBox="0 0 24 24" role="img" focusable="false"><path d="M3 18 9 7l4 6 2-3 6 8H3Z"/><path d="M9 7l2.5 11"/><path d="M15 10l-1 8"/></svg>`,
  },
  E: {
    label: "Energy",
    description: "Power for advanced production chains.",
    svg: `<svg viewBox="0 0 24 24" role="img" focusable="false"><path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/></svg>`,
  },
  F: {
    label: "Food",
    description: "Sustains growth and keeps civilization expanding.",
    svg: `<svg viewBox="0 0 24 24" role="img" focusable="false"><path d="M12 3v18"/><path d="M12 7c-4 0-6-2-7-4 5 0 7 2 7 4Z"/><path d="M12 11c4 0 6-2 7-4-5 0-7 2-7 4Z"/><path d="M12 15c-4 0-6-2-7-4 5 0 7 2 7 4Z"/><path d="M12 19c4 0 6-2 7-4-5 0-7 2-7 4Z"/></svg>`,
  },
  P: {
    label: "Population",
    description: "People available to build, gather, and innovate.",
    svg: `<svg viewBox="0 0 24 24" role="img" focusable="false"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.8-4 3-6 6-6s5.2 2 6 6"/><path d="M14 16c1-.8 2-1.2 3-1.2 2.4 0 4 1.6 4.7 5.2"/></svg>`,
  },
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
    icon.innerHTML = config.svg;

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

function startResourceUi() {
  enhanceResourcePanel();
  syncAccessibleResourceLabels();
  observeResourcePanel();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startResourceUi, { once: true });
} else {
  startResourceUi();
}
