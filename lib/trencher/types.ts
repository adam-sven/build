export type Chain = "solana" | "ethereum" | "base" | "bsc";

export type Interval = "5m" | "1h" | "24h" | "7d";

export type RiskLevel = "low" | "med" | "high" | "unknown";

export type DiscoverMode = "trending" | "new" | "voted" | "quality";

export type ErrorCode =
  | "invalid_mint"
  | "invalid_wallet"
  | "token_already_submitted"
  | "nonce_expired"
  | "invalid_signature"
  | "ineligible_wallet_age"
  | "ineligible_sol_balance"
  | "already_voted_cooldown"
  | "daily_vote_limit"
  | "invalid_fee_tx"
  | "fee_tx_reused"
  | "submit_fee_invalid"
  | "submit_fee_reused"
  | "rate_limited"
  | "api_key_missing"
  | "api_key_invalid"
  | "rpc_error"
  | "provider_error"
  | "db_error";

export type ApiError = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
  };
};

export type Candle = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export type MarketSnapshot = {
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  priceChange: { m5: number | null; h1: number | null; h24: number | null };
  txCount24h: number | null;
  pairUrl: string | null;
  dex: string | null;
};

export type TokenIdentity = {
  name: string | null;
  symbol: string | null;
  image: string | null;
  socials?: {
    website?: string | null;
    twitter?: string | null;
    telegram?: string | null;
  };
};

export type TokenResponse = {
  apiVersion: "v1";
  ok: true;
  chain: Chain;
  mint: string;
  identity: TokenIdentity;
  market: MarketSnapshot;
  candles: {
    interval: Interval;
    items: Candle[];
  };
  holders: {
    holderCount: number | null;
    top10Pct: number | null;
    topHolders: { wallet: string; pct: number }[];
  };
  signals: {
    bundles: RiskLevel;
    snipers: RiskLevel;
    botRisk: RiskLevel;
    confidence: number;
    explanation: string[];
  };
  votes: {
    up24h: number;
    down24h: number;
    score24h: number;
    peakUpvotes24h: number;
    peakScore: number;
    peakRank: number;
  };
  search: {
    searches1h: number;
    searches24h: number;
    trending: boolean;
  };
  why: string[];
  updatedAt: string;
};

export type TokenRowSummary = {
  chain: Chain;
  mint: string;
  name: string | null;
  symbol: string | null;
  image: string | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  fdvUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  txCount24h: number | null;
  priceChange: { m5: number | null; h1: number | null; h24: number | null };
  votes: { up24h: number; down24h: number; score24h: number };
  search: { searches1h: number; searches24h: number; trending: boolean };
  flags: { bundles: RiskLevel; snipers: RiskLevel; botRisk: RiskLevel; confidence: number };
  why: string[];
  pairUrl: string | null;
  source: "pumpfun" | "bagsapp" | "other";
  peakRank: number;
  peakScore: number;
  finalScore: number;
};

export type DiscoverResponse = {
  apiVersion: "v1";
  ok: true;
  chain: Chain;
  mode: DiscoverMode;
  generatedAt: string;
  items: TokenRowSummary[];
};

export type ChallengeResponse = {
  ok: true;
  nonce: string;
  messageToSign: string;
  expiresAt: string;
};
