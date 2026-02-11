import fs from "fs";
import os from "os";
import path from "path";
import { normalizeImageUrl } from "@/lib/utils";
import { kvGet, kvIncr, kvSet } from "@/lib/trencher/kv";

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
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  costBasisSol: number;
  currentValueSol: number;
  closedTrades: number;
  winningTrades: number;
  winRate: number | null;
  positions: WalletPosition[];
};

export type TopWallet = {
  wallet: string;
  buyCount: number;
  uniqueMints: number;
  sampledPnlSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  winRate: number | null;
  closedTrades: number;
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

export type WalletPosition = {
  mint: string;
  qty: number;
  costBasisSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  currentValueSol: number;
  avgCostSol: number;
  buyCount: number;
  sellCount: number;
  firstBuyAt: number | null;
  lastTradeAt: number | null;
  holdSeconds: number | null;
  closedTrades: number;
  winningTrades: number;
  winRate: number | null;
};

const CACHE_TTL = Number(process.env.SMART_CACHE_TTL_MS || `${10 * 60 * 1000}`);
let cache: { timestamp: number; data: SmartWalletSnapshot } | null = null;
let refreshPromise: Promise<SmartWalletSnapshot> | null = null;

const LOW_CREDIT_MODE = /^(1|true|yes)$/i.test(process.env.SMART_LOW_CREDIT_MODE || "");
const HAS_HELIUS = Boolean(process.env.HELIUS_API_KEY);
const RAW_SIGNATURES_LIMIT = Number(
  process.env.SMART_SIGNATURES_LIMIT ||
    (LOW_CREDIT_MODE ? "30" : HAS_HELIUS ? "120" : "40"),
);
const RAW_MAX_TX_PER_WALLET = Number(
  process.env.SMART_MAX_TX_PER_WALLET ||
    (LOW_CREDIT_MODE ? "12" : HAS_HELIUS ? "80" : "20"),
);
const RAW_CONCURRENCY = Number(
  process.env.SMART_RPC_CONCURRENCY ||
    (LOW_CREDIT_MODE ? "1" : HAS_HELIUS ? "3" : "2"),
);
const MAX_SIG_CAP = HAS_HELIUS ? 400 : 80;
const MAX_TX_CAP = HAS_HELIUS ? 200 : 40;
const CONCURRENCY_CAP = HAS_HELIUS ? 8 : 3;
const SIGNATURES_LIMIT = Math.max(20, Math.min(MAX_SIG_CAP, Number.isFinite(RAW_SIGNATURES_LIMIT) ? Math.floor(RAW_SIGNATURES_LIMIT) : (HAS_HELIUS ? 120 : 40)));
const MAX_TX_PER_WALLET = Math.max(
  10,
  Math.min(
    Math.min(SIGNATURES_LIMIT, MAX_TX_CAP),
    Number.isFinite(RAW_MAX_TX_PER_WALLET) ? Math.floor(RAW_MAX_TX_PER_WALLET) : (HAS_HELIUS ? 80 : 20),
  ),
);
const CONCURRENCY = Math.max(1, Math.min(CONCURRENCY_CAP, Number.isFinite(RAW_CONCURRENCY) ? Math.floor(RAW_CONCURRENCY) : (HAS_HELIUS ? 3 : 2)));
const TOKEN_METADATA_LIMIT = Number(process.env.SMART_TOKEN_METADATA_LIMIT || (LOW_CREDIT_MODE ? "40" : "80"));
const TOKEN_METADATA_CONCURRENCY = Number(
  process.env.SMART_TOKEN_METADATA_CONCURRENCY || (LOW_CREDIT_MODE ? "4" : "8"),
);
const TOKEN_META_TTL = 10 * 60 * 1000;
const SNAPSHOT_FALLBACK_WINDOW_MS = Number(process.env.SMART_SNAPSHOT_FALLBACK_WINDOW_MS || `${6 * 60 * 60 * 1000}`);
const RECENT_BUY_WINDOW_SEC = Number(process.env.SMART_RECENT_BUY_WINDOW_SEC || `${6 * 60 * 60}`);
const MIN_KEEP_LIQ_USD = Number(process.env.SMART_MIN_KEEP_LIQ_USD || "2500");
const MIN_KEEP_VOL_USD = Number(process.env.SMART_MIN_KEEP_VOL_USD || "5000");
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
const KV_CACHE_KEY = "trencher:smart-wallets:snapshot:v1";
const KV_CACHE_TTL_SECONDS = Number(process.env.SMART_KV_CACHE_TTL_SEC || `${12 * 60 * 60}`);
const ENABLE_HOLDINGS_FALLBACK = /^(1|true|yes)$/i.test(
  process.env.SMART_ENABLE_HOLDINGS_FALLBACK || (LOW_CREDIT_MODE ? "false" : "true"),
);

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

function addMapAmount(map: Map<string, number>, mint: string, amount: number) {
  map.set(mint, (map.get(mint) || 0) + amount);
}

function getTokenDeltaMap(tx: any, wallet: string): Map<string, number> {
  const pre = (tx?.meta?.preTokenBalances || []).filter((b: any) => b.owner === wallet);
  const post = (tx?.meta?.postTokenBalances || []).filter((b: any) => b.owner === wallet);

  const preMap = new Map<string, number>();
  for (const row of pre) {
    const mint = String(row?.mint || "");
    if (!mint || mint === WSOL_MINT) continue;
    addMapAmount(preMap, mint, tokenUiAmount(row));
  }

  const postMap = new Map<string, number>();
  for (const row of post) {
    const mint = String(row?.mint || "");
    if (!mint || mint === WSOL_MINT) continue;
    addMapAmount(postMap, mint, tokenUiAmount(row));
  }

  const out = new Map<string, number>();
  const keys = new Set<string>([...preMap.keys(), ...postMap.keys()]);
  for (const mint of keys) {
    const delta = (postMap.get(mint) || 0) - (preMap.get(mint) || 0);
    if (Math.abs(delta) > 1e-12) out.set(mint, delta);
  }
  return out;
}

function allocByAmount(entries: Array<{ mint: string; amount: number }>, total: number): Map<string, number> {
  const out = new Map<string, number>();
  const sum = entries.reduce((acc, x) => acc + Math.abs(x.amount), 0);
  if (sum <= 0 || total <= 0) return out;
  for (const item of entries) {
    out.set(item.mint, total * (Math.abs(item.amount) / sum));
  }
  return out;
}

type PositionState = {
  mint: string;
  qty: number;
  costBasisSol: number;
  realizedPnlSol: number;
  buyCount: number;
  sellCount: number;
  firstBuyAt: number | null;
  lastTradeAt: number | null;
  closedTrades: number;
  winningTrades: number;
};

function getOrCreatePosition(map: Map<string, PositionState>, mint: string): PositionState {
  let pos = map.get(mint);
  if (!pos) {
    pos = {
      mint,
      qty: 0,
      costBasisSol: 0,
      realizedPnlSol: 0,
      buyCount: 0,
      sellCount: 0,
      firstBuyAt: null,
      lastTradeAt: null,
      closedTrades: 0,
      winningTrades: 0,
    };
    map.set(mint, pos);
  }
  return pos;
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
  const positions = new Map<string, PositionState>();

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
    const tokenDeltas = getTokenDeltaMap(tx, wallet);
    const tokenIns: Array<{ mint: string; amount: number }> = [];
    const tokenOuts: Array<{ mint: string; amount: number }> = [];
    for (const [mint, delta] of tokenDeltas.entries()) {
      if (delta > 0) tokenIns.push({ mint, amount: delta });
      else tokenOuts.push({ mint, amount: Math.abs(delta) });
    }

    const buyCostByMint = solDelta < 0 ? allocByAmount(tokenIns, Math.abs(solDelta)) : new Map<string, number>();
    const sellProceedsByMint = solDelta > 0 ? allocByAmount(tokenOuts, solDelta) : new Map<string, number>();

    for (const buy of tokenIns) {
      const pos = getOrCreatePosition(positions, buy.mint);
      const buyCostSol = buyCostByMint.get(buy.mint) || 0;
      pos.qty += buy.amount;
      pos.costBasisSol += buyCostSol;
      pos.buyCount += 1;
      pos.lastTradeAt = blockTime || pos.lastTradeAt;
      if (blockTime && (!pos.firstBuyAt || blockTime < pos.firstBuyAt)) {
        pos.firstBuyAt = blockTime;
      }

      buys.push({
        mint: buy.mint,
        amount: buy.amount,
        signature: sig.signature,
        blockTime,
        wallet,
        solDelta,
        source: "tx",
      });
    }

    for (const sell of tokenOuts) {
      const pos = getOrCreatePosition(positions, sell.mint);
      const sellQty = sell.amount;
      const recognizedQty = Math.min(sellQty, Math.max(0, pos.qty));
      const avgCostSol = pos.qty > 0 ? pos.costBasisSol / pos.qty : 0;
      const recognizedCost = avgCostSol * recognizedQty;
      const proceeds = (sellProceedsByMint.get(sell.mint) || 0) * (sellQty > 0 ? recognizedQty / sellQty : 0);
      const realized = proceeds - recognizedCost;

      if (recognizedQty > 0) {
        pos.qty -= recognizedQty;
        pos.costBasisSol = Math.max(0, pos.costBasisSol - recognizedCost);
        pos.realizedPnlSol += realized;
        pos.closedTrades += 1;
        if (realized > 0) pos.winningTrades += 1;
      }

      pos.sellCount += 1;
      pos.lastTradeAt = blockTime || pos.lastTradeAt;
    }
  }

  if (ENABLE_HOLDINGS_FALLBACK && buys.length === 0) {
    try {
      buys.push(...(await getWalletHoldings(wallet)));
    } catch {
      // ignore holdings fallback failures
    }
  }

  const uniqueMints = new Set(buys.map((b) => b.mint)).size;
  const positionRows: WalletPosition[] = Array.from(positions.values()).map((pos) => ({
    mint: pos.mint,
    qty: pos.qty,
    costBasisSol: pos.costBasisSol,
    realizedPnlSol: pos.realizedPnlSol,
    unrealizedPnlSol: 0,
    totalPnlSol: pos.realizedPnlSol,
    currentValueSol: 0,
    avgCostSol: pos.qty > 0 ? pos.costBasisSol / pos.qty : 0,
    buyCount: pos.buyCount,
    sellCount: pos.sellCount,
    firstBuyAt: pos.firstBuyAt,
    lastTradeAt: pos.lastTradeAt,
    holdSeconds: null,
    closedTrades: pos.closedTrades,
    winningTrades: pos.winningTrades,
    winRate: pos.closedTrades > 0 ? pos.winningTrades / pos.closedTrades : null,
  }));
  const realizedPnlSol = positionRows.reduce((acc, p) => acc + p.realizedPnlSol, 0);
  const closedTrades = positionRows.reduce((acc, p) => acc + p.closedTrades, 0);
  const winningTrades = positionRows.reduce((acc, p) => acc + p.winningTrades, 0);
  return {
    wallet,
    buys,
    solNet,
    txCount,
    lastSeen,
    uniqueMints,
    sampledPnlSol: solNet,
    realizedPnlSol,
    unrealizedPnlSol: 0,
    totalPnlSol: realizedPnlSol,
    costBasisSol: positionRows.reduce((acc, p) => acc + p.costBasisSol, 0),
    currentValueSol: 0,
    closedTrades,
    winningTrades,
    winRate: closedTrades > 0 ? winningTrades / closedTrades : null,
    positions: positionRows,
  };
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
            realizedPnlSol: 0,
            unrealizedPnlSol: 0,
            totalPnlSol: 0,
            costBasisSol: 0,
            currentValueSol: 0,
            closedTrades: 0,
            winningTrades: 0,
            winRate: null,
            positions: [],
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
      image: normalizeImageUrl(pair?.info?.imageUrl || null),
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
        image: normalizeImageUrl(token?.logoURI || null),
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
        const image = normalizeImageUrl(
          result?.content?.files?.find((f: any) => typeof f?.cdn_uri === "string")?.cdn_uri ||
            result?.content?.files?.find((f: any) => typeof f?.uri === "string")?.uri ||
            null,
        );
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

async function getSolPriceUsd(mintMetaMap: Map<string, TopMint["token"]>): Promise<number | null> {
  const fromCache = mintMetaMap.get(WSOL_MINT)?.priceUsd;
  if (typeof fromCache === "number" && Number.isFinite(fromCache) && fromCache > 0) return fromCache;
  const solMeta = await getMintMeta(WSOL_MINT);
  const v = solMeta?.priceUsd;
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return null;
}

function enrichWalletPnL(
  activities: WalletActivity[],
  mintMetaMap: Map<string, TopMint["token"]>,
  solPriceUsd: number | null,
) {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const item of activities) {
    let unrealized = 0;
    let costBasis = 0;
    let currentValue = 0;
    let realized = 0;
    let closedTrades = 0;
    let winningTrades = 0;

    item.positions = item.positions.map((pos) => {
      const meta = mintMetaMap.get(pos.mint);
      const pxUsd = meta?.priceUsd ?? null;
      const valueSol =
        pos.qty > 0 && solPriceUsd && pxUsd && solPriceUsd > 0
          ? (pos.qty * pxUsd) / solPriceUsd
          : 0;
      const unrealizedSol = valueSol - pos.costBasisSol;
      const totalSol = pos.realizedPnlSol + unrealizedSol;
      const holdSeconds = pos.firstBuyAt ? Math.max(0, nowSec - pos.firstBuyAt) : null;

      realized += pos.realizedPnlSol;
      unrealized += unrealizedSol;
      costBasis += pos.costBasisSol;
      currentValue += valueSol;
      closedTrades += pos.closedTrades;
      winningTrades += pos.winningTrades;

      return {
        ...pos,
        unrealizedPnlSol: unrealizedSol,
        totalPnlSol: totalSol,
        currentValueSol: valueSol,
        holdSeconds,
      };
    });

    item.realizedPnlSol = realized;
    item.unrealizedPnlSol = unrealized;
    item.totalPnlSol = realized + unrealized;
    item.costBasisSol = costBasis;
    item.currentValueSol = currentValue;
    item.closedTrades = closedTrades;
    item.winningTrades = winningTrades;
    item.winRate = closedTrades > 0 ? winningTrades / closedTrades : null;
  }
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

async function readKvCache(): Promise<SmartWalletSnapshot | null> {
  try {
    const cached = await kvGet<SmartWalletSnapshot>(KV_CACHE_KEY);
    if (!cached || !cached.ok || !isCompatibleSnapshot(cached)) return null;
    return cached;
  } catch {
    return null;
  }
}

function isFresh(snapshot: SmartWalletSnapshot): boolean {
  return Date.now() - new Date(snapshot.timestamp).getTime() < CACHE_TTL;
}

function snapshotRowCount(snapshot: SmartWalletSnapshot | null | undefined): number {
  if (!snapshot) return 0;
  return (snapshot.topWallets?.length || 0) + (snapshot.topMints?.length || 0);
}

async function readBestPreviousSnapshot(): Promise<SmartWalletSnapshot | null> {
  const candidates: SmartWalletSnapshot[] = [];
  if (cache?.data && isCompatibleSnapshot(cache.data)) candidates.push(cache.data);
  const kvCached = await readKvCache();
  if (kvCached) candidates.push(kvCached);
  const diskCached = readFileCache();
  if (diskCached) candidates.push(diskCached);
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const rowsDiff = snapshotRowCount(b) - snapshotRowCount(a);
    if (rowsDiff !== 0) return rowsDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  return candidates[0] || null;
}

async function buildSnapshotInternal(): Promise<SmartWalletSnapshot> {
  void kvIncr("trencher:metrics:smart_snapshot_build_total", 60 * 60 * 24 * 30).catch(() => undefined);
  const wallets = loadWallets();
  const previous = await readBestPreviousSnapshot();
  const previousRows = snapshotRowCount(previous);
  const previousTopWallets = previous?.topWallets?.length || 0;
  const canUsePrevious =
    !!previous &&
    previousRows > 0 &&
    Date.now() - new Date(previous.timestamp).getTime() <= SNAPSHOT_FALLBACK_WINDOW_MS;
  const activity = await runInBatches(wallets);
  const previousByWallet = new Map<string, WalletActivity>(
    (canUsePrevious ? (previous?.activity || []) : []).map((row) => [row.wallet, row]),
  );
  const mergedActivity = activity.map((row) => {
    const prev = previousByWallet.get(row.wallet);
    if (!prev) return row;
    const rowInactive =
      row.buys.length === 0 &&
      (!row.positions || row.positions.length === 0) &&
      (row.totalPnlSol === 0 || !Number.isFinite(row.totalPnlSol));
    if (!rowInactive) return row;
    return prev;
  });

  const byMint: Record<string, { walletCount: number; buys: WalletBuy[] }> = {};
  for (const item of mergedActivity) {
    for (const buy of item.buys) {
      if (!byMint[buy.mint]) byMint[buy.mint] = { walletCount: 0, buys: [] };
      byMint[buy.mint].buys.push(buy);
    }
  }

  for (const mint of Object.keys(byMint)) {
    const uniqueWallets = new Set(byMint[mint].buys.map((b) => b.wallet));
    byMint[mint].walletCount = uniqueWallets.size;
  }

  const pnlMints = Array.from(new Set(mergedActivity.flatMap((item) => item.positions.map((pos) => pos.mint))));
  const nowSec = Math.floor(Date.now() / 1000);
  type MintAggregate = {
    mint: string;
    walletSet: Set<string>;
    recentWalletSet: Set<string>;
    openWalletSet: Set<string>;
    buys: WalletBuy[];
    amountTotal: number;
    solFlow: number;
    lastBuyAt: number;
    lastTradeAt: number;
    openQty: number;
  };
  const aggByMint = new Map<string, MintAggregate>();
  const getAgg = (mint: string): MintAggregate => {
    const hit = aggByMint.get(mint);
    if (hit) return hit;
    const next: MintAggregate = {
      mint,
      walletSet: new Set<string>(),
      recentWalletSet: new Set<string>(),
      openWalletSet: new Set<string>(),
      buys: [],
      amountTotal: 0,
      solFlow: 0,
      lastBuyAt: 0,
      lastTradeAt: 0,
      openQty: 0,
    };
    aggByMint.set(mint, next);
    return next;
  };

  for (const item of mergedActivity) {
    for (const buy of item.buys) {
      const agg = getAgg(buy.mint);
      agg.walletSet.add(item.wallet);
      if (buy.blockTime && buy.blockTime >= nowSec - RECENT_BUY_WINDOW_SEC) {
        agg.recentWalletSet.add(item.wallet);
      }
      agg.buys.push(buy);
      agg.amountTotal += buy.amount || 0;
      agg.solFlow += buy.solDelta || 0;
      const bts = buy.blockTime || 0;
      if (bts > agg.lastBuyAt) agg.lastBuyAt = bts;
      if (bts > agg.lastTradeAt) agg.lastTradeAt = bts;
    }
    for (const pos of item.positions || []) {
      const agg = getAgg(pos.mint);
      if ((pos.qty || 0) > 0.000001) {
        agg.openWalletSet.add(item.wallet);
        agg.openQty += pos.qty || 0;
      }
      const pts = pos.lastTradeAt || 0;
      if (pts > agg.lastTradeAt) agg.lastTradeAt = pts;
    }
  }

  const rankedMints = Array.from(aggByMint.values())
    .map((agg) => ({
      mint: agg.mint,
      walletCount: agg.walletSet.size,
      recentWalletCount: agg.recentWalletSet.size,
      openWalletCount: agg.openWalletSet.size,
      buyCount: agg.buys.length,
      wallets: Array.from(agg.walletSet),
      amountTotal: agg.amountTotal,
      solFlow: agg.solFlow,
      lastBuyAt: agg.lastBuyAt,
      lastTradeAt: agg.lastTradeAt,
      openQty: agg.openQty,
    }))
    .filter((row) => row.openWalletCount > 0 || row.recentWalletCount > 0 || row.buyCount >= 2)
    .sort((a, b) => {
      if (b.openWalletCount !== a.openWalletCount) return b.openWalletCount - a.openWalletCount;
      if (b.recentWalletCount !== a.recentWalletCount) return b.recentWalletCount - a.recentWalletCount;
      if (b.walletCount !== a.walletCount) return b.walletCount - a.walletCount;
      if (b.buyCount !== a.buyCount) return b.buyCount - a.buyCount;
      return b.lastTradeAt - a.lastTradeAt;
    });

  const mintsForMeta = Array.from(
    new Set([
      ...rankedMints.slice(0, TOKEN_METADATA_LIMIT).map((item) => item.mint),
      ...pnlMints.slice(0, TOKEN_METADATA_LIMIT),
      WSOL_MINT,
    ]),
  );
  const mintMetaMap = await mapMintMetaWithConcurrency(mintsForMeta);
  const solPriceUsd = await getSolPriceUsd(mintMetaMap);
  enrichWalletPnL(mergedActivity, mintMetaMap, solPriceUsd);

  const topWallets: TopWallet[] = mergedActivity
    .filter((item) => item.buys.length > 0 || Math.abs(item.totalPnlSol) > 1e-9)
    .map((item) => ({
      wallet: item.wallet,
      buyCount: item.buys.length,
      uniqueMints: item.uniqueMints,
      sampledPnlSol: item.sampledPnlSol,
      realizedPnlSol: item.realizedPnlSol,
      unrealizedPnlSol: item.unrealizedPnlSol,
      totalPnlSol: item.totalPnlSol,
      winRate: item.winRate,
      closedTrades: item.closedTrades,
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
      if (b.totalPnlSol !== a.totalPnlSol) return b.totalPnlSol - a.totalPnlSol;
      if (b.buyCount !== a.buyCount) return b.buyCount - a.buyCount;
      return b.uniqueMints - a.uniqueMints;
    });

  const topMints: TopMint[] = rankedMints
    .filter((item) => {
      const meta = mintMetaMap.get(item.mint);
      if (!meta) return true;
      const liq = meta.liquidityUsd || 0;
      const vol = meta.volume24h || 0;
      const staleNoPosition = item.openWalletCount === 0 && item.recentWalletCount === 0;
      if (staleNoPosition && liq < MIN_KEEP_LIQ_USD && vol < MIN_KEEP_VOL_USD) return false;
      return true;
    })
    .slice(0, TOKEN_METADATA_LIMIT)
    .map((item) => ({
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

  const activeWallets = mergedActivity.filter((item) => item.buys.length > 0).length;
  const totalBuys = mergedActivity.reduce((sum, item) => sum + item.buys.length, 0);

  const snapshot: SmartWalletSnapshot = {
    ok: true,
    timestamp: new Date().toISOString(),
    wallets,
    activity: mergedActivity,
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

  const nextRows = snapshotRowCount(snapshot);
  const nextTopWallets = snapshot.topWallets?.length || 0;
  if (canUsePrevious && previous) {
    const hardEmptyDrop = previousTopWallets > 0 && nextTopWallets === 0;
    const totalEmptyDrop = previousRows > 0 && nextRows === 0;
    const severeCollapse =
      previousRows >= 20 &&
      nextRows < Math.max(8, Math.floor(previousRows * 0.45));
    if (hardEmptyDrop || totalEmptyDrop || severeCollapse) {
      void kvIncr("trencher:metrics:smart_snapshot_guard_reused_previous_total", 60 * 60 * 24 * 30).catch(() => undefined);
      cache = { timestamp: Date.now(), data: previous };
      return previous;
    }
  }

  if (nextRows === 0) {
    return snapshot;
  }

  cache = { timestamp: Date.now(), data: snapshot };
  try {
    fs.writeFileSync(FILE_CACHE_PATH, JSON.stringify(snapshot));
  } catch {
    // ignore
  }
  try {
    await kvSet(KV_CACHE_KEY, snapshot, KV_CACHE_TTL_SECONDS);
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
  source: "memory" | "disk" | "kv" | "fresh";
}> {
  if (cache && isFresh(cache.data)) {
    if (snapshotRowCount(cache.data) === 0) {
      const kvCached = await readKvCache();
      if (kvCached && snapshotRowCount(kvCached) > 0) {
        cache = { timestamp: Date.now(), data: kvCached };
        void kvIncr("trencher:metrics:smart_snapshot_source:kv", 60 * 60 * 24 * 30).catch(() => undefined);
        return { data: kvCached, stale: !isFresh(kvCached), source: "kv" };
      }
    }
    void kvIncr("trencher:metrics:smart_snapshot_source:memory", 60 * 60 * 24 * 30).catch(() => undefined);
    return { data: cache.data, stale: false, source: "memory" };
  }

  const kvCached = await readKvCache();
  if (kvCached && snapshotRowCount(kvCached) > 0) {
    cache = { timestamp: Date.now(), data: kvCached };
    try {
      fs.writeFileSync(FILE_CACHE_PATH, JSON.stringify(kvCached));
    } catch {
      // ignore
    }
    const stale = !isFresh(kvCached);
    if (stale) {
      startBackgroundRefresh();
    }
    void kvIncr("trencher:metrics:smart_snapshot_source:kv", 60 * 60 * 24 * 30).catch(() => undefined);
    return { data: kvCached, stale, source: "kv" };
  }

  const diskCached = readFileCache();
  if (diskCached && snapshotRowCount(diskCached) > 0) {
    cache = { timestamp: Date.now(), data: diskCached };
    const stale = !isFresh(diskCached);
    if (stale) {
      startBackgroundRefresh();
    }
    void kvIncr("trencher:metrics:smart_snapshot_source:disk", 60 * 60 * 24 * 30).catch(() => undefined);
    return { data: diskCached, stale, source: "disk" };
  }

  if (refreshPromise) {
    const data = await refreshPromise;
    void kvIncr("trencher:metrics:smart_snapshot_source:fresh", 60 * 60 * 24 * 30).catch(() => undefined);
    return { data, stale: false, source: "fresh" };
  }

  refreshPromise = buildSnapshotInternal().finally(() => {
    refreshPromise = null;
  });
  const data = await refreshPromise;
  void kvIncr("trencher:metrics:smart_snapshot_source:fresh", 60 * 60 * 24 * 30).catch(() => undefined);
  return { data, stale: false, source: "fresh" };
}
