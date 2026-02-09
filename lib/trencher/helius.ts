import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
const HOLDER_STATS_TTL_MS = Number(process.env.HOLDER_STATS_TTL_MS || `${15 * 60 * 1000}`);
const HOLDER_COUNT_MAX_PAGES = Number(process.env.HOLDER_COUNT_MAX_PAGES || "3");
const holderStatsCache = new Map<
  string,
  {
    at: number;
    data: { holderCount: number | null; top10Pct: number | null; topHolders: { wallet: string; pct: number }[] };
  }
>();

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
