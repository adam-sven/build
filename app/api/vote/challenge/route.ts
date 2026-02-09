import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/trencher/auth";
import { createChallenge } from "@/lib/trencher/challenge";
import { err, ok, parseChain, isValidSolanaMint } from "@/lib/trencher/http";

function validWallet(wallet: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(wallet);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return err(auth.code, auth.message, auth.code === "rate_limited" ? 429 : 401);
  }

  const chain = parseChain(request);
  const wallet = (request.nextUrl.searchParams.get("wallet") || "").trim();
  const mint = (request.nextUrl.searchParams.get("mint") || "").trim();
  const direction = (request.nextUrl.searchParams.get("direction") || "").trim() as "up" | "down";

  if (!validWallet(wallet)) return err("invalid_wallet", "Wallet must be a valid pubkey.", 400);
  if (!isValidSolanaMint(mint)) return err("invalid_mint", "Mint must be a valid address.", 400);
  if (direction !== "up" && direction !== "down") return err("provider_error", "Direction must be up|down", 400);

  const challenge = await createChallenge({ kind: "vote", wallet, chain, mint, direction });
  return ok({ ok: true, nonce: challenge.nonce, messageToSign: challenge.messageToSign, expiresAt: new Date(challenge.expiresAt).toISOString() });
}
