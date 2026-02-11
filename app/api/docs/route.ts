import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/trencher/auth";
import { ok, err } from "@/lib/trencher/http";

export async function GET(request: NextRequest) {
  const auth = await requireApiKey(request);
  if (!auth.ok) {
    return err(auth.code, auth.message, auth.code === "rate_limited" ? 429 : 401);
  }

  return ok({
    apiVersion: "v1",
    name: "IamTrader API",
    auth: {
      header: "X-API-Key",
      limit: "10 requests/min per API key",
    },
    endpoints: [
      { method: "GET", path: "/api/token?chain=solana&mint=<mint>" },
      { method: "GET", path: "/api/discover?mode=trending|new|voted|quality&chain=solana" },
      { method: "GET", path: "/api/vote/challenge?wallet=<pubkey>&mint=<mint>&direction=up|down" },
      { method: "POST", path: "/api/vote/submit" },
      { method: "GET", path: "/api/votes?mint=<mint>&chain=solana" },
      { method: "GET", path: "/api/submit/challenge?wallet=<pubkey>&mint=<mint>" },
      { method: "POST", path: "/api/submit/confirm" },
      { method: "POST", path: "/api/search/log" },
      { method: "GET", path: "/api/cron/refresh" },
    ],
    curlExamples: {
      discover:
        "curl -H 'X-API-Key: <key>' 'https://your-domain/api/discover?mode=trending&chain=solana'",
      token:
        "curl -H 'X-API-Key: <key>' 'https://your-domain/api/token?chain=solana&mint=<mint>'",
    },
    errorCodes: [
      "invalid_mint",
      "invalid_wallet",
      "nonce_expired",
      "invalid_signature",
      "ineligible_wallet_age",
      "ineligible_sol_balance",
      "already_voted_cooldown",
      "daily_vote_limit",
      "invalid_fee_tx",
      "fee_tx_reused",
      "submit_fee_invalid",
      "submit_fee_reused",
      "rate_limited",
      "api_key_missing",
      "api_key_invalid",
      "rpc_error",
      "provider_error",
      "db_error",
    ],
  });
}
