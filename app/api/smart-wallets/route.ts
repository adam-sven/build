import { NextRequest, NextResponse } from "next/server";
import { buildSmartWalletSnapshot, getSmartWalletSnapshot } from "@/lib/smart-wallets";
import { runLiveRefresh } from "@/lib/trencher/live";
import { getAssetMetadata } from "@/lib/trencher/helius";
import {
  getStoredSmartSnapshotFromEvents,
  refreshAndStoreSmartSnapshotFromEvents,
} from "@/lib/trencher/helius-ingest";

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 80;
const rateLimitStore = new Map<string, { count: number; start: number }>();
let jupMap: Map<string, any> | null = null;
let jupFetchedAt = 0;
const HYDRATE_CACHE_TTL_MS = Number(process.env.SMART_HYDRATE_TTL_MS || "120000");
let hydratedCache: { at: number; fingerprint: string; data: any } | null = null;
const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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
    const pair = dexMap.get(mint);
    if (pair) {
      row.token = {
        ...row.token,
        name: row.token?.name || pair?.baseToken?.name || null,
        symbol: row.token?.symbol || pair?.baseToken?.symbol || null,
        image: row.token?.image || pair?.info?.imageUrl || null,
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
        image: row.token?.image || jup?.logoURI || null,
      };
      continue;
    }

    const helius = await getAssetMetadata(mint);
    row.token = {
      ...row.token,
      name: row.token?.name || helius.name,
      symbol: row.token?.symbol || helius.symbol,
      image: row.token?.image || helius.image,
    };
  }

  return data;
}

function getSnapshotFingerprint(data: any): string {
  const ts = String(data?.timestamp || "");
  const top = Array.isArray(data?.topMints) ? data.topMints.slice(0, 12) : [];
  return `${ts}:${top.map((m: any) => m?.mint || "").join(",")}`;
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && !process.env.HELIUS_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "missing_helius_api_key" },
      { status: 503 },
    );
  }

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

    if (webhookMode) {
      if (force) {
        const refreshed = await refreshAndStoreSmartSnapshotFromEvents();
        if (refreshed) {
          const hydrated = await hydrateTopMintMeta(refreshed);
          return NextResponse.json(hydrated, {
            headers: {
              "Cache-Control": "no-store, max-age=0",
              "X-Smart-Cache": "force-refresh",
              "X-Smart-Source": "webhook",
            },
          });
        }
      }

      const cachedWebhook = await getStoredSmartSnapshotFromEvents();
      if (cachedWebhook) {
        const hydrated = await hydrateTopMintMeta(cachedWebhook);
        return NextResponse.json(hydrated, {
          headers: {
            "Cache-Control": "public, s-maxage=20, stale-while-revalidate=120",
            "X-Smart-Stale": "0",
            "X-Smart-Source": "webhook",
            "X-Smart-Hydrate": "fresh",
          },
        });
      }
    }

    if (force) {
      const data = await buildSmartWalletSnapshot(true);
      const hydrated = await hydrateTopMintMeta(data);
      return NextResponse.json(hydrated, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Smart-Cache": "force-refresh",
        },
      });
    }

    const { data, stale, source } = await getSmartWalletSnapshot();
    const fp = getSnapshotFingerprint(data);
    const now = Date.now();
    if (
      hydratedCache &&
      hydratedCache.fingerprint === fp &&
      now - hydratedCache.at < HYDRATE_CACHE_TTL_MS
    ) {
      return NextResponse.json(hydratedCache.data, {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
          "X-Smart-Stale": stale ? "1" : "0",
          "X-Smart-Source": source,
          "X-Smart-Hydrate": "cache",
        },
      });
    }

    const hydrated = await hydrateTopMintMeta(data);
    hydratedCache = { at: now, fingerprint: fp, data: hydrated };
    return NextResponse.json(hydrated, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        "X-Smart-Stale": stale ? "1" : "0",
        "X-Smart-Source": source,
        "X-Smart-Hydrate": "fresh",
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "smart_wallets_failed" }, { status: 500 });
  }
}
