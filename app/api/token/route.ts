import { NextRequest, NextResponse } from "next/server";
import type { TokenIntelResponse } from "@/lib/types";

const cache = new Map<
	string,
	{ data: TokenIntelResponse; timestamp: number }
>();
const CACHE_TTL = 30000;

function isValidSolanaAddress(addr: string): boolean {
	if (!addr || typeof addr !== "string") return false;
	if (addr.length < 32 || addr.length > 50) return false;
	return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(
		addr,
	);
}

// ── Dexscreener (market data) ──────────────────────────────────────
async function fetchDexscreener(mint: string) {
	try {
		const res = await fetch(
			`https://api.dexscreener.com/latest/dex/tokens/${mint}`,
			{ headers: { Accept: "application/json" } },
		);
		if (!res.ok) return null;
		const data = await res.json();
		const pair = data.pairs?.[0];
		if (!pair) return null;
		return {
			identity: {
				name: (pair.baseToken?.name as string) || null,
				symbol: (pair.baseToken?.symbol as string) || null,
				image: (pair.info?.imageUrl as string) || null,
			},
			market: {
				priceUsd: pair.priceUsd ? Number.parseFloat(pair.priceUsd) : null,
				liquidityUsd: pair.liquidity?.usd || null,
				volume24hUsd: pair.volume?.h24 || null,
				fdvUsd: pair.fdv || null,
				dex: pair.dexId || null,
				pairUrl:
					pair.url || `https://dexscreener.com/solana/${mint}`,
			},
		};
	} catch {
		return null;
	}
}

// ── Holder count (Helius DAS API) ──────────────────────────────────
async function fetchHolderCount(mint: string): Promise<number | null> {
	const apiKey = process.env.HELIUS_API_KEY;
	if (!apiKey) {
		console.log("[token-api] No HELIUS_API_KEY set");
		return null;
	}

	// Use the correct Helius DAS getTokenAccounts endpoint
	try {
		const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
		console.log("[token-api] Fetching holders via Helius DAS for:", mint);

		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "holder-count",
				method: "getTokenAccounts",
				params: {
					mint: mint,
					limit: 1,
					options: {},
				},
			}),
		});

		if (!res.ok) {
			console.log("[token-api] Helius DAS HTTP error:", res.status);
			return null;
		}

		const data = await res.json();
		console.log("[token-api] Helius DAS response total:", data?.result?.total);

		if (data?.result?.total !== undefined) {
			return data.result.total;
		}

		// Fallback: count token_accounts length
		if (data?.result?.token_accounts) {
			return data.result.token_accounts.length;
		}

		return null;
	} catch (e) {
		console.error("[token-api] Helius DAS error:", e);
		return null;
	}
}

// ── Signal estimation from market data ─────────────────────────────
function estimateSignals(market: TokenIntelResponse["market"]) {
	const vol = market.volume24hUsd || 0;
	const liq = market.liquidityUsd || 0;
	const fdv = market.fdvUsd || 0;

	let bundles: "low" | "med" | "high" = "low";
	let snipers: "low" | "med" | "high" = "low";

	if (liq > 0) {
		const ratio = vol / liq;
		if (ratio > 5) {
			bundles = "high";
			snipers = "high";
		} else if (ratio > 2) {
			bundles = "med";
			snipers = "med";
		}
	}

	if (fdv > 0 && liq > 0 && liq / fdv < 0.01) {
		bundles = "high";
		snipers = "high";
	} else if (fdv > 0 && liq > 0 && liq / fdv < 0.05) {
		if (bundles === "low") bundles = "med";
		if (snipers === "low") snipers = "med";
	}

	return { bundles, snipers, whaleNetBuy5m: null };
}

