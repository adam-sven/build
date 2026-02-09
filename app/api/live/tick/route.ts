import { NextRequest } from "next/server";
import { ok, parseChain } from "@/lib/trencher/http";
import { runLiveRefresh } from "@/lib/trencher/live";
import { LIVE_TICK_SECRET } from "@/lib/trencher/config";

function isAuthorized(request: NextRequest) {
  if (!LIVE_TICK_SECRET) return true;
  return request.headers.get("authorization") === `Bearer ${LIVE_TICK_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json(
      { ok: false, error: { code: "api_key_invalid", message: "Invalid live tick secret" } },
      { status: 401 },
    );
  }

  const chain = parseChain(request);
  const rawScope = request.nextUrl.searchParams.get("scope") || "all";
  const scope = rawScope === "discover" || rawScope === "smart" ? rawScope : "all";

  const out = await runLiveRefresh(chain, scope);
  return ok({
    ...out,
    chain,
    scope,
    now: new Date().toISOString(),
  });
}
