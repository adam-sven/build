import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";

type TokenIntelStage = "early" | "mid" | "late";
type RiskLevel = "low" | "medium" | "high";

type TokenIntelResponse = {
	ok: boolean;
	mint: string;
	timestamp: string;
	identity: {
		name: string | null;
		symbol: string | null;
		image: string | null;
	};
	market: {
		priceUsd: number | null;
		liquidityUsd: number | null;
		volume24hUsd: number | null;
		fdvUsd: number | null;
		marketCapUsd: number | null;
		priceChangePct: {
			m5: number | null;
			h1: number | null;
			h6: number | null;
			h24: number | null;
		};
		txns24h: {
			buys: number | null;
			sells: number | null;
		};
		dex: string | null;
		pairUrl: string | null;
		pairCreatedAt: number | null;
	};
	metrics: {
		holders: number | null;
		top10Pct: number | null;
		volToLiq: number | null;
		totalSupply: number | null;
		decimals: number | null;
		mintAuthority: string | null;
		freezeAuthority: string | null;
		mintAuthorityRevoked: boolean | null;
		freezeAuthorityRevoked: boolean | null;
		tokenProgram: string | null;
		poolCount: number | null;
		listedAgeHours: number | null;
	};
	signals: {
		stage: { value: TokenIntelStage; explanation: string };
		confidence: { value: number; explanation: string };
		bundledBuys: { value: boolean; explanation: string };
		sniperActivity: { value: RiskLevel; explanation: string };
		botRisk: { value: RiskLevel; explanation: string };
	};
	sources: {
		dexscreener: boolean;
		helius: boolean;
	};
	error?: string;
};

const cache = new Map<string, { data: TokenIntelResponse; timestamp: number }>();
const CACHE_TTL = 30_000;

function isValidSolanaAddress(addr: string): boolean {
	if (!addr || typeof addr !== "string") return false;
	if (addr.length < 32 || addr.length > 50) return false;
	return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(
		addr,
	);
}

async function fetchDexscreener(mint: string) {
	try {
		const res = await fetch(
			`https://api.dexscreener.com/latest/dex/tokens/${mint}`,
			{ headers: { Accept: "application/json" } },
		);
		if (!res.ok) return null;
		const data = await res.json();
		const pairs = Array.isArray(data.pairs) ? data.pairs : [];
		const pair = pairs.sort((a: any, b: any) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0))[0];
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
				dex: pair.dexId || null,
				pairUrl:
					pair.url || `https://dexscreener.com/solana/${mint}`,
				pairCreatedAt: pair.pairCreatedAt || null,
			},
			pairsCount: pairs.length,
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
		if (!res.ok) return null;
		const data = await res.json();
		const count = data?.holder ?? null;
		return count !== null && count !== undefined ? Number.parseInt(String(count), 10) : null;
	} catch {
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
	} catch {
		return { top10Pct: null, topHolders: [] };
	}
}

type MintAccountInfo = {
	decimals: number | null;
	totalSupply: number | null;
	mintAuthority: string | null;
	freezeAuthority: string | null;
	mintAuthorityRevoked: boolean | null;
	freezeAuthorityRevoked: boolean | null;
	tokenProgram: string | null;
};

function parseMintAccount(data: Buffer): Omit<MintAccountInfo, "tokenProgram" | "totalSupply"> {
	if (data.length < 82) {
		return {
			decimals: null,
			mintAuthority: null,
			freezeAuthority: null,
			mintAuthorityRevoked: null,
			freezeAuthorityRevoked: null,
		};
	}

	const mintAuthorityOption = data.readUInt32LE(0);
	const mintAuthority =
		mintAuthorityOption === 0
			? null
			: new PublicKey(data.subarray(4, 36)).toBase58();
	const decimals = data.readUInt8(44);
	const freezeAuthorityOption = data.readUInt32LE(46);
	const freezeAuthority =
		freezeAuthorityOption === 0
			? null
			: new PublicKey(data.subarray(50, 82)).toBase58();

	return {
		decimals,
		mintAuthority,
		freezeAuthority,
		mintAuthorityRevoked: mintAuthorityOption === 0,
		freezeAuthorityRevoked: freezeAuthorityOption === 0,
	};
}

