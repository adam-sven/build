'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';


type TokenIntelStage = 'early' | 'mid' | 'late';

type TokenIntelResponse = {
  ok: boolean;
  mint: string;
  timestamp: string;
  identity: { name: string | null; symbol: string | null; image: string | null };
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
    sniperActivity: { value: 'low' | 'medium' | 'high'; explanation: string };
    botRisk: { value: 'low' | 'medium' | 'high'; explanation: string };
  };
  sources: { dexscreener: boolean; helius: boolean };
  error?: string;
};

type SmartWalletSnapshot = {
  ok: boolean;
  timestamp: string;
  byMint: Record<
    string,
    { walletCount: number; buys: { wallet: string; signature: string; blockTime: number | null; amount: number }[] }
  >;
};

export default function IntelPage() {
  const [mint, setMint] = useState('');
  const [data, setData] = useState<TokenIntelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smartWallets, setSmartWallets] = useState<SmartWalletSnapshot | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);

  const handleFetch = async (overrideMint?: string) => {
    const targetMint = overrideMint?.trim() || mint.trim();
    if (!targetMint) {
      setError('Please enter a mint address');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`/api/token-intel?mint=${encodeURIComponent(targetMint)}`);
      if (!res.ok) {
        const text = await res.text();
        setError(`API Error: ${res.status} ${text}`);
        return;
      }
      const result: TokenIntelResponse = await res.json();
      if (!result.ok) {
        setError(result.error || 'Failed to fetch token intel');
        return;
      }
      setData(result);
    } catch {
      setError('Error fetching token intel');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFetch();
  };

  useEffect(() => {
    if (!mint.trim()) return;
    const params = new URLSearchParams(window.location.search);
    params.set('mint', mint.trim());
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [mint]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialMint = params.get('mint');
    if (initialMint) {
      setMint(initialMint);
      handleFetch(initialMint);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchSmartWallets = async () => {
      if (!data?.mint) return;
      setSmartLoading(true);
      try {
        const res = await fetch('/api/smart-wallets');
        if (!res.ok) throw new Error('smart-wallets failed');
        const json: SmartWalletSnapshot = await res.json();
        setSmartWallets(json);
      } catch {
        setSmartWallets(null);
      } finally {
        setSmartLoading(false);
      }
    };
    fetchSmartWallets();
  }, [data?.mint]);

  const formatUsd = (val: number | null) => {
    if (val === null) return 'Unavailable';
    if (val < 0.01) return `$${val.toFixed(6)}`;
    if (val < 1) return `$${val.toFixed(4)}`;
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}m`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
    return `$${val.toFixed(2)}`;
  };

  const formatPct = (val: number | null) => {
    return val === null ? 'Unavailable' : `${val.toFixed(2)}%`;
  };

  const formatRatio = (val: number | null) => {
    return val === null ? 'Unavailable' : `${val.toFixed(2)}x`;
  };

  const formatHours = (val: number | null) => {
    if (val === null) return 'Unavailable';
    if (val < 1) return `${Math.round(val * 60)}m`;
    if (val < 24) return `${val.toFixed(1)}h`;
    const days = val / 24;
    return `${days.toFixed(1)}d`;
  };

  const formatShort = (val: number | null) => {
    if (val === null) return 'Unavailable';
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}b`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}m`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(2)}k`;
    return val.toFixed(2);
  };

  const formatBlockTime = (val: number | null) => {
    if (!val) return '—';
    return new Date(val * 1000).toLocaleString();
  };

  const shortAddr = (addr: string, start = 6, end = 4) => {
    return `${addr.slice(0, start)}...${addr.slice(-end)}`;
  };

  const signalChip = (value: 'low' | 'medium' | 'high') => {
    if (value === 'high') return 'bg-red-500/15 text-red-200 border-red-400/30';
    if (value === 'medium') return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
    return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
  };

  const smartForMint = data?.mint ? smartWallets?.byMint?.[data.mint] : undefined;
  const smartBuys = smartForMint?.buys
    ? [...smartForMint.buys].sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0)).slice(0, 5)
    : [];

  return (
    <main className="min-h-screen text-foreground bg-[radial-gradient(1200px_500px_at_10%_-10%,#14213d_0%,transparent_60%),radial-gradient(900px_400px_at_90%_10%,#1f2937_0%,transparent_55%),#05070b]">
      <div className="max-w-5xl mx-auto px-4 py-14">
        <div className="mb-10">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-3">Token Intel</h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Paste a Solana mint and get a single, high-signal snapshot.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            This tool filters for attention-worthiness. It does not predict price or recommend trades.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-3 mb-10">
          <input
            type="text"
            placeholder="Enter mint address"
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/10"
          />
          <Button
            onClick={handleFetch}
            disabled={loading}
            className="h-12 px-6 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 text-black hover:opacity-90"
          >
            {loading ? 'Loading...' : 'Fetch Intel'}
          </Button>
        </div>

        {error && (
          <div className="mb-8 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {data && data.ok && (
          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,22,35,0.92),rgba(7,10,18,0.95))] shadow-[0_24px_70px_-45px_rgba(0,0,0,0.9)]">
              <div className="absolute inset-0 opacity-70 [background:radial-gradient(520px_220px_at_8%_-10%,rgba(56,189,248,0.25),transparent_60%),radial-gradient(520px_220px_at_92%_0%,rgba(16,185,129,0.18),transparent_60%)]" />
              <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-[22px]" />
              <div className="relative p-5 md:p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-black/40 border border-white/10 overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
                      {data.identity.image ? (
                        <img
                          src={data.identity.image || '/placeholder.svg'}
                          alt={data.identity.name || 'Token'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-xs text-white/50">
                          {data.identity.symbol || 'SOL'}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-xl md:text-2xl font-semibold">
                        {data.identity.name || 'Unknown Token'}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                        <span className="font-mono">{shortAddr(data.mint, 8, 8)}</span>
                        {data.identity.symbol && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs">
                            {data.identity.symbol}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/55">
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Stage {data.signals.stage.value}</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Confidence {data.signals.confidence.value}%</span>
                        {data.market.dex && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 uppercase">{data.market.dex}</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-white/50">
                        {data.signals.stage.explanation} {data.signals.confidence.explanation}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-200">
                      Holders {data.metrics.holders !== null ? data.metrics.holders.toLocaleString() : 'Unavailable'}
                    </div>
                    <div className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
                      Liq {formatUsd(data.market.liquidityUsd)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                    <div className="text-[11px] uppercase tracking-widest text-white/50">Price</div>
                    <div className="mt-1 text-lg font-semibold">{formatUsd(data.market.priceUsd)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                    <div className="text-[11px] uppercase tracking-widest text-white/50">Liquidity</div>
                    <div className="mt-1 text-lg font-semibold">{formatUsd(data.market.liquidityUsd)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                    <div className="text-[11px] uppercase tracking-widest text-white/50">Volume 24h</div>
                    <div className="mt-1 text-lg font-semibold">{formatUsd(data.market.volume24hUsd)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                    <div className="text-[11px] uppercase tracking-widest text-white/50">FDV</div>
                    <div className="mt-1 text-lg font-semibold">{formatUsd(data.market.fdvUsd)}</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm text-white/60">Live Metrics</div>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Holders</div>
                      <div className="mt-1 text-lg font-semibold">
                        {data.metrics.holders !== null ? data.metrics.holders.toLocaleString() : 'Unavailable'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Top 10 %</div>
                      <div className="mt-1 text-lg font-semibold">{formatPct(data.metrics.top10Pct)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Vol / Liq</div>
                      <div className="mt-1 text-lg font-semibold">{formatRatio(data.metrics.volToLiq)}</div>
                    </div>
                  </div>
                </div>

                <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-sm text-white/70">Market Pulse</summary>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">5m</div>
                      <div className="mt-1 text-lg font-semibold">
                        {formatPct(data.market.priceChangePct.m5)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">1h</div>
                      <div className="mt-1 text-lg font-semibold">
                        {formatPct(data.market.priceChangePct.h1)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">6h</div>
                      <div className="mt-1 text-lg font-semibold">
                        {formatPct(data.market.priceChangePct.h6)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">24h</div>
                      <div className="mt-1 text-lg font-semibold">
                        {formatPct(data.market.priceChangePct.h24)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Buys (24h)</div>
                      <div className="mt-1 text-lg font-semibold">
                        {data.market.txns24h.buys ?? 'Unavailable'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Sells (24h)</div>
                      <div className="mt-1 text-lg font-semibold">
                        {data.market.txns24h.sells ?? 'Unavailable'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Market Cap</div>
                      <div className="mt-1 text-lg font-semibold">
                        {data.market.marketCapUsd !== null ? `$${formatShort(data.market.marketCapUsd)}` : 'Unavailable'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Listed</div>
                      <div className="mt-1 text-lg font-semibold">
                        {formatHours(data.metrics.listedAgeHours)}
                      </div>
                    </div>
                  </div>
                </details>

                <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                  <summary className="cursor-pointer text-sm text-white/70">Token Structure</summary>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Supply</div>
                      <div className="mt-1 text-lg font-semibold">
                        {data.metrics.totalSupply !== null ? formatShort(data.metrics.totalSupply) : 'Unavailable'}
                      </div>
                      <div className="text-[11px] text-white/50">Decimals {data.metrics.decimals ?? 'N/A'}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Mint Authority</div>
                      <div className="mt-1 text-lg font-semibold">
                        {data.metrics.mintAuthorityRevoked === null
                          ? 'Unknown'
                          : data.metrics.mintAuthorityRevoked
                          ? 'Revoked'
                          : 'Active'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Freeze Authority</div>
                      <div className="mt-1 text-lg font-semibold">
                        {data.metrics.freezeAuthorityRevoked === null
                          ? 'Unknown'
                          : data.metrics.freezeAuthorityRevoked
                          ? 'Revoked'
                          : 'Active'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Token Program</div>
                      <div className="mt-1 text-lg font-semibold">
                        {data.metrics.tokenProgram
                          ? data.metrics.tokenProgram === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
                            ? 'SPL Token'
                            : 'Token-2022'
                          : 'Unknown'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">DEX Pools</div>
                      <div className="mt-1 text-lg font-semibold">
                        {data.metrics.poolCount ?? 'Unavailable'}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Mint</div>
                      <div className="mt-1 text-xs font-mono text-white/70">{shortAddr(data.mint, 6, 6)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">DEX</div>
                      <div className="mt-1 text-lg font-semibold">{data.market.dex || 'Unavailable'}</div>
                    </div>
                  </div>
                </details>

                <div className="mt-4">
                  <div className="text-sm text-white/60">Smart Wallet Activity</div>
                  <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white/50">Wallets buying this mint</div>
                      <div className="text-sm font-semibold text-white">
                        {smartForMint?.walletCount ?? 0}
                      </div>
                    </div>
                    {smartLoading && (
                      <div className="mt-2 text-xs text-white/50">Loading smart-wallet activity…</div>
                    )}
                    {!smartLoading && smartBuys.length === 0 && (
                      <div className="mt-2 text-xs text-white/50">
                        No smart-wallet buys detected in recent transactions.
                      </div>
                    )}
                    {!smartLoading && smartBuys.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-white/70">
                        {smartBuys.map((buy) => (
                          <li key={`${buy.signature}-${buy.wallet}`} className="flex items-center justify-between">
                            <span className="font-mono">{shortAddr(buy.wallet, 6, 6)}</span>
                            <span className="text-white/50">{formatShort(buy.amount)}</span>
                            <span className="text-white/40">{formatBlockTime(buy.blockTime)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 text-[11px] text-white/40">
                      Based on the last 5 transactions per wallet. Updated {smartWallets?.timestamp ? new Date(smartWallets.timestamp).toLocaleString() : '—'}.
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-sm text-white/60">Signals</div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Bundles</div>
                      <div className={`mt-1 inline-flex items-center rounded-full border px-3 py-1 text-xs ${data.signals.bundledBuys.value ? 'bg-red-500/15 text-red-200 border-red-400/30' : 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30'}`} title={data.signals.bundledBuys.explanation}>
                        {data.signals.bundledBuys.value ? 'Detected' : 'Not detected'}
                      </div>
                      <p className="mt-2 text-xs text-white/50">{data.signals.bundledBuys.explanation}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Snipers</div>
                      <div className={`mt-1 inline-flex items-center rounded-full border px-3 py-1 text-xs ${signalChip(data.signals.sniperActivity.value)}`} title={data.signals.sniperActivity.explanation}>
                        {data.signals.sniperActivity.value}
                      </div>
                      <p className="mt-2 text-xs text-white/50">{data.signals.sniperActivity.explanation}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[11px] uppercase tracking-widest text-white/50">Bot Risk</div>
                      <div className={`mt-1 inline-flex items-center rounded-full border px-3 py-1 text-xs ${signalChip(data.signals.botRisk.value)}`} title={data.signals.botRisk.explanation}>
                        {data.signals.botRisk.value}
                      </div>
                      <p className="mt-2 text-xs text-white/50">{data.signals.botRisk.explanation}</p>
                    </div>
                  </div>
                </div>

                <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3" open>
                  <summary className="cursor-pointer text-sm text-white/70">GMGN Chart</summary>
                  <div className="mt-3 rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
                    <iframe
                      title="GMGN chart"
                      src={`https://www.gmgn.cc/kline/sol/${data.mint}?theme=dark&interval=15`}
                      className="w-full h-[260px]"
                      allow="clipboard-read; clipboard-write"
                    />
                  </div>
                </details>

                <div className="mt-4 flex flex-col md:flex-row gap-3">
                  <Button
                    className="h-12 rounded-2xl bg-emerald-400 text-black hover:opacity-90"
                    asChild
                  >
                    <a href={data.market.pairUrl || `https://dexscreener.com/solana/${data.mint}`} target="_blank" rel="noreferrer">
                      Open on Dexscreener
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 rounded-2xl border-white/15 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => navigator.clipboard?.writeText(data.mint)}
                  >
                    Copy Mint
                  </Button>
                </div>
              </div>
            </div>

            <details className="rounded-lg border border-white/10 bg-white/5">
              <summary className="cursor-pointer px-6 py-4 text-sm text-muted-foreground font-medium hover:text-foreground transition-colors">
                Advanced (raw JSON)
              </summary>
              <div className="px-6 pb-6 border-t border-white/10">
                <pre className="text-xs overflow-auto bg-black/30 rounded-md p-4">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}
