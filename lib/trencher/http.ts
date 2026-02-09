import { NextRequest, NextResponse } from "next/server";
import type { ApiError, Chain } from "@/lib/trencher/types";

export function parseChain(request: NextRequest): Chain {
  const chain = (request.nextUrl.searchParams.get("chain") || "solana").toLowerCase();
  if (chain === "solana" || chain === "ethereum" || chain === "base" || chain === "bsc") {
    return chain;
  }
  return "solana";
}

export function parseMint(request: NextRequest): string {
  return (request.nextUrl.searchParams.get("mint") || "").trim();
}

export function isValidSolanaMint(mint: string): boolean {
  if (!mint) return false;
  if (mint.length < 32 || mint.length > 50) return false;
  return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(mint);
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function err(code: ApiError["error"]["code"], message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
}
