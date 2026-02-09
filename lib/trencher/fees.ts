import { PublicKey } from "@solana/web3.js";
import { TREASURY_PUBKEY } from "@/lib/trencher/config";
import { getConnection } from "@/lib/trencher/helius";

export async function verifySystemTransferFee(params: {
  expectedFrom: string;
  feeTxSig: string;
  lamports: number;
}) {
  try {
    const conn = getConnection();
    const tx = await conn.getParsedTransaction(params.feeTxSig, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });
    if (!tx) return { ok: false, code: "invalid_fee_tx" as const };

    const from = new PublicKey(params.expectedFrom).toBase58();
    const treasury = new PublicKey(TREASURY_PUBKEY).toBase58();

    const found =
      tx.transaction.message.instructions.find((ins: any) => {
        if ("parsed" in ins && ins.program === "system" && ins.parsed?.type === "transfer") {
          const info = ins.parsed.info;
          return (
            info?.source === from &&
            info?.destination === treasury &&
            Number(info?.lamports) === params.lamports
          );
        }
        return false;
      }) || null;

    if (!found) return { ok: false, code: "invalid_fee_tx" as const };
    return { ok: true as const };
  } catch {
    return { ok: false, code: "invalid_fee_tx" as const };
  }
}
