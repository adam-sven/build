import fs from "fs";
import os from "os";
import path from "path";

export type WalletBuy = {
  mint: string;
  amount: number;
  signature: string;
  blockTime: number | null;
  wallet: string;
  solDelta: number;
  source: "tx" | "holding";
};

export type WalletActivity = {
  wallet: string;
  buys: WalletBuy[];
  solNet: number;
  txCount: number;
  lastSeen: number | null;
  uniqueMints: number;
  sampledPnlSol: number;
};

export type TopWallet = {
  wallet: string;
  buyCount: number;
  uniqueMints: number;
  sampledPnlSol: number;
  txCount: number;
  lastSeen: number | null;
  topMints: string[];
};

export type TopMint = {
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
    marketCapUsd: number | null;
    fdvUsd: number | null;
    pairUrl: string | null;
    dex: string | null;
  };
};

export type SmartWalletSnapshot = {
  ok: boolean;
  timestamp: string;
  wallets: string[];
  activity: WalletActivity[];
  byMint: Record<string, { walletCount: number; buys: WalletBuy[] }>;
  topWallets: TopWallet[];
  topMints: TopMint[];
  stats: {
    totalWallets: number;
    activeWallets: number;
    totalBuys: number;
    totalTrackedMints: number;
  };
};

const CACHE_TTL = Number(process.env.SMART_CACHE_TTL_MS || `${10 * 60 * 1000}`);
let cache: { timestamp: number; data: SmartWalletSnapshot } | null = null;
let refreshPromise: Promise<SmartWalletSnapshot> | null = null;

const SIGNATURES_LIMIT = Number(process.env.SMART_SIGNATURES_LIMIT || "6");
const MAX_TX_PER_WALLET = Number(process.env.SMART_MAX_TX_PER_WALLET || "4");
const CONCURRENCY = Number(process.env.SMART_RPC_CONCURRENCY || "3");
const TOKEN_METADATA_LIMIT = 80;
const TOKEN_METADATA_CONCURRENCY = 8;
const TOKEN_META_TTL = 10 * 60 * 1000;
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const RPC_TIMEOUT_MS = 10_000;
const RPC_RETRIES = 2;
const JUP_TTL = 60 * 60 * 1000;
let jupTokenMap: Map<string, any> | null = null;
let jupFetchedAt = 0;
const tokenMetaCache = new Map<string, { at: number; value: TopMint["token"] }>();

const WALLET_PATH = path.join(process.cwd(), "data", "smart-wallets.json");
const FILE_CACHE_PATH = path.join(os.tmpdir(), "smart-wallets-cache.json");

function isCompatibleSnapshot(snapshot: any): snapshot is SmartWalletSnapshot {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (!Array.isArray(snapshot.topWallets) || !Array.isArray(snapshot.topMints)) return false;
  if (!snapshot.stats || typeof snapshot.stats !== "object") return false;
  const sampleMint = snapshot.topMints[0];
  if (sampleMint && (!sampleMint.token || typeof sampleMint.token !== "object")) return false;
  return true;
}

export function loadWallets(): string[] {
  try {
    const raw = fs.readFileSync(WALLET_PATH, "utf-8");
    const data = JSON.parse(raw) as { wallets?: unknown[] };
    const wallets: unknown[] = Array.isArray(data.wallets) ? data.wallets : [];
    return Array.from(
      new Set(
        wallets
          .map((w: unknown) => String(w).trim())
          .filter((w: string) => w.length > 0),
      ),
    );
  } catch {
    return [];
  }
}

function rpcUrl() {
  const key = process.env.HELIUS_API_KEY;
  return key ? `https://mainnet.helius-rpc.com/?api-key=${key}` : "https://api.mainnet-beta.solana.com";
}

async function rpc(method: string, params: unknown[]) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RPC_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
      const res = await fetch(rpcUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`RPC ${method} failed (${res.status})`);
      }
      return await res.json();
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < RPC_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error(`RPC ${method} failed`);
}

function getAccountIndex(tx: any, wallet: string): number {
  const keys = tx?.transaction?.message?.accountKeys || [];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = typeof key === "string" ? key : key?.pubkey;
    if (value === wallet) return i;
  }
  return -1;
}

function getSolDelta(tx: any, wallet: string): number {
  const idx = getAccountIndex(tx, wallet);
  if (idx < 0) return 0;
  const pre = tx?.meta?.preBalances?.[idx] ?? null;
  const post = tx?.meta?.postBalances?.[idx] ?? null;
  if (pre === null || post === null) return 0;
  return (post - pre) / 1_000_000_000;
}

