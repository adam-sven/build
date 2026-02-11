import { getHolderStats } from "@/lib/trencher/helius";
import { marketProvider } from "@/lib/trencher/market";
import { calcSignals, finalScore } from "@/lib/trencher/scoring";
import {
  cacheFeed,
  cacheToken,
  getCachedFeed,
  getCachedToken,
  getCandidateMints,
  getSearchCounts,
  getTokenPeak,
  getVotes24h,
  upsertToken,
} from "@/lib/trencher/db";
import { SEARCH_TRENDING_THRESHOLD_1H } from "@/lib/trencher/config";
import {
  DISCOVER_MIN_LIQUIDITY_USD,
  DISCOVER_MIN_TX_24H,
  DISCOVER_MIN_VOLUME_24H_USD,
} from "@/lib/trencher/config";
import type {
  Chain,
  DiscoverMode,
  DiscoverResponse,
  Interval,
  TokenResponse,
  TokenRowSummary,
} from "@/lib/trencher/types";
import { kvDel, kvSetNx } from "@/lib/trencher/kv";

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchDexFallbackCandidates(chain: Chain): Promise<string[]> {
  if (chain !== "solana") return [];
  const queries = ["pump", "pumpswap", "pumpfun", "sol"];
  const out = new Set<string>();

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" }, cache: "no-store" },
      );
      if (!res.ok) continue;
      const json = await res.json();
      const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
      for (const p of pairs) {
        if (p?.chainId !== "solana") continue;
        const liq = Number(p?.liquidity?.usd || 0);
        const vol = Number(p?.volume?.h24 || 0);
        const tx24 =
          Number(p?.txns?.h24?.buys || 0) +
          Number(p?.txns?.h24?.sells || 0);
        const h24 = Number(p?.priceChange?.h24 || 0);
        const mint = p?.baseToken?.address;
        if (!mint) continue;
        if (liq < 20_000 || vol < 100_000 || tx24 < 120) continue;
        if (Number.isFinite(h24) && h24 <= -96) continue;
        out.add(String(mint));
        if (out.size >= 120) return [...out];
      }
    } catch {
      // continue
    }
  }

  return [...out];
}

export async function buildToken(
  chain: Chain,
  mint: string,
  interval: Interval = "1h",
  options?: { includeHolders?: boolean },
): Promise<TokenResponse> {
  const includeHolders = options?.includeHolders !== false;
  const tokenCacheScope = `${interval}:${includeHolders ? "full" : "lite"}`;
  const cached = await getCachedToken<TokenResponse>(chain, mint, tokenCacheScope);
  if (cached) return cached;

  const [marketData, holders, votes, search, peak, candles] = await Promise.all([
    marketProvider
      .getTokenMarket(chain, mint)
      .catch(() => ({
        identity: { name: null, symbol: null, image: null },
        market: {
          priceUsd: null,
          liquidityUsd: null,
          volume24hUsd: null,
          fdvUsd: null,
          marketCapUsd: null,
          priceChange: { m5: null, h1: null, h24: null },
          txCount24h: null,
          pairUrl: `https://dexscreener.com/solana/${mint}`,
          dex: null,
        },
      })),
    includeHolders
      ? withTimeout(
          getHolderStats(mint),
          Number(process.env.HOLDER_STATS_TIMEOUT_MS || "3000"),
          { holderCount: null, top10Pct: null, topHolders: [] },
        )
      : Promise.resolve({ holderCount: null, top10Pct: null, topHolders: [] }),
    getVotes24h(chain, mint),
    getSearchCounts(chain, mint),
    getTokenPeak(chain, mint),
    marketProvider.getCandles(chain, mint, interval).catch(() => []),
  ]);

  const signals = calcSignals({ market: marketData.market, top10Pct: holders.top10Pct });
  const scores = finalScore({
    up24h: votes.up24h,
    down24h: votes.down24h,
    market: marketData.market,
    searches1h: search.searches1h,
    searches24h: search.searches24h,
    flags: {
      bundles: signals.bundles,
      snipers: signals.snipers,
      botRisk: signals.botRisk,
      confidence: signals.confidence,
    },
  });

  const why: string[] = [];
  if ((marketData.market.liquidityUsd || 0) > 50_000 && (marketData.market.volume24hUsd || 0) > 100_000) {
    why.push("High liquidity with active volume.");
  }
  if (votes.up24h - votes.down24h > 0) why.push("Net positive votes in rolling 24h.");
  if (search.searches1h >= SEARCH_TRENDING_THRESHOLD_1H) why.push("High search interest in last hour.");
  if (why.length === 0) why.push("Baseline quality and activity signals only.");

  const payload: TokenResponse = {
    apiVersion: "v1",
    ok: true,
    chain,
    mint,
    identity: marketData.identity,
    market: marketData.market,
    candles: {
      interval,
      items: candles,
    },
    holders,
    signals,
    votes: {
      up24h: votes.up24h,
      down24h: votes.down24h,
      score24h: votes.up24h - votes.down24h,
      peakUpvotes24h: peak.peakUpvotes24h,
      peakScore: peak.peakScore,
      peakRank: peak.peakRank,
    },
    search: {
      searches1h: search.searches1h,
      searches24h: search.searches24h,
      trending: search.searches1h >= SEARCH_TRENDING_THRESHOLD_1H,
    },
    why,
    updatedAt: new Date().toISOString(),
  };

  await upsertToken({
    chain,
    mint,
    metadataJson: { name: payload.identity.name, symbol: payload.identity.symbol, image: payload.identity.image },
    peakRank: peak.peakRank,
    peakScore: Math.max(peak.peakScore, scores.score),
    peakUpvotes24h: Math.max(peak.peakUpvotes24h, votes.up24h),
  });

  const liteTtl = Number(process.env.TOKEN_CACHE_TTL_LITE_SEC || "18");
  const fullTtl = Number(process.env.TOKEN_CACHE_TTL_FULL_SEC || "45");

  if (includeHolders) {
    await Promise.all([
      cacheToken(chain, mint, payload, fullTtl, tokenCacheScope),
      cacheToken(chain, mint, payload, liteTtl, `${interval}:lite`),
    ]);
  } else {
    await cacheToken(chain, mint, payload, liteTtl, tokenCacheScope);
  }
  return payload;
}

