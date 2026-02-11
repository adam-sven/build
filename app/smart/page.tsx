'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { readSessionJson, writeSessionJson } from '@/lib/client-cache';

type WalletBuy = {
  mint: string;
  amount: number;
  signature: string;
  blockTime: number | null;
  wallet: string;
  solDelta: number;
  source: 'tx' | 'holding';
};

type WalletActivity = {
  wallet: string;
  buys: WalletBuy[];
  sampledPnlSol: number;
  txCount: number;
  lastSeen: number | null;
  uniqueMints: number;
};

type TopWallet = {
  wallet: string;
  buyCount: number;
  uniqueMints: number;
  sampledPnlSol: number;
  realizedPnlSol: number;
  unrealizedPnlSol: number;
  totalPnlSol: number;
  winRate: number | null;
  closedTrades: number;
  txCount: number;
  lastSeen: number | null;
  topMints: string[];
};

type TopMint = {
  mint: string;
  walletCount: number;
  buyCount: number;
  wallets: string[];
  amountTotal: number;
  solFlow: number;
  lastBuyAt: number | null;
  token: {
    name: string | null;
    symbol: string | null;
    image: string | null;
    priceUsd: number | null;
    change24h: number | null;
    volume24h: number | null;
    liquidityUsd: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    pairUrl: string | null;
    dex: string | null;
  };
};

type SmartWalletSnapshot = {
  ok: boolean;
  timestamp: string;
  wallets: string[];
  activity: WalletActivity[];
  byMint: Record<string, { walletCount: number; buys: WalletBuy[] }>;
  topWallets: TopWallet[];
  topMints: TopMint[];
  stats: {
    totalWallets: number;
    activeWallets: number;
    totalBuys: number;
    totalTrackedMints: number;
  };
};

const shortAddr = (addr: string, start = 6, end = 6) => {
  return `${addr.slice(0, start)}...${addr.slice(-end)}`;
};
const isLikelyMint = (v: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);

const formatBlockTime = (val: number | null) => {
  if (!val) return '—';
  return new Date(val * 1000).toLocaleString();
};

const formatShort = (val: number | null) => {
  if (val === null) return '—';
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}b`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}m`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(2)}k`;
  return val.toFixed(2);
};

const formatSol = (val: number) => {
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)} SOL`;
};

const formatWinRatePct = (val: number | null) => {
  if (val === null) return "—";
  return `${(val * 100).toFixed(0)}%`;
};

const formatUsd = (val: number | null) => {
  if (val === null) return '—';
  if (val < 0.01) return `$${val.toFixed(6)}`;
  if (val < 1) return `$${val.toFixed(4)}`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}m`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}k`;
  return `$${val.toFixed(2)}`;
};

const formatPct = (val: number | null) => {
  if (val === null) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
};

function TokenAvatar({ image, symbol }: { image: string | null; symbol: string | null }) {
  const [src, setSrc] = useState<string>(image || "/placeholder-logo.svg");
  useEffect(() => {
    setSrc(image || "/placeholder-logo.svg");
  }, [image]);
  if (src) {
    return (
      <img
        src={src}
        alt={symbol || "token"}
        className="h-6 w-6 rounded-full border border-white/15 object-cover"
        onError={() => setSrc("/placeholder-logo.svg")}
      />
    );
  }
  return <img src="/placeholder-logo.svg" alt={symbol || "token"} className="h-6 w-6 rounded-full border border-white/15 object-cover" />;
}

