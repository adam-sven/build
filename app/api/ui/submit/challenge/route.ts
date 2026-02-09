import { NextRequest } from "next/server";
import { createChallenge } from "@/lib/trencher/challenge";
import { hasSubmissionForMint } from "@/lib/trencher/db";
import { err, ok, parseChain, isValidSolanaMint } from "@/lib/trencher/http";

function validWallet(wallet: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(wallet);
}

export async function GET(request: NextRequest) {
  const chain = parseChain(request);
  const wallet = (request.nextUrl.searchParams.get("wallet") || "").trim();
  const mint = (request.nextUrl.searchParams.get("mint") || "").trim();

  if (!validWallet(wallet)) return err("invalid_wallet", "Wallet must be valid pubkey.", 400);
  if (!isValidSolanaMint(mint)) return err("invalid_mint", "Mint must be a valid address.", 400);
  if (await hasSubmissionForMint(chain, mint)) {
    return err(
      "token_already_submitted",
      "This token is already listed. Opening Intel instead so you can vote and discuss.",
      409,
    );
  }

  const challenge = await createChallenge({ kind: "submit", wallet, chain, mint });
  return ok({ ok: true, nonce: challenge.nonce, messageToSign: challenge.messageToSign, expiresAt: new Date(challenge.expiresAt).toISOString() });
}
