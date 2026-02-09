import { NextRequest } from "next/server";
import { buildToken } from "@/lib/trencher/service";
import { err, isValidSolanaMint, ok, parseChain, parseMint } from "@/lib/trencher/http";
import type { Interval } from "@/lib/trencher/types";

export async function GET(request: NextRequest) {
  const chain = parseChain(request);
  const mint = parseMint(request);
  const interval = (request.nextUrl.searchParams.get("interval") || "1h") as Interval;

  if (!isValidSolanaMint(mint)) return err("invalid_mint", "Invalid mint", 400);

  try {
    const token = await buildToken(chain, mint, interval);
    return ok(token);
  } catch {
    return err("provider_error", "Failed to load token", 502);
  }
}
