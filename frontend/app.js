/**
 * Vault Pulls — frontend.
 *
 * This file holds NO inventory data and makes NO pull decisions. It only
 * ever sees: a 32-card preview slice, single-card lookups, its own pull
 * results, and aggregate stats — all fetched from the backend, which is
 * the sole place a card is marked "pulled". Balance and "My Collection"
 * are cosmetic, per-browser bookkeeping on top of that (localStorage);
 * the inventory itself is not something this file can touch directly.
 */

const API_BASE = window.VAULT_API_BASE || "http://localhost:4000";

const RARITY_COLOR = {
  Common: "#9ca3af",
  Rare: "#60a5fa",
  Epic: "#c084fc",
  Legendary: "#f7c948",
};

const STORAGE_KEY = "vault-pulls-frontend-v1";
const STARTING_BALANCE = 1000;

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.balance === "number" && Array.isArray(parsed.myPulls)) return parsed;
    }
  } catch (err) {
    console.warn("Could not read saved local state, starting fresh.", err);
  }
  return { balance: STARTING_BALANCE, myPulls: [] };
}

function saveLocalState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
  } catch (err) {
    console.warn("Could not save local state.", err);
  }
}

const local = loadLocalState();
let latestStats = null;

// ---------------------------------------------------------------------
// Backend client
// ---------------------------------------------------------------------

async function api(path, options) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch (err) {
    setConnectionBanner(true);
    throw new Error("Could not reach the inventory backend.");
  }
  setConnectionBanner(false);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function setConnectionBanner(show) {
  document.getElementById("connection-banner").hidden = !show;
}

// ---------------------------------------------------------------------
// Rendering: top bar
// ---------------------------------------------------------------------

function renderTopbar() {
  if (latestStats) {
    document.getElementById("stat-remaining").textContent = latestStats.remaining.toLocaleString();
    document.getElementById("stat-total").textContent = latestStats.total.toLocaleString();
  }
  document.getElementById("stat-collected").textContent = local.myPulls.length.toLocaleString();
  document.getElementById("stat-balance").textContent = `$${local.balance.toLocaleString()}`;
}

// ---------------------------------------------------------------------
// Rendering: odds + tiers
// ---------------------------------------------------------------------

function renderOdds() {
  if (!latestStats) return;
  const el = document.getElementById("odds-table");
  const weights = latestStats.pullWeights;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  el.innerHTML = Object.entries(weights)
    .map(([rarity, weight]) => {
      const pct = ((weight / total) * 100).toFixed(0);
      return `
        <div class="odds-chip">
          <div class="odds-rate" style="color:${RARITY_COLOR[rarity]}">${pct}%</div>
          <div class="odds-label">${rarity}</div>
        </div>
      `;
    })
    .join("");
}

function renderTiers() {
  if (!latestStats) return;
  const el = document.getElementById("tier-list");
  el.innerHTML = latestStats.tiers
    .map(
      (tier) => `
      <div class="tier-card ${tier.featured ? "featured" : ""}">
        <div class="tier-name">${tier.label}</div>
        <div class="tier-price">$${tier.price}</div>
        <div class="tier-pulls">1 card &middot; ${tier.tagline}</div>
        <button class="tier-buy" data-tier="${tier.id}">Open Pack</button>
      </div>
    `
    )
    .join("");

  el.querySelectorAll(".tier-buy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tier = latestStats.tiers.find((t) => t.id === btn.dataset.tier);
      openPack(tier);
    });
  });
}

function refreshBuyButtonsDisabled() {
  if (!latestStats) return;
  const soldOut = latestStats.remaining <= 0;
  document.querySelectorAll(".tier-buy").forEach((btn) => {
    const tier = latestStats.tiers.find((t) => t.id === btn.dataset.tier);
    const canAfford = local.balance >= tier.price;
    btn.disabled = soldOut || !canAfford || btn.dataset.busy === "1";
    if (btn.dataset.busy === "1") return; // leave "Pulling..." alone
    btn.textContent = soldOut ? "Sold Out" : canAfford ? "Open Pack" : "Insufficient Balance";
  });
}

