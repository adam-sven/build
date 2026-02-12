import { NextRequest, NextResponse } from "next/server";
import { buildSmartWalletSnapshot, getSmartWalletSnapshot, loadWallets } from "@/lib/smart-wallets";
import { runLiveRefresh } from "@/lib/trencher/live";
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
const TOP_MINT_MIN_WALLETS = Math.max(1, Number(process.env.SMART_TOP_MINT_MIN_WALLETS || "2"));
const MIN_TOP_MINT_ROWS = Math.max(3, Number(process.env.SMART_MIN_TOP_MINT_ROWS || "6"));
const DEX_TIMEOUT_MS = Number(process.env.SMART_DEX_TIMEOUT_MS || "3500");
const TRIGGER_LIVE_REFRESH_ON_READ = /^(1|true|yes)$/i.test(
  process.env.SMART_TRIGGER_LIVE_REFRESH_ON_READ || "true",
);
const SMART_ROUTE_CACHE_TTL_MS = Math.max(5_000, Number(process.env.SMART_ROUTE_CACHE_TTL_MS || "12000"));
const SMART_CACHE_CONTROL = "public, s-maxage=20, stale-while-revalidate=120";
let smartRouteCache: { at: number; data: any; stale: boolean; source: string } | null = null;
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
      if (res?.ok) {
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
    .filter((r: any) => {
      const token = r?.token || {};
      const identityMissing = !token?.name || !token?.image;
      const marketMissing =
        token?.priceUsd === null ||
        token?.priceUsd === undefined ||
        token?.volume24h === null ||
        token?.volume24h === undefined ||
        token?.liquidityUsd === null ||
        token?.liquidityUsd === undefined ||
        token?.marketCapUsd === null ||
        token?.marketCapUsd === undefined;
      return identityMissing || marketMissing;
    })
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
      const res = await Promise.race<Response | null>([
        fetch(`https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), DEX_TIMEOUT_MS)),
      ]);
      if (res?.ok) {
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
    row.token = {
      ...row.token,
      image: normalizeImageUrl(row.token?.image || cdnFallback),
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
      const res = await Promise.race<Response | null>([
        fetch(`https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), DEX_TIMEOUT_MS)),
      ]);
      if (!res?.ok) continue;
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

function chooseBestSnapshot(
  webhook: any | null,
  polled: any | null,
  expectedWalletCount: number,
): { data: any; source: "webhook" | "polled" } {
  if (!polled) return { data: webhook, source: "webhook" };
  if (!webhook) return { data: polled, source: "polled" };

  const webhookRows = hasDetailedWalletMetrics(webhook, expectedWalletCount) ? snapshotRows(webhook) : 0;
  const polledRows = snapshotRows(polled);
  const webhookTs = webhook?.timestamp ? new Date(webhook.timestamp).getTime() : 0;
  const polledTs = polled?.timestamp ? new Date(polled.timestamp).getTime() : 0;

  if (webhookRows === 0) return { data: polled, source: "polled" };
  if (polledRows === 0) return { data: webhook, source: "webhook" };

  // Guard against flash-collapse: a very small/partial webhook snapshot must not override a richer polled snapshot.
  const tooSparseVsPolled = webhookRows < Math.max(10, Math.floor(polledRows * 0.65));
  if (tooSparseVsPolled) return { data: polled, source: "polled" };

  const webhookNewer = webhookTs >= polledTs;
  return webhookNewer ? { data: webhook, source: "webhook" } : { data: polled, source: "polled" };
}

function hasDetailedWalletMetrics(snapshot: any, expectedWalletCount: number): boolean {
  if (!snapshot || Number(snapshot?.stats?.totalWallets || 0) < expectedWalletCount) return false;
  const activity = Array.isArray(snapshot?.activity) ? snapshot.activity : [];
  const withPositions = activity.filter((a: any) => Array.isArray(a?.positions));
  const hasPositionArrays = withPositions.length >= Math.max(3, Math.floor(expectedWalletCount * 0.2));
  const topWallets = Array.isArray(snapshot?.topWallets) ? snapshot.topWallets : [];
  const hasPnLFields = topWallets.some(
    (w: any) =>
      Number.isFinite(Number(w?.realizedPnlSol)) ||
      Number.isFinite(Number(w?.unrealizedPnlSol)) ||
      Number.isFinite(Number(w?.totalPnlSol)),
  );
  const hasCoverage = topWallets.some((w: any) => Number.isFinite(Number(w?.priceCoveragePct)));
  return hasPositionArrays && (hasPnLFields || hasCoverage);
}

