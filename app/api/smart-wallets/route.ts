import { NextRequest, NextResponse } from "next/server";
import { buildSmartWalletSnapshot, getSmartWalletSnapshot } from "@/lib/smart-wallets";
import { runLiveRefresh } from "@/lib/trencher/live";
import { getAssetMetadata } from "@/lib/trencher/helius";
import {
  getStoredSmartSnapshotFromEvents,
  refreshAndStoreSmartSnapshotFromEvents,
} from "@/lib/trencher/helius-ingest";
import { normalizeImageUrl } from "@/lib/utils";
import { getWalletProfilesMap } from "@/lib/wallet-profiles";

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 80;
const rateLimitStore = new Map<string, { count: number; start: number }>();
let jupMap: Map<string, any> | null = null;
let jupFetchedAt = 0;
const HYDRATE_CACHE_TTL_MS = Number(process.env.SMART_HYDRATE_TTL_MS || "120000");
let hydratedCache: { at: number; fingerprint: string; data: any } | null = null;
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HOT_MINT_COUNT = Number(process.env.SMART_HOT_MINT_COUNT || "12");
const HOT_MINT_TTL_MS = Number(process.env.SMART_HOT_MINT_TTL_MS || "30000");
const hotMintCache = new Map<
  string,
  {
    at: number;
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
  }
>();

function getIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (!fwd) return "anonymous";
  const ip = fwd.split(",")[0]?.trim();
  return ip || "anonymous";
}

function isAllowed(ip: string): boolean {
  const now = Date.now();
  const existing = rateLimitStore.get(ip);
  if (!existing || now - existing.start > RATE_LIMIT_WINDOW) {
    rateLimitStore.set(ip, { count: 1, start: now });
    return true;
  }
  if (existing.count >= RATE_LIMIT_MAX) return false;
  existing.count += 1;
  return true;
}

async function getJupToken(mint: string): Promise<any | null> {
  const now = Date.now();
  const stale = now - jupFetchedAt > 60 * 60 * 1000;
  if (!jupMap || stale) {
    try {
      const res = await fetch("https://tokens.jup.ag/tokens?tags=verified", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const list = await res.json();
        const next = new Map<string, any>();
        if (Array.isArray(list)) {
          for (const t of list) {
            if (typeof t?.address === "string") next.set(t.address, t);
          }
        }
        jupMap = next;
        jupFetchedAt = now;
      }
    } catch {
      // ignore
    }
  }
  return jupMap?.get(mint) ?? null;
}

async function hydrateTopMintMeta(data: any) {
  const rows = Array.isArray(data?.topMints) ? data.topMints : [];
  const missing = rows
    .filter((r: any) => MINT_RE.test(String(r?.mint || "")))
    .filter((r: any) => !r?.token?.name || !r?.token?.image)
    .slice(0, 90);
  if (!missing.length) return data;

  const batches: string[][] = [];
  const uniqueMints = Array.from(
    new Set<string>(missing.map((r: any) => String(r?.mint || ""))),
  ).filter((m) => MINT_RE.test(m));
  for (let i = 0; i < uniqueMints.length; i += 25) {
    batches.push(uniqueMints.slice(i, i + 25));
  }

  const dexMap = new Map<string, any>();
  for (const batch of batches) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const json = await res.json();
        const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
        for (const pair of pairs) {
          if (pair?.chainId !== "solana") continue;
          const mint = String(pair?.baseToken?.address || "");
          if (!MINT_RE.test(mint)) continue;
          const prev = dexMap.get(mint);
          const prevLiq = Number(prev?.liquidity?.usd || 0);
          const nextLiq = Number(pair?.liquidity?.usd || 0);
          if (!prev || nextLiq > prevLiq) {
            dexMap.set(mint, pair);
          }
        }
      }
    } catch {
      // ignore dex batch failures
    }
  }

  for (const row of missing) {
    const mint = String(row?.mint || "");
    if (!MINT_RE.test(mint)) continue;
    const cdnFallback = `https://cdn.dexscreener.com/tokens/solana/${mint}.png`;
    const pair = dexMap.get(mint);
    if (pair) {
      row.token = {
        ...row.token,
        name: row.token?.name || pair?.baseToken?.name || null,
        symbol: row.token?.symbol || pair?.baseToken?.symbol || null,
        image: normalizeImageUrl(row.token?.image || pair?.info?.imageUrl || cdnFallback),
        priceUsd: row.token?.priceUsd ?? (pair?.priceUsd ? Number(pair.priceUsd) : null),
        change24h: row.token?.change24h ?? pair?.priceChange?.h24 ?? null,
        volume24h: row.token?.volume24h ?? pair?.volume?.h24 ?? null,
        liquidityUsd: row.token?.liquidityUsd ?? pair?.liquidity?.usd ?? null,
        marketCapUsd: row.token?.marketCapUsd ?? pair?.marketCap ?? null,
        fdvUsd: row.token?.fdvUsd ?? pair?.fdv ?? null,
        pairUrl: row.token?.pairUrl || pair?.url || null,
        dex: row.token?.dex || pair?.dexId || null,
      };
      continue;
    }

    const jup = await getJupToken(mint);
    if (jup) {
      row.token = {
        ...row.token,
        name: row.token?.name || jup?.name || null,
        symbol: row.token?.symbol || jup?.symbol || null,
        image: normalizeImageUrl(row.token?.image || jup?.logoURI || cdnFallback),
      };
      continue;
    }

    const helius = await getAssetMetadata(mint);
    row.token = {
      ...row.token,
      name: row.token?.name || helius.name,
      symbol: row.token?.symbol || helius.symbol,
      image: normalizeImageUrl(row.token?.image || helius.image || cdnFallback),
    };
  }

  return data;
}

