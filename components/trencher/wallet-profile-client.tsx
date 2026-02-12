"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import AnimatedUsd from "@/components/trencher/animated-usd";

type WalletProfile = {
  ok: boolean;
  wallet: string;
  profile: {
    rank: number | null;
    name: string | null;
    accountUrl: string | null;
    twitter: string | null;
    telegram: string | null;
    website: string | null;
  } | null;
  updatedAt: string;
  summary: {
    solBalance: number | null;
    sampledPnlSol: number;
    realizedPnlSol: number;
    unrealizedPnlSol: number;
    totalPnlSol: number;
    winRate: number | null;
    closedTrades: number;
    winningTrades: number;
    costBasisSol: number;
    currentValueSol: number;
    txCount: number;
    buyCount: number;
    uniqueMints: number;
    lastSeen: number | null;
  };
  tokens: Array<{
    mint: string;
    buyCount: number;
    sellCount: number;
    qty: number;
    amountTotal: number;
    sampledSolFlow: number;
    realizedPnlSol: number;
    unrealizedPnlSol: number;
    totalPnlSol: number;
    avgCostSol: number;
    currentValueSol: number;
    firstSeen: number | null;
    lastSeen: number | null;
    sampledHoldSeconds: number | null;
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
  }>;
  recentBuys: Array<{
    mint: string;
    amount: number;
    blockTime: number | null;
    source: "tx" | "holding";
    token: {
      name: string | null;
      symbol: string | null;
      image: string | null;
    } | null;
  }>;
};

function short(value: string, left = 7, right = 7) {
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function usd(v: number | null) {
  if (v === null) return "-";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}m`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  if (v < 0.01) return `$${v.toFixed(6)}`;
  return `$${v.toFixed(2)}`;
}

function pct(v: number | null) {
  if (v === null) return "-";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return "-";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatWinRate(v: number | null | undefined) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "-";
  return `${(v * 100).toFixed(0)}%`;
}

function sol(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)} SOL`;
}

function solAmount(v: number | null) {
  if (v === null) return "-";
  return `${v.toFixed(3)} SOL`;
}

function formatTime(sec: number | null) {
  if (!sec) return "-";
  return new Date(sec * 1000).toLocaleString();
}

