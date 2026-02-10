import { NextRequest } from "next/server";
import {
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { getConnection } from "@/lib/trencher/helius";
import { ok, err } from "@/lib/trencher/http";
import { TREASURY_PUBKEY, SUBMIT_FEE_LAMPORTS, VOTE_FEE_LAMPORTS } from "@/lib/trencher/public";

function base64ToBytes(base64: string) {
  return Uint8Array.from(Buffer.from(base64, "base64"));
}

function mustBeFeeTx(tx: Transaction, expectedLamports: number) {
  const treasury = new PublicKey(TREASURY_PUBKEY).toBase58();
  const feePayer = tx.feePayer?.toBase58() || "";
  if (!feePayer) return { ok: false as const, message: "Missing fee payer" };
  if (!tx.recentBlockhash) return { ok: false as const, message: "Missing recent blockhash" };

  // Only allow simple SystemProgram transfer to treasury for expectedLamports.
  const transferIxs = tx.instructions
    .filter((ix) => ix.programId.equals(SystemProgram.programId))
    .map((ix) => {
      try {
        const type = SystemInstruction.decodeInstructionType(ix);
        if (type !== "Transfer") return null;
        const decoded = SystemInstruction.decodeTransfer(ix);
        const lamports =
          typeof decoded.lamports === "bigint" ? Number(decoded.lamports) : Number(decoded.lamports);
        return {
          from: decoded.fromPubkey.toBase58(),
          to: decoded.toPubkey.toBase58(),
          lamports,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as { from: string; to: string; lamports: number }[];

  const found = transferIxs.find((t) => t.to === treasury && t.lamports === expectedLamports);
  if (!found) return { ok: false as const, message: "Transaction is not the required treasury fee transfer" };
  if (found.from !== feePayer) return { ok: false as const, message: "Fee payer must match transfer source" };

  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return err("provider_error", "Invalid JSON body", 400);

  const kind = String(body.kind || "").trim();
  const txBase64 = String(body.txBase64 || "").trim();
  if (kind !== "vote" && kind !== "submit") return err("provider_error", "kind must be vote|submit", 400);
  if (!txBase64) return err("provider_error", "Missing txBase64", 400);

  const expectedLamports = kind === "vote" ? VOTE_FEE_LAMPORTS : SUBMIT_FEE_LAMPORTS;

  try {
    const tx = Transaction.from(base64ToBytes(txBase64));
    const check = mustBeFeeTx(tx, expectedLamports);
    if (!check.ok) return err("invalid_fee_tx", check.message, 400);

    const conn = getConnection();
    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    });
    const latest = await conn.getLatestBlockhash("confirmed");
    await conn.confirmTransaction(
      { signature: sig, ...latest },
      "confirmed",
    );
    return ok({ ok: true, signature: sig });
  } catch (e: any) {
    return err("rpc_error", e?.message || "Failed to broadcast transaction", 502);
  }
}
