import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/trencher/auth";
import { consumeAndVerifyChallenge } from "@/lib/trencher/challenge";
import { SUBMIT_FEE_LAMPORTS } from "@/lib/trencher/config";
import { createSubmission, hasFeeSigUsed, hasSubmissionForMint, upsertToken } from "@/lib/trencher/db";
import { verifySystemTransferFee } from "@/lib/trencher/fees";
import { err, isValidSolanaMint, ok } from "@/lib/trencher/http";

function validWallet(wallet: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(wallet);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return err(auth.code, auth.message, auth.code === "rate_limited" ? 429 : 401);
  }

  const body = await request.json().catch(() => null);
  if (!body) return err("provider_error", "Invalid JSON body", 400);

  const chain = (body.chain || "solana") as "solana";
  const mint = String(body.mint || "").trim();
  const wallet = String(body.wallet || "").trim();
  const nonce = String(body.nonce || "");
  const message = String(body.message || "");
  const signatureBase64 = String(body.signature || "");
  const feeTxSig = String(body.feeTxSig || "").trim();

  if (!validWallet(wallet)) return err("invalid_wallet", "Wallet must be valid", 400);
  if (!isValidSolanaMint(mint)) return err("invalid_mint", "Mint must be valid", 400);

  const challenge = await consumeAndVerifyChallenge({
    kind: "submit",
    nonce,
    wallet,
    mint,
    chain,
    message,
    signatureBase64,
  });
  if (!challenge.ok) {
    return err(
      challenge.code,
      challenge.code === "nonce_expired" ? "Challenge expired" : "Signature verification failed",
      400,
    );
  }

  if (await hasSubmissionForMint(chain, mint)) {
    return err("token_already_submitted", "This token is already listed.", 409);
  }

  if (await hasFeeSigUsed("submit", feeTxSig)) {
    return err("submit_fee_reused", "Submit fee signature already used.", 409);
  }

  const feeCheck = await verifySystemTransferFee({
    expectedFrom: wallet,
    feeTxSig,
    lamports: SUBMIT_FEE_LAMPORTS,
  });
  if (!feeCheck.ok) {
    return err("submit_fee_invalid", "Submit fee tx must transfer exactly 0.01 SOL to treasury.", 400);
  }

  await createSubmission({ chain, mint, submitter: wallet, feeTxSig });
  await upsertToken({ chain, mint });

  return ok({ ok: true, message: "Submission recorded", chain, mint });
}
