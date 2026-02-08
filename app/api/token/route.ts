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

type HolderCountResult = { count: number | null; source: "helius" | "solscan" | null };
type TopHoldersResult = { top10Pct: number | null; topHolders: { wallet: string; pct: number }[] };

async function fetchHolderCountFromSolscan(mint: string): Promise<number | null> {
	try {
		const res = await fetch(
			`https://api.solscan.io/token/meta?tokenAddress=${mint}`,
			{ headers: { Accept: "application/json" } },
		);
		if (!res.ok) {
			console.log("[token-api] Solscan HTTP error:", res.status);
			return null;
		}
		const data = await res.json();
		const count = data?.holder ?? null;
		return count !== null && count !== undefined ? Number.parseInt(String(count), 10) : null;
	} catch (e) {
		console.error("[token-api] Solscan error:", e);
		return null;
	}
}

async function fetchTopHoldersFromRpc(mint: string): Promise<TopHoldersResult> {
	try {
		const apiKey = process.env.HELIUS_API_KEY;
		const rpcUrl = apiKey
			? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
			: "https://api.mainnet-beta.solana.com";
		const [largestRes, supplyRes] = await Promise.all([
			fetch(rpcUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: "largest-accounts",
					method: "getTokenLargestAccounts",
					params: [mint],
				}),
			}),
			fetch(rpcUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: "token-supply",
					method: "getTokenSupply",
					params: [mint],
				}),
			}),
		]);

		if (!largestRes.ok || !supplyRes.ok) {
			console.log("[token-api] RPC error:", largestRes.status, supplyRes.status);
			return { top10Pct: null, topHolders: [] };
		}

		const [largestData, supplyData] = await Promise.all([
			largestRes.json(),
			supplyRes.json(),
		]);

		const supply = supplyData?.result?.value?.uiAmount;
		const largest = largestData?.result?.value || [];

		if (!supply || !Array.isArray(largest) || largest.length === 0) {
			return { top10Pct: null, topHolders: [] };
		}

		const topN = largest.slice(0, 10);
		const topSum = topN.reduce((sum: number, item: { uiAmount: number | null }) => {
			return sum + (item.uiAmount || 0);
		}, 0);

		const top10Pct = (topSum / supply) * 100;
		const topHolders = topN.map((item: { address: string; uiAmount: number | null }) => ({
			wallet: item.address,
			pct: supply > 0 ? ((item.uiAmount || 0) / supply) * 100 : 0,
		}));

		return { top10Pct, topHolders };
	} catch (e) {
		console.error("[token-api] RPC top holders error:", e);
		return { top10Pct: null, topHolders: [] };
	}
}

// ── Holder count (Helius DAS API) ──────────────────────────────────
async function fetchHolderCount(mint: string): Promise<HolderCountResult> {
	const apiKey = process.env.HELIUS_API_KEY;
	if (!apiKey) {
		return { count: await fetchHolderCountFromSolscan(mint), source: "solscan" };
	}

	try {
		const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
		const limit = 1000;
		const maxPages = 20;
		let page = 1;
		const owners = new Set<string>();

		while (page <= maxPages) {
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: `holder-count-${page}`,
					method: "getTokenAccounts",
					params: {
						mint: mint,
						page,
						limit,
						options: {},
					},
				}),
			});

			if (!res.ok) {
				return { count: await fetchHolderCountFromSolscan(mint), source: "solscan" };
			}

			const data = await res.json();
			if (data?.error) {
				return { count: await fetchHolderCountFromSolscan(mint), source: "solscan" };
			}

			const accounts = data?.result?.token_accounts;
			const pageCount = Array.isArray(accounts) ? accounts.length : 0;
			if (Array.isArray(accounts)) {
				for (const acct of accounts) {
					if (acct?.owner) owners.add(acct.owner);
				}
			}

			if (pageCount < limit) {
				break;
			}
			page += 1;
		}

		if (owners.size > 0) {
			return { count: owners.size, source: "helius" };
		}

		return { count: await fetchHolderCountFromSolscan(mint), source: "solscan" };
	} catch (e) {
		console.error("[token-api] Helius DAS error:", e);
		return { count: await fetchHolderCountFromSolscan(mint), source: "solscan" };
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

		const [dex, holderResult, topHoldersResult] = await Promise.all([
			fetchDexscreener(mint),
			fetchHolderCount(mint),
			fetchTopHoldersFromRpc(mint),
		]);

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
				holderCount: holderResult.count ?? null,
				top10Pct: topHoldersResult.top10Pct ?? null,
				topHolders: topHoldersResult.topHolders,
			},
			candles: { interval: "1h" as const, items: [] },
			signals,
			verdict: calcVerdict(market, holderResult.count, signals),
			sources: {
				dexscreener: !!dex,
				birdeye: false,
				helius: holderResult.source === "helius",
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
