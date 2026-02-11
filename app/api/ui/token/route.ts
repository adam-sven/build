import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildToken } from "@/lib/trencher/service";
import { err, isValidSolanaMint, parseChain, parseMint } from "@/lib/trencher/http";
import type { Interval } from "@/lib/trencher/types";

export async function GET(request: NextRequest) {
  const chain = parseChain(request);
  const mint = parseMint(request);
  const interval = (request.nextUrl.searchParams.get("interval") || "1h") as Interval;
  const includeHolders = request.nextUrl.searchParams.get("includeHolders") === "1";

  if (!isValidSolanaMint(mint)) return err("invalid_mint", "Invalid mint", 400);

  try {
    const token = await buildToken(chain, mint, interval, { includeHolders });
    const cacheControl = includeHolders
      ? "public, s-maxage=20, stale-while-revalidate=120"
      : "public, s-maxage=10, stale-while-revalidate=60";
    return NextResponse.json(token, {
      headers: {
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return err("provider_error", "Failed to load token", 502);
  }
}
