/**
 * The full 5000-card inventory.
 *
 * Placeholder data only — swap `name`/`image` per card once real art and
 * card names are ready. IDs run 1-5000 and are permanent (used as the
 * inventory key), so keep them stable even if names/art change later.
 *
 * Rarity is derived from the id range so the whole 5000-card set is
 * generated instead of hand-written:
 *   1     - 4000  Common    (4000 cards, 80%)
 *   4001  - 4800  Rare      (800 cards, 16%)
 *   4801  - 4950  Epic      (150 cards, 3%)
 *   4951  - 5000  Legendary (50 cards, 1%)
 */

const RARITY_TIERS = [
  { name: "Legendary", min: 4951, max: 5000, color: "#f7c948", glow: "rgba(247, 201, 72, 0.55)" },
  { name: "Epic", min: 4801, max: 4950, color: "#c084fc", glow: "rgba(192, 132, 252, 0.5)" },
  { name: "Rare", min: 4001, max: 4800, color: "#60a5fa", glow: "rgba(96, 165, 250, 0.45)" },
  { name: "Common", min: 1, max: 4000, color: "#9ca3af", glow: "rgba(156, 163, 175, 0.35)" },
];

const TOTAL_CARDS = 5000;

function rarityForId(id) {
  return RARITY_TIERS.find((tier) => id >= tier.min && id <= tier.max);
}

function padId(id) {
  return String(id).padStart(4, "0");
}

function buildInventory() {
  const inventory = new Array(TOTAL_CARDS);
  for (let id = 1; id <= TOTAL_CARDS; id++) {
    const rarity = rarityForId(id);
    inventory[id - 1] = {
      id,
      name: `Card #${padId(id)}`,
      rarity: rarity.name,
      color: rarity.color,
      glow: rarity.glow,
      // Placeholder art: replace with a real image URL per card, e.g.
      // image: `/assets/cards/${id}.png`
      image: null,
    };
  }
  return inventory;
}

// Exposed globally for app.js (kept as plain <script> includes, no bundler).
window.CARD_INVENTORY = buildInventory();
window.RARITY_TIERS = RARITY_TIERS;
window.TOTAL_CARDS = TOTAL_CARDS;
