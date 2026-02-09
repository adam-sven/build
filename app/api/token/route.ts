import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/trencher/auth";
import { buildToken } from "@/lib/trencher/service";
import { err, ok, parseChain, parseMint, isValidSolanaMint } from "@/lib/trencher/http";
import type { Interval } from "@/lib/trencher/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    const status = auth.code === "rate_limited" ? 429 : 401;
    return err(auth.code, auth.message, status);
  }

  const chain = parseChain(request);
  const mint = parseMint(request);
  const interval = (request.nextUrl.searchParams.get("interval") || "1h") as Interval;

  if (!mint || !isValidSolanaMint(mint)) {
    return err("invalid_mint", "Mint must be a valid base58 address.", 400);
  }

  try {
    const token = await buildToken(chain, mint, interval);
    return ok(token);
  } catch (e) {
    return err("provider_error", "Unable to fetch token data from providers.", 502);
  }
}
