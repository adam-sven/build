import { NextRequest } from "next/server";
import { requireApiKey, limitByIp } from "@/lib/trencher/auth";
import { logSearch } from "@/lib/trencher/db";
import { err, isValidSolanaMint, ok } from "@/lib/trencher/http";

function getIp(request: NextRequest) {
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || "anonymous").trim();
}

export async function POST(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return err(auth.code, auth.message, auth.code === "rate_limited" ? 429 : 401);
  }

  const ip = getIp(request);
  const allowed = await limitByIp(ip, "search-log", 30, 60);
  if (!allowed) return err("rate_limited", "Too many search logs from this IP", 429);

  const body = await request.json().catch(() => null);
  if (!body) return err("provider_error", "Invalid body", 400);

  const chain = (body.chain || "solana") as "solana";
  const query = String(body.query || "").trim();
  if (!query) return err("provider_error", "query is required", 400);

  const proposedResolvedMint = String(body.resolvedMint || "").trim();
  const resolvedMint = isValidSolanaMint(query)
    ? query
    : isValidSolanaMint(proposedResolvedMint)
      ? proposedResolvedMint
      : null;
  await logSearch({ chain, query, resolvedMint });

  return ok({ ok: true, resolvedMint });
}