export default function SmartWalletsPage() {
  const [data, setData] = useState<SmartWalletSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [walletFilter, setWalletFilter] = useState('');
  const [mintFilter, setMintFilter] = useState('');
  const sessionKey = 'trencher:smart:snapshot:v1';

  const hasSnapshotRows = (snapshot: SmartWalletSnapshot | null) => {
    if (!snapshot) return false;
    return (snapshot.topWallets?.length || 0) + (snapshot.topMints?.length || 0) > 0;
  };

  useEffect(() => {
    let ignore = false;
    const cached = readSessionJson<SmartWalletSnapshot>(sessionKey);
    const hasCachedRows = hasSnapshotRows(cached);
    if (cached?.ok) {
      setData(cached);
    }

    const load = async (force = false, silent = false) => {
      if (!silent && !hasCachedRows) setLoading(true);
      try {
        const res = await fetch(`/api/smart-wallets${force ? '?force=1' : ''}`);
        const json = await res.json();
        if (!ignore && json?.ok) {
          setError(null);
          setData((prev) => {
            const nextHasRows = hasSnapshotRows(json);
            const prevHasRows = hasSnapshotRows(prev);
            const next = !nextHasRows && prevHasRows ? prev : json;
            writeSessionJson(sessionKey, next);
            return next;
          });
        } else if (!ignore) {
          setError(json?.error || "smart_wallets_failed");
        }
      } finally {
        if (!ignore && !silent) setLoading(false);
      }
    };

    load();
    const interval = setInterval(() => load(false, true), 20_000);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  const forceRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/smart-wallets?force=1');
      const json = await res.json();
      if (json?.ok) {
        setError(null);
        setData((prev) => {
          const nextHasRows = hasSnapshotRows(json);
          const prevHasRows = hasSnapshotRows(prev);
          const next = !nextHasRows && prevHasRows ? prev : json;
          writeSessionJson(sessionKey, next);
          return next;
        });
      } else {
        setError(json?.error || "smart_wallets_failed");
      }
    } finally {
      setRefreshing(false);
    }
  };

  const activityByWallet = useMemo(() => {
    const map = new Map<string, WalletActivity>();
    for (const item of data?.activity || []) map.set(item.wallet, item);
    return map;
  }, [data]);

  const wallets = useMemo(() => {
    const list = (data?.topWallets || []).filter((item) => item.buyCount > 0);
    if (!walletFilter.trim()) return list;
    const q = walletFilter.toLowerCase();
    return list.filter((item) => item.wallet.toLowerCase().includes(q));
  }, [data, walletFilter]);

  const topMints = useMemo(() => {
    const list = [...(data?.topMints || [])]
      .filter((item) => isLikelyMint(String(item?.mint || "")))
      .sort((a, b) => {
      const aKnown = (a.token?.name || a.token?.symbol || a.token?.image) ? 1 : 0;
      const bKnown = (b.token?.name || b.token?.symbol || b.token?.image) ? 1 : 0;
      if (bKnown !== aKnown) return bKnown - aKnown;
      if (b.buyCount !== a.buyCount) return b.buyCount - a.buyCount;
      return b.walletCount - a.walletCount;
    });
    if (!mintFilter.trim()) return list;
    const q = mintFilter.toLowerCase();
    return list.filter((item) => {
      const label = `${item.token.symbol || ''} ${item.token.name || ''} ${item.mint}`.toLowerCase();
      return label.includes(q);
    });
  }, [data, mintFilter]);

  return (
    <main className="min-h-screen text-foreground bg-[radial-gradient(1200px_500px_at_10%_-10%,#14213d_0%,transparent_60%),radial-gradient(900px_400px_at_90%_10%,#1f2937_0%,transparent_55%),#05070b]">
      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Smart Wallets</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Two-column discovery: wallet performers on the left, most bought tokens on the right.
            </p>
          </div>
          <div className="text-xs text-white/40">
            Updated: {data?.timestamp ? new Date(data.timestamp).toLocaleString() : '—'}
          </div>
        </div>

        <div className="mb-4">
          <Button
            onClick={forceRefresh}
            disabled={refreshing}
            className="h-8 rounded-lg bg-emerald-400 text-black hover:opacity-90"
          >
            {refreshing ? 'Refreshing…' : 'Refresh now'}
          </Button>
        </div>

        {data?.stats && (
          <div className="mb-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Wallets</div>
              <div className="text-lg font-semibold">{data.stats.totalWallets}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Active</div>
              <div className="text-lg font-semibold">{data.stats.activeWallets}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Buys Seen</div>
              <div className="text-lg font-semibold">{data.stats.totalBuys}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Tracked Mints</div>
              <div className="text-lg font-semibold">{data.stats.totalTrackedMints}</div>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-sm text-white/60">Loading smart wallet activity…</div>
        )}
        {!loading && error && (
          <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            Smart Wallets API error: {error}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <section className="xl:col-span-6 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-white/10 bg-black/25">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Wallet Leaderboard</h2>
                <input
                  value={walletFilter}
                  onChange={(e) => setWalletFilter(e.target.value)}
                  placeholder="Filter wallet"
                  className="w-40 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white/80 placeholder:text-white/40 focus:outline-none focus:border-white/30"
                />
              </div>
              <p className="mt-1 text-xs text-white/50">PnL shows realized + unrealized SOL estimate from sampled trades and live token prices.</p>
            </div>

            <div className="max-h-[62vh] overflow-y-auto">
              {wallets.length === 0 && (
                <div className="px-4 py-8 text-sm text-white/50">No active wallets matched this filter.</div>
              )}
              {wallets.map((wallet, index) => {
                const isOpen = expandedWallet === wallet.wallet;
                const details = activityByWallet.get(wallet.wallet);
                return (
                  <div key={wallet.wallet} className="border-b border-white/5">
                    <button
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-white/5"
                      onClick={() => setExpandedWallet(isOpen ? null : wallet.wallet)}
                    >
                      <div className="grid grid-cols-[28px_1fr_auto] gap-3 items-center">
                        <div className="text-xs text-white/40">#{index + 1}</div>
                        <div>
                          <Link href={`/wallet/${wallet.wallet}`} className="font-mono text-sm text-cyan-200 hover:text-cyan-100">
                            {shortAddr(wallet.wallet, 7, 7)}
                          </Link>
                          <div className="mt-1 text-xs text-white/50">
                            Buys {wallet.buyCount} • Mints {wallet.uniqueMints} • Tx {wallet.txCount}
                          </div>
                        </div>
                        <div className={`text-sm font-semibold ${(wallet.totalPnlSol ?? wallet.sampledPnlSol) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                          {formatSol(wallet.totalPnlSol ?? wallet.sampledPnlSol)}
                        </div>
                      </div>
                    </button>

                    {isOpen && details && (
                      <div className="px-4 pb-4">
                        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                          <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] text-white/70">
                            <div>Realized: <span className={(wallet.realizedPnlSol || 0) >= 0 ? "text-emerald-300" : "text-red-300"}>{formatSol(wallet.realizedPnlSol || 0)}</span></div>
                            <div>Unrealized: <span className={(wallet.unrealizedPnlSol || 0) >= 0 ? "text-emerald-300" : "text-red-300"}>{formatSol(wallet.unrealizedPnlSol || 0)}</span></div>
                            <div>Win rate: <span className="text-white/85">{formatWinRatePct(wallet.winRate)}</span></div>
                            <div>Closed trades: <span className="text-white/85">{wallet.closedTrades || 0}</span></div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs uppercase tracking-widest text-white/45">Recent buys</div>
                            <Link
                              href={`/wallet/${wallet.wallet}`}
                              className="text-xs text-cyan-300 hover:text-cyan-200"
                            >
                              Open Wallet Profile
                            </Link>
                          </div>
                          <ul className="mt-2 space-y-1 text-xs text-white/70">
                            {details.buys.slice(0, 8).map((buy) => (
                              <li key={`${buy.signature}-${buy.mint}`} className="grid grid-cols-[1fr_auto_auto] gap-2">
                                <span className="font-mono">
                                  {shortAddr(buy.mint, 6, 6)}
                                  {buy.source === 'holding' ? ' (holding)' : ''}
                                </span>
                                <span>{formatShort(buy.amount)}</span>
                                <span className="text-white/40">{formatBlockTime(buy.blockTime)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="xl:col-span-6 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-white/10 bg-black/25">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Top Bought Tokens</h2>
                <input
                  value={mintFilter}
                  onChange={(e) => setMintFilter(e.target.value)}
                  placeholder="Filter token"
                  className="w-40 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white/80 placeholder:text-white/40 focus:outline-none focus:border-white/30"
                />
              </div>
              <p className="mt-1 text-xs text-white/50">Click a token row to open Intel instantly.</p>
            </div>

            <div className="max-h-[62vh] overflow-y-auto">
              {topMints.length === 0 && (
                <div className="px-4 py-8 text-sm text-white/50">No token activity yet.</div>
              )}
              {topMints.map((token, index) => {
                const changeTone =
                  token.token.change24h === null
                    ? 'text-white/55'
                    : token.token.change24h >= 0
                      ? 'text-emerald-300'
                      : 'text-red-300';

                return (
                  <div key={token.mint} className="border-b border-white/5">
                    <Link
                      href={`/intel?mint=${token.mint}`}
                      className="block w-full px-4 py-3 text-left transition-colors hover:bg-white/5"
                    >
                      <div className="grid grid-cols-[28px_1fr_auto] gap-3 items-center">
                        <div className="text-xs text-white/40">#{index + 1}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <TokenAvatar image={token.token.image} symbol={token.token.symbol} />
                            <span className="font-semibold">
                              {token.token.symbol || shortAddr(token.mint, 4, 4)}
                            </span>
                            <span className="text-xs text-white/45">
                              {token.token.name || shortAddr(token.mint, 6, 6)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-white/60">
                            {token.walletCount} wallets • {token.buyCount} buys
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-white/90">MCAP {formatUsd(token.token.marketCapUsd)}</span>
                            <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-white/90">VOL {formatUsd(token.token.volume24h)}</span>
                            <span className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-white/80">LIQ {formatUsd(token.token.liquidityUsd)}</span>
                          </div>
                        </div>
                        <div className={`text-base font-semibold ${changeTone}`}>{formatPct(token.token.change24h)}</div>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="mt-5 text-xs text-white/40 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          Data auto-refreshes every few minutes on the backend and every 20 seconds in this UI.
        </div>
      </div>
    </main>
  );
}
