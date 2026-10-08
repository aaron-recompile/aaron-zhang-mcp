// On-chain pre-IPO perps (Hyperliquid HIP-3, EntropyIO "io" dex) vs the last private round, read live at request time.
// Deterministic: no model in the loop. The perp side is the market's live bet; the private side comes from the verified cards.
const HL = "https://api.hyperliquid.xyz/info";
const TTL_MS = 60_000;
let cache = null;

// Contracts whose price is quoted as implied company valuation: $1 of price = $1B of valuation.
export const UNIT_SOURCES = [
  { publisher: "Entropy Guides", url: "https://entropyguides.com/guides/trading/anthropic-pre-ipo-perp", note: "price is implied market cap in $B, cash-settled perp" },
  { publisher: "Alea Research", url: "https://alearesearch.substack.com/p/entropy-pricing-private-markets" },
  { publisher: "RedStone", url: "https://blog.redstone.finance/2026/08/24/redstone-live-powers-entropy-pre-ipo-and-rwa-markets-on-hyperliquid/", note: "oracle provider for Entropy pre-IPO markets" },
];
export const PAIRS = [
  { asset: "io:OAI", company: "OpenAI" },
  { asset: "io:ANTH", company: "Anthropic" },
];

async function post(body) {
  const r = await fetch(HL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`hyperliquid ${r.status}`);
  return r.json();
}

export async function ioMarkets() {
  if (cache && Date.now() - cache.at < TTL_MS) return { ...cache.data, cache: "fresh" };
  try {
    const [meta, ctxs] = await post({ type: "metaAndAssetCtxs", dex: "io" });
    const byAsset = Object.fromEntries(meta.universe.map((a, i) => [a.name, { ...ctxs[i], maxLeverage: a.maxLeverage, isDelisted: !!a.isDelisted }]));
    const data = { received_at: new Date().toISOString(), byAsset };
    cache = { at: Date.now(), data };
    return { ...data, cache: "refreshed" };
  } catch (e) {
    if (cache) return { ...cache.data, cache: "stale_fallback", upstream_error: String(e.message).slice(0, 120) };
    throw e;
  }
}

const num = (x) => (x === null || x === undefined ? null : Number(x));
const pct = (a, b) => (a && b ? Math.round((a / b - 1) * 1000) / 10 : null);

// metric(company, id) is the card lookup from app.js, passed in so values keep their source and grade.
export async function onchainVsPrivate(metric) {
  const m = await ioMarkets();
  const rows = PAIRS.map(({ asset, company }) => {
    const c = m.byAsset[asset];
    const privateRound = metric(company, company === "OpenAI" ? "last_private_post_money_2026_03" : "last_private_post_money_2026_05");
    const ipoLow = metric(company, "ipo_valuation_target_low");
    const ipoHigh = metric(company, "ipo_valuation_target_high");
    if (!c) return { company, asset, listed: false, private_last_round: privateRound };
    const mark = num(c.markPx), oracle = num(c.oraclePx), prev = num(c.prevDayPx), oi = num(c.openInterest), funding = num(c.funding);
    const implied = mark * 1e9;
    return {
      company, asset, listed: !c.isDelisted,
      perp: {
        mark_px: mark, oracle_px: oracle, mid_px: num(c.midPx), prev_day_px: prev,
        change_24h_pct: pct(mark, prev),
        implied_valuation_usd: implied, oracle_implied_valuation_usd: oracle ? oracle * 1e9 : null,
        mark_vs_oracle_pct: pct(mark, oracle),
        open_interest_contracts: oi, open_interest_usd: oi && mark ? Math.round(oi * mark) : null,
        volume_24h_usd: num(c.dayNtlVlm) !== null ? Math.round(num(c.dayNtlVlm)) : null,
        funding_rate_hourly: funding, funding_rate_annualized_pct: funding !== null ? Math.round(funding * 24 * 365 * 10000) / 100 : null,
        max_leverage: c.maxLeverage,
      },
      private_last_round: privateRound,
      ipo_valuation_target: { low: ipoLow, high: ipoHigh },
      derived: {
        perp_vs_last_private_pct: privateRound ? pct(implied, privateRound.value) : null,
        perp_vs_ipo_target_low_pct: ipoLow ? pct(implied, ipoLow.value) : null,
        perp_vs_ipo_target_high_pct: ipoHigh ? pct(implied, ipoHigh.value) : null,
        note: "positive = the perp prices the company above that private anchor",
      },
    };
  });
  return {
    dataset: "onchain-preipo-vs-private", generated_at: new Date().toISOString(),
    perp_received_at: m.received_at, perp_cache: m.cache, ...(m.upstream_error ? { upstream_error: m.upstream_error } : {}),
    method: "Live Hyperliquid HIP-3 'io' dex context (POST api.hyperliquid.xyz/info metaAndAssetCtxs) converted at $1 of price = $1B of implied valuation, set against the last private post-money and IPO valuation target from this feed's verified cards. No model in the loop.",
    unit_convention: { rule: "implied_valuation_usd = mark_px * 1e9", verification: "secondary", sources: UNIT_SOURCES },
    companies: rows,
    caveats: [
      "A perp is a cash-settled bet on implied valuation, not equity; thin books and the oracle design can keep it away from where shares would trade.",
      "Last private round is a past, negotiated price with preferences attached; it is a stale anchor, not a mark.",
      "Funding shows which side pays to hold the position: positive means longs pay shorts.",
    ],
    disclaimer: "Factual market and public-reporting data. Not investment advice.",
  };
}
