import fs from "fs";
import path from "path";
import { kvGet, kvSet } from "@/lib/trencher/kv";

export type LiveWalletEvent = {
  signature: string;
  blockTime: number;
  wallet: string;
  mint: string;
  amount: number;
  solDelta: number;
};

type SmartSnapshotLike = {
  ok: boolean;
  timestamp: string;
  wallets: string[];
  activity: Array<{
    wallet: string;
    buys: Array<{
      mint: string;
      amount: number;
      signature: string;
      blockTime: number | null;
      wallet: string;
      solDelta: number;
      source: "tx" | "holding";
    }>;
    solNet: number;
    txCount: number;
    lastSeen: number | null;
    uniqueMints: number;
    sampledPnlSol: number;
  }>;
  byMint: Record<string, { walletCount: number; buys: Array<any> }>;
  topWallets: Array<{
    wallet: string;
    buyCount: number;
    uniqueMints: number;
    sampledPnlSol: number;
    txCount: number;
    lastSeen: number | null;
    topMints: string[];
  }>;
  topMints: Array<{
    mint: string;
    walletCount: number;
    buyCount: number;
    wallets: string[];
    amountTotal: number;
    solFlow: number;
    lastBuyAt: number | null;
    token: {
      name: string | null;
      symbol: string | null;
      image: string | null;
      priceUsd: number | null;
      change24h: number | null;
      volume24h: number | null;
      liquidityUsd: number | null;
      pairUrl: string | null;
      dex: string | null;
    };
  }>;
  stats: {
    totalWallets: number;
    activeWallets: number;
    totalBuys: number;
    totalTrackedMints: number;
  };
};

const EVENTS_KEY = "trencher:helius:wallet_events:v1";
const SNAPSHOT_KEY = "trencher:helius:smart_snapshot:v1";
const DEFAULT_TTL_SECONDS = Number(process.env.SMART_EVENT_TTL_SEC || `${24 * 3600}`);
const MAX_EVENTS = Number(process.env.SMART_EVENT_MAX || "12000");
const SNAPSHOT_TTL_SECONDS = Number(process.env.SMART_EVENT_SNAPSHOT_TTL_SEC || "1200");
const WALLET_PATH = path.join(process.cwd(), "data", "smart-wallets.json");
const SOL_MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,50}$/;

let jupTokenMap: Map<string, any> | null = null;
let jupFetchedAt = 0;