function toRow(token: TokenResponse, final: number): TokenRowSummary {
  const pairUrl = token.market.pairUrl || "";
  const dex = (token.market.dex || "").toLowerCase();
  const mintLower = token.mint.toLowerCase();
  let source: "pumpfun" | "bagsapp" | "other" = "other";
  if (mintLower.endsWith("pump")) source = "pumpfun";
  else if (pairUrl.includes("pump.fun") || dex.includes("pump")) source = "pumpfun";
  else if (pairUrl.includes("bags") || dex.includes("bags")) source = "bagsapp";

  return {
    chain: token.chain,
    mint: token.mint,
    name: token.identity.name,
    symbol: token.identity.symbol,
    image: token.identity.image,
    priceUsd: token.market.priceUsd,
    marketCapUsd: token.market.marketCapUsd,
    fdvUsd: token.market.fdvUsd,
    liquidityUsd: token.market.liquidityUsd,
    volume24hUsd: token.market.volume24hUsd,
    txCount24h: token.market.txCount24h,
    priceChange: token.market.priceChange,
    votes: { up24h: token.votes.up24h, down24h: token.votes.down24h, score24h: token.votes.score24h },
    search: token.search,
    flags: {
      bundles: token.signals.bundles,
      snipers: token.signals.snipers,
      botRisk: token.signals.botRisk,
      confidence: token.signals.confidence,
    },
    why: token.why,
    pairUrl: token.market.pairUrl,
    source,
    peakRank: token.votes.peakRank,
    peakScore: token.votes.peakScore,
    finalScore: final,
  };
}

