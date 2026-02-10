export const APP_NAME = "Trencher";
export const API_VERSION = "v1";

export const TREASURY_PUBKEY =
  process.env.TREASURY_PUBKEY || "CSJc1VcNJUHJHj199sVSa8XJ66rvEpf4sHbpeQj7N6vA";

export const VOTE_FEE_LAMPORTS = Number(process.env.VOTE_FEE_LAMPORTS || "1000000");
export const SUBMIT_FEE_LAMPORTS = Number(process.env.SUBMIT_FEE_LAMPORTS || "10000000");

export const SEARCH_TRENDING_THRESHOLD_1H = Number(
  process.env.SEARCH_TRENDING_THRESHOLD_1H || "12",
);

export const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
export const CRON_SECRET = process.env.CRON_SECRET || "";
export const LIVE_TICK_SECRET = process.env.LIVE_TICK_SECRET || "";

export const DEFAULT_CHAIN = "solana" as const;

export const DISCOVER_MIN_LIQUIDITY_USD = Number(process.env.DISCOVER_MIN_LIQUIDITY_USD || "25000");
export const DISCOVER_MIN_VOLUME_24H_USD = Number(process.env.DISCOVER_MIN_VOLUME_24H_USD || "120000");
export const DISCOVER_MIN_TX_24H = Number(process.env.DISCOVER_MIN_TX_24H || "180");
