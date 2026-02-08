import { PublicKey } from '@solana/web3.js';

// Native Solana address validation (base58, 32 bytes = 43-44 chars)
function decodeBase58(s: string): Buffer {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let d: number[] = [0];

  for (let i = 0; i < s.length; i++) {
    let carry = alphabet.indexOf(s[i]);
    if (carry < 0) throw new Error('Invalid base58 character');
    for (let j = 0; j < d.length; j++) {
      carry += d[j] * 58;
      d[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      d.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Handle leading '1's (which represent 0x00 bytes)
  for (let i = 0; i < s.length && s[i] === '1'; i++) d.push(0);

  return Buffer.from(d.reverse());
}

export type QuoteSide = 'buy' | 'sell';

export type QuoteSummary = {
  side: QuoteSide;
  inputMint: string;
  outputMint: string;
  inAmount: string;   // raw integer (base units)
  outAmount: string;  // raw integer (base units)
  priceImpactPct?: number; // from Jupiter, if provided
  routeFound: boolean;
  error?: string;
};

export type AnalysisResult = {
  mint: string;                 // token mint (the asset we're analyzing)
  ok: boolean;
  timestamp: number;

  // We analyze by quoting SOL->TOKEN (buy) and TOKEN->SOL (sell)
  buy: QuoteSummary;
  sell: QuoteSummary;

  // Derived metrics (best-effort; may be null if quotes missing)
  spreadPct: number | null;     // effective spread between buy and sell
  warnings: string[];
};

const JUPITER_QUOTE_URL = 'https://quote-api.jup.ag/v6/quote';

// Wrapped SOL mint
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// Default quote size: 0.1 SOL (in lamports)
const DEFAULT_SOL_IN_LAMPORTS = BigInt(100_000_000); // 0.1 SOL

// Helpers
function isValidSolanaAddress(addr: string): boolean {
  try {
    // Solana addresses are base58, 32 bytes (typically 43-44 characters)
    const decoded = decodeBase58(addr);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

function pct(n: number): number {
  return Math.round(n * 10000) / 10000; // 4 dp
}

async function jupiterQuote(params: Record<string, string>): Promise<any> {
  const url = new URL(JUPITER_QUOTE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    // next: { revalidate: 0 } // (optional) for Next.js fetch caching control
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Jupiter quote failed: ${res.status} ${res.statusText} ${text}`.trim());
  }

  return res.json();
}

/**
 * Core engine:
 * - quotes SOL -> TOKEN for "buy"
 * - quotes TOKEN -> SOL for "sell"
 * - computes spread + warnings
 *
 * NOTE: For sell, we need a token amount. In v1 we estimate by using the buy outAmount
 * (i.e. "sell back what you'd receive from buying 0.1 SOL").
 */
export async function analyzeToken(mint: string, solInLamports: bigint = DEFAULT_SOL_IN_LAMPORTS): Promise<AnalysisResult> {
  const timestamp = Date.now();

  // Basic validation
  if (!isValidSolanaAddress(mint)) {
    return {
      mint,
      ok: false,
      timestamp,
      buy: {
        side: 'buy',
        inputMint: WSOL_MINT,
        outputMint: mint,
        inAmount: solInLamports.toString(),
        outAmount: '0',
        routeFound: false,
        error: 'Invalid mint address',
      },
      sell: {
        side: 'sell',
        inputMint: mint,
        outputMint: WSOL_MINT,
        inAmount: '0',
        outAmount: '0',
        routeFound: false,
        error: 'Invalid mint address',
      },
      spreadPct: null,
      warnings: ['invalid_mint'],
    };
  }

  const warnings: string[] = [];

  // 1) BUY quote: WSOL -> TOKEN
  let buy: QuoteSummary = {
    side: 'buy',
    inputMint: WSOL_MINT,
    outputMint: mint,
    inAmount: solInLamports.toString(),
    outAmount: '0',
    routeFound: false,
  };

  try {
    const buyQuote = await jupiterQuote({
      inputMint: WSOL_MINT,
      outputMint: mint,
      amount: solInLamports.toString(),
      slippageBps: '50',           // 0.50% for quoting; tune later
      onlyDirectRoutes: 'false',
    });

    if (!buyQuote?.outAmount) throw new Error('No outAmount from Jupiter');

    buy = {
      side: 'buy',
      inputMint: WSOL_MINT,
      outputMint: mint,
      inAmount: solInLamports.toString(),
      outAmount: String(buyQuote.outAmount),
      priceImpactPct: buyQuote.priceImpactPct != null ? Number(buyQuote.priceImpactPct) : undefined,
      routeFound: true,
    };
  } catch (e: any) {
    buy = { ...buy, error: e?.message ?? 'Buy quote failed', routeFound: false };
    warnings.push('no_buy_route');
  }

  // 2) SELL quote: TOKEN -> WSOL
  // Use the buy outAmount as the amount to sell back (best-effort).
  const sellAmount = buy.routeFound ? BigInt(buy.outAmount) : BigInt(0);

  let sell: QuoteSummary = {
    side: 'sell',
    inputMint: mint,
    outputMint: WSOL_MINT,
    inAmount: sellAmount.toString(),
    outAmount: '0',
    routeFound: false,
  };

  if (sellAmount > 0n) {
    try {
      const sellQuote = await jupiterQuote({
        inputMint: mint,
        outputMint: WSOL_MINT,
        amount: sellAmount.toString(),
        slippageBps: '50',
        onlyDirectRoutes: 'false',
      });

      if (!sellQuote?.outAmount) throw new Error('No outAmount from Jupiter');

      sell = {
        side: 'sell',
        inputMint: mint,
        outputMint: WSOL_MINT,
        inAmount: sellAmount.toString(),
        outAmount: String(sellQuote.outAmount),
        priceImpactPct: sellQuote.priceImpactPct != null ? Number(sellQuote.priceImpactPct) : undefined,
        routeFound: true,
      };
    } catch (e: any) {
      sell = { ...sell, error: e?.message ?? 'Sell quote failed', routeFound: false };
      warnings.push('no_sell_route');
    }
  } else {
    warnings.push('sell_amount_zero');
    sell = { ...sell, error: 'Sell amount is zero because buy quote failed', routeFound: false };
  }

  // 3) Derived metrics: effective spread
  // We treat:
  // - Buy spends solInLamports to receive tokenOut
  // - Sell converts tokenOut back to solOut
  // Effective spread = 1 - (solOut / solIn)
  let spreadPct: number | null = null;

  if (buy.routeFound && sell.routeFound) {
    const solIn = Number(solInLamports);           // safe for 0.1 SOL
    const solOut = Number(BigInt(sell.outAmount)); // lamports out

    if (solIn > 0 && solOut >= 0) {
      const spread = 1 - solOut / solIn;
      spreadPct = pct(spread * 100);

      // Heuristic warnings
      if (spreadPct > 5) warnings.push('high_spread');
      if ((buy.priceImpactPct ?? 0) > 3) warnings.push('high_buy_impact');
      if ((sell.priceImpactPct ?? 0) > 3) warnings.push('high_sell_impact');
    }
  }

  const ok = buy.routeFound || sell.routeFound;

  return {
    mint,
    ok,
    timestamp,
    buy,
    sell,
    spreadPct,
    warnings,
  };
}