async function fetchMintAccountInfo(mint: string): Promise<MintAccountInfo> {
	try {
		const apiKey = process.env.HELIUS_API_KEY;
		const rpcUrl = apiKey
			? `https://mainnet.helius-rpc.com/?api-key=${apiKey}`
			: "https://api.mainnet-beta.solana.com";
		const [acctRes, supplyRes] = await Promise.all([
			fetch(rpcUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: "mint-account",
					method: "getAccountInfo",
					params: [mint, { encoding: "base64" }],
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

		if (!acctRes.ok) {
			return {
				decimals: null,
				totalSupply: null,
				mintAuthority: null,
				freezeAuthority: null,
				mintAuthorityRevoked: null,
				freezeAuthorityRevoked: null,
				tokenProgram: null,
			};
		}
		const [acctData, supplyData] = await Promise.all([
			acctRes.json(),
			supplyRes.ok ? supplyRes.json() : Promise.resolve(null),
		]);
		const info = acctData?.result?.value;
		const supplyUi = supplyData?.result?.value?.uiAmount ?? null;
		if (!info?.data?.[0]) {
			return {
				decimals: null,
				totalSupply: supplyUi,
				mintAuthority: null,
				freezeAuthority: null,
				mintAuthorityRevoked: null,
				freezeAuthorityRevoked: null,
				tokenProgram: info?.owner || null,
			};
		}
		const buffer = Buffer.from(info.data[0], "base64");
		const parsed = parseMintAccount(buffer);
		return {
			...parsed,
			totalSupply: supplyUi,
			tokenProgram: info?.owner || null,
		};
	} catch {
		return {
			decimals: null,
			totalSupply: null,
			mintAuthority: null,
			freezeAuthority: null,
			mintAuthorityRevoked: null,
			freezeAuthorityRevoked: null,
			tokenProgram: null,
		};
	}
}

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

			if (pageCount < limit) break;
			page += 1;
		}

		if (owners.size > 0) {
			return { count: owners.size, source: "helius" };
		}

		return { count: await fetchHolderCountFromSolscan(mint), source: "solscan" };
	} catch {
		return { count: await fetchHolderCountFromSolscan(mint), source: "solscan" };
	}
}

function calcStage(market: TokenIntelResponse["market"]): { value: TokenIntelStage; explanation: string } {
	const fdv = market.fdvUsd || 0;
	const liq = market.liquidityUsd || 0;
	const vol = market.volume24hUsd || 0;

	if (fdv > 5_000_000 || (liq > 250_000 && vol < liq)) {
		return {
			value: "late",
			explanation: "Higher FDV or liquidity with cooling volume suggests late-stage distribution.",
		};
	}
	if (fdv > 1_000_000 || (vol > 2 * liq && liq > 50_000)) {
		return {
			value: "mid",
			explanation: "FDV and volume indicate active attention and expansion.",
		};
	}
	return {
		value: "early",
		explanation: "Liquidity and valuation are still forming; discovery phase.",
	};
}

function calcConfidence(data: {
	market: TokenIntelResponse["market"];
	holders: number | null;
	top10Pct: number | null;
}): { value: number; explanation: string } {
	let score = 50;
	let missing = 0;
	if (data.market.priceUsd === null) missing += 1;
	if (data.market.liquidityUsd === null) missing += 1;
	if (data.market.volume24hUsd === null) missing += 1;
	if (data.market.fdvUsd === null) missing += 1;
	if (data.holders === null) missing += 1;
	if (data.top10Pct === null) missing += 1;

	score -= missing * 8;
	if (score < 15) score = 15;
	const explanation =
		missing === 0
			? "Full market + holder data available."
			: `Missing ${missing} data inputs reduces confidence.`;
	return { value: Math.min(100, score), explanation };
}

function calcSignals(market: TokenIntelResponse["market"], top10Pct: number | null) {
	const vol = market.volume24hUsd || 0;
	const liq = market.liquidityUsd || 0;
	const fdv = market.fdvUsd || 0;
	const volToLiq = liq > 0 ? vol / liq : null;
	const liqToFdv = fdv > 0 ? liq / fdv : null;

	const bundledBuys =
		volToLiq !== null && volToLiq > 5 && liqToFdv !== null && liqToFdv < 0.05;

	let sniperActivity: RiskLevel = "low";
	let botRisk: RiskLevel = "low";

	if (volToLiq !== null && volToLiq > 3) sniperActivity = "medium";
	if (volToLiq !== null && volToLiq > 6) sniperActivity = "high";

	if (liqToFdv !== null && liqToFdv < 0.02) botRisk = "medium";
	if (liqToFdv !== null && liqToFdv < 0.01) botRisk = "high";
	if (top10Pct !== null && top10Pct > 35) botRisk = "high";

	return {
		bundledBuys: {
			value: Boolean(bundledBuys),
			explanation: bundledBuys
				? "High volume-to-liquidity with thin liquidity suggests bundled buy pressure."
				: "No strong bundled-buy signature from volume/liquidity.",
		},
		sniperActivity: {
			value: sniperActivity,
			explanation:
				volToLiq === null
					? "Insufficient volume/liquidity to assess snipers."
					: `Volume/liquidity ratio at ${volToLiq.toFixed(2)}x.`,
		},
		botRisk: {
			value: botRisk,
			explanation:
				top10Pct !== null
					? `Top 10 holders at ${top10Pct.toFixed(2)}% and liq/FDV ${(liqToFdv ?? 0).toFixed(4)}.`
					: `Liquidity/FDV ${(liqToFdv ?? 0).toFixed(4)} informs bot risk.`,
		},
	};
}