function normalizeSmartLists(data: any) {
  const topWallets = Array.isArray(data?.topWallets) ? data.topWallets : [];
  for (const row of topWallets) {
    if (!Number.isFinite(Number(row?.winRate))) row.winRate = null;
    if (!Number.isFinite(Number(row?.priceCoveragePct))) row.priceCoveragePct = null;
    if (!Number.isFinite(Number(row?.realizedPnlSol))) row.realizedPnlSol = 0;
    if (!Number.isFinite(Number(row?.unrealizedPnlSol))) row.unrealizedPnlSol = 0;
    if (!Number.isFinite(Number(row?.totalPnlSol))) row.totalPnlSol = Number(row?.sampledPnlSol || 0);
  }
  topWallets.sort((a: any, b: any) => {
    const ap = Number.isFinite(Number(a?.totalPnlSol)) ? Number(a.totalPnlSol) : Number(a?.sampledPnlSol || 0);
    const bp = Number.isFinite(Number(b?.totalPnlSol)) ? Number(b.totalPnlSol) : Number(b?.sampledPnlSol || 0);
    if (bp !== ap) return bp - ap;
    const ab = Number(a?.buyCount || 0);
    const bb = Number(b?.buyCount || 0);
    if (bb !== ab) return bb - ab;
    return Number(b?.uniqueMints || 0) - Number(a?.uniqueMints || 0);
  });

  const topMints = Array.isArray(data?.topMints) ? data.topMints : [];
  const filtered = topMints.filter((m: any) => Number(m?.walletCount || 0) >= TOP_MINT_MIN_WALLETS);
  filtered.sort((a: any, b: any) => {
    const aChange = Number.isFinite(Number(a?.token?.change24h)) ? Number(a.token.change24h) : null;
    const bChange = Number.isFinite(Number(b?.token?.change24h)) ? Number(b.token.change24h) : null;
    if (aChange !== null && bChange !== null && bChange !== aChange) return bChange - aChange;
    if (bChange !== null && aChange === null) return 1;
    if (aChange !== null && bChange === null) return -1;
    if (Number(b?.walletCount || 0) !== Number(a?.walletCount || 0)) {
      return Number(b?.walletCount || 0) - Number(a?.walletCount || 0);
    }
    if (Number(b?.buyCount || 0) !== Number(a?.buyCount || 0)) {
      return Number(b?.buyCount || 0) - Number(a?.buyCount || 0);
    }
    return Number(b?.lastBuyAt || 0) - Number(a?.lastBuyAt || 0);
  });
  data.topMints = filtered;
  return data;
}

function mergeTopMintTokenFallbacks(next: any, prev: any) {
  const nextRows = Array.isArray(next?.topMints) ? next.topMints : [];
  const prevRows = Array.isArray(prev?.topMints) ? prev.topMints : [];
  if (!nextRows.length || !prevRows.length) return next;

  const prevByMint = new Map<string, any>();
  for (const row of prevRows) {
    const mint = String(row?.mint || "");
    if (!mint) continue;
    prevByMint.set(mint, row?.token || {});
  }

  for (const row of nextRows) {
    const mint = String(row?.mint || "");
    const oldToken = prevByMint.get(mint);
    if (!oldToken) continue;
    const token = row?.token || {};
    row.token = {
      ...oldToken,
      ...token,
      name: token?.name || oldToken?.name || null,
      symbol: token?.symbol || oldToken?.symbol || null,
      image: token?.image || oldToken?.image || null,
      priceUsd: token?.priceUsd ?? oldToken?.priceUsd ?? null,
      change24h: token?.change24h ?? oldToken?.change24h ?? null,
      volume24h: token?.volume24h ?? oldToken?.volume24h ?? null,
      liquidityUsd: token?.liquidityUsd ?? oldToken?.liquidityUsd ?? null,
      marketCapUsd: token?.marketCapUsd ?? oldToken?.marketCapUsd ?? null,
      fdvUsd: token?.fdvUsd ?? oldToken?.fdvUsd ?? null,
      pairUrl: token?.pairUrl || oldToken?.pairUrl || null,
      dex: token?.dex || oldToken?.dex || null,
    };
  }

  return next;
}

