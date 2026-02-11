import { NextRequest, NextResponse } from "next/server";
import { getSmartWalletSnapshot } from "@/lib/smart-wallets";
import { getStoredSmartSnapshotFromEvents } from "@/lib/trencher/helius-ingest";
import { normalizeImageUrl } from "@/lib/utils";
import { getWalletProfile } from "@/lib/wallet-profiles";

type WalletBuy = {
  mint: string;
  amount: number;
  signature: string;
  blockTime: number | null;
  wallet: string;
  solDelta: number;
  source: "tx" | "holding";
};

function isWallet(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(value);
}

async function fetchTokenMeta(mint: string) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
    const pair = pairs
      .filter((p: any) => p?.chainId === "solana")
      .sort((a: any, b: any) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
    if (!pair) return null;
    return {
      name: pair?.baseToken?.name || null,
      symbol: pair?.baseToken?.symbol || null,
      image: normalizeImageUrl(pair?.info?.imageUrl || null),
      priceUsd: pair?.priceUsd ? Number(pair.priceUsd) : null,
      change24h: pair?.priceChange?.h24 ?? null,
      volume24h: pair?.volume?.h24 ?? null,
      liquidityUsd: pair?.liquidity?.usd ?? null,
      marketCapUsd: pair?.marketCap ?? null,
      fdvUsd: pair?.fdv ?? null,
      pairUrl: pair?.url || null,
      dex: pair?.dexId || null,
    };
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ wallet: string }> }) {
  const { wallet } = await context.params;
  if (!isWallet(wallet)) {
    return NextResponse.json({ ok: false, error: "invalid_wallet" }, { status: 400 });
  }

  const [{ data: baseSnapshot }, webhookSnapshot] = await Promise.all([
    getSmartWalletSnapshot(),
    process.env.SMART_USE_WEBHOOK_EVENTS !== "false"
      ? getStoredSmartSnapshotFromEvents()
      : Promise.resolve(null),
  ]);

  const getWalletActivity = (snapshot: any) =>
    (snapshot?.activity || []).find((x: any) => x?.wallet === wallet) || null;
  const score = (activity: any) => {
    if (!activity) return -1;
    const buys = Array.isArray(activity?.buys) ? activity.buys.length : 0;
    const positions = Array.isArray(activity?.positions) ? activity.positions.length : 0;
    const pnl = Number(activity?.totalPnlSol || 0);
    return buys * 3 + positions * 2 + (Math.abs(pnl) > 0 ? 1 : 0);
  };

  const baseActivity = getWalletActivity(baseSnapshot);
  const webhookActivity = getWalletActivity(webhookSnapshot);
  const data = (score(webhookActivity) > score(baseActivity) ? webhookSnapshot : baseSnapshot) || baseSnapshot;
  const activity = getWalletActivity(data);
  if (!activity) {
    return NextResponse.json({ ok: false, error: "wallet_not_found" }, { status: 404 });
  }
  const activityAny = activity as any;
  const profile = getWalletProfile(wallet);

  const tokenMap = new Map<string, any>();
  for (const row of data.topMints || []) {
    tokenMap.set(row.mint, row.token);
  }

  const byMint = new Map<string, WalletBuy[]>();
  for (const buy of activity.buys || []) {
    const list = byMint.get(buy.mint) || [];
    list.push(buy);
    byMint.set(buy.mint, list);
  }

  const positionByMint = new Map<string, any>();
  for (const pos of activityAny.positions || []) {
    positionByMint.set(String(pos.mint || ""), pos);
  }
  const mints = Array.from(new Set([...byMint.keys(), ...positionByMint.keys()]));
  const missing = mints.filter((mint) => !tokenMap.has(mint)).slice(0, 18);
  const fetched = await Promise.all(missing.map(async (mint) => [mint, await fetchTokenMeta(mint)] as const));
  for (const [mint, token] of fetched) {
    if (token) tokenMap.set(mint, token);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const tokens = mints
    .map((mint) => {
      const list = (byMint.get(mint) || []).slice().sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0));
      const firstSeen = list.reduce((acc, x) => {
        if (!x.blockTime) return acc;
        if (acc === null || x.blockTime < acc) return x.blockTime;
        return acc;
      }, null as number | null);
      const lastSeen = list.reduce((acc, x) => {
        if (!x.blockTime) return acc;
        if (acc === null || x.blockTime > acc) return x.blockTime;
        return acc;
      }, null as number | null);
      const holdSeconds = firstSeen ? nowSec - firstSeen : null;
      const meta = tokenMap.get(mint) || null;
      const amountTotal = list.reduce((sum, x) => sum + (x.amount || 0), 0);
      const flow = list.reduce((sum, x) => sum + (x.solDelta || 0), 0);
      const pos = positionByMint.get(mint) || null;

      return {
        mint,
        buyCount: list.length,
        sellCount: pos?.sellCount || 0,
        qty: pos?.qty || 0,
        amountTotal,
        sampledSolFlow: flow,
        realizedPnlSol: pos?.realizedPnlSol || 0,
        unrealizedPnlSol: pos?.unrealizedPnlSol || 0,
        totalPnlSol: pos?.totalPnlSol || 0,
        avgCostSol: pos?.avgCostSol || 0,
        currentValueSol: pos?.currentValueSol || 0,
        firstSeen,
        lastSeen,
        sampledHoldSeconds: pos?.holdSeconds ?? holdSeconds,
        latestTx: list[0] || null,
        token: {
          name: meta?.name || null,
          symbol: meta?.symbol || null,
          image: normalizeImageUrl(meta?.image || null),
          priceUsd: meta?.priceUsd ?? null,
          change24h: meta?.change24h ?? null,
          volume24h: meta?.volume24h ?? null,
          liquidityUsd: meta?.liquidityUsd ?? null,
          marketCapUsd: meta?.marketCapUsd ?? null,
          fdvUsd: meta?.fdvUsd ?? null,
          pairUrl: meta?.pairUrl || null,
          dex: meta?.dex || null,
        },
      };
    })
    .sort((a, b) => {
      if (b.totalPnlSol !== a.totalPnlSol) return b.totalPnlSol - a.totalPnlSol;
      if (b.buyCount !== a.buyCount) return b.buyCount - a.buyCount;
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    });

  const recentBuys = (activity.buys || [])
    .slice()
    .sort((a: WalletBuy, b: WalletBuy) => (b.blockTime || 0) - (a.blockTime || 0))
    .slice(0, 25)
    .map((buy: WalletBuy) => ({
      ...buy,
      token: tokenMap.get(buy.mint) || null,
    }));

  return NextResponse.json({
    ok: true,
    wallet,
    profile: profile
      ? {
          rank: profile.rank,
          name: profile.name,
          accountUrl: profile.accountUrl,
          twitter: profile.twitter,
          telegram: profile.telegram,
          website: profile.website,
        }
      : null,
    updatedAt: data.timestamp,
    summary: {
      sampledPnlSol: activity.sampledPnlSol,
      realizedPnlSol: activityAny.realizedPnlSol || 0,
      unrealizedPnlSol: activityAny.unrealizedPnlSol || 0,
      totalPnlSol: activityAny.totalPnlSol || 0,
      winRate: activityAny.winRate ?? null,
      closedTrades: activityAny.closedTrades || 0,
      winningTrades: activityAny.winningTrades || 0,
      costBasisSol: activityAny.costBasisSol || 0,
      currentValueSol: activityAny.currentValueSol || 0,
      txCount: activity.txCount,
      buyCount: activity.buys.length,
      uniqueMints: activity.uniqueMints,
      lastSeen: activity.lastSeen,
    },
    tokens,
    recentBuys,
  });
}
