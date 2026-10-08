import { cached, latestRelease, latestTags, mergedPRs, npmVersions, eipIndex } from "./sources.js";

const ETH_CLIENTS = [
  ["go-ethereum", "execution", "ethereum/go-ethereum"], ["nethermind", "execution", "NethermindEth/nethermind"],
  ["besu", "execution", "besu-eth/besu"], ["erigon", "execution", "erigontech/erigon"], ["reth", "execution", "paradigmxyz/reth"],
  ["lighthouse", "consensus", "sigp/lighthouse"], ["prysm", "consensus", "OffchainLabs/prysm"], ["teku", "consensus", "Consensys-Incorporated/teku"],
  ["nimbus", "consensus", "status-im/nimbus-eth2"], ["lodestar", "consensus", "ChainSafe/lodestar"],
];
const AGENT_FRAMEWORKS = [
  ["OpenClaw", "openclaw/openclaw"], ["Model Context Protocol (spec)", "modelcontextprotocol/modelcontextprotocol"],
  ["LangGraph", "langchain-ai/langgraph"], ["CrewAI", "crewAIInc/crewAI"],
];
const X402_PACKAGES = ["@x402/core", "@x402/evm", "@x402/express", "@x402/fetch", "@x402/extensions", "@coinbase/x402"];

const stamp = (sources) => ({ generated_at: new Date().toISOString(), method: "read live from public GitHub/npm APIs, cached up to 6h; not rewritten by a model", sources });

export const PRODUCTS = [
  {
    path: "/ethereum/client-releases", price: "0.01",
    tags: ["ethereum", "client", "release", "node", "upgrade"],
    description: "Latest releases of the 10 main Ethereum clients as JSON: execution (go-ethereum, Nethermind, Besu, Erigon, Reth) and consensus (Lighthouse, Prysm, Teku, Nimbus, Lodestar). Version, date, days since release, link to notes, and a plain keyword flag when notes mention security or urgent upgrades.",
    build: () => cached("eth", async () => ({
      dataset: "ethereum-client-releases",
      clients: await Promise.all(ETH_CLIENTS.map(async ([client, layer, repo]) => ({ client, layer, ...(await latestRelease(repo)) }))),
      ...stamp(ETH_CLIENTS.map(([, , r]) => `https://github.com/${r}/releases`)),
    })),
  },
  {
    path: "/agents/framework-releases", price: "0.01",
    tags: ["ai-agent", "framework", "release", "mcp", "openclaw"],
    description: "Latest releases of AI agent frameworks and specs as JSON: OpenClaw, Model Context Protocol specification, LangGraph, CrewAI. Version, date, days since release and link to release notes, read live from GitHub.",
    build: () => cached("agents", async () => ({
      dataset: "agent-framework-releases",
      frameworks: await Promise.all(AGENT_FRAMEWORKS.map(async ([framework, repo]) => ({ framework, ...(await latestRelease(repo)) }))),
      ...stamp(AGENT_FRAMEWORKS.map(([, r]) => `https://github.com/${r}/releases`)),
    })),
  },
  {
    path: "/x402/protocol-updates", price: "0.01",
    tags: ["x402", "protocol", "coinbase", "agent-payments", "updates"],
    description: "x402 protocol updates as JSON: recently merged changes in the x402 Foundation repository (formerly coinbase/x402), latest tags, and current npm versions of the @x402 packages (core, evm, express, fetch, extensions) and @coinbase/x402. Read live from GitHub and npm, with links.",
    build: () => cached("x402", async () => ({
      dataset: "x402-protocol-updates",
      repo: "x402-foundation/x402",
      note: "The protocol repository moved from coinbase/x402 to the x402 Foundation (x402-foundation/x402).",
      recent_merged_changes: await mergedPRs("x402-foundation/x402", 15),
      latest_tags: await latestTags("x402-foundation/x402", 5),
      npm_packages: await npmVersions(X402_PACKAGES),
      ...stamp(["https://github.com/x402-foundation/x402", "https://registry.npmjs.org"]),
    })),
  },
  {
    path: "/ethereum/eips", price: "0.01",
    tags: ["ethereum", "eip", "status", "standards", "upgrade"],
    description: "Status of every Ethereum Improvement Proposal as JSON: number, title, status (living, final, last-call, review, draft, stagnant, withdrawn) and link, plus counts by status. Parsed live from eips.ethereum.org (EIPs are CC0).",
    build: () => cached("eips", async () => {
      const eips = await eipIndex();
      const by_status = eips.reduce((m, e) => ({ ...m, [e.status]: (m[e.status] || 0) + 1 }), {});
      return { dataset: "eip-status", count: eips.length, by_status, eips, ...stamp(["https://eips.ethereum.org/all"]) };
    }),
  },
];
