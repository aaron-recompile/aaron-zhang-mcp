// Test client: call one paid MCP tool, paying on the given network only.
// node --env-file=~/x402-lab/.env scripts/buy-mcp.mjs <endpoint> <tool> <network> [jsonArgs]
import { createx402MCPClient } from "@x402/mcp";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
const [endpoint, tool, network, args = "{}"] = process.argv.slice(2);
const client = createx402MCPClient({ name: "aaron-test-buyer", version: "1.0.0",
  schemes: [{ network, client: new ExactEvmScheme(privateKeyToAccount(process.env.PRIVATE_KEY)) }],
  policies: [(_v, reqs) => reqs.filter((r) => r.network === network && BigInt(r.amount ?? "0") <= 100000n)],
  autoPayment: true, onPaymentRequested: async () => true });
await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
const res = await client.callTool(tool, JSON.parse(args));
const text = res.content?.[0]?.text || "";
console.log("payment:", JSON.stringify(res.paymentResponse || res._meta || {}).slice(0, 300));
console.log("data:", text.slice(0, 300));
await client.close();
