/**
 * Vault Pulls backend — the authoritative 5000-card inventory.
 *
 * Zero dependencies on purpose (just Node's built-in http/fs) so the demo
 * runs with nothing but `node server.js`. The frontend never holds the
 * full 5000-card list; it only ever sees a small preview slice, single
 * card lookups, and the outcome of its own pulls. This file is the only
 * place a card is ever marked pulled.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  TOTAL_CARDS,
  RARITY_ORDER,
  RARITY_RANGES,
  buildInventory,
  totalByRarity,
} = require("./inventory");
const { renderDashboard } = require("./dashboard");

const PORT = process.env.PORT || 4000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "inventory-state.json");

// Every price point buys exactly one pull; higher tiers guarantee a
// better rarity floor instead of more cards.
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

const PULL_WEIGHTS = { Common: 70, Rare: 25, Epic: 4, Legendary: 1 };

/** Round to the nearest cent — plain multiplication can land on e.g. 57.49999999999999. */
function roundMoney(amount) {
  return Math.round(amount * 100) / 100;
}

// Average market value per rarity, derived from pack pricing rather than
// hand-typed numbers. Common/Rare/Epic price at 65% of the tier that
// guarantees them; Legendary has no dedicated tier (it only ever shows
// up as a bonus pull from the $500 Epic+ tier), so it prices instead at
// 125% of that same top tier.
const RARITY_AVERAGE_PRICE = buildRarityAveragePrice();
function buildRarityAveragePrice() {
  const priceOf = (tierId) => TIERS.find((t) => t.id === tierId).price;
  return {
    Common: roundMoney(priceOf("small") * 0.65),
    Rare: roundMoney(priceOf("medium") * 0.65),
    Epic: roundMoney(priceOf("large") * 0.65),
    Legendary: roundMoney(priceOf("large") * 1.25),
  };
}

// A subset of cards within a rarity price above that rarity's average —
// "premium" cards, at 115% of the pack tier that guarantees their
// rarity. They're the lowest-numbered `count` ids in that rarity's band
// (same "first N of the band" convention PREVIEW_IDS below uses), so
// which cards are premium is fixed and reproducible rather than random.
const PREMIUM_RULES = [
  { rarity: "Common", tierId: "small", count: 1000 },
  { rarity: "Rare", tierId: "medium", count: 120 },
  { rarity: "Epic", tierId: "large", count: 22 },
];
const PREMIUM_PRICE_BY_ID = buildPremiumPriceById();
function buildPremiumPriceById() {
  const priceOf = (tierId) => TIERS.find((t) => t.id === tierId).price;
  const byId = new Map();
  for (const rule of PREMIUM_RULES) {
    const band = RARITY_RANGES.find((r) => r.name === rule.rarity);
    const price = roundMoney(priceOf(rule.tierId) * 1.15);
    for (let id = band.min; id < band.min + rule.count; id++) {
      byId.set(id, price);
    }
  }
  return byId;
}

/** Attach this card's price to it: premium override if it has one, else its rarity's average. */
function withAveragePrice(card) {
  const price = PREMIUM_PRICE_BY_ID.has(card.id)
    ? PREMIUM_PRICE_BY_ID.get(card.id)
    : RARITY_AVERAGE_PRICE[card.rarity];
  return { ...card, averagePrice: price, isPremium: PREMIUM_PRICE_BY_ID.has(card.id) };
}

// The frontend's "Card Preview" section shows only this fixed slice of
// the vault (8 ids from each rarity band) — never the full 5000. For a
// rarity with a premium subset, half the sample comes from inside that
// subset and half from just past it, so the preview doesn't imply every
// card of that rarity is premium-priced.
const PREVIEW_IDS = buildPreviewIds();
function buildPreviewIds() {
  const bands = [
    { name: "Legendary", from: 4951, to: 5000 },
    { name: "Epic", from: 4801, to: 4950 },
    { name: "Rare", from: 4001, to: 4800 },
    { name: "Common", from: 1, to: 4000 },
  ];
  const ids = [];
  for (const band of bands) {
    const premiumRule = PREMIUM_RULES.find((r) => r.rarity === band.name);
    if (premiumRule) {
      for (let i = 0; i < 4; i++) ids.push(band.from + i);
      for (let i = 0; i < 4; i++) ids.push(band.from + premiumRule.count + i);
    } else {
      for (let i = 0; i < 8; i++) ids.push(band.from + i);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------
// State: the full inventory, persisted to disk so a restart doesn't
// silently restock the vault.
// ---------------------------------------------------------------------

let inventory = loadState();
let recentPulls = []; // most-recent-first, capped

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      if (Array.isArray(raw) && raw.length === TOTAL_CARDS) return raw;
    }
  } catch (err) {
    console.warn("Could not read saved inventory state, starting fresh.", err.message);
  }
  return buildInventory();
}

function saveState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(inventory));
}

function resetInventory() {
  inventory = buildInventory();
  recentPulls = [];
  saveState();
}

// ---------------------------------------------------------------------
// Pull logic
// ---------------------------------------------------------------------

function remainingByRarity() {
  const buckets = { Common: [], Rare: [], Epic: [], Legendary: [] };
  for (const card of inventory) if (!card.pulled) buckets[card.rarity].push(card);
  return buckets;
}

