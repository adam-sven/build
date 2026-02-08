import { NextRequest, NextResponse } from 'next/server';

// Helper: validate Solana address
function isValidSolanaAddress(addr: string): boolean {
  if (!addr || typeof addr !== 'string') return false;
  if (addr.length < 32 || addr.length > 44) return false;
  // Base58 alphabet check
  return /^[1-9A-HJ-NP-Z]+$/.test(addr);
}

// Helper: short mint display
function shortMint(mint: string, start = 6, end = 6): string {
  if (mint.length <= start + end) return mint;
  return `${mint.slice(0, start)}...${mint.slice(-end)}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint');

  if (!mint || !isValidSolanaAddress(mint)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid or missing mint address' },
      { status: 400 }
    );
  }

  try {
    // STUB: In production, fetch real pump.fun curve + momentum data
    // For now, return realistic mock data structure
    
    const mockStages = ['early', 'mid', 'late'] as const;
    const stageIndex = Math.floor(Math.random() * 3);
    const stage = mockStages[stageIndex];

    const result = {
      ok: true,
      mint,
      token: {
        name: 'Mock Token',
        symbol: 'MOCK',
        image: null,
        decimals: 6,
        totalSupply: '1000000000',
      },
      pump: {
        bondingCurvePda: 'CebN5GCBQ5TNhxsgoEYGAZMZcisCmz7MCfKnKX7KV18J',
        progressPct: stage === 'early' ? Math.random() * 20 : stage === 'mid' ? 20 + Math.random() * 50 : 70 + Math.random() * 30,
        isComplete: stage === 'late' ? Math.random() > 0.5 : false,
      },
      lifecycle: {
        stage,
        confidence: Math.random() > 0.5 ? 'high' : 'medium',
        buysPerMin: Math.floor(Math.random() * 50) + 5,
        sellsPerMin: Math.floor(Math.random() * 30) + 2,
        uniqueWallets5m: Math.floor(Math.random() * 200) + 20,
        explanation: 
          stage === 'early' ? 'Low curve progress, small but active community. First wave of discovery phase.'
          : stage === 'mid' ? 'Curve ~50% filled, steady buy/sell ratio. Momentum phase.'
          : 'Curve nearing completion or graduated. Late-stage dynamics.',
      },
      links: {
        pumpfun: `https://pump.fun/${mint}`,
        solscan: `https://solscan.io/token/${mint}`,
        dexscreener: `https://dexscreener.com/solana/${mint}`,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[pump/analyze]', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to analyze token' },
      { status: 500 }
    );
  }
}
