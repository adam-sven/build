import { NextResponse } from "next/server";
import { normalizeImageUrl } from "@/lib/utils";

const MINT_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type PumpItem = {
  mint: string;
  name: string | null;
  symbol: string | null;
  image: string | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  change24h: number | null;
  pairUrl: string | null;
  bonded: boolean;
};

function parseNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const profileRes = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!profileRes.ok) {
      return NextResponse.json({ ok: true, items: [] }, { headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=120" } });
    }

    const profiles = (await profileRes.json()) as any[];
    const solPumpProfiles = (Array.isArray(profiles) ? profiles : [])
      .filter((x) => x?.chainId === "solana")
      .filter((x) => MINT_RE.test(String(x?.tokenAddress || "")))
      .filter((x) => String(x?.tokenAddress || "").toLowerCase().endsWith("pump"))
      .slice(0, 35);

    const mints = Array.from(new Set(solPumpProfiles.map((x) => String(x.tokenAddress))));
    const marketRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mints.join(",")}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).catch(() => null);
    const marketJson = marketRes && marketRes.ok ? await marketRes.json() : { pairs: [] };
    const pairs = Array.isArray(marketJson?.pairs) ? marketJson.pairs : [];

    const bestByMint = new Map<string, any>();
    for (const pair of pairs) {
      if (pair?.chainId !== "solana") continue;
      const mint = String(pair?.baseToken?.address || "");
      if (!MINT_RE.test(mint)) continue;
      const prev = bestByMint.get(mint);
      const prevLiq = Number(prev?.liquidity?.usd || 0);
      const nextLiq = Number(pair?.liquidity?.usd || 0);
      if (!prev || nextLiq > prevLiq) bestByMint.set(mint, pair);
    }

    const items: PumpItem[] = mints.map((mint) => {
      const profile = solPumpProfiles.find((x) => String(x.tokenAddress) === mint);
      const pair = bestByMint.get(mint);
      return {
        mint,
        name: pair?.baseToken?.name || profile?.description?.split(" ").slice(0, 3).join(" ") || null,
        symbol: pair?.baseToken?.symbol || null,
        image: normalizeImageUrl(pair?.info?.imageUrl || profile?.icon || `https://cdn.dexscreener.com/tokens/solana/${mint}.png`),
        priceUsd: parseNum(pair?.priceUsd),
        marketCapUsd: parseNum(pair?.marketCap),
        volume24hUsd: parseNum(pair?.volume?.h24),
        liquidityUsd: parseNum(pair?.liquidity?.usd),
        change24h: parseNum(pair?.priceChange?.h24),
        pairUrl: pair?.url || profile?.url || null,
        bonded: Boolean(pair),
      };
    });

    items.sort((a, b) => {
      const aScore = (a.volume24hUsd || 0) + (a.liquidityUsd || 0);
      const bScore = (b.volume24hUsd || 0) + (b.liquidityUsd || 0);
      return bScore - aScore;
    });

    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        items: items.slice(0, 20),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=20, stale-while-revalidate=120",
        },
      },
    );
  } catch {
    return NextResponse.json({ ok: true, items: [] }, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60" } });
  }
}

