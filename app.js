// Aaron Zhang Data MCP: the datasets of PreIPO Feed, Bitcoin Technical Radar and Protocol Radar as paid MCP tools.
// Payment per tool call over x402 (USDC on Base) via @x402/mcp; each tool is listed in the x402 Bazaar as an MCP resource.
import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createPaymentWrapper, x402ResourceServer } from "@x402/mcp";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { declareDiscoveryExtension, bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { facilitator } from "@coinbase/x402";
import { PRODUCTS as PROTOCOL } from "./lib/protocol.js";
import { LIVE as BTC } from "./lib/btc-live.js";
import { card, compare, btcDigest } from "./lib/preipo.js";
import { RELATED } from "./lib/related.js";

const HOST = "https://aaron-zhang-mcp.vercel.app";
const PAY_TO = "0x4b5887B6E399C2E104becd01f7c406229c15891d";
const MAKER = { name: "Aaron Zhang", role: "independent developer", url: "https://farcaster.xyz/aaronzhang" };
const SERVICE_NAME = "Aaron Zhang Data MCP"; // <= 32 ASCII
const NETWORKS = (process.env.X402_NETWORKS || "eip155:84532").split(",");
const SUMMARY = "Paid MCP tools for AI agents: sourced fundamentals of OpenAI and Anthropic (revenue, funding, IPO status, side-by-side comparison), what changed in Bitcoin and Lightning, BIP and EIP status, Ethereum client and AI agent framework releases, x402 protocol updates. Pay per call in USDC over x402.";

const json = (data) => ({ content: [{ type: "text", text: JSON.stringify(data) }] });
const byPath = (list, path) => list.find((p) => p.path === path);

// One entry per tool. inputShape is a zod shape for the MCP SDK; inputJson mirrors it for Bazaar discovery.
const TOOLS = [
  { name: "preipo_company_card", price: "$0.01", tags: ["pre-ipo", "openai", "anthropic", "revenue", "valuation"],
    description: "Sourced fundamentals card for OpenAI or Anthropic: dataset 'financials' (revenue, run-rate, losses, compute, cash, users) or 'ipo' (filing status, timeline, valuation target, underwriters). Every figure has a source URL and verification grade.",
    inputShape: { company: z.enum(["openai", "anthropic"]), dataset: z.enum(["financials", "ipo"]) },
    inputJson: { properties: { company: { type: "string", enum: ["openai", "anthropic"] }, dataset: { type: "string", enum: ["financials", "ipo"] } }, required: ["company", "dataset"] },
    run: async ({ company, dataset }) => card(company, dataset) },
  { name: "openai_vs_anthropic", price: "$0.05", tags: ["openai", "anthropic", "comparison", "valuation", "revenue"],
    description: "OpenAI vs Anthropic side by side: full-year revenue, latest run-rate, last private round and post-money valuation, IPO status, compute obligations, cash, valuation-to-run-rate multiples; gaps listed. Each value keeps its source and grade.",
    inputShape: {}, inputJson: { properties: {} }, run: async () => compare() },
  { name: "bitcoin_technical_updates", price: "$0.01", tags: ["bitcoin", "lightning", "bitcoin-core", "bip", "protocol"],
    description: "What actually changed in Bitcoin and Lightning recently: each item has status (merged, released, activated, documentation), layer, why it matters, what has not happened yet, and the GitHub source.",
    inputShape: {}, inputJson: { properties: {} }, run: async () => btcDigest() },
  ...[["bitcoin_releases", "/bitcoin/releases", BTC], ["bitcoin_bips", "/bitcoin/bips", BTC],
      ["ethereum_client_releases", "/ethereum/client-releases", PROTOCOL], ["ethereum_eips", "/ethereum/eips", PROTOCOL],
      ["agent_framework_releases", "/agents/framework-releases", PROTOCOL], ["x402_protocol_updates", "/x402/protocol-updates", PROTOCOL]]
    .map(([name, path, list]) => { const p = byPath(list, path); return { name, price: `$${p.price}`, tags: p.tags, description: p.description, inputShape: {}, inputJson: { properties: {} }, run: () => p.build() }; }),
];

const facilitatorConfig = process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET
  ? { ...facilitator, timeoutMs: 15_000 } : { url: "https://x402.org/facilitator", timeoutMs: 15_000 };
const resourceServer = new x402ResourceServer(new HTTPFacilitatorClient(facilitatorConfig));
for (const n of NETWORKS) resourceServer.register(n, new ExactEvmScheme());
resourceServer.registerExtension(bazaarResourceServerExtension);

let wrappersPromise = null; // built once per instance (needs the facilitator's supported kinds)
async function wrappers() {
  if (!wrappersPromise) wrappersPromise = (async () => {
    await resourceServer.initialize();
    const out = {};
    for (const t of TOOLS) {
      const accepts = (await Promise.all(NETWORKS.map((network) =>
        resourceServer.buildPaymentRequirements({ scheme: "exact", network, payTo: PAY_TO, price: t.price })))).flat();
      out[t.name] = createPaymentWrapper(resourceServer, {
        accepts,
        resource: { url: `${HOST}/mcp#${t.name}`, description: t.description, mimeType: "application/json", serviceName: SERVICE_NAME, tags: t.tags, iconUrl: `${HOST}/icon.svg` },
        extensions: declareDiscoveryExtension({ toolName: t.name, description: t.description, transport: "streamable-http", inputSchema: t.inputJson }),
        hooks: { onAfterSettlement: async (ctx) => console.log(JSON.stringify({ event: "sale", tool: t.name, payer: ctx?.settlement?.payer, network: ctx?.settlement?.network, tx: ctx?.settlement?.transaction })) },
      });
    }
    return out;
  })().catch((e) => { wrappersPromise = null; throw e; });
  return wrappersPromise;
}

async function buildServer() {
  const paid = await wrappers();
  const server = new McpServer({ name: "aaron-zhang-data", version: "1.0.0" });
  for (const t of TOOLS) {
    server.tool(t.name, `${t.description} Costs ${t.price.replace("$", "")} USDC per call (x402).`, t.inputShape,
      paid[t.name](async (args) => json(await t.run(args))));
  }
  server.tool("list_datasets", "Free: list the paid tools in this server with prices, plus the HTTP services by the same developer.", {},
    async () => json({ tools: TOOLS.map(({ name, price, description }) => ({ name, price, description })), http_services: RELATED, maker: MAKER }));
  return server;
}

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));
app.post("/mcp", async (req, res) => {
  try {
    const server = await buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null });
  }
});
app.get("/mcp", (req, res) => res.status(405).set("Allow", "POST").send({ error: "Use POST with MCP streamable HTTP (stateless). See /llms.txt." }));

