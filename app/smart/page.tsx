'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from "next/navigation";
import { Button } from '@/components/ui/button';
import AnimatedUsd from '@/components/trencher/animated-usd';
import AnimatedSol from '@/components/trencher/animated-sol';
import AnimatedNumber from '@/components/trencher/animated-number';
import { readSessionJson, writeSessionJson } from '@/lib/client-cache';

const SMART_POLL_MS = Math.max(20_000, Number(process.env.NEXT_PUBLIC_SMART_POLL_MS || "20000"));
const SMART_FORCE_REFRESH_MIN_MS = Math.max(
  60_000,
  Number(process.env.NEXT_PUBLIC_SMART_FORCE_REFRESH_MIN_MS || "120000"),
);

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
  priceCoveragePct: number | null;
  profile?: {
    rank: number | null;
    name: string | null;
    accountUrl: string | null;
    twitter: string | null;
    telegram: string | null;
    website: string | null;
  } | null;
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

const formatWinRatePct = (val: number | null | undefined) => {
  if (typeof val !== "number" || !Number.isFinite(val)) return "—";
  return `${(val * 100).toFixed(0)}%`;
};

const formatCoveragePct = (val: number | null | undefined) => {
  if (typeof val !== "number" || !Number.isFinite(val)) return "n/a";
  return `${Math.max(0, Math.min(100, val * 100)).toFixed(0)}%`;
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

function TokenAvatar({ image, symbol, mint }: { image: string | null; symbol: string | null; mint: string }) {
  const candidates = [
    image || "",
    `https://cdn.dexscreener.com/tokens/solana/${mint}.png`,
    `https://dd.dexscreener.com/ds-data/tokens/solana/${mint}.png`,
  ].filter(Boolean);
  const [idx, setIdx] = useState(0);
  const src = idx < candidates.length ? candidates[idx] : null;

  useEffect(() => {
    setIdx(0);
  }, [image, mint]);

  if (src) {
    return (
      <img
        src={src}
        alt={symbol || "token"}
        className="h-6 w-6 rounded-full border border-white/15 object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setIdx((v) => v + 1)}
      />
    );
  }
  return (
    <div className="grid h-6 w-6 place-items-center rounded-full border border-white/15 bg-white/5 text-[10px] font-semibold text-white/75">
      {(symbol || mint || "T").slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function SmartWalletsPage() {
  const router = useRouter();
  const [data, setData] = useState<SmartWalletSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [walletFilter, setWalletFilter] = useState('');
  const [mintFilter, setMintFilter] = useState('');
  const [smartSearch, setSmartSearch] = useState("");
  const enrichRunKeyRef = useRef<string>("");
  const lastForceRefreshAtRef = useRef(0);
  const sessionKey = 'trencher:smart:snapshot:v1';
  const localKey = "trencher:smart:snapshot:persist:v1";

  const readLocalSnapshot = () => {
    try {
      const raw = window.localStorage.getItem(localKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SmartWalletSnapshot;
      return parsed?.ok ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeLocalSnapshot = (snapshot: SmartWalletSnapshot | null) => {
    if (!snapshot?.ok) return;
    try {
      window.localStorage.setItem(localKey, JSON.stringify(snapshot));
    } catch {
      // ignore
    }
  };

  const hasSnapshotRows = (snapshot: SmartWalletSnapshot | null) => {
    if (!snapshot) return false;
    return (snapshot.topWallets?.length || 0) + (snapshot.topMints?.length || 0) > 0;
  };
  const snapshotRowCount = (snapshot: SmartWalletSnapshot | null) =>
    (snapshot?.topWallets?.length || 0) + (snapshot?.topMints?.length || 0);

  useEffect(() => {
    let ignore = false;
    const cached = readSessionJson<SmartWalletSnapshot>(sessionKey) || readLocalSnapshot();
    const hasCachedRows = hasSnapshotRows(cached);
    if (cached?.ok) {
      setData(cached);
    }

    const load = async (force = false, silent = false) => {
      if (!silent && !hasCachedRows) setLoading(true);
      try {
        const qs = force ? `force=1&t=${Date.now()}` : `t=${Date.now()}`;
        const res = await fetch(`/api/smart-wallets?${qs}`, { cache: "no-store" });
        const json = await res.json();
        if (!ignore && json?.ok) {
          setError(null);
          setData((prev) => {
            const nextHasRows = hasSnapshotRows(json);
            const prevHasRows = hasSnapshotRows(prev);
            const nextCount = snapshotRowCount(json);
            const prevCount = snapshotRowCount(prev);
            const severeDrop = prevCount > 0 && nextCount > 0 && nextCount < Math.max(3, Math.floor(prevCount * 0.6));
            let next = (!nextHasRows && prevHasRows) || severeDrop ? prev : json;
            const prevTopWallets = Array.isArray(prev?.topWallets) ? prev.topWallets : [];
            const nextTopWallets = Array.isArray(next?.topWallets) ? next.topWallets : [];
            if (prevTopWallets.length >= 10 && nextTopWallets.length < Math.max(5, Math.floor(prevTopWallets.length * 0.6))) {
              next = { ...next, topWallets: prevTopWallets };
            }
            const prevTopMints = Array.isArray(prev?.topMints) ? prev.topMints : [];
            const nextTopMints = Array.isArray(next?.topMints) ? next.topMints : [];
            if (prevTopMints.length >= 6 && nextTopMints.length < 3) {
              next = { ...next, topMints: prevTopMints };
            }
            writeSessionJson(sessionKey, next);
            writeLocalSnapshot(next);
            return next;
          });
          if (!force) {
            const staleHeader = res.headers.get("X-Smart-Stale") === "1";
            const sourceHeader = res.headers.get("X-Smart-Source") || "";
            const snapshotAgeMs = json?.timestamp ? Date.now() - new Date(json.timestamp).getTime() : Number.POSITIVE_INFINITY;
            const shouldForce =
              staleHeader ||
              snapshotAgeMs > SMART_POLL_MS * 3 ||
              sourceHeader === "postgres" ||
              sourceHeader === "kv" ||
              sourceHeader === "disk";
            if (shouldForce && Date.now() - lastForceRefreshAtRef.current > SMART_FORCE_REFRESH_MIN_MS) {
              lastForceRefreshAtRef.current = Date.now();
              void load(true, true);
            }
          }
        } else if (!ignore) {
          setError(json?.error || "smart_wallets_failed");
        }
      } finally {
        if (!ignore && !silent) setLoading(false);
      }
    };

    load();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void load(false, true);
    }, SMART_POLL_MS);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  const forceRefresh = async () => {
    setRefreshing(true);
    try {
      lastForceRefreshAtRef.current = Date.now();
      const res = await fetch(`/api/smart-wallets?force=1&t=${Date.now()}`, { cache: "no-store" });
      const json = await res.json();
      if (json?.ok) {
        setError(null);
        setData((prev) => {
          const nextHasRows = hasSnapshotRows(json);
          const prevHasRows = hasSnapshotRows(prev);
          const nextCount = snapshotRowCount(json);
          const prevCount = snapshotRowCount(prev);
          const severeDrop = prevCount > 0 && nextCount > 0 && nextCount < Math.max(3, Math.floor(prevCount * 0.6));
          let next = (!nextHasRows && prevHasRows) || severeDrop ? prev : json;
          const prevTopWallets = Array.isArray(prev?.topWallets) ? prev.topWallets : [];
          const nextTopWallets = Array.isArray(next?.topWallets) ? next.topWallets : [];
          if (prevTopWallets.length >= 10 && nextTopWallets.length < Math.max(5, Math.floor(prevTopWallets.length * 0.6))) {
            next = { ...next, topWallets: prevTopWallets };
          }
          const prevTopMints = Array.isArray(prev?.topMints) ? prev.topMints : [];
          const nextTopMints = Array.isArray(next?.topMints) ? next.topMints : [];
          if (prevTopMints.length >= 6 && nextTopMints.length < 3) {
            next = { ...next, topMints: prevTopMints };
          }
          writeSessionJson(sessionKey, next);
          writeLocalSnapshot(next);
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

  const tokenMetaByMint = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string | null;
        symbol: string | null;
      }
    >();
    for (const item of data?.topMints || []) {
      map.set(item.mint, {
        name: item.token?.name || null,
        symbol: item.token?.symbol || null,
      });
    }
    return map;
  }, [data]);

  const wallets = useMemo(() => {
    const sorted = [...(data?.topWallets || [])].sort((a, b) => {
      const aPnl = Number.isFinite(Number(a.totalPnlSol)) ? Number(a.totalPnlSol) : Number(a.sampledPnlSol || 0);
      const bPnl = Number.isFinite(Number(b.totalPnlSol)) ? Number(b.totalPnlSol) : Number(b.sampledPnlSol || 0);
      if (bPnl !== aPnl) return bPnl - aPnl;
      if ((b.buyCount || 0) !== (a.buyCount || 0)) return (b.buyCount || 0) - (a.buyCount || 0);
      return (b.uniqueMints || 0) - (a.uniqueMints || 0);
    });
    let list = sorted.filter((item) => {
      const pnl = Number.isFinite(Number(item.totalPnlSol)) ? Number(item.totalPnlSol) : Number(item.sampledPnlSol || 0);
      return Math.abs(pnl) > 0.000001;
    });
    // Keep the table stable when price coverage temporarily collapses to zero-PnL rows.
    if (list.length < 8 && sorted.length > list.length) {
      const topActive = sorted.filter((item) => Number(item.buyCount || 0) > 0).slice(0, 12);
      if (topActive.length > list.length) {
        list = topActive;
      }
    }
    if (!walletFilter.trim()) return list;
    const q = walletFilter.toLowerCase();
    return list.filter((item) => {
      const label = `${item.wallet} ${item.profile?.name || ""}`.toLowerCase();
      return label.includes(q);
    });
  }, [data, walletFilter]);

  const topMints = useMemo(() => {
    const list = [...(data?.topMints || [])]
      .filter((item) => isLikelyMint(String(item?.mint || "")))
      .filter((item) => (item.walletCount || 0) > 1)
      .sort((a, b) => {
        const aChange = typeof a.token?.change24h === "number" && Number.isFinite(a.token.change24h)
          ? a.token.change24h
          : null;
        const bChange = typeof b.token?.change24h === "number" && Number.isFinite(b.token.change24h)
          ? b.token.change24h
          : null;
        if (aChange !== null && bChange !== null && bChange !== aChange) return bChange - aChange;
        if (bChange !== null && aChange === null) return 1;
        if (aChange !== null && bChange === null) return -1;
        if (b.buyCount !== a.buyCount) return b.buyCount - a.buyCount;
        if (b.walletCount !== a.walletCount) return b.walletCount - a.walletCount;
        return (b.lastBuyAt || 0) - (a.lastBuyAt || 0);
      });
    if (!mintFilter.trim()) return list;
    const q = mintFilter.toLowerCase();
    return list.filter((item) => {
      const label = `${item.token.symbol || ''} ${item.token.name || ''} ${item.mint}`.toLowerCase();
      return label.includes(q);
    });
  }, [data, mintFilter]);

  useEffect(() => {
    const rows = Array.isArray(data?.topMints) ? data.topMints : [];
    if (!rows.length) return;
    const missing = rows
      .filter((r) => !!r?.mint)
      .filter(
        (r) =>
          r.token?.marketCapUsd === null ||
          r.token?.marketCapUsd === undefined ||
          r.token?.volume24h === null ||
          r.token?.volume24h === undefined ||
          r.token?.liquidityUsd === null ||
          r.token?.liquidityUsd === undefined,
      )
      .slice(0, 15);
    if (!missing.length) return;

    const runKey = missing.map((r) => r.mint).join(",");
    if (enrichRunKeyRef.current === runKey) return;
    enrichRunKeyRef.current = runKey;

    let dead = false;
    const run = async () => {
      const byMint = new Map<string, any>();
      for (let i = 0; i < missing.length; i += 8) {
        const batch = missing.slice(i, i + 8).map((r) => r.mint);
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${batch.join(",")}`, {
            cache: "no-store",
          });
          if (!res.ok) continue;
          const json = await res.json();
          const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
          for (const mint of batch) {
            const pair = pairs
              .filter((p: any) => p?.chainId === "solana" && String(p?.baseToken?.address || "") === mint)
              .sort((a: any, b: any) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
            if (!pair) continue;
            byMint.set(mint, {
              priceUsd: pair?.priceUsd ? Number(pair.priceUsd) : null,
              change24h: pair?.priceChange?.h24 ?? null,
              volume24h: pair?.volume?.h24 ?? null,
              liquidityUsd: pair?.liquidity?.usd ?? null,
              marketCapUsd: pair?.marketCap ?? null,
              fdvUsd: pair?.fdv ?? null,
              pairUrl: pair?.url || null,
              dex: pair?.dexId || null,
            });
          }
        } catch {
          // ignore enrichment batch failure
        }
      }

      if (dead || byMint.size === 0) return;
      setData((prev) => {
        if (!prev?.ok) return prev;
        const mergedTopMints = (prev.topMints || []).map((row) => {
          const patch = byMint.get(row.mint);
          if (!patch) return row;
          return {
            ...row,
            token: {
              ...row.token,
              priceUsd: patch.priceUsd ?? row.token?.priceUsd ?? null,
              change24h: patch.change24h ?? row.token?.change24h ?? null,
              volume24h: patch.volume24h ?? row.token?.volume24h ?? null,
              liquidityUsd: patch.liquidityUsd ?? row.token?.liquidityUsd ?? null,
              marketCapUsd: patch.marketCapUsd ?? row.token?.marketCapUsd ?? null,
              fdvUsd: patch.fdvUsd ?? row.token?.fdvUsd ?? null,
              pairUrl: patch.pairUrl || row.token?.pairUrl || null,
              dex: patch.dex || row.token?.dex || null,
            },
          };
        });
        return { ...prev, topMints: mergedTopMints };
      });
    };
    void run();
    return () => {
      dead = true;
    };
  }, [data?.timestamp, data?.topMints?.length]);

  const openSmartSearch = () => {
    const q = smartSearch.trim();
    if (!q) return;
    const qLower = q.toLowerCase();
    const looksLikeWallet = /^[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(q);
    const looksLikeMint = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(q);

    const matchedWallet = (data?.topWallets || []).find((w) => {
      const label = `${w.wallet} ${w.profile?.name || ""}`.toLowerCase();
      return label.includes(qLower);
    });
    if (matchedWallet) {
      router.push(`/wallet/${matchedWallet.wallet}`);
      return;
    }

    const matchedToken = (data?.topMints || []).find((m) => {
      const label = `${m.mint} ${m.token?.symbol || ""} ${m.token?.name || ""}`.toLowerCase();
      return label.includes(qLower);
    });
    if (matchedToken) {
      router.push(`/intel?mint=${matchedToken.mint}`);
      return;
    }

    if (looksLikeWallet && !looksLikeMint) {
      router.push(`/wallet/${q}`);
      return;
    }
    if (looksLikeMint || looksLikeWallet) {
      router.push(`/intel?mint=${q}`);
      return;
    }

    setWalletFilter(q);
    setMintFilter(q);
  };

  return (
    <main className="min-h-screen text-foreground bg-[radial-gradient(1200px_500px_at_10%_-10%,#14213d_0%,transparent_60%),radial-gradient(900px_400px_at_90%_10%,#1f2937_0%,transparent_55%),#05070b]">
      <div className="w-full px-3 py-8 md:px-6 md:py-12">
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
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={smartSearch}
              onChange={(e) => setSmartSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openSmartSearch();
              }}
              placeholder="Search token (mint/symbol) or wallet (address/name)"
              className="h-8 w-full max-w-xl rounded-lg border border-white/10 bg-black/40 px-3 text-xs text-white/90 placeholder:text-white/40 focus:outline-none focus:border-white/30"
            />
            <Button
              onClick={openSmartSearch}
              className="h-8 rounded-lg bg-emerald-400 text-black hover:opacity-90"
            >
              Open
            </Button>
            <Button
              onClick={forceRefresh}
              disabled={refreshing}
              variant="outline"
              className="h-8 rounded-lg border-white/20"
            >
              {refreshing ? 'Refreshing…' : 'Refresh now'}
            </Button>
          </div>
        </div>

        {data?.stats && (
          <div className="mb-5 grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Tracked wallets</div>
              <div className="text-lg font-semibold"><AnimatedNumber value={data.stats.totalWallets} decimals={0} format={(v) => `${Math.round(v)}`} /></div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Active (24h)</div>
              <div className="text-lg font-semibold"><AnimatedNumber value={data.stats.activeWallets} decimals={0} format={(v) => `${Math.round(v)}`} /></div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Shown in list</div>
              <div className="text-lg font-semibold"><AnimatedNumber value={wallets.length} decimals={0} format={(v) => `${Math.round(v)}`} /></div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Buys Seen</div>
              <div className="text-lg font-semibold"><AnimatedNumber value={data.stats.totalBuys} decimals={0} format={(v) => `${Math.round(v)}`} /></div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-white/45">Tracked Mints</div>
              <div className="text-lg font-semibold"><AnimatedNumber value={data.stats.totalTrackedMints} decimals={0} format={(v) => `${Math.round(v)}`} /></div>
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
              <p className="mt-1 text-xs text-white/50">
                Showing all tracked wallets. Ranked by 24h realized + unrealized SOL estimate (sampled, not lifetime ledger).
                {" "}Buys = buy transactions (24h), Unique tokens = distinct token mints bought.
              </p>
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
                          <div className="flex items-center gap-2">
                            <Link href={`/wallet/${wallet.wallet}`} className="font-mono text-sm text-cyan-200 hover:text-cyan-100">
                              {wallet.profile?.name || shortAddr(wallet.wallet, 7, 7)}
                            </Link>
                            {wallet.profile?.twitter && (
                              <a
                                href={wallet.profile.twitter}
                                target="_blank"
                                rel="noreferrer nofollow noopener"
                                className="text-[10px] text-white/55 hover:text-white/80"
                              >
                                X
                              </a>
                            )}
                            {wallet.profile?.telegram && (
                              <a
                                href={wallet.profile.telegram}
                                target="_blank"
                                rel="noreferrer nofollow noopener"
                                className="text-[10px] text-white/55 hover:text-white/80"
                              >
                                TG
                              </a>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-white/50">
                            {shortAddr(wallet.wallet, 7, 7)} • Buys (tx) {wallet.buyCount} • Unique tokens {wallet.uniqueMints} • Tx {wallet.txCount}
                            {" • "}Price coverage {formatCoveragePct(wallet.priceCoveragePct)}
                            {wallet.buyCount === 0 ? <span className="ml-2 text-white/40">• Inactive (24h)</span> : null}
                          </div>
                        </div>
                        <AnimatedSol
                          value={wallet.totalPnlSol ?? wallet.sampledPnlSol}
                          className={`text-sm font-semibold ${(wallet.totalPnlSol ?? wallet.sampledPnlSol) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                        />
                      </div>
                    </button>

                    {isOpen && details && (
                      <div className="px-4 pb-4">
                        <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                          <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] text-white/70">
                            <div>Realized: <AnimatedSol value={wallet.realizedPnlSol || 0} className={(wallet.realizedPnlSol || 0) >= 0 ? "text-emerald-300" : "text-red-300"} /></div>
                            <div>Unrealized: <AnimatedSol value={wallet.unrealizedPnlSol || 0} className={(wallet.unrealizedPnlSol || 0) >= 0 ? "text-emerald-300" : "text-red-300"} /></div>
                            <div>Win rate: <span className="text-white/85">{formatWinRatePct(wallet.winRate)}</span></div>
                            <div>Closed trades: <span className="text-white/85">{wallet.closedTrades || 0}</span></div>
                            <div>Price coverage: <span className="text-white/85">{formatCoveragePct(wallet.priceCoveragePct)}</span></div>
                            <div className="text-white/50">Open-position cost basis with live prices</div>
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
                                <span className="font-mono min-w-0">
                                  <span className="mr-1 text-white/85">
                                    {tokenMetaByMint.get(buy.mint)?.symbol || tokenMetaByMint.get(buy.mint)?.name || "Token"}
                                  </span>
                                  <Link href={`/intel?mint=${buy.mint}`} className="text-cyan-300 hover:text-cyan-200">
                                    {shortAddr(buy.mint, 6, 6)}
                                  </Link>
                                  {buy.source === 'holding' ? <span className="text-white/40"> (holding)</span> : null}
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
                      className="block w-full px-3 py-2 text-left transition-colors hover:bg-white/5"
                    >
                      <div className="grid grid-cols-[20px_1fr_auto] gap-2 items-center">
                        <div className="text-[10px] text-white/40">#{index + 1}</div>
                        <div className="min-w-0">
                          <div className="truncate text-sm">
                            <span className="font-semibold text-white/95">{token.token.symbol || shortAddr(token.mint, 4, 4)}</span>
                            <span className="ml-1 text-white/45">{token.token.name || shortAddr(token.mint, 6, 6)}</span>
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-white/55">
                            <AnimatedNumber value={token.walletCount} decimals={0} format={(v) => `${Math.round(v)}w`} /> • <AnimatedNumber value={token.buyCount} decimals={0} format={(v) => `${Math.round(v)}b`} /> • MCap <AnimatedUsd value={token.token.marketCapUsd} /> • Vol <AnimatedUsd value={token.token.volume24h} /> • Liq <AnimatedUsd value={token.token.liquidityUsd} />
                          </div>
                        </div>
                        <div className={`text-sm font-semibold ${changeTone}`}>{formatPct(token.token.change24h)}</div>
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
