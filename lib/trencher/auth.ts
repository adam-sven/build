import { NextRequest } from "next/server";
import { initDefaultApiKeys, validateApiKey } from "@/lib/trencher/db";
import { kvIncr } from "@/lib/trencher/kv";
import { INTERNAL_API_KEY } from "@/lib/trencher/config";

export async function requireApiKey(request: NextRequest): Promise<{ ok: true } | { ok: false; code: "api_key_missing" | "api_key_invalid" | "rate_limited"; message: string }> {
  await initDefaultApiKeys();

  const internal = request.headers.get("x-internal-api-key");
  if (INTERNAL_API_KEY && internal === INTERNAL_API_KEY) {
    return { ok: true };
  }

  const key = request.headers.get("x-api-key");
  if (!key) {
    return { ok: false, code: "api_key_missing", message: "X-API-Key header is required." };
  }

  const valid = await validateApiKey(key);
  if (!valid) {
    return { ok: false, code: "api_key_invalid", message: "API key is invalid or revoked." };
  }

  const count = await kvIncr(`trencher:ratelimit:key:${key}:${Math.floor(Date.now() / 60000)}`, 65);
  if (count > 10) {
    return { ok: false, code: "rate_limited", message: "Rate limit exceeded (10 req/min per API key)." };
  }

  return { ok: true };
}

export async function limitByIp(ip: string, scope: string, limit: number, windowSeconds: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const n = await kvIncr(`trencher:ratelimit:ip:${scope}:${ip}:${bucket}`, windowSeconds + 5);
  return n <= limit;
}
