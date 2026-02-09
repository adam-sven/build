import { NextRequest } from "next/server";
import { ok, parseChain } from "@/lib/trencher/http";
import { runLiveRefresh } from "@/lib/trencher/live";

export async function GET(request: NextRequest) {
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