function tokenUiAmount(balance: any): number {
  if (!balance?.uiTokenAmount) return 0;
  const ui = balance.uiTokenAmount.uiAmount;
  if (typeof ui === "number") return ui;
  const fromString = Number.parseFloat(balance.uiTokenAmount.uiAmountString || "0");
  return Number.isFinite(fromString) ? fromString : 0;
}

async function getWalletHoldings(wallet: string): Promise<WalletBuy[]> {
  const res = await rpc("getTokenAccountsByOwner", [
    wallet,
    { programId: TOKEN_PROGRAM },
    { encoding: "jsonParsed" },
  ]);
  const accounts = res?.result?.value || [];

  const holdings: WalletBuy[] = [];
  for (const account of accounts) {
    const parsed = account?.account?.data?.parsed?.info;
    const mint = parsed?.mint;
    const amount = Number(parsed?.tokenAmount?.uiAmount || 0);
    if (!mint || mint === WSOL_MINT || amount <= 0) continue;
    holdings.push({
      mint,
      amount,
      signature: "holding",
      blockTime: null,
      wallet,
      solDelta: 0,
      source: "holding",
    });
  }

  return holdings.sort((a, b) => b.amount - a.amount).slice(0, 8);
}

async function getRecentActivity(wallet: string): Promise<WalletActivity> {
  const sigRes = await rpc("getSignaturesForAddress", [wallet, { limit: SIGNATURES_LIMIT }]);
  const signatures: { signature: string; blockTime: number | null }[] = (sigRes?.result || []).slice(
    0,
    MAX_TX_PER_WALLET,
  );

  const buys: WalletBuy[] = [];
  let solNet = 0;
  let txCount = 0;
  let lastSeen: number | null = null;

  for (const sig of signatures) {
    let tx: any = null;
    try {
      const txRes = await rpc("getTransaction", [
        sig.signature,
        { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
      ]);
      tx = txRes?.result;
    } catch {
      continue;
    }
    if (!tx?.meta) continue;

    txCount += 1;
    const blockTime = tx.blockTime ?? sig.blockTime ?? null;
    if (blockTime && (!lastSeen || blockTime > lastSeen)) {
      lastSeen = blockTime;
    }

    const solDelta = getSolDelta(tx, wallet);
    solNet += solDelta;

    const pre = (tx.meta.preTokenBalances || []).filter((b: any) => b.owner === wallet);
    const post = (tx.meta.postTokenBalances || []).filter((b: any) => b.owner === wallet);

    const preMap = new Map<string, number>(
      pre.map((b: any) => [String(b.mint), tokenUiAmount(b)]),
    );
    for (const p of post) {
      const mint = p.mint;
      if (!mint || mint === WSOL_MINT) continue;
      const preAmt = preMap.get(mint) || 0;
      const postAmt = tokenUiAmount(p);
      const delta = postAmt - preAmt;
      if (delta > 0) {
        buys.push({
          mint,
          amount: delta,
          signature: sig.signature,
          blockTime,
          wallet,
          solDelta,
          source: "tx",
        });
      }
    }
  }

  if (buys.length === 0) {
    try {
      buys.push(...(await getWalletHoldings(wallet)));
    } catch {
      // ignore holdings fallback failures
    }
  }

  const uniqueMints = new Set(buys.map((b) => b.mint)).size;
  return { wallet, buys, solNet, txCount, lastSeen, uniqueMints, sampledPnlSol: solNet };
}

async function runInBatches(wallets: string[]): Promise<WalletActivity[]> {
  const out: WalletActivity[] = [];
  for (let i = 0; i < wallets.length; i += CONCURRENCY) {
    const batch = wallets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (wallet) => {
        try {
          return await getRecentActivity(wallet);
        } catch {
          return {
            wallet,
            buys: [],
            solNet: 0,
            txCount: 0,
            lastSeen: null,
            uniqueMints: 0,
            sampledPnlSol: 0,
          };
        }
      }),
    );
    out.push(...results);
  }
  return out;
}

function pickBestPair(payload: any): any {
  const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
  if (!pairs.length) return null;
  return pairs
    .filter((pair: any) => pair?.chainId === "solana")
    .sort((a: any, b: any) => {
      const la = Number(a?.liquidity?.usd ?? 0);
      const lb = Number(b?.liquidity?.usd ?? 0);
      return lb - la;
    })[0];
}

