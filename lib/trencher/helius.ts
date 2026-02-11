import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { normalizeImageUrl } from "@/lib/utils";
const LOW_CREDIT_MODE = /^(1|true|yes)$/i.test(process.env.SMART_LOW_CREDIT_MODE || "");
const HOLDER_STATS_TTL_MS = Number(
  process.env.HOLDER_STATS_TTL_MS || (LOW_CREDIT_MODE ? `${60 * 60 * 1000}` : `${15 * 60 * 1000}`),
);
const HOLDER_COUNT_MAX_PAGES = Number(process.env.HOLDER_COUNT_MAX_PAGES || (LOW_CREDIT_MODE ? "1" : "3"));
const holderStatsCache = new Map<
  string,
  {
    at: number;
    data: { holderCount: number | null; top10Pct: number | null; topHolders: { wallet: string; pct: number }[] };
  }
>();
const assetMetaCache = new Map<
  string,
  {
    at: number;
    data: { name: string | null; symbol: string | null; image: string | null; website: string | null; twitter: string | null; telegram: string | null };
  }
>();
const ASSET_META_TTL_MS = Number(process.env.ASSET_META_TTL_MS || `${60 * 60 * 1000}`);

export function getConnection() {
  const rpcUrl =
    process.env.RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : "https://api.mainnet-beta.solana.com");
  return new Connection(rpcUrl, "confirmed");
}

export async function getHolderStats(mint: string): Promise<{
  holderCount: number | null;
  top10Pct: number | null;
  topHolders: { wallet: string; pct: number }[];
}> {
  const cached = holderStatsCache.get(mint);
  if (cached && Date.now() - cached.at < HOLDER_STATS_TTL_MS) {
    return cached.data;
  }
  try {
    const conn = getConnection();
    const [largest, supply] = await Promise.all([
      conn.getTokenLargestAccounts(new PublicKey(mint)),
      conn.getTokenSupply(new PublicKey(mint)),
    ]);

    const total = supply.value.uiAmount || 0;
    if (!total) return { holderCount: null, top10Pct: null, topHolders: [] };

    const top = largest.value.slice(0, 10);
    const topHolders = top.map((x) => ({
      wallet: x.address.toBase58(),
      pct: ((x.uiAmount || 0) / total) * 100,
    }));
    const top10Pct = topHolders.reduce((acc, x) => acc + x.pct, 0);

    const apiKey = process.env.HELIUS_API_KEY;
    let holderCount: number | null = null;
    if (apiKey) {
      try {
        const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
        let page = 1;
        const limit = 1000;
        const owners = new Set<string>();
        while (page <= HOLDER_COUNT_MAX_PAGES) {
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: `holders-${page}`,
              method: "getTokenAccounts",
              params: { mint, page, limit },
            }),
          });
          if (!res.ok) break;
          const json = await res.json();
          const accounts = json?.result?.token_accounts || [];
          for (const account of accounts) {
            if (account?.owner) owners.add(account.owner);
          }
          if (accounts.length < limit) break;
          page += 1;
        }
        if (owners.size > 0) holderCount = owners.size;
      } catch {
        // ignore
      }
    }

    const out = { holderCount, top10Pct, topHolders };
    holderStatsCache.set(mint, { at: Date.now(), data: out });
    return out;
  } catch {
    return { holderCount: null, top10Pct: null, topHolders: [] };
  }
}

export async function getWalletAgeDays(wallet: string): Promise<number | null> {
  try {
    const conn = getConnection();
    const pubkey = new PublicKey(wallet);
    let before: string | undefined;
    let oldest: number | null = null;

    for (let i = 0; i < 10; i += 1) {
      const sigs = await conn.getSignaturesForAddress(pubkey, { limit: 1000, before });
      if (sigs.length === 0) break;
      const tail = sigs[sigs.length - 1];
      if (tail.blockTime) {
        oldest = tail.blockTime;
      }
      before = tail.signature;
      if (sigs.length < 1000) break;
    }

    if (!oldest) return null;
    const ageDays = (Date.now() / 1000 - oldest) / (24 * 3600);
    return ageDays;
  } catch {
    return null;
  }
}

export async function getSolBalance(wallet: string): Promise<number | null> {
  try {
    const conn = getConnection();
    const lamports = await conn.getBalance(new PublicKey(wallet));
    return lamports / LAMPORTS_PER_SOL;
  } catch {
    return null;
  }
}

export async function getAssetMetadata(mint: string): Promise<{
  name: string | null;
  symbol: string | null;
  image: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
}> {
  const cached = assetMetaCache.get(mint);
  if (cached && Date.now() - cached.at < ASSET_META_TTL_MS) {
    return cached.data;
  }

  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    return { name: null, symbol: null, image: null, website: null, twitter: null, telegram: null };
  }

  try {
    const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "asset-meta",
        method: "getAsset",
        params: { id: mint },
      }),
    });
    if (!res.ok) {
      return { name: null, symbol: null, image: null, website: null, twitter: null, telegram: null };
    }
    const json = await res.json();
    const content = json?.result?.content || {};
    const links = content?.links || {};
    const metadata = content?.metadata || {};
    const out = {
      name: typeof metadata?.name === "string" ? metadata.name : null,
      symbol: typeof metadata?.symbol === "string" ? metadata.symbol : null,
      image: normalizeImageUrl(typeof links?.image === "string" ? links.image : null),
      website: typeof links?.external_url === "string" ? links.external_url : null,
      twitter: typeof links?.twitter === "string" ? links.twitter : null,
      telegram: typeof links?.telegram === "string" ? links.telegram : null,
    };
    assetMetaCache.set(mint, { at: Date.now(), data: out });
    return out;
  } catch {
    return { name: null, symbol: null, image: null, website: null, twitter: null, telegram: null };
  }
}
