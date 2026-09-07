/**
 * Vault Pulls — single pack, three price points, 5000-card inventory.
 *
 * Everything here is client-side/demo only: "balance" and inventory state
 * live in localStorage per browser. A real storefront would move the
 * inventory pool, RNG, and balance/payment handling to a server so the
 * 5000-card pool is shared and tamper-proof across all customers.
 */

const STORAGE_KEY = "vault-pulls-state-v2";
const STARTING_BALANCE = 1000; // demo play-money balance

// Every price point buys exactly one pull. What changes is the rarity
// floor that pull is guaranteed to meet — pay more, pull from a smaller,
// better pool.
const RARITY_ORDER = ["Common", "Rare", "Epic", "Legendary"];

const TIERS = [
  { id: "small", price: 50, label: "Single Pull", minRarity: "Common", tagline: "Standard odds" },
  { id: "medium", price: 100, label: "Rare+ Pull", minRarity: "Rare", tagline: "Guaranteed Rare or better" },
  {
    id: "large",
    price: 500,
    label: "Epic+ Pull",
    minRarity: "Epic",
    tagline: "Guaranteed Epic or better",
    featured: true,
  },
];

// Baseline weighted odds across the whole vault (before any tier's
// rarity-floor guarantee is applied).
const PULL_WEIGHTS = { Common: 70, Rare: 25, Epic: 4, Legendary: 1 };

const INVENTORY_PAGE_SIZE = 250;

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.pulledIds) && typeof parsed.balance === "number") {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Could not read saved state, starting fresh.", err);
  }
  return { pulledIds: [], balance: STARTING_BALANCE };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Could not save state.", err);
  }
}

const state = loadState();
const pulledSet = new Set(state.pulledIds);
let inventoryRenderedCount = 0;

// ---------------------------------------------------------------------
// Pull logic
// ---------------------------------------------------------------------

function remainingByRarity() {
  const buckets = { Common: [], Rare: [], Epic: [], Legendary: [] };
  for (const card of window.CARD_INVENTORY) {
    if (!pulledSet.has(card.id)) buckets[card.rarity].push(card);
  }
  return buckets;
}

function weightedRarityOrder(allowedRarities) {
  // Shuffle-ish deterministic-by-random order of rarities weighted by
  // PULL_WEIGHTS, restricted to `allowedRarities`, so if the first choice
  // is sold out we fall back sanely to the next-best allowed rarity.
  const entries = Object.entries(PULL_WEIGHTS).filter(([rarity]) =>
    allowedRarities.includes(rarity)
  );
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  let chosen = entries[entries.length - 1][0];
  for (const [rarity, weight] of entries) {
    if (roll < weight) {
      chosen = rarity;
      break;
    }
    roll -= weight;
  }
  const rest = entries.map(([r]) => r).filter((r) => r !== chosen);
  return [chosen, ...rest];
}

function pullOneCard(buckets, allowedRarities) {
  for (const rarity of weightedRarityOrder(allowedRarities)) {
    const pool = buckets[rarity];
    if (pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      const [card] = pool.splice(idx, 1);
      return card;
    }
  }
  return null; // nothing left among the allowed rarities
}

function openPack(tier) {
  if (state.balance < tier.price) {
    showToast(`Not enough balance for ${tier.label} ($${tier.price}).`);
    return;
  }

  if (pulledSet.size >= window.TOTAL_CARDS) {
    showToast("The vault is empty — every card has been pulled!");
    return;
  }

  const buckets = remainingByRarity();
  const guaranteedRarities = RARITY_ORDER.slice(RARITY_ORDER.indexOf(tier.minRarity));

  let card = pullOneCard(buckets, guaranteedRarities);
  let guaranteeMissed = false;
  if (!card) {
    // Nothing left at or above the guaranteed rarity — pull from
    // whatever's left in the vault instead of refusing the sale.
    card = pullOneCard(buckets, RARITY_ORDER);
    guaranteeMissed = true;
  }

  pulledSet.add(card.id);
  state.balance -= tier.price;
  state.pulledIds = Array.from(pulledSet);
  saveState();

  renderTopbar();
  renderCollection();
  renderInventoryReset();
  refreshBuyButtonsDisabled();
  showReveal(card, tier, guaranteeMissed);
}

// ---------------------------------------------------------------------
// Rendering: top bar
// ---------------------------------------------------------------------

function renderTopbar() {
  document.getElementById("stat-remaining").textContent =
    (window.TOTAL_CARDS - pulledSet.size).toLocaleString();
  document.getElementById("stat-collected").textContent = pulledSet.size.toLocaleString();
  document.getElementById("stat-balance").textContent = `$${state.balance.toLocaleString()}`;
}

// ---------------------------------------------------------------------
// Rendering: odds + tiers
// ---------------------------------------------------------------------

function renderOdds() {
  const el = document.getElementById("odds-table");
  el.innerHTML = "";
  const total = Object.values(PULL_WEIGHTS).reduce((a, b) => a + b, 0);
  for (const tier of window.RARITY_TIERS) {
    const chip = document.createElement("div");
    chip.className = "odds-chip";
    const pct = ((PULL_WEIGHTS[tier.name] / total) * 100).toFixed(0);
    chip.innerHTML = `
      <div class="odds-rate" style="color:${tier.color}">${pct}%</div>
      <div class="odds-label">${tier.name}</div>
    `;
    el.appendChild(chip);
  }
}

