import { NextRequest, NextResponse } from "next/server";
import { buildSmartWalletSnapshot } from "@/lib/smart-wallets";
import { kvSet } from "@/lib/trencher/kv";

const LIVE_SMART_AT_KEY = "trencher:live:smart:at";

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

  try {
    const snapshot = await buildSmartWalletSnapshot(true);
    await kvSet(LIVE_SMART_AT_KEY, Date.now(), 3600);

    return NextResponse.json({
      ok: true,
      warmed: true,
      timestamp: snapshot.timestamp,
      rows: {
        topWallets: Array.isArray(snapshot.topWallets) ? snapshot.topWallets.length : 0,
        topMints: Array.isArray(snapshot.topMints) ? snapshot.topMints.length : 0,
        activity: Array.isArray(snapshot.activity) ? snapshot.activity.length : 0,
      },
      stats: snapshot.stats || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        warmed: false,
        error: "warm_failed",
        message: error?.message || "unknown error",
      },
      { status: 500 },
    );
  }
}