function loadWatchedWallets(): Set<string> {
  try {
    const raw = fs.readFileSync(WALLET_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { wallets?: unknown[] };
    const list = Array.isArray(parsed.wallets) ? parsed.wallets : [];
    return new Set(list.map((w) => String(w).trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function uniqueBy<T>(arr: T[], key: (v: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

async function getJupToken(mint: string): Promise<any | null> {
  const now = Date.now();
  const stale = now - jupFetchedAt > 60 * 60 * 1000;
  if (!jupTokenMap || stale) {
    try {
      const res = await fetch("https://tokens.jup.ag/tokens?tags=verified", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const list = await res.json();
        const map = new Map<string, any>();
        if (Array.isArray(list)) {
          for (const token of list) {
            if (typeof token?.address === "string") map.set(token.address, token);
          }
        }
        jupTokenMap = map;
        jupFetchedAt = now;
      }
    } catch {
      // ignore
    }
  }
  return jupTokenMap?.get(mint) ?? null;
}

async function getMintMeta(mint: string) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const json = await res.json();
      const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
      const pair = pairs
        .filter((p: any) => p?.chainId === "solana")
        .sort((a: any, b: any) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
      if (pair) {
        return {
          name: pair?.baseToken?.name || null,
          symbol: pair?.baseToken?.symbol || null,
          image: pair?.info?.imageUrl || null,
          priceUsd: pair?.priceUsd ? Number(pair.priceUsd) : null,
          change24h: pair?.priceChange?.h24 ?? null,
          volume24h: pair?.volume?.h24 ?? null,
          liquidityUsd: pair?.liquidity?.usd ?? null,
          pairUrl: pair?.url || null,
          dex: pair?.dexId || null,
        };
      }
    }
  } catch {
    // continue fallback
  }

  const jup = await getJupToken(mint);
  if (jup) {
    return {
      name: jup?.name || null,
      symbol: jup?.symbol || null,
      image: jup?.logoURI || null,
      priceUsd: null,
      change24h: null,
      volume24h: null,
      liquidityUsd: null,
      pairUrl: null,
      dex: null,
    };
  }

  return {
    name: null,
    symbol: null,
    image: null,
    priceUsd: null,
    change24h: null,
    volume24h: null,
    liquidityUsd: null,
    pairUrl: null,
    dex: null,
  };
}

async function getMintMetaMap(mints: string[]) {
  const out = new Map<string, Awaited<ReturnType<typeof getMintMeta>>>();
  const concurrency = 8;
  for (let i = 0; i < mints.length; i += concurrency) {
    const batch = mints.slice(i, i + concurrency);
    const rows = await Promise.all(batch.map(async (mint) => [mint, await getMintMeta(mint)] as const));
    for (const [mint, meta] of rows) out.set(mint, meta);
  }
  return out;
}

export function parseHeliusWebhookEvents(payload: any): LiveWalletEvent[] {
  const watched = loadWatchedWallets();
  if (watched.size === 0) return [];
  const txs = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [payload];
  const out: LiveWalletEvent[] = [];

  for (const tx of txs) {
    const signature = String(tx?.signature || tx?.transactionSignature || tx?.id || "");
    const blockTime = Number(tx?.timestamp || tx?.blockTime || Math.floor(Date.now() / 1000));
    const transfers = Array.isArray(tx?.tokenTransfers) ? tx.tokenTransfers : [];
    const nativeTransfers = Array.isArray(tx?.nativeTransfers) ? tx.nativeTransfers : [];

    const solByWallet = new Map<string, number>();
    for (const nt of nativeTransfers) {
      const from = String(nt?.fromUserAccount || nt?.from || "");
      const to = String(nt?.toUserAccount || nt?.to || "");
      const amount = Number(nt?.amount || nt?.lamports || 0) / 1_000_000_000;
      if (from && watched.has(from)) solByWallet.set(from, (solByWallet.get(from) || 0) - amount);
      if (to && watched.has(to)) solByWallet.set(to, (solByWallet.get(to) || 0) + amount);
    }

    for (const tr of transfers) {
      const mint = String(tr?.mint || "");
      const toWallet = String(tr?.toUserAccount || tr?.toTokenAccount || tr?.to || "");
      const amount = Number(tr?.tokenAmount || tr?.amount || 0);
      if (!signature || !mint || !toWallet) continue;
      if (!SOL_MINT_RE.test(mint)) continue;
      if (!watched.has(toWallet)) continue;
      if (!(amount > 0)) continue;
      out.push({
        signature,
        blockTime: Number.isFinite(blockTime) ? blockTime : Math.floor(Date.now() / 1000),
        wallet: toWallet,
        mint,
        amount,
        solDelta: solByWallet.get(toWallet) || 0,
      });
    }
  }

  return uniqueBy(out, (e) => `${e.signature}:${e.wallet}:${e.mint}`).sort((a, b) => b.blockTime - a.blockTime);
}

export async function storeWalletEvents(events: LiveWalletEvent[]) {
  if (!events.length) return { stored: 0, total: 0 };
  const current = (await kvGet<LiveWalletEvent[]>(EVENTS_KEY)) || [];
  const merged = uniqueBy([...events, ...current], (e) => `${e.signature}:${e.wallet}:${e.mint}`)
    .sort((a, b) => b.blockTime - a.blockTime)
    .slice(0, MAX_EVENTS);
  await kvSet(EVENTS_KEY, merged, DEFAULT_TTL_SECONDS);
  return { stored: events.length, total: merged.length };
}

export async function getStoredWalletEvents() {
  return (await kvGet<LiveWalletEvent[]>(EVENTS_KEY)) || [];
}

export async function getStoredSmartSnapshotFromEvents() {
  return (await kvGet<SmartSnapshotLike>(SNAPSHOT_KEY)) || null;
}

export async function buildSmartSnapshotFromEvents(): Promise<SmartSnapshotLike | null> {
  if (process.env.SMART_USE_WEBHOOK_EVENTS === "false") return null;
  const watchedWallets = loadWatchedWallets();
  if (watchedWallets.size === 0) return null;

  const events = await getStoredWalletEvents();
  if (!events.length) return null;

  const byWallet = new Map<string, LiveWalletEvent[]>();
  const byMint = new Map<string, LiveWalletEvent[]>();

  for (const event of events) {
    if (!SOL_MINT_RE.test(event.mint)) continue;
    if (!watchedWallets.has(event.wallet)) continue;
    const walletList = byWallet.get(event.wallet) || [];
    walletList.push(event);
    byWallet.set(event.wallet, walletList);
    const mintList = byMint.get(event.mint) || [];
    mintList.push(event);
    byMint.set(event.mint, mintList);
  }

  const walletRows = Array.from(watchedWallets).map((wallet) => {
    const buys = (byWallet.get(wallet) || []).sort((a, b) => b.blockTime - a.blockTime);
    const txSigs = new Set(buys.map((b) => b.signature));
    const uniqueMints = new Set(buys.map((b) => b.mint));
    const lastSeen = buys.length ? buys[0].blockTime : null;
    const solNet = buys.reduce((acc, b) => acc + (b.solDelta || 0), 0);
    return {
      wallet,
      buys: buys.map((b) => ({
        mint: b.mint,
        amount: b.amount,
        signature: b.signature,
        blockTime: b.blockTime,
        wallet: b.wallet,
        solDelta: b.solDelta,
        source: "tx" as const,
      })),
      solNet,
      txCount: txSigs.size,
      lastSeen,
      uniqueMints: uniqueMints.size,
      sampledPnlSol: solNet,
    };
  });

  const topWallets = walletRows
    .map((w) => ({
      wallet: w.wallet,
      buyCount: w.buys.length,
      uniqueMints: w.uniqueMints,
      sampledPnlSol: w.sampledPnlSol,
      txCount: w.txCount,
      lastSeen: w.lastSeen,
      topMints: Array.from(new Set(w.buys.map((b) => b.mint))).slice(0, 3),
    }))
    .sort((a, b) => {
      if (b.buyCount !== a.buyCount) return b.buyCount - a.buyCount;
      if (b.sampledPnlSol !== a.sampledPnlSol) return b.sampledPnlSol - a.sampledPnlSol;
      return b.uniqueMints - a.uniqueMints;
    });

  const mintRows = Array.from(byMint.entries())
    .map(([mint, buys]) => ({
      mint,
      buys,
      walletCount: new Set(buys.map((b) => b.wallet)).size,
      buyCount: buys.length,
      wallets: Array.from(new Set(buys.map((b) => b.wallet))),
      amountTotal: buys.reduce((sum, b) => sum + (b.amount || 0), 0),
      solFlow: buys.reduce((sum, b) => sum + (b.solDelta || 0), 0),
      lastBuyAt: buys.reduce((latest, b) => (b.blockTime > latest ? b.blockTime : latest), 0),
    }))
    .sort((a, b) => {
      if (b.walletCount !== a.walletCount) return b.walletCount - a.walletCount;
      return b.buyCount - a.buyCount;
    });

  const topMintsSeed = mintRows.slice(0, 120);
  const mintMeta = await getMintMetaMap(topMintsSeed.map((m) => m.mint));
  const topMints = topMintsSeed.map((row) => ({
    mint: row.mint,
    walletCount: row.walletCount,
    buyCount: row.buyCount,
    wallets: row.wallets,
    amountTotal: row.amountTotal,
    solFlow: row.solFlow,
    lastBuyAt: row.lastBuyAt || null,
    token: mintMeta.get(row.mint) || {
      name: null,
      symbol: null,
      image: null,
      priceUsd: null,
      change24h: null,
      volume24h: null,
      liquidityUsd: null,
      pairUrl: null,
      dex: null,
    },
  }));

  const byMintObj: Record<string, { walletCount: number; buys: Array<any> }> = {};
  for (const row of mintRows) {
    byMintObj[row.mint] = {
      walletCount: row.walletCount,
      buys: row.buys.map((b) => ({
        mint: b.mint,
        amount: b.amount,
        signature: b.signature,
        blockTime: b.blockTime,
        wallet: b.wallet,
        solDelta: b.solDelta,
        source: "tx",
      })),
    };
  }

  const activeWallets = walletRows.filter((w) => w.buys.length > 0).length;
  const totalBuys = walletRows.reduce((sum, w) => sum + w.buys.length, 0);

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    wallets: Array.from(watchedWallets),
    activity: walletRows,
    byMint: byMintObj,
    topWallets,
    topMints,
    stats: {
      totalWallets: watchedWallets.size,
      activeWallets,
      totalBuys,
      totalTrackedMints: mintRows.length,
    },
  };
}

export async function refreshAndStoreSmartSnapshotFromEvents() {
  const snapshot = await buildSmartSnapshotFromEvents();
  if (!snapshot) return null;
  await kvSet(SNAPSHOT_KEY, snapshot, SNAPSHOT_TTL_SECONDS);
  return snapshot;
}
