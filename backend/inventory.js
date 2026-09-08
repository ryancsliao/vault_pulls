/**
 * The vault's card model and the one place that generates the full
 * 5000-card inventory. This module has no knowledge of HTTP — it's pure
 * data shape, kept separate so server.js stays about routing/state.
 */

const RARITY_RANGES = [
  { name: "Legendary", min: 4951, max: 5000 },
  { name: "Epic", min: 4801, max: 4950 },
  { name: "Rare", min: 4001, max: 4800 },
  { name: "Common", min: 1, max: 4000 },
];

const TOTAL_CARDS = 5000;
const RARITY_ORDER = ["Common", "Rare", "Epic", "Legendary"];

function padId(id) {
  return String(id).padStart(4, "0");
}

function rarityForId(id) {
  return RARITY_RANGES.find((r) => id >= r.min && id <= r.max).name;
}

/** Fresh inventory: all 5000 cards, none pulled yet. */
function buildInventory() {
  const inventory = new Array(TOTAL_CARDS);
  for (let id = 1; id <= TOTAL_CARDS; id++) {
    inventory[id - 1] = {
      id,
      name: `Card #${padId(id)}`,
      rarity: rarityForId(id),
      pulled: false,
      pulledAt: null,
    };
  }
  return inventory;
}

module.exports = {
  TOTAL_CARDS,
  RARITY_ORDER,
  RARITY_RANGES,
  buildInventory,
  padId,
  rarityForId,
};
