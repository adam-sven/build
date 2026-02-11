import { Connection } from "@solana/web3.js";
import { ok, err } from "@/lib/trencher/http";

function rpcUrls(): string[] {
  const out: string[] = [];
  const primary = process.env.SOLANA_RPC_URL?.trim();
  const rpc = process.env.RPC_URL?.trim();
  if (primary) out.push(primary);
  if (rpc) out.push(rpc);
  if (process.env.HELIUS_API_KEY) {
    out.push(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);
  }
  out.push("https://api.mainnet-beta.solana.com");
  return Array.from(new Set(out));
}

export async function GET() {
  try {
    const urls = rpcUrls();
    let lastErr: any = null;

    for (const url of urls) {
      const conn = new Connection(url, "confirmed");
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const bh = await conn.getLatestBlockhash("confirmed");
          return ok({ ok: true, ...bh });
        } catch (e: any) {
          lastErr = e;
          const msg = String(e?.message || "").toLowerCase();
          const isRateLimit = msg.includes("429") || msg.includes("rate limit");
          if (!isRateLimit) break;
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
    }

    throw lastErr || new Error("No RPC endpoint available");
  } catch (e: any) {
    return err("rpc_error", e?.message || "Failed to fetch recent blockhash", 502);
  }
}
