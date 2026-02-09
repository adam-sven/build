import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/trencher/auth";
import { buildDiscoverFeed } from "@/lib/trencher/service";
import { err, ok, parseChain } from "@/lib/trencher/http";
import type { DiscoverMode } from "@/lib/trencher/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    const status = auth.code === "rate_limited" ? 429 : 401;
    return err(auth.code, auth.message, status);
  }

  const chain = parseChain(request);
  const mode = (request.nextUrl.searchParams.get("mode") || "trending") as DiscoverMode;
  const allowed = new Set(["trending", "new", "voted", "quality"]);
  if (!allowed.has(mode)) {
    return err("provider_error", "mode must be trending|new|voted|quality", 400);
  }

  try {
    const feed = await buildDiscoverFeed(chain, mode);
    return ok(feed);
  } catch {
    return err("provider_error", "Failed to build discover feed.", 502);
  }
}
