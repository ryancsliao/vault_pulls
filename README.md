# Vault Pulls

A simple, single-pack "card pulling" storefront in the style of
[courtyard.io](https://courtyard.io/) — pay a fixed price, pull one random
card drawn from a finite inventory. Paying more doesn't get you more
cards, it gets you a better guaranteed rarity floor.

Pure static HTML/CSS/JS, no build step, no dependencies. Open
`index.html` in a browser, or serve the folder:

```bash
cd card-pulling-site
python3 -m http.server 8080
# then visit http://localhost:8080
```

## What's here

- **One pack**: "The Vault Pack" — the only product sold.
- **Three price points, one card each**:
  | Price | Cards per pull | Guarantee |
  |-------|-----------------|-----------|
  | $50   | 1 card | Standard odds (any rarity) |
  | $100  | 1 card | Rare or better |
  | $500  | 1 card | Epic or better |
- **5,000-card inventory**, `cards.js` generates placeholders `Card #0001`
  through `Card #5000`, each assigned a rarity by id range:
  - `1–4000` Common (80%)
  - `4001–4800` Rare (16%)
  - `4801–4950` Epic (3%)
  - `4951–5000` Legendary (1%)

  The $50 pull is weighted across all four rarities by those
  percentages. The $100 and $500 pulls re-roll only among the rarities
  their tier guarantees (Rare+ or Epic+), weighted the same way among
  just those. Each card can only be pulled once — pulling depletes the
  shared inventory until all 5,000 are gone ("Sold Out"), and if a
  tier's guaranteed rarities happen to be fully sold out, that pull
  falls back to whatever's left rather than refusing the sale.
- **My Collection** section showing the cards you've personally pulled.
- **Full Vault Inventory** browser (paginated, 5,000 cards) so you can see
  the whole pool and which cards are already gone. There's a "jump to
  card #" box to find a specific card.
- A play-money balance (`$1,000` to start) so you can test buying without
  a real payment flow.

## Swapping in real cards

Everything about a card lives in `cards.js`. Replace the placeholder
generator with your real data, e.g.:

```js
window.CARD_INVENTORY = [
  { id: 1, name: "Blue Dragon", rarity: "Legendary", color: "#f7c948", glow: "...", image: "/assets/cards/1.png" },
  // ...
];
```

Keep `id` stable (1–5000) since it's used as the inventory key in
`localStorage`.

## Known limitations (this is a demo, not production)

- **State is per-browser**, stored in `localStorage`
  (`vault-pulls-state-v2`). Two different browsers/devices each see a
  full, un-pulled 5,000-card vault — the inventory isn't actually shared
  globally. A real version needs a backend (database + server-side RNG)
  so the pool and each customer's balance/collection are authoritative
  and shared.
- **No real payments.** The balance is fake play-money for demo
  purposes; wire up a real payment processor (Stripe, etc.) before
  taking real money.
- **No auth.** Anyone opening the page is "you"; there's no login or
  per-account collection beyond the browser's local storage.