async function getMintMeta(mint: string): Promise<TopMint["token"]> {
  const cached = tokenMetaCache.get(mint);
  if (cached && Date.now() - cached.at < TOKEN_META_TTL) {
    return cached.value;
  }

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("dex_failed");
    }
    const json = await res.json();
    const pair = pickBestPair(json);
    const fromDex = {
      name: pair?.baseToken?.name || null,
      symbol: pair?.baseToken?.symbol || null,
      image: pair?.info?.imageUrl || null,
      priceUsd: pair?.priceUsd ? Number(pair.priceUsd) : null,
      change24h: pair?.priceChange?.h24 ?? null,
      volume24h: pair?.volume?.h24 ?? null,
      liquidityUsd: pair?.liquidity?.usd ?? null,
      marketCapUsd: pair?.marketCap ?? null,
      fdvUsd: pair?.fdv ?? null,
      pairUrl: pair?.url || null,
      dex: pair?.dexId || null,
    };
    if (fromDex.name || fromDex.symbol || fromDex.image) {
      tokenMetaCache.set(mint, { at: Date.now(), value: fromDex });
      return fromDex;
    }
  } catch {
    // continue to Jup fallback
  }

  try {
    const now = Date.now();
    const stale = now - jupFetchedAt > JUP_TTL;
    if (!jupTokenMap || stale) {
      const res = await fetch("https://tokens.jup.ag/tokens?tags=verified", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const list = await res.json();
        const next = new Map<string, any>();
        if (Array.isArray(list)) {
          for (const token of list) {
            if (typeof token?.address === "string") next.set(token.address, token);
          }
        }
        jupTokenMap = next;
        jupFetchedAt = now;
      }
    }
    const token = jupTokenMap?.get(mint) || null;
    if (token) {
      const result = {
        name: token?.name || null,
        symbol: token?.symbol || null,
        image: token?.logoURI || null,
        priceUsd: null,
        change24h: null,
        volume24h: null,
        liquidityUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        pairUrl: null,
        dex: null,
      };
      tokenMetaCache.set(mint, { at: Date.now(), value: result });
      return result;
    }
  } catch {
    // fallthrough
  }

  try {
    const apiKey = process.env.HELIUS_API_KEY;
    if (apiKey) {
      const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "getAsset",
          method: "getAsset",
          params: { id: mint },
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const result = json?.result;
        const image =
          result?.content?.files?.find((f: any) => typeof f?.cdn_uri === "string")?.cdn_uri ||
          result?.content?.files?.find((f: any) => typeof f?.uri === "string")?.uri ||
          null;
        const name = result?.content?.metadata?.name || result?.content?.metadata?.symbol || null;
        const symbol = result?.content?.metadata?.symbol || null;
        if (name || symbol || image) {
          const result = {
            name,
            symbol,
            image,
            priceUsd: null,
            change24h: null,
            volume24h: null,
            liquidityUsd: null,
            marketCapUsd: null,
            fdvUsd: null,
            pairUrl: null,
            dex: null,
          };
          tokenMetaCache.set(mint, { at: Date.now(), value: result });
          return result;
        }
      }
    }
  } catch {
    // fallthrough
  }

  const result = {
    name: null,
    symbol: null,
    image: null,
    priceUsd: null,
    change24h: null,
    volume24h: null,
    liquidityUsd: null,
    marketCapUsd: null,
    fdvUsd: null,
    pairUrl: null,
    dex: null,
  };
  tokenMetaCache.set(mint, { at: Date.now(), value: result });
  return result;
}

async function mapMintMetaWithConcurrency(mints: string[]): Promise<Map<string, TopMint["token"]>> {
  const out = new Map<string, TopMint["token"]>();
  for (let i = 0; i < mints.length; i += TOKEN_METADATA_CONCURRENCY) {
    const batch = mints.slice(i, i + TOKEN_METADATA_CONCURRENCY);
    const chunk = await Promise.all(
      batch.map(async (mint) => [mint, await getMintMeta(mint)] as const),
    );
    for (const [mint, meta] of chunk) {
      out.set(mint, meta);
    }
  }
  return out;
}

function readFileCache(): SmartWalletSnapshot | null {
  try {
    const raw = fs.readFileSync(FILE_CACHE_PATH, "utf-8");
    const cached: SmartWalletSnapshot = JSON.parse(raw);
    if (!cached.ok || !isCompatibleSnapshot(cached)) return null;
    return cached;
  } catch {
    return null;
  }
}

function isFresh(snapshot: SmartWalletSnapshot): boolean {
  return Date.now() - new Date(snapshot.timestamp).getTime() < CACHE_TTL;
}