export async function GET(request: NextRequest) {
  const ip = getIp(request);
  if (!isAllowed(ip)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  try {
    const force = request.nextUrl.searchParams.get("force") === "1";
    const webhookMode = process.env.SMART_USE_WEBHOOK_EVENTS !== "false";
    const now = Date.now();
    if (!force && smartRouteCache && now - smartRouteCache.at < SMART_ROUTE_CACHE_TTL_MS) {
      return NextResponse.json(smartRouteCache.data, {
        headers: {
          "Cache-Control": SMART_CACHE_CONTROL,
          "X-Smart-Stale": smartRouteCache.stale ? "1" : "0",
          "X-Smart-Source": smartRouteCache.source,
          "X-Smart-Cache": "memory-hit",
        },
      });
    }
    if (!force && TRIGGER_LIVE_REFRESH_ON_READ) {
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
    const expectedWalletCount = loadWallets().length;
    if (webhookMode) {
      cachedWebhook = await getStoredSmartSnapshotFromEvents();
      if (cachedWebhook) {
        const webhookLooksComplete = hasDetailedWalletMetrics(cachedWebhook, expectedWalletCount);
        if (!webhookLooksComplete) {
          // Rebuild when webhook snapshot is stale/incomplete versus local tracked wallet sources.
          void refreshAndStoreSmartSnapshotFromEvents();
        }
      } else {
        void refreshAndStoreSmartSnapshotFromEvents();
      }
    }

    const { data: polled, stale, source } = await getSmartWalletSnapshot();
    const picked = chooseBestSnapshot(cachedWebhook, polled, expectedWalletCount);
    const data = picked.data || polled;
    const effectiveSource = picked.source === "webhook" ? "webhook" : source;

    const fp = getSnapshotFingerprint(data);
    const nowTs = Date.now();
    if (
      hydratedCache &&
      hydratedCache.fingerprint === fp &&
      nowTs - hydratedCache.at < HYDRATE_CACHE_TTL_MS
    ) {
      const fast = await applyHotMintFastLane(hydratedCache.data);
      smartRouteCache = { at: nowTs, data: fast, stale, source: effectiveSource };
      return NextResponse.json(fast, {
        headers: {
          "Cache-Control": SMART_CACHE_CONTROL,
          "X-Smart-Stale": stale ? "1" : "0",
          "X-Smart-Source": effectiveSource,
          "X-Smart-Hydrate": "cache+hot",
        },
      });
    }

    const hydrated = normalizeSmartLists(hydrateWalletProfiles(await hydrateTopMintMeta(data)));
    const fastHydrated = await applyHotMintFastLane(hydrated);
    if (hydratedCache) {
      mergeTopMintTokenFallbacks(fastHydrated, hydratedCache.data);
    }
    if (
      hydratedCache &&
      Array.isArray(fastHydrated?.topMints) &&
      fastHydrated.topMints.length < MIN_TOP_MINT_ROWS
    ) {
      const prevTop = Array.isArray(hydratedCache.data?.topMints) ? hydratedCache.data.topMints : [];
      if (prevTop.length >= MIN_TOP_MINT_ROWS) {
        fastHydrated.topMints = prevTop;
      }
    }
    if (hydratedCache && Array.isArray(fastHydrated?.topWallets)) {
      const prevWallets = Array.isArray(hydratedCache.data?.topWallets) ? hydratedCache.data.topWallets : [];
      const nextWallets = fastHydrated.topWallets;
      const severeWalletDrop =
        prevWallets.length >= 10 && nextWallets.length < Math.max(5, Math.floor(prevWallets.length * 0.6));
      if (severeWalletDrop) {
        fastHydrated.topWallets = prevWallets;
      }
    }
    hydratedCache = { at: nowTs, fingerprint: fp, data: fastHydrated };
    smartRouteCache = { at: nowTs, data: fastHydrated, stale, source: effectiveSource };
    return NextResponse.json(fastHydrated, {
      headers: {
        "Cache-Control": SMART_CACHE_CONTROL,
        "X-Smart-Stale": stale ? "1" : "0",
        "X-Smart-Source": effectiveSource,
        "X-Smart-Hydrate": "fresh+hot",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "smart_wallets_failed" }, { status: 500 });
  }
}
