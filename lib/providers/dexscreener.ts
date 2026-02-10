import type { Candle, Chain, Interval, MarketSnapshot, TokenIdentity } from "@/lib/trencher/types";
import { getAssetMetadata } from "@/lib/trencher/helius";

const FETCH_TIMEOUT_MS = 7_500;

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intervalToGecko(interval: Interval): { timeframe: "minute" | "hour" | "day"; aggregate: number; limit: number } {
  if (interval === "5m") return { timeframe: "minute", aggregate: 5, limit: 120 };
  if (interval === "1h") return { timeframe: "minute", aggregate: 60, limit: 120 };
  if (interval === "24h") return { timeframe: "hour", aggregate: 1, limit: 96 };
  return { timeframe: "day", aggregate: 1, limit: 120 };
}

export class DexscreenerMarketProvider {
  private static jupTokenMap: Map<string, any> | null = null;
  private static jupFetchedAt = 0;
  private static JUP_TTL = 60 * 60 * 1000;

  private async getJupToken(mint: string): Promise<any | null> {
    const now = Date.now();
    const stale = now - DexscreenerMarketProvider.jupFetchedAt > DexscreenerMarketProvider.JUP_TTL;
    if (!DexscreenerMarketProvider.jupTokenMap || stale) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch("https://tokens.jup.ag/tokens?tags=verified", {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const list = await res.json();
          const next = new Map<string, any>();
          if (Array.isArray(list)) {
            for (const token of list) {
              if (typeof token?.address === "string") next.set(token.address, token);
            }
          }
          DexscreenerMarketProvider.jupTokenMap = next;
          DexscreenerMarketProvider.jupFetchedAt = now;
        }
      } catch {
        // ignore
      }
    }
    return DexscreenerMarketProvider.jupTokenMap?.get(mint) ?? null;
  }

  private extractSocials(pair: any) {
    const websites = Array.isArray(pair?.info?.websites) ? pair.info.websites : [];
    const socials = Array.isArray(pair?.info?.socials) ? pair.info.socials : [];
    const website = websites.find((w: any) => typeof w?.url === "string")?.url ?? null;
    const twitter =
      socials.find((s: any) => String(s?.type || "").toLowerCase() === "twitter")?.url ?? null;
    const telegram =
      socials.find((s: any) => String(s?.type || "").toLowerCase() === "telegram")?.url ?? null;
    return { website, twitter, telegram };
  }

  async getPrimaryPair(chain: Chain, mint: string): Promise<any | null> {
    if (chain !== "solana") return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(timeout);
    if (!res) return null;
    if (!res.ok) return null;
    const json = await res.json();
    const pairs = Array.isArray(json.pairs) ? json.pairs : [];
    const pair = pairs
      .filter((p: any) => p?.chainId === "solana")
      .sort((a: any, b: any) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
    if (pair) return pair;

    // Fallback query: some new pairs lag on token endpoint but can be found via search.
    const searchController = new AbortController();
    const searchTimeout = setTimeout(() => searchController.abort(), FETCH_TIMEOUT_MS);
    const searchRes = await fetch(
      `https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(mint)}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: searchController.signal,
      },
    ).catch(() => null);
    clearTimeout(searchTimeout);
    if (!searchRes || !searchRes.ok) return null;
    const searchJson = await searchRes.json();
    const searchPairs = Array.isArray(searchJson?.pairs) ? searchJson.pairs : [];
    const best = searchPairs
      .filter((p: any) => p?.chainId === "solana")
      .sort((a: any, b: any) => {
        const aMintMatch = String(a?.baseToken?.address || "") === mint ? 1 : 0;
        const bMintMatch = String(b?.baseToken?.address || "") === mint ? 1 : 0;
        if (bMintMatch !== aMintMatch) return bMintMatch - aMintMatch;
        return Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0);
      })[0];
    return best || null;
  }

  async getTokenMarket(chain: Chain, mint: string): Promise<{ identity: TokenIdentity; market: MarketSnapshot }> {
    const pair = await this.getPrimaryPair(chain, mint);
    const jupToken = await this.getJupToken(mint);
    const heliusMeta = await getAssetMetadata(mint);
    if (!pair && !jupToken && !heliusMeta.name && !heliusMeta.symbol && !heliusMeta.image) {
      throw new Error("provider_error");
    }
    const pairSocials = this.extractSocials(pair);

    return {
      identity: {
        name: pair?.baseToken?.name || jupToken?.name || heliusMeta.name || null,
        symbol: pair?.baseToken?.symbol || jupToken?.symbol || heliusMeta.symbol || null,
        image: pair?.info?.imageUrl || jupToken?.logoURI || heliusMeta.image || null,
        socials: {
          website: pairSocials.website || jupToken?.extensions?.website || heliusMeta.website || null,
          twitter: pairSocials.twitter || jupToken?.extensions?.twitter || heliusMeta.twitter || null,
          telegram: pairSocials.telegram || jupToken?.extensions?.telegram || heliusMeta.telegram || null,
        },
      },
      market: {
        priceUsd: parseNumber(pair?.priceUsd),
        liquidityUsd: parseNumber(pair?.liquidity?.usd),
        volume24hUsd: parseNumber(pair?.volume?.h24),
        fdvUsd: parseNumber(pair?.fdv),
        marketCapUsd: parseNumber(pair?.marketCap),
        priceChange: {
          m5: parseNumber(pair?.priceChange?.m5),
          h1: parseNumber(pair?.priceChange?.h1),
          h24: parseNumber(pair?.priceChange?.h24),
        },
        txCount24h: (pair?.txns?.h24?.buys || 0) + (pair?.txns?.h24?.sells || 0) || null,
        pairUrl: pair?.url || `https://dexscreener.com/solana/${mint}`,
        dex: pair?.dexId || null,
      },
    };
  }

  async getCandles(chain: Chain, mint: string, interval: Interval): Promise<Candle[]> {
    const pair = await this.getPrimaryPair(chain, mint);
    const pool = pair?.pairAddress;
    if (!pool) return [];

    const geckoCfg = intervalToGecko(interval);
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${geckoCfg.timeframe}?aggregate=${geckoCfg.aggregate}&limit=${geckoCfg.limit}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) return [];
      const json = await res.json();
      const list = json?.data?.attributes?.ohlcv_list;
      if (!Array.isArray(list)) return [];
      return list
        .map((row: any) => ({
          // Keep UNIX time in seconds (all app charts normalize from seconds).
          t: Number(row[0]),
          o: Number(row[1]),
          h: Number(row[2]),
          l: Number(row[3]),
          c: Number(row[4]),
          v: Number(row[5] || 0),
        }))
        .filter((x: Candle) => Number.isFinite(x.t) && Number.isFinite(x.c));
    } catch {
      return [];
    }
  }
}
