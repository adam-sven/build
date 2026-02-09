import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/trencher/auth";
import { getRecentVoters, getVotes24h } from "@/lib/trencher/db";
import { err, isValidSolanaMint, ok, parseChain, parseMint } from "@/lib/trencher/http";

export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return err(auth.code, auth.message, auth.code === "rate_limited" ? 429 : 401);
  }

  const chain = parseChain(request);
  const mint = parseMint(request);
  if (!isValidSolanaMint(mint)) {
    return err("invalid_mint", "Mint is invalid.", 400);
  }

  const [votes, voters] = await Promise.all([
    getVotes24h(chain, mint),
    getRecentVoters(chain, mint, 25),
  ]);

  return ok({
    apiVersion: "v1",
    ok: true,
    chain,
    mint,
    up24h: votes.up24h,
    down24h: votes.down24h,
    score24h: votes.up24h - votes.down24h,
    voters,
  });
}