// ── Verdict calculation ────────────────────────────────────────────
function calcVerdict(
	market: TokenIntelResponse["market"],
	holderCount: number | null,
	signals: TokenIntelResponse["signals"],
) {
	const riskFlags: string[] = [];
	let stage: "early" | "mid" | "late" = "early";
	let confidence = 50;

	const fdv = market.fdvUsd || 0;
	const liq = market.liquidityUsd || 0;
	const vol = market.volume24hUsd || 0;

	if (fdv > 5_000_000) {
		stage = "late";
		confidence = 85;
	} else if (fdv > 1_000_000) {
		stage = "mid";
		confidence = 70;
	} else if (fdv > 100_000) {
		confidence = 55;
	} else {
		confidence = 30;
	}

	if (fdv < 100_000) riskFlags.push("Sub-100k FDV");
	if (liq < 10_000) riskFlags.push("Critical liquidity");
	if (liq / (fdv || 1) < 0.01) riskFlags.push("Poor liquidity ratio");
	if (vol < 5_000) riskFlags.push("Minimal volume");
	if (holderCount !== null && holderCount < 100)
		riskFlags.push("Low holder diversity");
	if (signals.bundles === "high" || signals.snipers === "high")
		riskFlags.push("High bot activity");
	if (!market.pairUrl) riskFlags.push("No route found");

	confidence -= riskFlags.length * 8;
	confidence = Math.max(0, Math.min(100, confidence));

	return { stage, confidence, riskFlags };
}

// ── Main fetch logic ───────────────────────────────────────────────
async function fetchTokenIntel(mint: string): Promise<TokenIntelResponse> {
	const cached = cache.get(mint);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.data;
	}

	try {
		console.log("[token-api] === Starting fetch for:", mint, "===");

		const [dex, holderCount] = await Promise.all([
			fetchDexscreener(mint),
			fetchHolderCount(mint),
		]);

		console.log(
			"[token-api] Results - dex:",
			!!dex,
			"holderCount:",
			holderCount,
		);

		const market = dex?.market || {
			priceUsd: null,
			liquidityUsd: null,
			volume24hUsd: null,
			fdvUsd: null,
			dex: null,
			pairUrl: null,
		};

		const signals = dex?.market
			? estimateSignals(dex.market)
			: { bundles: "low" as const, snipers: "low" as const, whaleNetBuy5m: null };

		const result: TokenIntelResponse = {
			ok: true,
			mint,
			identity: dex?.identity || { name: null, symbol: null, image: null },
			socials: { twitter: null, website: null, telegram: null },
			market,
			holders: {
				holderCount: holderCount ?? null,
				top10Pct: null,
				topHolders: [],
			},
			candles: { interval: "1h" as const, items: [] },
			signals,
			verdict: calcVerdict(market, holderCount, signals),
			sources: {
				dexscreener: !!dex,
				birdeye: false,
				helius: holderCount !== null,
			},
		};

		cache.set(mint, { data: result, timestamp: Date.now() });
		return result;
	} catch (error) {
		console.error("[token-api] Error:", error);
		return {
			ok: false,
			mint,
			identity: { name: null, symbol: null, image: null },
			socials: { twitter: null, website: null, telegram: null },
			market: {
				priceUsd: null,
				liquidityUsd: null,
				volume24hUsd: null,
				fdvUsd: null,
				dex: null,
				pairUrl: null,
			},
			holders: { holderCount: null, top10Pct: null, topHolders: [] },
			candles: { interval: "1h" as const, items: [] },
			signals: { bundles: "low", snipers: "low", whaleNetBuy5m: null },
			verdict: { stage: "early" as const, confidence: 0, riskFlags: [] },
			sources: { dexscreener: false, birdeye: false, helius: false },
			error: "Failed to fetch token data",
		};
	}
}

export async function GET(request: NextRequest) {
	try {
		const mint = request.nextUrl.searchParams.get("mint");

		if (!mint) {
			return NextResponse.json(
				{ ok: false, error: "missing_mint" },
				{ status: 400 },
			);
		}

		if (!isValidSolanaAddress(mint)) {
			return NextResponse.json(
				{ ok: false, error: "invalid_mint" },
				{ status: 400 },
			);
		}

		const data = await fetchTokenIntel(mint);
		return NextResponse.json(data);
	} catch (error) {
		console.error("[token-api] Route error:", error);
		return NextResponse.json(
			{ ok: false, error: "internal_error" },
			{ status: 500 },
		);
	}
}