app.get("/", (req, res) => res.send({ service: "Aaron Zhang Data MCP", maker: MAKER, what: SUMMARY, mcp_endpoint: `${HOST}/mcp`, transport: "streamable-http (stateless)",
  tools: TOOLS.map(({ name, price }) => ({ name, price })), free_tools: ["list_datasets"], related_services: RELATED,
  discovery: ["/llms.txt", "/.well-known/x402", "/agents.json"] }));
app.get("/llms.txt", (req, res) => res.type("text/plain").send(`# Aaron Zhang Data MCP

> ${SUMMARY}

Built and maintained by ${MAKER.name}, an ${MAKER.role}. Contact: ${MAKER.url}

## Connect
MCP endpoint: ${HOST}/mcp (streamable HTTP, stateless). Paid tools return a payment requirement; an x402-capable MCP client (e.g. @x402/mcp) pays in USDC on Base and retries. \`list_datasets\` is free.

## Tools
${TOOLS.map((t) => `- ${t.name} (${t.price.replace("$", "")} USDC): ${t.description}`).join("\n")}

## Same data over plain HTTP
${RELATED.map((r) => `- [${r.name}](${r.url}/llms.txt): ${r.what}`).join("\n")}

Not investment advice.
`));
app.get("/.well-known/x402", (req, res) => res.send({ x402Version: 2, service: "Aaron Zhang Data MCP", serviceName: SERVICE_NAME, maker: MAKER, description: SUMMARY,
  docs: `${HOST}/llms.txt`, payTo: PAY_TO, mcp: { endpoint: `${HOST}/mcp`, transport: "streamable-http" },
  resources: TOOLS.map((t) => ({ resource: `${HOST}/mcp#${t.name}`, type: "mcp", toolName: t.name, description: t.description, priceUsd: Number(t.price.replace("$", "")), networks: NETWORKS, tags: t.tags })),
  related_services: RELATED }));
app.get("/agents.json", (req, res) => res.send({ name: "Aaron Zhang Data MCP", description: SUMMARY, provider: MAKER, url: HOST,
  mcp: { endpoint: `${HOST}/mcp`, transport: "streamable-http" }, auth: { type: "x402", networks: NETWORKS, asset: "USDC", payTo: PAY_TO },
  capabilities: TOOLS.map((t) => ({ id: t.name, description: t.description, priceUsd: Number(t.price.replace("$", "")), tags: t.tags })), related_services: RELATED }));
app.get("/icon.svg", (req, res) => res.type("image/svg+xml").send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#14112b"/><text x="32" y="41" font-family="Helvetica,Arial,sans-serif" font-size="20" font-weight="700" fill="#a78bfa" text-anchor="middle">MCP</text></svg>`));
app.get("/robots.txt", (req, res) => res.type("text/plain").send(`User-agent: *\nAllow: /\n\n# Agents: start at ${HOST}/llms.txt\n`));

export { TOOLS };
export default app;
if (!process.env.VERCEL) app.listen(4026, () => console.log("http://localhost:4026/mcp"));
