import type { Candle, Chain, Interval, MarketSnapshot, TokenIdentity } from "@/lib/trencher/types";
import { DexscreenerMarketProvider } from "@/lib/providers/dexscreener";

export interface MarketProvider {
  getTokenMarket(chain: Chain, mint: string): Promise<{ identity: TokenIdentity; market: MarketSnapshot }>;
  getCandles(chain: Chain, mint: string, interval: Interval): Promise<Candle[]>;
}

export const marketProvider: MarketProvider = new DexscreenerMarketProvider();