function setBuyButtonsBusy(busy) {
  document.querySelectorAll(".tier-buy").forEach((btn) => {
    btn.dataset.busy = busy ? "1" : "0";
    if (busy) {
      btn.disabled = true;
      btn.textContent = "Pulling…";
    }
  });
  if (!busy) refreshBuyButtonsDisabled();
}

// ---------------------------------------------------------------------
// Pulling a card
// ---------------------------------------------------------------------

async function openPack(tier) {
  if (local.balance < tier.price) {
    showToast(`Not enough balance for ${tier.label} ($${tier.price}).`);
    return;
  }

  setBuyButtonsBusy(true);
  try {
    const result = await api("/api/pull", {
      method: "POST",
      body: JSON.stringify({ tierId: tier.id }),
    });

    local.balance -= tier.price;
    local.myPulls.unshift(result.card);
    saveLocalState();

    latestStats = result.stats;
    renderTopbar();
    renderCollection();
    showReveal(result.card, tier, result.guaranteeMissed);

    // The pull may have changed a card that's on-screen elsewhere.
    await Promise.all([refreshPreview(), refreshActivity()]);
  } catch (err) {
    showToast(err.message);
  } finally {
    setBuyButtonsBusy(false);
  }
}

// ---------------------------------------------------------------------
// Rendering: My Collection (client-side bookkeeping of your own pulls)
// ---------------------------------------------------------------------

function miniCardHTML(card) {
  const color = RARITY_COLOR[card.rarity];
  return `
    <div class="mini-card" style="border-color:${color}; box-shadow: 0 0 0 1px ${color};">
      <div class="mini-id">#${String(card.id).padStart(4, "0")}</div>
      <div class="mini-rarity" style="color:${color}">${card.rarity}</div>
    </div>
  `;
}

function renderCollection() {
  const empty = document.getElementById("collection-empty");
  const grid = document.getElementById("collection-grid");
  const count = document.getElementById("collection-count");

  count.textContent = `${local.myPulls.length.toLocaleString()} card${local.myPulls.length === 1 ? "" : "s"} pulled`;

  if (local.myPulls.length === 0) {
    empty.hidden = false;
    grid.hidden = true;
    grid.innerHTML = "";
    return;
  }

  empty.hidden = true;
  grid.hidden = false;
  grid.innerHTML = local.myPulls.map(miniCardHTML).join("");
}

// ---------------------------------------------------------------------
// Rendering: Card Preview (the only slice of the vault the page shows)
// ---------------------------------------------------------------------

function previewCardHTML(card) {
  const color = RARITY_COLOR[card.rarity];
  const style = card.pulled
    ? "opacity:0.35; filter:grayscale(0.6);"
    : `border-color:${color}; box-shadow: 0 0 0 1px ${color};`;
  return `
    <div class="mini-card" style="${style}">
      <div class="mini-id">#${String(card.id).padStart(4, "0")}</div>
      <div class="mini-rarity" style="color:${color}">${card.rarity}</div>
      ${card.pulled ? '<div style="font-size:0.6rem;color:#f87171;">PULLED</div>' : ""}
    </div>
  `;
}

async function refreshPreview() {
  try {
    const { cards } = await api("/api/preview");
    document.getElementById("preview-grid").innerHTML = cards.map(previewCardHTML).join("");
  } catch (err) {
    // Connection banner already shown by api(); nothing else to do here.
  }
}

// ---------------------------------------------------------------------
// Look up a single card by id
// ---------------------------------------------------------------------

async function lookupCard(id) {
  const holder = document.getElementById("lookup-result");
  if (!id || id < 1 || id > 5000) {
    holder.innerHTML = `<p class="lookup-error">Enter a card number between 1 and 5000.</p>`;
    return;
  }
  holder.innerHTML = `<p class="lookup-pending">Asking the backend about #${String(id).padStart(4, "0")}…</p>`;
  try {
    const { card } = await api(`/api/card/${id}`);
    const color = RARITY_COLOR[card.rarity];
    holder.innerHTML = `
      <div class="lookup-card">
        <div class="mini-card" style="border-color:${color}; box-shadow: 0 0 0 1px ${color};">
          <div class="mini-id">#${String(card.id).padStart(4, "0")}</div>
          <div class="mini-rarity" style="color:${color}">${card.rarity}</div>
        </div>
        <div class="lookup-status ${card.pulled ? "status-pulled" : "status-available"}">
          ${card.pulled ? `Already pulled${card.pulledAt ? " · " + new Date(card.pulledAt).toLocaleString() : ""}` : "Still in the vault"}
        </div>
      </div>
    `;
  } catch (err) {
    holder.innerHTML = `<p class="lookup-error">${err.message}</p>`;
  }
}