async function buildSnapshotInternal(): Promise<SmartWalletSnapshot> {

  const wallets = loadWallets();
  const activity = await runInBatches(wallets);

  const byMint: Record<string, { walletCount: number; buys: WalletBuy[] }> = {};
  for (const item of activity) {
    for (const buy of item.buys) {
      if (!byMint[buy.mint]) byMint[buy.mint] = { walletCount: 0, buys: [] };
      byMint[buy.mint].buys.push(buy);
    }
  }

  for (const mint of Object.keys(byMint)) {
    const uniqueWallets = new Set(byMint[mint].buys.map((b) => b.wallet));
    byMint[mint].walletCount = uniqueWallets.size;
  }

  const topWallets: TopWallet[] = activity
    .map((item) => ({
      wallet: item.wallet,
      buyCount: item.buys.length,
      uniqueMints: item.uniqueMints,
      sampledPnlSol: item.sampledPnlSol,
      txCount: item.txCount,
      lastSeen: item.lastSeen,
      topMints: Array.from(
        new Set(
          item.buys
            .sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0))
            .map((buy) => buy.mint),
        ),
      ).slice(0, 3),
    }))
    .sort((a, b) => {
      if (b.buyCount !== a.buyCount) return b.buyCount - a.buyCount;
      if (b.sampledPnlSol !== a.sampledPnlSol) return b.sampledPnlSol - a.sampledPnlSol;
      return b.uniqueMints - a.uniqueMints;
    });

  const rankedMints = Object.entries(byMint)
    .map(([mint, value]) => ({
      mint,
      walletCount: value.walletCount,
      buyCount: value.buys.length,
      wallets: Array.from(new Set(value.buys.map((b) => b.wallet))),
      amountTotal: value.buys.reduce((sum, buy) => sum + (buy.amount || 0), 0),
      solFlow: value.buys.reduce((sum, buy) => sum + (buy.solDelta || 0), 0),
      lastBuyAt: value.buys.reduce((latest, buy) => {
        const ts = buy.blockTime || 0;
        return ts > latest ? ts : latest;
      }, 0),
    }))
    .sort((a, b) => {
      if (b.walletCount !== a.walletCount) return b.walletCount - a.walletCount;
      return b.buyCount - a.buyCount;
    });

  const mintMetaMap = await mapMintMetaWithConcurrency(
    rankedMints.slice(0, TOKEN_METADATA_LIMIT).map((item) => item.mint),
  );

  const topMints: TopMint[] = rankedMints.slice(0, TOKEN_METADATA_LIMIT).map((item) => ({
    mint: item.mint,
    walletCount: item.walletCount,
    buyCount: item.buyCount,
    wallets: item.wallets,
    amountTotal: item.amountTotal,
    solFlow: item.solFlow,
    lastBuyAt: item.lastBuyAt || null,
    token: mintMetaMap.get(item.mint) || {
      name: null,
      symbol: null,
      image: null,
      priceUsd: null,
      change24h: null,
      volume24h: null,
      liquidityUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      pairUrl: null,
      dex: null,
    },
  }));

  const activeWallets = activity.filter((item) => item.buys.length > 0).length;
  const totalBuys = activity.reduce((sum, item) => sum + item.buys.length, 0);

  const snapshot: SmartWalletSnapshot = {
    ok: true,
    timestamp: new Date().toISOString(),
    wallets,
    activity,
    byMint,
    topWallets,
    topMints,
    stats: {
      totalWallets: wallets.length,
      activeWallets,
      totalBuys,
      totalTrackedMints: Object.keys(byMint).length,
    },
  };

  cache = { timestamp: Date.now(), data: snapshot };
  try {
    fs.writeFileSync(FILE_CACHE_PATH, JSON.stringify(snapshot));
  } catch {
    // ignore
  }

  return snapshot;
}

export async function buildSmartWalletSnapshot(force = false): Promise<SmartWalletSnapshot> {
  if (!force && cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return cache.data;
  }
  return buildSnapshotInternal();
}

function startBackgroundRefresh() {
  if (!refreshPromise) {
    refreshPromise = buildSnapshotInternal().finally(() => {
      refreshPromise = null;
    });
  }
}

export async function getSmartWalletSnapshot(): Promise<{
  data: SmartWalletSnapshot;
  stale: boolean;
  source: "memory" | "disk" | "fresh";
}> {
  if (cache && isFresh(cache.data)) {
    return { data: cache.data, stale: false, source: "memory" };
  }

  const diskCached = readFileCache();
  if (diskCached) {
    cache = { timestamp: Date.now(), data: diskCached };
    const stale = !isFresh(diskCached);
    if (stale) {
      startBackgroundRefresh();
    }
    return { data: diskCached, stale, source: "disk" };
  }

  if (refreshPromise) {
    const data = await refreshPromise;
    return { data, stale: false, source: "fresh" };
  }

  refreshPromise = buildSnapshotInternal().finally(() => {
    refreshPromise = null;
  });
  const data = await refreshPromise;
  return { data, stale: false, source: "fresh" };
}
