import { NextRequest, NextResponse } from "next/server";

const CACHE_TTL = 60_000;
let cache: { timestamp: number; data: ScanResponse } | null = null;

const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 60;
const rateLimitStore = new Map<string, { count: number; start: number }>();

const MIN_LIQUIDITY_USD = 10_000;
const MAX_ITEMS = 50;

const BLACKLIST_DEX = new Set(["raydium-clmm", "unknown"]);

const isValidIp = (ip: string | null) => (ip && ip.length > 0 ? ip : "anonymous");

function rateLimit(ip: string): boolean {
	const now = Date.now();
	const entry = rateLimitStore.get(ip);
	if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
		rateLimitStore.set(ip, { count: 1, start: now });
		return true;
	}
	if (entry.count >= RATE_LIMIT_MAX) return false;
	entry.count += 1;
	return true;
}

export type ScanItem = {
	mint: string;
	name: string | null;
	symbol: string | null;
	image: string | null;
	dex: string | null;
	pairUrl: string | null;
	priceUsd: number | null;
	liquidityUsd: number | null;
	volume24hUsd: number | null;
	fdvUsd: number | null;
	marketCapUsd: number | null;
	priceChangePct: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
	txns24h: { buys: number | null; sells: number | null };
	pairCreatedAt: number | null;
	poolCount: number | null;
	listedAgeHours: number | null;
	stage: { value: "early" | "mid" | "late"; explanation: string };
	confidence: { value: number; explanation: string };
};

export type ScanResponse = {
	ok: boolean;
	timestamp: string;
	items: ScanItem[];
	source: "dexscreener";
};

function calcStage(market: { fdvUsd: number | null; liquidityUsd: number | null; volume24hUsd: number | null }) {
	const fdv = market.fdvUsd || 0;
	const liq = market.liquidityUsd || 0;
	const vol = market.volume24hUsd || 0;

	if (fdv > 5_000_000 || (liq > 250_000 && vol < liq)) {
		return {
			value: "late" as const,
			explanation: "Higher FDV or liquidity with cooling volume suggests late-stage distribution.",
		};
	}
	if (fdv > 1_000_000 || (vol > 2 * liq && liq > 50_000)) {
		return {
			value: "mid" as const,
			explanation: "FDV and volume indicate active attention and expansion.",
		};
	}
	return {
		value: "early" as const,
		explanation: "Liquidity and valuation are still forming; discovery phase.",
	};
}

function calcConfidence(market: { priceUsd: number | null; liquidityUsd: number | null; volume24hUsd: number | null; fdvUsd: number | null }) {
	let score = 50;
	let missing = 0;
	if (market.priceUsd === null) missing += 1;
	if (market.liquidityUsd === null) missing += 1;
	if (market.volume24hUsd === null) missing += 1;
	if (market.fdvUsd === null) missing += 1;

	score -= missing * 8;
	if (score < 15) score = 15;
	const explanation =
		missing === 0 ? "Core market data available." : `Missing ${missing} market inputs reduces confidence.`;
	return { value: Math.min(100, score), explanation };
}

async function fetchDexscreenerSearch(query: string): Promise<any[]> {
	const res = await fetch(`https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(query)}`, {
		headers: { Accept: "application/json" },
	});
	if (!res.ok) return [];
	const data = await res.json();
	return Array.isArray(data.pairs) ? data.pairs : [];
}

async function fetchDexscreenerPairs(): Promise<any[]> {
	const queries = [
		"sol",
		"solana",
		"pump",
		"raydium",
		"meme",
		"dog",
		"cat",
		"ai",
		"coin",
		"token",
		"wsol",
	];
	const results = await Promise.all(queries.map(fetchDexscreenerSearch));
	const pairs = results.flat();
	const unique = new Map<string, any>();
	for (const pair of pairs) {
		const key = pair?.pairAddress || `${pair?.baseToken?.address}-${pair?.quoteToken?.address}`;
		if (!key) continue;
		if (!unique.has(key)) unique.set(key, pair);
	}
	return Array.from(unique.values());
}

export async function GET(request: NextRequest) {
	const ip = isValidIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? null);
	if (!rateLimit(ip)) {
		return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
	}

	if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
		return NextResponse.json(cache.data);
	}

	try {
		const pairs = await fetchDexscreenerPairs();

		const solPairs = pairs
			.filter((pair: any) => pair?.chainId === "solana")
			.filter((pair: any) => (pair?.liquidity?.usd || 0) >= MIN_LIQUIDITY_USD)
			.filter((pair: any) => !BLACKLIST_DEX.has(String(pair?.dexId || "")));

		const pairGroups = new Map<string, any[]>();
		for (const pair of solPairs) {
			const mint = pair?.baseToken?.address || pair?.baseToken?.mint;
			if (!mint) continue;
			const list = pairGroups.get(mint) || [];
			list.push(pair);
			pairGroups.set(mint, list);
		}

		const items: ScanItem[] = Array.from(pairGroups.entries()).map(([mint, group]) => {
			const sorted = group.sort((a: any, b: any) => (b?.volume?.h24 || 0) - (a?.volume?.h24 || 0));
			const pair = sorted[0];
			const market = {
				priceUsd: pair.priceUsd ? Number.parseFloat(pair.priceUsd) : null,
				liquidityUsd: pair.liquidity?.usd || null,
				volume24hUsd: pair.volume?.h24 || null,
				fdvUsd: pair.fdv || null,
			};
			const stage = calcStage(market);
			const confidence = calcConfidence(market);
			return {
				mint,
				name: pair?.baseToken?.name || null,
				symbol: pair?.baseToken?.symbol || null,
				image: pair?.info?.imageUrl || null,
				dex: pair?.dexId || null,
				pairUrl: pair?.url || null,
				priceUsd: market.priceUsd,
				liquidityUsd: market.liquidityUsd,
				volume24hUsd: market.volume24hUsd,
				fdvUsd: market.fdvUsd,
				marketCapUsd: pair.marketCap || null,
				priceChangePct: {
					m5: pair.priceChange?.m5 ?? null,
					h1: pair.priceChange?.h1 ?? null,
					h6: pair.priceChange?.h6 ?? null,
					h24: pair.priceChange?.h24 ?? null,
				},
				txns24h: {
					buys: pair.txns?.h24?.buys ?? null,
					sells: pair.txns?.h24?.sells ?? null,
				},
				pairCreatedAt: pair.pairCreatedAt || null,
				poolCount: group.length,
				listedAgeHours:
					pair.pairCreatedAt ? Math.max(0, (Date.now() - pair.pairCreatedAt) / 3600000) : null,
				stage,
				confidence,
			};
		});

		const ranked = items
			.sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0))
			.slice(0, MAX_ITEMS);

		const data: ScanResponse = {
			ok: true,
			timestamp: new Date().toISOString(),
			items: ranked,
			source: "dexscreener",
		};

		cache = { timestamp: Date.now(), data };
		return NextResponse.json(data);
	} catch (error) {
		return NextResponse.json({ ok: false, error: "scan_failed" }, { status: 500 });
	}
}