function renderTiers() {
  const el = document.getElementById("tier-list");
  el.innerHTML = "";
  for (const tier of TIERS) {
    const card = document.createElement("div");
    card.className = "tier-card" + (tier.featured ? " featured" : "");
    card.innerHTML = `
      <div class="tier-name">${tier.label}</div>
      <div class="tier-price">$${tier.price}</div>
      <div class="tier-pulls">1 card · ${tier.tagline}</div>
      <button class="tier-buy" data-tier="${tier.id}">Open Pack</button>
    `;
    el.appendChild(card);
  }

  el.querySelectorAll(".tier-buy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tier = TIERS.find((t) => t.id === btn.dataset.tier);
      openPack(tier);
    });
  });
}

function refreshBuyButtonsDisabled() {
  const soldOut = pulledSet.size >= window.TOTAL_CARDS;
  document.querySelectorAll(".tier-buy").forEach((btn) => {
    const tier = TIERS.find((t) => t.id === btn.dataset.tier);
    btn.disabled = soldOut || state.balance < tier.price;
    btn.textContent = soldOut ? "Sold Out" : "Open Pack";
  });
}

// ---------------------------------------------------------------------
// Rendering: collection (only pulled cards)
// ---------------------------------------------------------------------

function miniCardHTML(card) {
  return `
    <div class="mini-card" style="border-color:${card.glow}; box-shadow: 0 0 0 1px ${card.glow};">
      <div class="mini-id">#${String(card.id).padStart(4, "0")}</div>
      <div class="mini-rarity" style="color:${card.color}">${card.rarity}</div>
    </div>
  `;
}

function renderCollection() {
  const empty = document.getElementById("collection-empty");
  const grid = document.getElementById("collection-grid");
  const count = document.getElementById("collection-count");

  count.textContent = `${pulledSet.size.toLocaleString()} card${pulledSet.size === 1 ? "" : "s"} pulled`;

  if (pulledSet.size === 0) {
    empty.hidden = false;
    grid.hidden = true;
    grid.innerHTML = "";
    return;
  }

  empty.hidden = true;
  grid.hidden = false;

  const collected = window.CARD_INVENTORY.filter((c) => pulledSet.has(c.id)).sort(
    (a, b) => b.id - a.id
  );
  grid.innerHTML = collected.map(miniCardHTML).join("");
}

// ---------------------------------------------------------------------
// Rendering: full inventory (paginated, 5000 cards)
// ---------------------------------------------------------------------

function inventoryCardHTML(card) {
  const pulled = pulledSet.has(card.id);
  const style = pulled
    ? "opacity:0.35; filter:grayscale(0.6);"
    : `border-color:${card.glow}; box-shadow: 0 0 0 1px ${card.glow};`;
  return `
    <div class="mini-card" style="${style}" data-card-id="${card.id}">
      <div class="mini-id">#${String(card.id).padStart(4, "0")}</div>
      <div class="mini-rarity" style="color:${card.color}">${card.rarity}</div>
      ${pulled ? '<div style="font-size:0.6rem;color:#f87171;">PULLED</div>' : ""}
    </div>
  `;
}

function renderInventoryPage() {
  const grid = document.getElementById("inventory-grid");
  const start = inventoryRenderedCount;
  const end = Math.min(start + INVENTORY_PAGE_SIZE, window.TOTAL_CARDS);
  const slice = window.CARD_INVENTORY.slice(start, end);
  grid.insertAdjacentHTML("beforeend", slice.map(inventoryCardHTML).join(""));
  inventoryRenderedCount = end;

  const btn = document.getElementById("load-more-btn");
  btn.textContent =
    inventoryRenderedCount >= window.TOTAL_CARDS
      ? "All 5,000 cards loaded"
      : `Load more cards (${inventoryRenderedCount.toLocaleString()} / ${window.TOTAL_CARDS.toLocaleString()})`;
  btn.disabled = inventoryRenderedCount >= window.TOTAL_CARDS;
}

function renderInventoryReset() {
  document.getElementById("inventory-grid").innerHTML = "";
  inventoryRenderedCount = 0;
  renderInventoryPage();
}

function jumpToCard(id) {
  if (!id || id < 1 || id > window.TOTAL_CARDS) {
    showToast("Enter a card number between 1 and 5000.");
    return;
  }
  // Make sure that page of the inventory is rendered, then scroll to it.
  while (inventoryRenderedCount < id) {
    renderInventoryPage();
  }
  const el = document.querySelector(`.mini-card[data-card-id="${id}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.outline = "2px solid var(--accent)";
    setTimeout(() => (el.style.outline = ""), 1500);
  }
}

// ---------------------------------------------------------------------
// Reveal modal + toast
// ---------------------------------------------------------------------

function showReveal(card, tier, guaranteeMissed) {
  const overlay = document.getElementById("reveal-overlay");
  const grid = document.getElementById("reveal-grid");
  const title = document.getElementById("reveal-title");

  title.textContent = "You pulled a card!";

  grid.innerHTML = `
    <div class="reveal-card" style="background:${card.glow}; border-color:${card.color};">
      <div class="rc-id">#${String(card.id).padStart(4, "0")}</div>
      <div class="rc-name">${card.name}</div>
      <div class="rc-rarity" style="color:${card.color}">${card.rarity}</div>
    </div>
  `;

  if (guaranteeMissed) {
    grid.insertAdjacentHTML(
      "beforeend",
      `<div style="align-self:center;color:var(--text-dim);font-size:0.8rem;">
        The vault had no ${tier.minRarity}+ cards left to honor the
        ${tier.label} guarantee, so this pull came from the remaining
        pool instead.
      </div>`
    );
  }

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

document.getElementById("load-more-btn").addEventListener("click", renderInventoryPage);

document.getElementById("inventory-search").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    jumpToCard(parseInt(e.target.value, 10));
  }
});

function init() {
  renderTopbar();
  renderOdds();
  renderTiers();
  renderCollection();
  renderInventoryReset();
  refreshBuyButtonsDisabled();
}

init();