export default function WalletProfileClient({ wallet }: { wallet: string }) {
  const router = useRouter();
  const [data, setData] = useState<WalletProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionKey = useMemo(() => `iamtrader:wallet:${wallet}:v1`, [wallet]);

  const hasGoodTokenRows = (snapshot: WalletProfile | null) => {
    if (!snapshot?.ok || !Array.isArray(snapshot.tokens) || snapshot.tokens.length === 0) return false;
    return snapshot.tokens.some((t) => {
      const hasQty = Number(t.qty || 0) > 0.000001;
      const hasPnl =
        Math.abs(Number(t.totalPnlSol || 0)) > 0.000001 ||
        Math.abs(Number(t.realizedPnlSol || 0)) > 0.000001 ||
        Math.abs(Number(t.unrealizedPnlSol || 0)) > 0.000001;
      const hasMeta = Number.isFinite(Number(t.token?.priceUsd)) || Number.isFinite(Number(t.token?.marketCapUsd));
      return hasQty || hasPnl || hasMeta;
    });
  };

  useEffect(() => {
    let ignore = false;
    let cachedOk = false;
    try {
      const cached = window.sessionStorage.getItem(sessionKey);
      if (cached) {
        const parsed = JSON.parse(cached) as WalletProfile;
        if (parsed?.ok) {
          setData(parsed);
          cachedOk = true;
        }
      }
    } catch {
      // ignore
    }

    const load = async () => {
      if (!cachedOk) setLoading(true);
      setError(null);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const res = await fetch(`/api/smart-wallets/wallet/${wallet}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`wallet_profile_http_${res.status}`);
        const json = await res.json();
        if (!ignore && json?.ok) {
          setData((prev) => {
            const keepPrev = hasGoodTokenRows(prev) && !hasGoodTokenRows(json);
            const next = keepPrev ? prev : json;
            try {
              if (next?.ok) window.sessionStorage.setItem(sessionKey, JSON.stringify(next));
            } catch {
              // ignore
            }
            return next;
          });
        } else if (!ignore) {
          setError("wallet_profile_failed");
        }
      } catch {
        if (!ignore) setError("wallet_profile_timeout");
      } finally {
        clearTimeout(timeout);
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [wallet, sessionKey]);

  const topTokens = useMemo(() => (data?.tokens || []).slice(0, 25), [data]);

  return (
    <main className="w-full px-3 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/smart" className="text-xs text-cyan-300 hover:text-cyan-200">← Back to Smart Wallets</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Wallet Profile</h1>
          <div className="mt-1 text-sm text-white/90">{data?.profile?.name || short(wallet, 10, 10)}</div>
          <div className="mt-1 font-mono text-xs text-white/60">{short(wallet, 10, 10)}</div>
          {(data?.profile?.twitter || data?.profile?.telegram || data?.profile?.accountUrl || data?.profile?.website) && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {data?.profile?.twitter && (
                <a href={data.profile.twitter} target="_blank" rel="noreferrer nofollow noopener" className="rounded border border-white/15 px-2 py-1 text-white/70 hover:text-white">X</a>
              )}
              {data?.profile?.telegram && (
                <a href={data.profile.telegram} target="_blank" rel="noreferrer nofollow noopener" className="rounded border border-white/15 px-2 py-1 text-white/70 hover:text-white">Telegram</a>
              )}
              {data?.profile?.website && (
                <a href={data.profile.website} target="_blank" rel="noreferrer nofollow noopener" className="rounded border border-white/15 px-2 py-1 text-white/70 hover:text-white">Website</a>
              )}
              {data?.profile?.accountUrl && (
                <a href={data.profile.accountUrl} target="_blank" rel="noreferrer nofollow noopener" className="rounded border border-white/15 px-2 py-1 text-white/70 hover:text-white">KOL</a>
              )}
            </div>
          )}
        </div>
        <a
          href={`https://solscan.io/account/${wallet}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white/75 hover:text-white"
        >
          View on Solscan
        </a>
      </div>

      {loading && <p className="text-sm text-white/60">Loading wallet profile...</p>}
      {!loading && error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          Wallet profile request timed out. Try refresh.
        </div>
      )}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat title="Total PnL" value={sol(data.summary.totalPnlSol)} tone={data.summary.totalPnlSol >= 0 ? "good" : "bad"} />
            <Stat title="Realized" value={sol(data.summary.realizedPnlSol)} tone={data.summary.realizedPnlSol >= 0 ? "good" : "bad"} />
            <Stat title="Unrealized" value={sol(data.summary.unrealizedPnlSol)} tone={data.summary.unrealizedPnlSol >= 0 ? "good" : "bad"} />
            <Stat title="Buys" value={String(data.summary.buyCount)} />
            <Stat title="Win Rate" value={formatWinRate(data.summary.winRate)} />
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat title="SOL Balance" value={solAmount(data.summary.solBalance)} />
            <Stat title="Unique tokens" value={String(data.summary.uniqueMints)} />
            <Stat title="Transactions" value={String(data.summary.txCount)} />
            <Stat title="Closed trades" value={String(data.summary.closedTrades)} />
            <Stat title="Last seen" value={formatTime(data.summary.lastSeen)} />
          </div>

          <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-base font-semibold">Token Positions</h2>
            <p className="mt-1 text-xs text-white/55">PnL = realized + unrealized (SOL estimate from live USD token prices).</p>
            <div className="mt-3 space-y-2">
              {topTokens.map((item) => (
                <div
                  key={item.mint}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open Intel for ${item.token.symbol || item.token.name || item.mint}`}
                  className="grid cursor-pointer grid-cols-1 gap-3 rounded-xl border border-white/10 bg-black/25 p-3 transition-colors hover:border-emerald-300/40 hover:bg-black/35 md:grid-cols-[1.3fr_1fr_1fr_1fr_auto] md:items-center"
                  onClick={() => router.push(`/intel?mint=${item.mint}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/intel?mint=${item.mint}`);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    {item.token.image ? (
                      <img src={item.token.image} alt={item.token.symbol || "token"} className="h-8 w-8 rounded-full border border-white/15 object-cover" />
                    ) : (
                      <div className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/5 text-[10px]">{(item.token.symbol || "T").slice(0, 1)}</div>
                    )}
                    <div>
                      <div className="text-sm font-medium">{item.token.name || item.token.symbol || short(item.mint, 5, 5)}</div>
                      <div className="text-xs text-white/55">{short(item.mint, 8, 8)}</div>
                    </div>
                  </div>
                  <div className="text-xs text-white/70">
                    <div>Buys/Sells: {item.buyCount}/{item.sellCount}</div>
                    <div>Qty: {item.qty.toFixed(2)}</div>
                  </div>
                  <div className="text-xs text-white/70">
                    <div>Price: {usd(item.token.priceUsd)}</div>
                    <div>MC: <AnimatedUsd value={item.token.marketCapUsd} /></div>
                    <div>PnL: <span className={item.totalPnlSol >= 0 ? "text-emerald-300" : "text-red-300"}>{sol(item.totalPnlSol)}</span></div>
                  </div>
                  <div className="text-xs text-white/70">
                    <div>Real/Unreal: {sol(item.realizedPnlSol)} / {sol(item.unrealizedPnlSol)}</div>
                    <div>Hold age: {formatDuration(item.sampledHoldSeconds)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      asChild
                      size="sm"
                      className="h-8 bg-emerald-400 text-black hover:bg-emerald-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Link href={`/intel?mint=${item.mint}`}>Intel</Link>
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-8 border-white/20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <a href={item.token.pairUrl || `https://dexscreener.com/solana/${item.mint}`} target="_blank" rel="noreferrer">Buy</a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-base font-semibold">Recent Buys</h2>
            <div className="mt-3 space-y-1">
              {data.recentBuys.map((buy, idx) => (
                <div key={`${buy.mint}-${idx}`} className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-lg border border-white/5 px-2 py-1 text-xs text-white/70">
                  <div>{buy.token?.symbol || short(buy.mint, 5, 5)} <span className="text-white/45">{buy.source === "holding" ? "(holding)" : ""}</span></div>
                  <div>{buy.amount.toFixed(2)}</div>
                  <div className="text-white/45">{formatTime(buy.blockTime)}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ title, value, tone = "neutral" }: { title: string; value: string; tone?: "neutral" | "good" | "bad" }) {
  const cls = tone === "good" ? "text-emerald-300" : tone === "bad" ? "text-red-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-white/50">{title}</div>
      <div className={`mt-1 text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
