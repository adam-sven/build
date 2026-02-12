import { NextRequest, NextResponse } from "next/server";
import {
  parseHeliusWebhookEvents,
  refreshAndStoreSmartSnapshotFromEvents,
  storeWalletEvents,
} from "@/lib/trencher/helius-ingest";
import { kvSet } from "@/lib/trencher/kv";

const LIVE_SMART_AT_KEY = "trencher:live:smart:at";

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

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let payload: any = null;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const events = parseHeliusWebhookEvents(payload);
  const stored = await storeWalletEvents(events);
  const buildInline = /^(1|true|yes)$/i.test(process.env.HELIUS_INGEST_BUILD_INLINE || "");
  if (buildInline) {
    await refreshAndStoreSmartSnapshotFromEvents();
  } else {
    void refreshAndStoreSmartSnapshotFromEvents().catch(() => undefined);
  }
  void kvSet(LIVE_SMART_AT_KEY, Date.now(), 3600).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    parsed: events.length,
    stored: stored.stored,
    totalEvents: stored.total,
    snapshotBuildQueued: !buildInline,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const snapshot = await refreshAndStoreSmartSnapshotFromEvents();
  void kvSet(LIVE_SMART_AT_KEY, Date.now(), 3600).catch(() => undefined);
  return NextResponse.json({
    ok: true,
    snapshotBuilt: Boolean(snapshot),
    activeWallets: snapshot?.stats?.activeWallets ?? 0,
    trackedMints: snapshot?.stats?.totalTrackedMints ?? 0,
    timestamp: new Date().toISOString(),
  });
}
