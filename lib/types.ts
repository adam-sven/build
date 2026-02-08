export type TokenIntelResponse = {
  ok: boolean;
  mint: string;
  identity: { name: string | null; symbol: string | null; image: string | null };
  socials: { twitter: string | null; website: string | null; telegram: string | null };
  market: {
    priceUsd: number | null;
    liquidityUsd: number | null;
    volume24hUsd: number | null;
    fdvUsd: number | null;
    dex: string | null;
    pairUrl: string | null;
  };
  holders: {
    holderCount: number | null;
    top10Pct: number | null;
    topHolders: { wallet: string; pct: number }[];
  };
  candles: {
    interval: "15m" | "1h" | "4h" | "1d";
    items: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  };
  signals: {
    bundles: "low" | "med" | "high" | "unknown";
    snipers: "low" | "med" | "high" | "unknown";
    whaleNetBuy5m: number | null;
  };
  verdict: {
    stage: "early" | "mid" | "late";
    confidence: number;
    riskFlags: string[];
  };
  sources: { dexscreener: boolean; birdeye: boolean; helius: boolean };
  error?: string;
};