function isDiscoverEligible(token: TokenResponse, mode: DiscoverMode): boolean {
  const liq = token.market.liquidityUsd ?? 0;
  const vol = token.market.volume24hUsd ?? 0;
  const tx = token.market.txCount24h ?? 0;
  const h24 = token.market.priceChange.h24;
  const mcap = token.market.marketCapUsd ?? 0;
  const fdv = token.market.fdvUsd ?? 0;
  const hasIdentity = Boolean(token.identity.name || token.identity.symbol || token.identity.image);

  if (h24 !== null && Number.isFinite(h24) && h24 <= -96) return false;
  if (!hasIdentity && liq < DISCOVER_MIN_LIQUIDITY_USD * 1.5) return false;
  if (mode === "new") {
    return liq >= Math.max(8_000, DISCOVER_MIN_LIQUIDITY_USD * 0.65) &&
      vol >= Math.max(20_000, DISCOVER_MIN_VOLUME_24H_USD * 0.5);
  }
  if (mode === "voted") {
    return liq >= Math.max(10_000, DISCOVER_MIN_LIQUIDITY_USD * 0.8);
  }
  if (mode === "quality") {
    return (
      liq >= DISCOVER_MIN_LIQUIDITY_USD * 1.6 &&
      vol >= DISCOVER_MIN_VOLUME_24H_USD * 1.2 &&
      tx >= DISCOVER_MIN_TX_24H * 1.25 &&
      (mcap > 0 || fdv > 0)
    );
  }
  return (
    liq >= DISCOVER_MIN_LIQUIDITY_USD &&
    vol >= DISCOVER_MIN_VOLUME_24H_USD &&
    tx >= DISCOVER_MIN_TX_24H
  );
}

export async function buildDiscoverFeed(chain: Chain, mode: DiscoverMode): Promise<DiscoverResponse> {
  const cached = await getCachedFeed<DiscoverResponse>(chain, mode, { preferNonEmpty: true });
  if (cached) return cached;
  const staleCached = await getCachedFeed<DiscoverResponse>(chain, mode, { allowStale: true, preferNonEmpty: true });

  const lockKey = `trencher:lock:discover:${chain}:${mode}`;
  const gotLock = await kvSetNx(lockKey, "1", 25);
  if (!gotLock && staleCached) {
    return staleCached;
  }

  try {
    let candidates = await getCandidateMints(chain);
    if (candidates.length < 20) {
      const fallback = await fetchDexFallbackCandidates(chain);
      candidates = Array.from(new Set([...candidates, ...fallback]));
    }
    const sampled = candidates.slice(0, 90);
    const tokens = await Promise.all(
      sampled.map(async (mint) => {
        try {
          return await buildToken(chain, mint, "1h", { includeHolders: false });
        } catch {
          return null;
        }
      }),
    );

    const rows = tokens.filter(Boolean) as TokenResponse[];
    const scored = rows.map((t) => {
      const score = finalScore({
        up24h: t.votes.up24h,
        down24h: t.votes.down24h,
        market: t.market,
        searches1h: t.search.searches1h,
        searches24h: t.search.searches24h,
        flags: {
          bundles: t.signals.bundles,
          snipers: t.signals.snipers,
          botRisk: t.signals.botRisk,
          confidence: t.signals.confidence,
        },
      });
      return { token: t, ...score };
    });

    let sorted = scored;
    if (mode === "trending") sorted = [...scored].sort((a, b) => b.score - a.score);
    if (mode === "voted") sorted = [...scored].sort((a, b) => b.voteScore - a.voteScore);
    if (mode === "quality") sorted = [...scored].sort((a, b) => b.marketQuality - a.marketQuality);
    if (mode === "new") sorted = [...scored].sort((a, b) => +new Date(b.token.updatedAt) - +new Date(a.token.updatedAt));

    const tokenByMint = new Map(sorted.map((x) => [x.token.mint, x.token] as const));
    let items = sorted
      .map((x) => toRow(x.token, x.score))
      .filter((row) => {
        const token = tokenByMint.get(row.mint);
        return token ? isDiscoverEligible(token, mode) : false;
      })
      .slice(0, 100);

    if (items.length === 0) {
      if (staleCached?.items?.length) {
        return staleCached;
      }

      // Soft fallback to avoid blank feeds when strict filters or provider gaps temporarily eliminate all rows.
      items = sorted
        .map((x) => toRow(x.token, x.score))
        .filter((row) => (row.liquidityUsd || 0) >= 2_000 || (row.volume24hUsd || 0) >= 5_000)
        .slice(0, 40);
    }

    for (let i = 0; i < items.length; i += 1) {
      const row = items[i];
      await upsertToken({
        chain,
        mint: row.mint,
        peakRank: i + 1,
        peakScore: row.finalScore,
        peakUpvotes24h: row.votes.up24h,
      });
    }

    const out: DiscoverResponse = {
      apiVersion: "v1",
      ok: true,
      chain,
      mode,
      generatedAt: new Date().toISOString(),
      items,
    };

    await cacheFeed(chain, mode, out, 120);
    return out;
  } catch (error) {
    if (staleCached) return staleCached;
    throw error;
  } finally {
    await kvDel(lockKey);
  }
}