async function fetchTokenIntel(mint: string): Promise<TokenIntelResponse> {
	const cached = cache.get(mint);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;

	try {
		const [dex, holderResult, topHoldersResult, mintInfo] = await Promise.all([
			fetchDexscreener(mint),
			fetchHolderCount(mint),
			fetchTopHoldersFromRpc(mint),
			fetchMintAccountInfo(mint),
		]);

		const market = dex?.market || {
			priceUsd: null,
			liquidityUsd: null,
			volume24hUsd: null,
			fdvUsd: null,
			marketCapUsd: null,
			priceChangePct: { m5: null, h1: null, h6: null, h24: null },
			txns24h: { buys: null, sells: null },
			dex: null,
			pairUrl: null,
			pairCreatedAt: null,
		};

		const top10Pct = topHoldersResult.top10Pct ?? null;
		const volToLiq =
			market.volume24hUsd && market.liquidityUsd
				? market.volume24hUsd / market.liquidityUsd
				: null;

		const stage = calcStage(market);
		const confidence = calcConfidence({
			market,
			holders: holderResult.count ?? null,
			top10Pct,
		});
		const signalSet = calcSignals(market, top10Pct);

		const result: TokenIntelResponse = {
			ok: true,
			mint,
			timestamp: new Date().toISOString(),
			identity: dex?.identity || { name: null, symbol: null, image: null },
			market,
			metrics: {
				holders: holderResult.count ?? null,
				top10Pct,
				volToLiq,
				totalSupply: mintInfo.totalSupply,
				decimals: mintInfo.decimals,
				mintAuthority: mintInfo.mintAuthority,
				freezeAuthority: mintInfo.freezeAuthority,
				mintAuthorityRevoked: mintInfo.mintAuthorityRevoked,
				freezeAuthorityRevoked: mintInfo.freezeAuthorityRevoked,
				tokenProgram: mintInfo.tokenProgram,
				poolCount: dex?.pairsCount ?? null,
				listedAgeHours:
					market.pairCreatedAt !== null
						? Math.max(0, (Date.now() - market.pairCreatedAt) / 3600000)
						: null,
			},
			signals: {
				stage,
				confidence,
				bundledBuys: signalSet.bundledBuys,
				sniperActivity: signalSet.sniperActivity,
				botRisk: signalSet.botRisk,
			},
			sources: {
				dexscreener: Boolean(dex),
				helius: holderResult.source === "helius",
			},
		};

		cache.set(mint, { data: result, timestamp: Date.now() });
		return result;
	} catch (error) {
		return {
			ok: false,
			mint,
			timestamp: new Date().toISOString(),
			identity: { name: null, symbol: null, image: null },
			market: {
				priceUsd: null,
				liquidityUsd: null,
				volume24hUsd: null,
				fdvUsd: null,
				marketCapUsd: null,
				priceChangePct: { m5: null, h1: null, h6: null, h24: null },
				txns24h: { buys: null, sells: null },
				dex: null,
				pairUrl: null,
				pairCreatedAt: null,
			},
			metrics: {
				holders: null,
				top10Pct: null,
				volToLiq: null,
				totalSupply: null,
				decimals: null,
				mintAuthority: null,
				freezeAuthority: null,
				mintAuthorityRevoked: null,
				freezeAuthorityRevoked: null,
				tokenProgram: null,
				poolCount: null,
				listedAgeHours: null,
			},
			signals: {
				stage: { value: "early", explanation: "Insufficient data." },
				confidence: { value: 0, explanation: "Request failed." },
				bundledBuys: { value: false, explanation: "No data." },
				sniperActivity: { value: "low", explanation: "No data." },
				botRisk: { value: "low", explanation: "No data." },
			},
			sources: { dexscreener: false, helius: false },
			error: "Failed to fetch token intel",
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
		return NextResponse.json(
			{ ok: false, error: "internal_error" },
			{ status: 500 },
		);
	}
}
