import { NextRequest } from "next/server";
import { CRON_SECRET } from "@/lib/trencher/config";
import { buildDiscoverFeed } from "@/lib/trencher/service";
import { err, ok } from "@/lib/trencher/http";
import type { DiscoverMode } from "@/lib/trencher/types";

function authorized(request: NextRequest) {
  if (!CRON_SECRET) return true;
  return request.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return err("api_key_invalid", "Invalid cron secret", 401);
  }

  const chain = "solana" as const;
  const modes: DiscoverMode[] = ["trending", "new", "voted", "quality"];

  const out = await Promise.all(
    modes.map(async (mode) => {
      try {
        const feed = await buildDiscoverFeed(chain, mode);
        return { mode, count: feed.items.length, ok: true };
      } catch {
        return { mode, ok: false };
      }
    }),
  );

  return ok({ ok: true, refreshedAt: new Date().toISOString(), out });
}
