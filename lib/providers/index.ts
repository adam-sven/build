import type { TokenIntelResponse } from '../types';

export function calculateVerdict(
  market: TokenIntelResponse['market'],
  holders: TokenIntelResponse['holders'],
  signals: TokenIntelResponse['signals']
): TokenIntelResponse['verdict'] {
  const riskFlags: string[] = [];
  let stage: 'early' | 'mid' | 'late' = 'early';
  let confidence = 50;

  const fdv = market.fdvUsd || 0;
  const liq = market.liquidityUsd || 0;

  if (fdv > 5000000) {
    stage = 'late';
    confidence = 85;
  } else if (fdv > 1000000) {
    stage = 'mid';
    confidence = 70;
  } else if (fdv > 100000) {
    confidence = 55;
  }

  if (fdv < 100000) riskFlags.push('Sub-100k FDV');
  if (liq < 10000) riskFlags.push('Critical liquidity');
  if (liq / (fdv || 1) < 0.01) riskFlags.push('Poor liquidity ratio');

  confidence -= riskFlags.length * 8;
  confidence = Math.max(0, Math.min(100, confidence));

  return { stage, confidence, riskFlags };
}

export async function getDexscreenerData(mint: string): Promise<Partial<TokenIntelResponse>> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!res.ok) return {};

    const data = await res.json();
    const pair = data.pairs?.[0];
    if (!pair) return {};

    return {
      mint,
      identity: {
        name: pair.baseToken?.name || null,
        symbol: pair.baseToken?.symbol || null,
        image: pair.info?.imageUrl || null,
      },
      market: {
        priceUsd: pair.priceUsd ? parseFloat(pair.priceUsd) : null,
        liquidityUsd: pair.liquidity?.usd || null,
        volume24hUsd: pair.volume?.h24 || null,
        fdvUsd: pair.fdv || null,
        dex: pair.dexId || null,
        pairUrl: pair.url || `https://dexscreener.com/solana/${mint}`,
      },
      candles: { interval: '1h' as const, items: [] },
    };
  } catch (error) {
    console.error('[dex] error:', error);
    return {};
  }
}

export async function getHolderCount(mint: string): Promise<number | null> {
  try {
    console.log('[holders] fetching for:', mint);
    const res = await fetch(`https://api.solscan.io/token/meta?tokenAddress=${mint}`);

    if (!res.ok) {
      console.log('[holders] solscan error:', res.status);
      return null;
    }

    const data = await res.json();
    const count = data.holder || null;
    console.log('[holders] solscan count:', count);
    return count ? parseInt(String(count)) : null;
  } catch (error) {
    console.error('[holders] error:', error);
    return null;
  }
}

export function estimateSignalsFromMarket(
  market: TokenIntelResponse['market']
): TokenIntelResponse['signals'] {
  const vol = market.volume24hUsd || 0;
  const liq = market.liquidityUsd || 0;
  const fdv = market.fdvUsd || 0;

  let bundles: 'low' | 'med' | 'high' = 'low';
  let snipers: 'low' | 'med' | 'high' = 'low';

  if (liq > 0) {
    const ratio = vol / liq;
    if (ratio > 5) {
      bundles = 'high';
      snipers = 'high';
    } else if (ratio > 2) {
      bundles = 'med';
      snipers = 'med';
    }
  }

  if (fdv > 0 && liq > 0) {
    const ratio = liq / fdv;
    if (ratio < 0.01) {
      bundles = 'high';
      snipers = 'high';
    } else if (ratio < 0.05) {
      if (bundles === 'low') bundles = 'med';
      if (snipers === 'low') snipers = 'med';
    }
  }

  return { bundles, snipers, whaleNetBuy5m: null };
}
