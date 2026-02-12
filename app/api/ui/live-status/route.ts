import { kvGet } from "@/lib/trencher/kv";
import { ok } from "@/lib/trencher/http";

const SMART_AT_KEY = "trencher:live:smart:at";
const DISCOVER_AT_KEYS = [
  "trencher:live:discover:at:solana:trending",
  "trencher:live:discover:at:solana:new",
  "trencher:live:discover:at:solana:voted",
  "trencher:live:discover:at:solana:quality",
];
let statusCache: { at: number; data: any } | null = null;
const STATUS_CACHE_TTL_MS = Math.max(3_000, Number(process.env.LIVE_STATUS_CACHE_TTL_MS || "10000"));

export async function GET() {
  const now = Date.now();
  if (statusCache && now - statusCache.at < STATUS_CACHE_TTL_MS) {
    return ok(statusCache.data);
  }
  const [smartAt, dTrend, dNew, dVoted, dQuality] = await Promise.all([
    kvGet<number>(SMART_AT_KEY),
    kvGet<number>(DISCOVER_AT_KEYS[0]),
    kvGet<number>(DISCOVER_AT_KEYS[1]),
    kvGet<number>(DISCOVER_AT_KEYS[2]),
    kvGet<number>(DISCOVER_AT_KEYS[3]),
  ]);

  const discoverAts = [dTrend || 0, dNew || 0, dVoted || 0, dQuality || 0].filter(Boolean);
  const discoverAt = discoverAts.length ? Math.min(...discoverAts) : 0;
  const updatedAt = Math.max(smartAt || 0, discoverAt || 0, 0);

  const payload = {
    ok: true,
    serverTime: now,
    updatedAt,
    smartAt: smartAt || 0,
    discoverAt: discoverAt || 0,
  };
  statusCache = { at: now, data: payload };
  return ok(payload);
}
