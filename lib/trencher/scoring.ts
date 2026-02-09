import { SEARCH_TRENDING_THRESHOLD_1H } from "@/lib/trencher/config";
import type { MarketSnapshot, RiskLevel } from "@/lib/trencher/types";

function safeLog(x: number) {
  return Math.log10(Math.max(1, x));
}

export function scoreVotes(up24h: number, down24h: number) {
  return up24h - down24h;
}

export function scoreMarketQuality(market: MarketSnapshot) {
  const mcap = market.marketCapUsd || 0;
  const fdv = market.fdvUsd || 0;
  const liq = market.liquidityUsd || 0;
  const vol = market.volume24hUsd || 0;
  const tx = market.txCount24h || 0;

  const mcapFdv = fdv > 0 ? Math.min(1, mcap / fdv) : 0;
  const volLiq = liq > 0 ? Math.min(2, vol / liq) : 0;

  return mcapFdv * 20 + safeLog(liq) * 5 + safeLog(vol) * 6 + volLiq * 8 + safeLog(tx) * 3;
}

export function scoreSearchInterest(searches1h: number, searches24h: number) {
  return safeLog(searches1h) * 6 + safeLog(searches24h) * 3;
}

export function scoreRiskPenalty(flags: { bundles: RiskLevel; snipers: RiskLevel; botRisk: RiskLevel; confidence: number }) {
  if (flags.confidence < 65) return 0;
  const points = (flag: RiskLevel) => (flag === "high" ? 2 : flag === "med" ? 1 : 0);
  return points(flags.bundles) + points(flags.snipers) + points(flags.botRisk);
}

export function finalScore(input: {
  up24h: number;
  down24h: number;
  market: MarketSnapshot;
  searches1h: number;
  searches24h: number;
  flags: { bundles: RiskLevel; snipers: RiskLevel; botRisk: RiskLevel; confidence: number };
}) {
  const voteScore = scoreVotes(input.up24h, input.down24h);
  const marketQuality = scoreMarketQuality(input.market);
  const searchInterest = scoreSearchInterest(input.searches1h, input.searches24h);
  const riskPenalty = scoreRiskPenalty(input.flags);

  const score =
    0.45 * voteScore +
    0.4 * marketQuality +
    0.1 * searchInterest -
    0.05 * riskPenalty;

  return {
    voteScore,
    marketQuality,
    searchInterest,
    riskPenalty,
    score,
    trending: input.searches1h >= SEARCH_TRENDING_THRESHOLD_1H,
  };
}

export function calcSignals(params: {
  market: MarketSnapshot;
  top10Pct: number | null;
}): {
  bundles: RiskLevel;
  snipers: RiskLevel;
  botRisk: RiskLevel;
  confidence: number;
  explanation: string[];
} {
  const liq = params.market.liquidityUsd || 0;
  const vol = params.market.volume24hUsd || 0;
  const fdv = params.market.fdvUsd || 0;

  const volLiq = liq > 0 ? vol / liq : null;
  const liqFdv = fdv > 0 ? liq / fdv : null;

  let confidence = 40;
  if (params.market.volume24hUsd !== null) confidence += 15;
  if (params.market.liquidityUsd !== null) confidence += 15;
  if (params.market.fdvUsd !== null) confidence += 10;
  if (params.top10Pct !== null) confidence += 20;
  confidence = Math.min(100, confidence);

  let bundles: RiskLevel = "unknown";
  let snipers: RiskLevel = "unknown";
  let botRisk: RiskLevel = "unknown";

  const explanation: string[] = [];

  if (confidence >= 65) {
    if (volLiq === null) {
      bundles = "unknown";
      snipers = "unknown";
    } else if (volLiq > 6) {
      bundles = "high";
      snipers = "high";
      explanation.push(`High volume/liquidity ratio (${volLiq.toFixed(2)}x).`);
    } else if (volLiq > 3) {
      bundles = "med";
      snipers = "med";
      explanation.push(`Elevated volume/liquidity ratio (${volLiq.toFixed(2)}x).`);
    } else {
      bundles = "low";
      snipers = "low";
      explanation.push(`Normal volume/liquidity ratio (${volLiq.toFixed(2)}x).`);
    }

    if (params.top10Pct !== null && params.top10Pct > 40) {
      botRisk = "high";
      explanation.push(`Top 10 holder concentration is high (${params.top10Pct.toFixed(2)}%).`);
    } else if (liqFdv !== null && liqFdv < 0.02) {
      botRisk = "med";
      explanation.push(`Liquidity/FDV is thin (${liqFdv.toFixed(4)}).`);
    } else {
      botRisk = "low";
      explanation.push("No strong concentration or liquidity anomalies.");
    }
  } else {
    explanation.push("Signals hidden because confidence is below threshold.");
  }

  return { bundles, snipers, botRisk, confidence, explanation };
}