// ---------------------------------------------------------------------
// Vault Activity feed (proof the backend, not the browser, owns state)
// ---------------------------------------------------------------------

function activityItemHTML(entry) {
  const color = RARITY_COLOR[entry.rarity];
  const when = new Date(entry.pulledAt).toLocaleTimeString();
  return `
    <li class="activity-item">
      <span class="activity-id" style="color:${color}">#${String(entry.id).padStart(4, "0")}</span>
      <span class="activity-rarity" style="color:${color}">${entry.rarity}</span>
      <span class="activity-time">${when}</span>
    </li>
  `;
}

async function refreshActivity() {
  try {
    const { pulls } = await api("/api/recent-pulls?limit=10");
    const empty = document.getElementById("activity-empty");
    const list = document.getElementById("activity-list");
    if (pulls.length === 0) {
      empty.hidden = false;
      list.hidden = true;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = pulls.map(activityItemHTML).join("");
  } catch (err) {
    // Banner already shown; nothing else to do.
  }
}

// ---------------------------------------------------------------------
// Reveal modal + toast
// ---------------------------------------------------------------------

function showReveal(card, tier, guaranteeMissed) {
  const overlay = document.getElementById("reveal-overlay");
  const grid = document.getElementById("reveal-grid");
  const title = document.getElementById("reveal-title");
  const noteHolder = document.getElementById("partial-note-holder");
  const color = RARITY_COLOR[card.rarity];

  title.textContent = "You pulled a card!";

  grid.innerHTML = `
    <div class="reveal-card" style="border-color:${color};">
      <div class="rc-id">#${String(card.id).padStart(4, "0")}</div>
      <div class="rc-name">${card.name}</div>
      <div class="rc-rarity" style="color:${color}">${card.rarity}</div>
    </div>
  `;

  noteHolder.innerHTML = guaranteeMissed
    ? `<div style="color:var(--text-dim);font-size:0.8rem;margin-bottom:16px;">
        The vault had no ${tier.minRarity}+ cards left to honor the
        ${tier.label} guarantee, so this pull came from the remaining
        pool instead.
      </div>`
    : "";

  overlay.hidden = false;
}

function hideReveal() {
  document.getElementById("reveal-overlay").hidden = true;
}

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// ---------------------------------------------------------------------
// Reset demo (restocks the backend inventory + local bookkeeping)
// ---------------------------------------------------------------------

async function resetDemo() {
  try {
    const result = await api("/api/reset", { method: "POST" });
    latestStats = result.stats;
    local.balance = STARTING_BALANCE;
    local.myPulls = [];
    saveLocalState();

    renderTopbar();
    renderCollection();
    renderTiers();
    renderOdds();
    refreshBuyButtonsDisabled();
    await Promise.all([refreshPreview(), refreshActivity()]);
    showToast("Demo reset — backend vault restocked and your balance refilled.");
  } catch (err) {
    showToast(err.message);
  }
}

// ---------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------

document.getElementById("reveal-close").addEventListener("click", () => {
  hideReveal();
  refreshBuyButtonsDisabled();
});

document.getElementById("reveal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "reveal-overlay") {
    hideReveal();
    refreshBuyButtonsDisabled();
  }
});

document.getElementById("reset-demo-btn").addEventListener("click", resetDemo);

document.getElementById("lookup-btn").addEventListener("click", () => {
  lookupCard(parseInt(document.getElementById("lookup-input").value, 10));
});
document.getElementById("lookup-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookupCard(parseInt(e.target.value, 10));
});

document.getElementById("api-base-label").textContent = API_BASE;

async function init() {
  renderCollection();
  renderTopbar();
  try {
    latestStats = await api("/api/stats");
  } catch (err) {
    return; // banner is already showing; nothing else works without it
  }
  renderTopbar();
  renderOdds();
  renderTiers();
  refreshBuyButtonsDisabled();
  await Promise.all([refreshPreview(), refreshActivity()]);
}

init();