function weightedRarityOrder(allowedRarities) {
  const entries = Object.entries(PULL_WEIGHTS).filter(([rarity]) => allowedRarities.includes(rarity));
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
  return [chosen, ...entries.map(([r]) => r).filter((r) => r !== chosen)];
}

function pullOneCard(buckets, allowedRarities) {
  for (const rarity of weightedRarityOrder(allowedRarities)) {
    const pool = buckets[rarity];
    if (pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      return pool[idx]; // reference into `inventory` — mutate in place
    }
  }
  return null; // nothing left among the allowed rarities
}

function pulledCount() {
  return inventory.filter((c) => c.pulled).length;
}

function statsPayload() {
  const buckets = remainingByRarity();
  return {
    total: TOTAL_CARDS,
    pulledCount: pulledCount(),
    remaining: TOTAL_CARDS - pulledCount(),
    remainingByRarity: {
      Common: buckets.Common.length,
      Rare: buckets.Rare.length,
      Epic: buckets.Epic.length,
      Legendary: buckets.Legendary.length,
    },
    totalByRarity: totalByRarity(),
    pullWeights: PULL_WEIGHTS,
    tiers: TIERS,
    rarityAveragePrice: RARITY_AVERAGE_PRICE,
    premiumByRarity: premiumSummary(),
  };
}

/** { Common: { count: 1000, price: 57.5 }, ... } — for display, not lookup (use PREMIUM_PRICE_BY_ID for that). */
function premiumSummary() {
  const priceOf = (tierId) => TIERS.find((t) => t.id === tierId).price;
  const summary = {};
  for (const rule of PREMIUM_RULES) {
    summary[rule.rarity] = { count: rule.count, price: roundMoney(priceOf(rule.tierId) * 1.15) };
  }
  return summary;
}

// ---------------------------------------------------------------------
// Tiny HTTP layer (no framework)
// ---------------------------------------------------------------------

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function sendHTML(res, status, html) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  try {
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
      const html = renderDashboard({
        stats: statsPayload(),
        recentPulls,
        generatedAt: new Date().toLocaleString(),
      });
      return sendHTML(res, 200, html);
    }

    if (req.method === "GET" && url.pathname === "/api/stats") {
      return sendJSON(res, 200, statsPayload());
    }

    if (req.method === "GET" && url.pathname === "/api/preview") {
      const cards = PREVIEW_IDS.map((id) => withAveragePrice(inventory[id - 1]));
      return sendJSON(res, 200, { cards });
    }

    if (req.method === "GET" && url.pathname === "/api/recent-pulls") {
      const limit = Math.min(Number(url.searchParams.get("limit")) || 10, 50);
      return sendJSON(res, 200, { pulls: recentPulls.slice(0, limit) });
    }

    const cardMatch = url.pathname.match(/^\/api\/card\/(\d+)$/);
    if (req.method === "GET" && cardMatch) {
      const id = Number(cardMatch[1]);
      if (!Number.isInteger(id) || id < 1 || id > TOTAL_CARDS) {
        return sendJSON(res, 400, { error: `Card id must be between 1 and ${TOTAL_CARDS}.` });
      }
      return sendJSON(res, 200, { card: withAveragePrice(inventory[id - 1]) });
    }

    if (req.method === "POST" && url.pathname === "/api/pull") {
      const body = await readBody(req).catch(() => null);
      if (body === null) return sendJSON(res, 400, { error: "Invalid JSON body." });

      const tier = TIERS.find((t) => t.id === body.tierId);
      if (!tier) return sendJSON(res, 400, { error: "Unknown pack tier." });

      if (pulledCount() >= TOTAL_CARDS) {
        return sendJSON(res, 409, { error: "The vault is empty — every card has been pulled." });
      }

      const buckets = remainingByRarity();
      const guaranteedRarities = RARITY_ORDER.slice(RARITY_ORDER.indexOf(tier.minRarity));

      let card = pullOneCard(buckets, guaranteedRarities);
      let guaranteeMissed = false;
      if (!card) {
        // Nothing left at/above the guarantee — pull from whatever
        // remains rather than refusing the sale.
        card = pullOneCard(buckets, RARITY_ORDER);
        guaranteeMissed = true;
      }
      if (!card) {
        return sendJSON(res, 409, { error: "The vault is empty — every card has been pulled." });
      }

      card.pulled = true;
      card.pulledAt = new Date().toISOString();
      saveState();

      const pricedCard = withAveragePrice(card);
      recentPulls.unshift({
        id: card.id,
        name: card.name,
        rarity: card.rarity,
        tierId: tier.id,
        pulledAt: card.pulledAt,
        averagePrice: pricedCard.averagePrice,
        isPremium: pricedCard.isPremium,
      });
      recentPulls = recentPulls.slice(0, 50);

      return sendJSON(res, 200, { card: pricedCard, tier, guaranteeMissed, stats: statsPayload() });
    }

    if (req.method === "POST" && url.pathname === "/api/reset") {
      // Demo-only convenience: restock the whole vault. A real inventory
      // service would never expose this.
      resetInventory();
      return sendJSON(res, 200, { ok: true, stats: statsPayload() });
    }

    return sendJSON(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Vault Pulls backend listening on http://localhost:${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`Inventory: ${TOTAL_CARDS - pulledCount()} / ${TOTAL_CARDS} cards remaining`);
});
