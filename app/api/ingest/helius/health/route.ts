import { NextRequest, NextResponse } from "next/server";
import { getHeliusIngestHealth } from "@/lib/trencher/helius-ingest";

function isAuthorized(request: NextRequest) {
  const secret = process.env.HELIUS_WEBHOOK_SECRET || "";
  if (!secret) return true;

  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerSecret =
    request.headers.get("x-helius-secret") ||
    request.headers.get("x-webhook-secret") ||
    request.nextUrl.searchParams.get("secret") ||
    "";

  return bearer === secret || headerSecret === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const health = await getHeliusIngestHealth();
  return NextResponse.json({
    ok: true,
    ...health,
    serverTime: new Date().toISOString(),
  });
}

