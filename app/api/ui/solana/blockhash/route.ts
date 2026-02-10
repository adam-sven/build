import { getConnection } from "@/lib/trencher/helius";
import { ok, err } from "@/lib/trencher/http";

export async function GET() {
  try {
    const conn = getConnection();
    const bh = await conn.getLatestBlockhash("confirmed");
    return ok({ ok: true, ...bh });
  } catch (e: any) {
    return err("rpc_error", e?.message || "Failed to fetch recent blockhash", 502);
  }
}

