import { NextRequest, NextResponse } from "next/server";
import { buildSmartWalletSnapshot } from "@/lib/smart-wallets";

function hasValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const data = await buildSmartWalletSnapshot(true);
    return NextResponse.json(
      { ok: true, timestamp: data.timestamp },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "refresh_failed" }, { status: 500 });
  }
}
