// PreIPO data for MCP tools: the verified cards are public in aaron-recompile/preipo-feed; read them from GitHub
// and build the same derived views the HTTP service sells. No new figures are introduced here.
import { cached } from "./sources.js";

const RAW = "https://raw.githubusercontent.com/aaron-recompile/preipo-feed/main/data";
const FILES = { "openai/financials": "openai.json", "openai/ipo": "openai-ipo.json", "anthropic/financials": "anthropic.json", "anthropic/ipo": "anthropic-ipo.json" };

async function loadCards() {
  return cached("preipo-cards", async () => {
    const entries = await Promise.all(Object.entries(FILES).map(async ([key, file]) => {
      const r = await fetch(`${RAW}/${file}`, { signal: AbortSignal.timeout(15_000) });
      if (!r.ok) throw new Error(`${r.status} ${file}`);
      return [key, await r.json()];
    }));
    return { cards: Object.fromEntries(entries) };
  });
}

export async function card(company, dataset) {
  const { cards } = await loadCards();
  const c = cards[`${company}/${dataset}`];
  if (!c) throw new Error(`no card for ${company}/${dataset}`);
  return c;
}

const metric = (cards, company, id) => {
  for (const [key, c] of Object.entries(cards)) {
    if (!key.startsWith(company + "/")) continue;
    const m = c.metrics.find((x) => x.id === id);
    if (m) return { value: m.value, value_type: m.value_type, period: m.period, verification: m.verification, label: m.label, source: m.source ? c.sources[m.source] : undefined };
  }
  return null;
};

export async function compare() {
  const { cards } = await loadCards();
  const pick = (co, ids) => Object.fromEntries(Object.entries(ids).map(([k, id]) => [k, id ? metric(cards, co, id) : null]));
  const openai = pick("openai", { revenue_full_year_2025: "revenue_fy2025", latest_run_rate: "revenue_run_rate_annualized_reported_2026_08",
    last_private_post_money: "last_private_post_money_2026_03", last_private_round_size: "last_private_round_size_2026_03",
    ipo_valuation_target_high: null, compute_obligations: null, cash_and_investments_ye2025: null });
  const anthropic = pick("anthropic", { revenue_full_year_2025: "revenue_fy2025", latest_run_rate: "run_rate_revenue_2026_05",
    last_private_post_money: "last_private_post_money_2026_05", last_private_round_size: "last_private_round_size_2026_05",
    ipo_valuation_target_high: "ipo_valuation_target_high", compute_obligations: "compute_infra_obligations",
    cash_and_investments_ye2025: "cash_equiv_and_st_investments_ye2025" });
  const ratio = (n, d) => (n && d ? Math.round((n.value / d.value) * 10) / 10 : null);
  return {
    dataset: "openai-vs-anthropic", generated_at: new Date().toISOString(), openai, anthropic,
    derived: { openai_post_money_to_run_rate_at_most: ratio(openai.last_private_post_money, openai.latest_run_rate),
      anthropic_post_money_to_run_rate_at_most: ratio(anthropic.last_private_post_money, anthropic.latest_run_rate) },
    ipo_status: { openai: cards["openai/ipo"].ipo_status ?? null, anthropic: cards["anthropic/ipo"].ipo_status ?? null },
    gaps: Object.entries({ openai, anthropic }).flatMap(([co, s]) => Object.entries(s).filter(([, v]) => !v).map(([k]) => `${co}.${k}: no verified public figure yet`)),
    caveat: "Companies report revenue and run-rate on their own definitions and dates; compare periods and value types first.",
    disclaimer: "Factual figures compiled from public reporting, each with source and verification grade. Not investment advice.",
  };
}

export async function btcDigest() {
  return cached("btc-digest", async () => {
    const r = await fetch("https://raw.githubusercontent.com/aaron-recompile/btc-radar/main/data/digest.json", { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`${r.status} digest`);
    return r.json();
  });
}
