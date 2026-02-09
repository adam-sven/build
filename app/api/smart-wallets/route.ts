import { NextRequest, NextResponse } from "next/server";
import { buildSmartWalletSnapshot, getSmartWalletSnapshot } from "@/lib/smart-wallets";

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 80;
const rateLimitStore = new Map<string, { count: number; start: number }>();

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
    if (force) {
      const data = await buildSmartWalletSnapshot(true);
      return NextResponse.json(data, {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Smart-Cache": "force-refresh",
        },
      });
    }

    const { data, stale, source } = await getSmartWalletSnapshot();
    return NextResponse.json(data, {
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