async function applyHotMintFastLane(data: any) {
  const rows = Array.isArray(data?.topMints) ? data.topMints : [];
  if (!rows.length || HOT_MINT_COUNT <= 0) return data;

  const hotRows = rows
    .slice(0, HOT_MINT_COUNT)
    .filter((r: any) => MINT_RE.test(String(r?.mint || "")));
  if (!hotRows.length) return data;

  const now = Date.now();
  const staleMints: string[] = [];
  for (const row of hotRows) {
    const mint = String(row.mint);
    const cached = hotMintCache.get(mint);
    if (cached && now - cached.at <= HOT_MINT_TTL_MS) {
      row.token = { ...row.token, ...cached.token };
    } else {
      staleMints.push(mint);
    }
  }

  if (!staleMints.length) return data;

  const dexMap = new Map<string, any>();
  for (let i = 0; i < staleMints.length; i += 25) {
    const batch = staleMints.slice(i, i + 25);
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
      for (const pair of pairs) {
        if (pair?.chainId !== "solana") continue;
        const mint = String(pair?.baseToken?.address || "");
        if (!MINT_RE.test(mint)) continue;
        const prev = dexMap.get(mint);
        const prevLiq = Number(prev?.liquidity?.usd || 0);
        const nextLiq = Number(pair?.liquidity?.usd || 0);
        if (!prev || nextLiq > prevLiq) dexMap.set(mint, pair);
      }
    } catch {
      // ignore dex refresh failures
    }
  }

  for (const row of hotRows) {
    const mint = String(row.mint);
    const pair = dexMap.get(mint);
    if (!pair) continue;
    const token = {
      name: row.token?.name || pair?.baseToken?.name || null,
      symbol: row.token?.symbol || pair?.baseToken?.symbol || null,
      image: normalizeImageUrl(row.token?.image || pair?.info?.imageUrl || null),
      priceUsd: row.token?.priceUsd ?? (pair?.priceUsd ? Number(pair.priceUsd) : null),
      change24h: pair?.priceChange?.h24 ?? row.token?.change24h ?? null,
      volume24h: pair?.volume?.h24 ?? row.token?.volume24h ?? null,
      liquidityUsd: pair?.liquidity?.usd ?? row.token?.liquidityUsd ?? null,
      marketCapUsd: pair?.marketCap ?? row.token?.marketCapUsd ?? null,
      fdvUsd: pair?.fdv ?? row.token?.fdvUsd ?? null,
      pairUrl: pair?.url || row.token?.pairUrl || null,
      dex: pair?.dexId || row.token?.dex || null,
    };
    row.token = { ...row.token, ...token };
    hotMintCache.set(mint, { at: now, token });
  }

  return data;
}

