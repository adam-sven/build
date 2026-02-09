import { NextRequest } from "next/server";
import { consumeAndVerifyChallenge } from "@/lib/trencher/challenge";
import { VOTE_FEE_LAMPORTS } from "@/lib/trencher/config";
import { createVote, getVoteCooldown, getVoteDailyCount, hasFeeSigUsed } from "@/lib/trencher/db";
import { verifySystemTransferFee } from "@/lib/trencher/fees";
import { getSolBalance, getWalletAgeDays } from "@/lib/trencher/helius";
import { err, isValidSolanaMint, ok } from "@/lib/trencher/http";

function validWallet(wallet: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(wallet);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) return err("provider_error", "Invalid JSON body", 400);

  const chain = (body.chain || "solana") as "solana";
  const mint = String(body.mint || "").trim();
  const wallet = String(body.wallet || "").trim();
  const direction = String(body.direction || "") as "up" | "down";
  const nonce = String(body.nonce || "");
  const message = String(body.message || "");
  const signatureBase64 = String(body.signature || "");
  const feeTxSig = String(body.feeTxSig || "").trim();

  if (!validWallet(wallet)) return err("invalid_wallet", "Wallet must be valid", 400);
  if (!isValidSolanaMint(mint)) return err("invalid_mint", "Mint must be valid", 400);
  if (direction !== "up" && direction !== "down") return err("provider_error", "Direction must be up|down", 400);

  const challenge = await consumeAndVerifyChallenge({
    kind: "vote",
    nonce,
    wallet,
    mint,
    chain,
    direction,
    message,
    signatureBase64,
  });
  if (!challenge.ok) {
    const code = challenge.code;
    return err(code, code === "nonce_expired" ? "Challenge expired" : "Signature verification failed", 400);
  }

  const [ageDays, balance] = await Promise.all([getWalletAgeDays(wallet), getSolBalance(wallet)]);
  if (ageDays === null || ageDays < 7) return err("ineligible_wallet_age", "Wallet must be active for at least 7 days.", 403);
  if (balance === null || balance < 0.1) return err("ineligible_sol_balance", "Wallet balance must be at least 0.1 SOL.", 403);

  const lastVote = await getVoteCooldown(chain, mint, wallet);
  if (lastVote && Date.now() - lastVote.getTime() < 3600_000) return err("already_voted_cooldown", "You can vote once per wallet/mint per hour.", 409);

  const dailyCount = await getVoteDailyCount(chain, wallet);
  if (dailyCount >= 25) return err("daily_vote_limit", "Daily vote limit reached (25).", 429);

  if (await hasFeeSigUsed("vote", feeTxSig)) return err("fee_tx_reused", "Fee transaction signature already used.", 409);

  const feeCheck = await verifySystemTransferFee({ expectedFrom: wallet, feeTxSig, lamports: VOTE_FEE_LAMPORTS });
  if (!feeCheck.ok) return err("invalid_fee_tx", "Vote fee transaction must transfer exactly 0.001 SOL to treasury.", 400);

  await createVote({ chain, mint, voter: wallet, direction, feeTxSig });
  return ok({ ok: true, message: "Vote recorded" });
}
