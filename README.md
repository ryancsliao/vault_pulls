# Vault Pulls

A simple "card pulling" storefront in the style of [courtyard.io](https://courtyard.io/),
split into a real frontend and backend:

- **`backend/`** — the authoritative 5,000-card inventory. It's the only
  place a card is ever marked "pulled." Zero dependencies, just Node's
  built-in `http`/`fs`.
- **`frontend/`** — static HTML/CSS/JS. It never holds the full card
  list; it only shows a small preview sample, single-card lookups, and
  its own pull results, all fetched from the backend over HTTP.

Paying more doesn't get you more cards — every price point buys exactly
one pull, and a higher price guarantees a better rarity floor for it.

## Running it

Two processes, in two terminals:

```bash
# Terminal 1 — the inventory backend (http://localhost:4000)
cd backend
npm start

# Terminal 2 — the frontend (http://localhost:8080)
cd frontend
python3 -m http.server 8080
```

Then open http://localhost:8080. If the frontend can't reach the
backend, it shows a banner telling you so instead of failing silently.

Want to look at the backend directly instead of the storefront? Open
http://localhost:4000/dashboard — a live table + bar-chart view of the
inventory (remaining by rarity, recent pulls, tier config), re-rendered
on every request and auto-refreshing every 5 seconds. Raw JSON is still
available at the `/api/*` routes below if you'd rather script against it.

Running the backend on a different host/port? Set `window.VAULT_API_BASE`
before `app.js` loads, e.g. add this above the `<script src="app.js">`
tag in `index.html`:

```html
<script>window.VAULT_API_BASE = "http://localhost:5000";</script>
```

## Why a backend at all

The whole point of a card-pulling site is that the inventory is real and
finite — once card #2481 is pulled, it has to actually be gone, for
everyone, not just in the browser that pulled it. A frontend-only version
can't guarantee that (two tabs, two different "vaults"). So:

- The backend holds the full 5,000-card array in memory and persists it
  to `backend/data/inventory-state.json` after every pull, so restarting
  the server doesn't restock the vault.
- The frontend deliberately never fetches all 5,000 cards. It shows:
  - **Card Preview** — a fixed sample of 32 cards (8 per rarity band),
    re-fetched after every pull so a previewed card dims the moment
    anyone pulls it.
  - **Look Up a Card** — ask the backend about any single card #1–5000
    on demand.
  - **Vault Activity** — the last 10 pulls the backend has recorded,
    from any visitor, proving the inventory is shared state, not
    per-browser.
- **My Collection** and your play-money **Balance** are the one thing
  that's intentionally per-browser (`localStorage`) — there's no login,
  so "who pulled what" is just a demo convenience, not part of the
  inventory itself.

## Backend API

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` (also `/`) | Human-readable HTML dashboard: stat tiles, a rarity bar chart, and tables of recent pulls + tiers |
| GET | `/api/stats` | Totals, remaining-by-rarity, pull odds, and tier config |
| GET | `/api/preview` | The fixed 32-card preview sample, with current `pulled` status |
| GET | `/api/card/:id` | A single card's status (`id` 1–5000) |
| GET | `/api/recent-pulls?limit=10` | Most recent pulls, newest first |
| POST | `/api/pull` | Body `{ "tierId": "small" \| "medium" \| "large" }` — pulls one card |
| POST | `/api/reset` | Demo-only: restocks the full vault |

`POST /api/pull` response:

```json
{
  "card": { "id": 3312, "name": "Card #3312", "rarity": "Rare", "pulled": true, "pulledAt": "…" },
  "tier": { "id": "medium", "price": 100, "label": "Rare+ Pull", "minRarity": "Rare", "tagline": "Guaranteed Rare or better" },
  "guaranteeMissed": false,
  "stats": { "total": 5000, "remaining": 4999, "pulledCount": 1, "remainingByRarity": { "...": "..." }, "pullWeights": { "...": "..." }, "tiers": [ "..." ] }
}
```

If a tier's guaranteed rarities are completely sold out, the pull falls
back to whatever's left in the vault instead of rejecting the purchase,
and `guaranteeMissed` is `true` so the frontend can say so.

## Pricing

| Price | Cards | Guarantee |
|---|---|---|
| $50 | 1 | Standard odds (any rarity) |
| $100 | 1 | Rare or better |
| $500 | 1 | Epic or better |

Base rarity odds (used by the $50 tier, and as the pool the higher tiers
re-roll within): `Common 70% · Rare 25% · Epic 4% · Legendary 1%`, over
rarity bands `1–4000` / `4001–4800` / `4801–4950` / `4951–5000`.

## Known limitations (this is a demo, not production)

- **In-memory + single JSON file** — fine for a demo, not a real
  concurrent-write-safe store. A production version would use a real
  database with transactional pulls.
- **No real payments.** Balance is fake play-money tracked in the
  browser; wire up a real payment processor before taking real money,
  and move balance/purchase validation server-side at the same time.
- **No auth.** Anyone hitting the backend can pull; "My Collection" is
  just what your browser remembers pulling, not an authenticated
  ownership record.
- **`POST /api/reset`** is a demo convenience with no access control — a
  real inventory service would never expose a way to restock itself.
