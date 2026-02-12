import { NextRequest, NextResponse } from "next/server";
import { buildDiscoverFeed } from "@/lib/trencher/service";
import { err, parseChain } from "@/lib/trencher/http";
import type { DiscoverMode } from "@/lib/trencher/types";
import { runLiveRefresh } from "@/lib/trencher/live";

const TRIGGER_LIVE_REFRESH_ON_READ = /^(1|true|yes)$/i.test(
  process.env.DISCOVER_TRIGGER_LIVE_REFRESH_ON_READ || "",
);
const DISCOVER_ROUTE_CACHE_TTL_MS = Math.max(
  5_000,
  Number(process.env.DISCOVER_ROUTE_CACHE_TTL_MS || "15000"),
);
const DISCOVER_CACHE_CONTROL = "public, s-maxage=20, stale-while-revalidate=90";
const discoverRouteCache = new Map<string, { at: number; data: any }>();

function cacheKey(chain: string, mode: string) {
  return `${chain}:${mode}`;
}

export async function GET(request: NextRequest) {
  const chain = parseChain(request);
  const mode = (request.nextUrl.searchParams.get("mode") || "trending") as DiscoverMode;
  const allowed = new Set(["trending", "new", "voted", "quality"]);
  if (!allowed.has(mode)) return err("provider_error", "Invalid mode", 400);
  const key = cacheKey(chain, mode);
  const now = Date.now();
  const hit = discoverRouteCache.get(key);
  if (hit && now - hit.at < DISCOVER_ROUTE_CACHE_TTL_MS) {
    return NextResponse.json(hit.data, {
      headers: {
        "Cache-Control": DISCOVER_CACHE_CONTROL,
        "X-Discover-Cache": "memory-hit",
      },
    });
  }

  try {
    if (TRIGGER_LIVE_REFRESH_ON_READ) {
      void runLiveRefresh(chain, "discover");
    }
    const feed = await buildDiscoverFeed(chain, mode);
    discoverRouteCache.set(key, { at: now, data: feed });
    return NextResponse.json(feed, {
      headers: {
        "Cache-Control": DISCOVER_CACHE_CONTROL,
        "X-Discover-Cache": "fresh",
      },
    });
  } catch {
    return err("provider_error", "Failed to load feed", 502);
  }
}
