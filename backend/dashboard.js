/**
 * A server-rendered HTML dashboard for the inventory backend — a table +
 * bar chart view of the same data /api/stats and /api/recent-pulls
 * expose as JSON, for when a human wants to look at it directly instead
 * of curling the API. No client-side framework, no build step: this
 * function returns a complete HTML page as a string, re-rendered fresh
 * on every request straight from the live `inventory` array.
 */

const RARITY_COLORS = {
  Common: "#9ca6ad",
  Rare: "#6f95ac",
  Epic: "#a685b8",
  Legendary: "#d4af5f",
};
const RARITY_ORDER = ["Legendary", "Epic", "Rare", "Common"];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function formatMoney(amount) {
  return `$${Number(amount).toFixed(2)}`;
}

function barRow(rarity, remaining, total, avgPrice) {
  const pulled = total - remaining;
  const pulledPct = total === 0 ? 0 : (pulled / total) * 100;
  const color = RARITY_COLORS[rarity];
  return `
    <div class="bar-row">
      <div class="bar-label">
        <span class="dot" style="background:${color}"></span>${rarity}
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pulledPct.toFixed(1)}%; background:${color}"></div>
      </div>
      <div class="bar-figures">${remaining.toLocaleString()} / ${total.toLocaleString()} left</div>
      <div class="bar-price">avg ${formatMoney(avgPrice)}</div>
    </div>
  `;
}

function recentPullsRows(recentPulls) {
  if (recentPulls.length === 0) {
    return `<tr><td colspan="5" class="empty-cell">No pulls recorded yet.</td></tr>`;
  }
  return recentPulls
    .map(
      (p) => `
      <tr>
        <td class="mono">#${String(p.id).padStart(4, "0")}</td>
        <td><span class="chip" style="color:${RARITY_COLORS[p.rarity]}">${p.rarity}</span></td>
        <td class="mono">${formatMoney(p.averagePrice)}</td>
        <td class="mono">${escapeHtml(p.tierId)}</td>
        <td class="mono dim">${formatTime(p.pulledAt)}</td>
      </tr>
    `
    )
    .join("");
}

function tierRows(tiers) {
  return tiers
    .map(
      (t) => `
      <tr>
        <td>${escapeHtml(t.label)}</td>
        <td class="mono">$${t.price}</td>
        <td><span class="chip" style="color:${RARITY_COLORS[t.minRarity]}">${t.minRarity}+</span></td>
        <td class="dim">${escapeHtml(t.tagline)}</td>
      </tr>
    `
    )
    .join("");
}

function renderDashboard({ stats, recentPulls, generatedAt }) {
  const pulledPct = stats.total === 0 ? 0 : ((stats.pulledCount / stats.total) * 100).toFixed(1);

  const bars = RARITY_ORDER.map((rarity) =>
    barRow(rarity, stats.remainingByRarity[rarity], stats.totalByRarity[rarity], stats.rarityAveragePrice[rarity])
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="refresh" content="5" />
<title>Vault Pulls — Backend Dashboard</title>
<style>
  :root {
    --ground: #0e1113;
    --surface: #171b1e;
    --surface-raised: #1e2327;
    --line: #2a3136;
    --ink: #ecefed;
    --ink-dim: #98a2a5;
    --ink-faint: #5e6668;
    --brass: #c9a256;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font-family: -apple-system, "Segoe UI", sans-serif;
    line-height: 1.5;
    padding: 32px 24px 60px;
  }
  .wrap { max-width: 920px; margin: 0 auto; }
  .mono { font-family: ui-monospace, "SF Mono", Consolas, monospace; }
  .dim { color: var(--ink-dim); }

  header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; flex-wrap: wrap; gap: 8px; }
  h1 { font-size: 1.5rem; margin: 0; }
  .subtitle { color: var(--ink-dim); font-size: 0.85rem; margin-bottom: 32px; }
  .subtitle a { color: var(--brass); }

  .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 36px; }
  .stat-tile { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; }
  .stat-tile .label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-faint); margin-bottom: 6px; }
  .stat-tile .value { font-size: 1.6rem; font-weight: 700; font-variant-numeric: tabular-nums; }

  section { margin-bottom: 36px; }
  h2 { font-size: 1.05rem; margin: 0 0 14px; }
  .section-note { color: var(--ink-dim); font-size: 0.8rem; margin: -6px 0 16px; max-width: 62ch; }

  .bar-row { display: grid; grid-template-columns: 110px 1fr 155px 90px; align-items: center; gap: 12px; margin-bottom: 10px; }
  .bar-label { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
  .bar-track { background: var(--surface-raised); border: 1px solid var(--line); border-radius: 999px; height: 14px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 999px 0 0 999px; }
  .bar-figures { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 0.78rem; color: var(--ink-dim); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .bar-price { font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 0.78rem; color: var(--brass); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

  table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 14px; font-size: 0.85rem; border-bottom: 1px solid var(--line); }
  th { color: var(--ink-faint); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  .empty-cell { color: var(--ink-faint); text-align: center; padding: 20px; }
  .chip { font-size: 0.78rem; font-weight: 600; }

  footer { color: var(--ink-faint); font-size: 0.78rem; text-align: center; margin-top: 40px; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Vault Pulls — Backend Dashboard</h1>
    </header>
    <div class="subtitle">
      Rendered straight from the live inventory on every request &middot;
      auto-refreshes every 5s &middot; raw JSON at
      <a href="/api/stats">/api/stats</a>
    </div>

    <div class="stat-row">
      <div class="stat-tile">
        <div class="label">Total cards</div>
        <div class="value">${stats.total.toLocaleString()}</div>
      </div>
      <div class="stat-tile">
        <div class="label">Remaining</div>
        <div class="value">${stats.remaining.toLocaleString()}</div>
      </div>
      <div class="stat-tile">
        <div class="label">Pulled</div>
        <div class="value">${stats.pulledCount.toLocaleString()}</div>
      </div>
      <div class="stat-tile">
        <div class="label">% Pulled</div>
        <div class="value">${pulledPct}%</div>
      </div>
    </div>

    <section>
      <h2>Inventory by rarity</h2>
      <p class="section-note">
        Avg value = 65% of the pack tier that guarantees each rarity
        (Common → $50 tier, Rare → $100 tier, Epic → $500 tier);
        Legendary has no tier of its own, so it prices at 125% of the
        $500 tier instead.
      </p>
      ${bars}
    </section>

    <section>
      <h2>Recent pulls</h2>
      <table>
        <thead>
          <tr><th>Card</th><th>Rarity</th><th>Value</th><th>Tier</th><th>Pulled at</th></tr>
        </thead>
        <tbody>${recentPullsRows(recentPulls)}</tbody>
      </table>
    </section>

    <section>
      <h2>Pack tiers</h2>
      <table>
        <thead>
          <tr><th>Tier</th><th>Price</th><th>Guarantee</th><th>Tagline</th></tr>
        </thead>
        <tbody>${tierRows(stats.tiers)}</tbody>
      </table>
    </section>

    <footer>Generated ${escapeHtml(generatedAt)}</footer>
  </div>
</body>
</html>`;
}

module.exports = { renderDashboard };
