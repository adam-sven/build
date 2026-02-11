import { NextRequest, NextResponse } from "next/server";
import { getWalletProfilesMap } from "@/lib/wallet-profiles";
import { loadWallets } from "@/lib/smart-wallets";

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,50}$/;

function isMintLike(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (!q) {
    return NextResponse.json({ ok: false, error: "missing_query" }, { status: 400 });
  }

  const profiles = getWalletProfilesMap();
  const trackedWallets = new Set(loadWallets());
  const qLower = q.toLowerCase();

  // 1) Exact wallet/profile match.
  if (BASE58_RE.test(q)) {
    if (profiles.has(q) || trackedWallets.has(q) || !isMintLike(q)) {
      return NextResponse.json({
        ok: true,
        target: { type: "wallet", wallet: q, url: `/wallet/${q}` },
      });
    }
    return NextResponse.json({
      ok: true,
      target: { type: "token", mint: q, url: `/intel?mint=${q}` },
    });
  }

  // 2) Wallet name match from profile dataset.
  const byName = Array.from(profiles.values()).find((p) =>
    `${p.name || ""}`.toLowerCase().includes(qLower),
  );
  if (byName?.wallet) {
    return NextResponse.json({
      ok: true,
      target: { type: "wallet", wallet: byName.wallet, url: `/wallet/${byName.wallet}` },
    });
  }

  // 3) Token symbol/name match via Dexscreener search.
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const json = await res.json();
      const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
      const best = pairs
        .filter((p: any) => p?.chainId === "solana")
        .sort((a: any, b: any) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
      const mint = String(best?.baseToken?.address || "");
      if (isMintLike(mint)) {
        return NextResponse.json({
          ok: true,
          target: { type: "token", mint, url: `/intel?mint=${mint}` },
        });
      }
    }
  } catch {
    // ignore search upstream failure
  }

  return NextResponse.json({
    ok: true,
    target: { type: "discover", url: "/discover" },
  });
}

