import { cached, latestRelease, latestTags, bipIndex } from "./sources.js";

const IMPLS = [["Bitcoin Core", "bitcoin/bitcoin", "release"], ["LND", "lightningnetwork/lnd", "release"],
  ["Core Lightning", "ElementsProject/lightning", "release"], ["Eclair", "ACINQ/eclair", "release"], ["LDK", "lightningdevkit/rust-lightning", "tag"]];
const stamp = (sources) => ({ generated_at: new Date().toISOString(), method: "read live from public GitHub, cached up to 6h; not rewritten by a model", sources });

export const LIVE = [
  {
    path: "/bitcoin/releases", price: "0.01", tags: ["bitcoin", "lightning", "release", "bitcoin-core", "security"],
    description: "Latest releases of Bitcoin Core and the Lightning implementations (LND, Core Lightning, Eclair, LDK) as JSON: version, date, days since release, link to notes, and a plain keyword flag when notes mention security fixes. Read live from GitHub.",
    build: () => cached("releases", async () => ({
      dataset: "bitcoin-lightning-releases",
      implementations: await Promise.all(IMPLS.map(async ([impl, repo, kind]) =>
        kind === "release" ? { implementation: impl, ...(await latestRelease(repo)) }
          : { implementation: impl, repo, latest_tags: await latestTags(repo, 3), note: "This project publishes tags rather than GitHub releases." })),
      ...stamp(IMPLS.map(([, r]) => `https://github.com/${r}`)),
    })),
  },
  {
    path: "/bitcoin/bips", price: "0.01", tags: ["bitcoin", "bip", "status", "soft-fork", "standards"],
    description: "Status of every Bitcoin Improvement Proposal as JSON: number, layer (consensus soft fork, peer services, applications), title, type and status (Draft, Complete, Deployed, Closed...), with links. Parsed live from the bitcoin/bips repository index, plus counts by status.",
    build: () => cached("bips", async () => {
      const bips = await bipIndex();
      const by_status = bips.reduce((m, b) => ({ ...m, [b.status]: (m[b.status] || 0) + 1 }), {});
      return { dataset: "bip-status", count: bips.length, by_status, bips, ...stamp(["https://github.com/bitcoin/bips/blob/master/README.mediawiki"]) };
    }),
  },
];
