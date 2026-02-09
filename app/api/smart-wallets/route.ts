import { NextRequest, NextResponse } from "next/server";
import { buildSmartWalletSnapshot, getSmartWalletSnapshot } from "@/lib/smart-wallets";
import { runLiveRefresh } from "@/lib/trencher/live";

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 80;
const rateLimitStore = new Map<string, { count: number; start: number }>();
let jupMap: Map<string, any> | null = null;
let jupFetchedAt = 0;

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
    .filter((r: any) => !r?.token?.name || !r?.token?.image)
    .slice(0, 72);
  if (!missing.length) return data;

  for (const row of missing) {
    const mint = String(row?.mint || "");
    if (!mint) continue;
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
          row.token = {
            ...row.token,
            name: row.token?.name || pair?.baseToken?.name || null,
            symbol: row.token?.symbol || pair?.baseToken?.symbol || null,
            image: row.token?.image || pair?.info?.imageUrl || null,
            priceUsd: row.token?.priceUsd ?? (pair?.priceUsd ? Number(pair.priceUsd) : null),
            change24h: row.token?.change24h ?? pair?.priceChange?.h24 ?? null,
            volume24h: row.token?.volume24h ?? pair?.volume?.h24 ?? null,
            liquidityUsd: row.token?.liquidityUsd ?? pair?.liquidity?.usd ?? null,
            pairUrl: row.token?.pairUrl || pair?.url || null,
            dex: row.token?.dex || pair?.dexId || null,
          };
          continue;
        }
      }
    } catch {
      // continue fallback
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
          const name = result?.content?.metadata?.name || null;
          const symbol = result?.content?.metadata?.symbol || null;
          if (name || symbol || image) {
            row.token = {
              ...row.token,
              name: row.token?.name || name,
              symbol: row.token?.symbol || symbol,
              image: row.token?.image || image,
            };
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return data;
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
    if (!force) {
      await runLiveRefresh("solana", "smart");
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
    const hydrated = await hydrateTopMintMeta(data);
    return NextResponse.json(hydrated, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        "X-Smart-Stale": stale ? "1" : "0",
        "X-Smart-Source": source,
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "smart_wallets_failed" }, { status: 500 });
  }
}