function hydrateWalletProfiles(data: any) {
  const profiles = getWalletProfilesMap();
  if (!profiles.size) return data;

  const topWallets = Array.isArray(data?.topWallets) ? data.topWallets : [];
  for (const row of topWallets) {
    const wallet = String(row?.wallet || "");
    const profile = profiles.get(wallet);
    if (!profile) continue;
    row.profile = {
      rank: profile.rank,
      name: profile.name,
      accountUrl: profile.accountUrl,
      twitter: profile.twitter,
      telegram: profile.telegram,
      website: profile.website,
    };
  }

  const activity = Array.isArray(data?.activity) ? data.activity : [];
  for (const row of activity) {
    const wallet = String(row?.wallet || "");
    const profile = profiles.get(wallet);
    if (!profile) continue;
    row.profile = {
      rank: profile.rank,
      name: profile.name,
      accountUrl: profile.accountUrl,
      twitter: profile.twitter,
      telegram: profile.telegram,
      website: profile.website,
    };
  }

  return data;
}

function getSnapshotFingerprint(data: any): string {
  const ts = String(data?.timestamp || "");
  const top = Array.isArray(data?.topMints) ? data.topMints.slice(0, 12) : [];
  return `${ts}:${top.map((m: any) => m?.mint || "").join(",")}`;
}

function snapshotRows(data: any): number {
  const w = Array.isArray(data?.topWallets) ? data.topWallets.length : 0;
  const m = Array.isArray(data?.topMints) ? data.topMints.length : 0;
  return w + m;
}

export async function GET(request: NextRequest) {
  const ip = getIp(request);
  if (!isAllowed(ip)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  try {
    const force = request.nextUrl.searchParams.get("force") === "1";
    const webhookMode = process.env.SMART_USE_WEBHOOK_EVENTS !== "false";
    if (!force) {
      void runLiveRefresh("solana", "smart");
    }

    if (force) {
      const data = await buildSmartWalletSnapshot(true);
      const hydrated = hydrateWalletProfiles(await hydrateTopMintMeta(data));
      return NextResponse.json(hydrated, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Smart-Cache": "force-refresh",
        },
      });
    }

    let cachedWebhook: any | null = null;
    if (webhookMode) {
      cachedWebhook = await getStoredSmartSnapshotFromEvents();
      if (cachedWebhook) {
        const hasPnl = Array.isArray((cachedWebhook as any)?.activity)
          && (cachedWebhook as any).activity.some((a: any) => Array.isArray(a?.positions));
        if (!hasPnl) {
          void refreshAndStoreSmartSnapshotFromEvents();
        }
      } else {
        void refreshAndStoreSmartSnapshotFromEvents();
      }
    }

    const { data: polled, stale, source } = await getSmartWalletSnapshot();
    const webhookRows = snapshotRows(cachedWebhook);
    const polledRows = snapshotRows(polled);
    const webhookTs = cachedWebhook?.timestamp ? new Date(cachedWebhook.timestamp).getTime() : 0;
    const polledTs = polled?.timestamp ? new Date(polled.timestamp).getTime() : 0;
    const useWebhook = webhookRows > 0 && (polledRows === 0 || webhookTs >= polledTs);
    const data = useWebhook ? cachedWebhook : polled;
    const effectiveSource = useWebhook ? "webhook" : source;

    const fp = getSnapshotFingerprint(data);
    const now = Date.now();
    if (
      hydratedCache &&
      hydratedCache.fingerprint === fp &&
      now - hydratedCache.at < HYDRATE_CACHE_TTL_MS
    ) {
      const fast = await applyHotMintFastLane(hydratedCache.data);
      return NextResponse.json(fast, {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
          "X-Smart-Stale": stale ? "1" : "0",
          "X-Smart-Source": effectiveSource,
          "X-Smart-Hydrate": "cache+hot",
        },
      });
    }

    const hydrated = hydrateWalletProfiles(await hydrateTopMintMeta(data));
    const fastHydrated = await applyHotMintFastLane(hydrated);
    hydratedCache = { at: now, fingerprint: fp, data: fastHydrated };
    return NextResponse.json(fastHydrated, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        "X-Smart-Stale": stale ? "1" : "0",
        "X-Smart-Source": effectiveSource,
        "X-Smart-Hydrate": "fresh+hot",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "smart_wallets_failed" }, { status: 500 });
  }
}
