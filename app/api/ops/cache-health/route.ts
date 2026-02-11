import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/trencher/kv";
import Redis from "ioredis";

const SMART_SNAPSHOT_KEY = "trencher:smart-wallets:snapshot:v1";
const LIVE_SMART_AT_KEY = "trencher:live:smart:at";
const DISCOVER_AT_KEYS = [
  "trencher:live:discover:at:solana:trending",
  "trencher:live:discover:at:solana:new",
  "trencher:live:discover:at:solana:voted",
  "trencher:live:discover:at:solana:quality",
];

function isAuthorized(request: NextRequest) {
  const secret = process.env.OPS_SECRET || process.env.LIVE_TICK_SECRET || "";
  if (!secret) return true;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  const query = request.nextUrl.searchParams.get("secret") || "";
  return bearer === secret || query === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [
    smartSnapshot,
    liveSmartAt,
    discoverTrendingAt,
    discoverNewAt,
    discoverVotedAt,
    discoverQualityAt,
    mMemory,
    mDisk,
    mKv,
    mFresh,
    mBuild,
    mGuardReuse,
  ] = await Promise.all([
    kvGet<any>(SMART_SNAPSHOT_KEY),
    kvGet<number>(LIVE_SMART_AT_KEY),
    kvGet<number>(DISCOVER_AT_KEYS[0]),
    kvGet<number>(DISCOVER_AT_KEYS[1]),
    kvGet<number>(DISCOVER_AT_KEYS[2]),
    kvGet<number>(DISCOVER_AT_KEYS[3]),
    kvGet<number>("trencher:metrics:smart_snapshot_source:memory"),
    kvGet<number>("trencher:metrics:smart_snapshot_source:disk"),
    kvGet<number>("trencher:metrics:smart_snapshot_source:kv"),
    kvGet<number>("trencher:metrics:smart_snapshot_source:fresh"),
    kvGet<number>("trencher:metrics:smart_snapshot_build_total"),
    kvGet<number>("trencher:metrics:smart_snapshot_guard_reused_previous_total"),
  ]);

  const topWallets = Array.isArray(smartSnapshot?.topWallets) ? smartSnapshot.topWallets.length : 0;
  const topMints = Array.isArray(smartSnapshot?.topMints) ? smartSnapshot.topMints.length : 0;
  const activity = Array.isArray(smartSnapshot?.activity) ? smartSnapshot.activity.length : 0;

  let redisHealth: {
    reachable: boolean;
    ping: string | null;
    snapshotKeyExists: boolean | null;
    error: string | null;
  } = {
    reachable: false,
    ping: null,
    snapshotKeyExists: null,
    error: null,
  };

  const redisUrl = process.env.REDIS_URL || "";
  if (redisUrl) {
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      tls: redisUrl.startsWith("rediss://") ? {} : undefined,
    });
    try {
      await client.connect();
      const [ping, exists] = await Promise.all([client.ping(), client.exists(SMART_SNAPSHOT_KEY)]);
      redisHealth = {
        reachable: true,
        ping: ping || null,
        snapshotKeyExists: exists === 1,
        error: null,
      };
    } catch (error: any) {
      redisHealth = {
        reachable: false,
        ping: null,
        snapshotKeyExists: null,
        error: error?.message || "redis check failed",
      };
    } finally {
      await client.quit().catch(() => undefined);
    }
  }

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    infra: {
      redisConfigured: Boolean(process.env.REDIS_URL),
      vercelKvConfigured: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
      heliusConfigured: Boolean(process.env.HELIUS_API_KEY),
      redisHealth,
    },
    liveRefresh: {
      smartAt: liveSmartAt || 0,
      discoverAt: {
        trending: discoverTrendingAt || 0,
        new: discoverNewAt || 0,
        voted: discoverVotedAt || 0,
        quality: discoverQualityAt || 0,
      },
    },
    smartSnapshot: {
      timestamp: smartSnapshot?.timestamp || null,
      rows: {
        topWallets,
        topMints,
        activity,
        total: topWallets + topMints,
      },
      stats: smartSnapshot?.stats || null,
    },
    counters: {
      sourceHits: {
        memory: mMemory || 0,
        disk: mDisk || 0,
        kv: mKv || 0,
        fresh: mFresh || 0,
      },
      snapshotBuilds: mBuild || 0,
      guardReusePrevious: mGuardReuse || 0,
    },
  });
}
