import { NextRequest } from "next/server";
import { buildDiscoverFeed } from "@/lib/trencher/service";
import { err, ok, parseChain } from "@/lib/trencher/http";
import type { DiscoverMode } from "@/lib/trencher/types";
import { runLiveRefresh } from "@/lib/trencher/live";

export async function GET(request: NextRequest) {
  const chain = parseChain(request);
  const mode = (request.nextUrl.searchParams.get("mode") || "trending") as DiscoverMode;
  const allowed = new Set(["trending", "new", "voted", "quality"]);
  if (!allowed.has(mode)) return err("provider_error", "Invalid mode", 400);

  try {
    await runLiveRefresh(chain, "discover");
    const feed = await buildDiscoverFeed(chain, mode);
    return ok(feed);
  } catch {
    return err("provider_error", "Failed to load feed", 502);
  }
}
