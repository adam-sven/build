"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type WalletProfile = {
  ok: boolean;
  wallet: string;
  updatedAt: string;
  summary: {
    sampledPnlSol: number;
    txCount: number;
    buyCount: number;
    uniqueMints: number;
    lastSeen: number | null;
  };
  tokens: Array<{
    mint: string;
    buyCount: number;
    amountTotal: number;
    sampledSolFlow: number;
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

function formatTime(sec: number | null) {
  if (!sec) return "-";
  return new Date(sec * 1000).toLocaleString();
}

export default function WalletProfileClient({ wallet }: { wallet: string }) {
  const [data, setData] = useState<WalletProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/smart-wallets/wallet/${wallet}`);
        const json = await res.json();
        if (!ignore && json?.ok) setData(json);
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => {
      ignore = true;
    };
  }, [wallet]);

  const topTokens = useMemo(() => (data?.tokens || []).slice(0, 25), [data]);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/smart" className="text-xs text-cyan-300 hover:text-cyan-200">← Back to Smart Wallets</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Wallet Profile</h1>
          <div className="mt-1 font-mono text-sm text-white/70">{short(wallet, 10, 10)}</div>
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

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat title="Sampled PnL" value={`${data.summary.sampledPnlSol > 0 ? "+" : ""}${data.summary.sampledPnlSol.toFixed(2)} SOL`} tone={data.summary.sampledPnlSol >= 0 ? "good" : "bad"} />
            <Stat title="Buys" value={String(data.summary.buyCount)} />
            <Stat title="Unique tokens" value={String(data.summary.uniqueMints)} />
            <Stat title="Transactions" value={String(data.summary.txCount)} />
            <Stat title="Last seen" value={formatTime(data.summary.lastSeen)} />
          </div>

          <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <h2 className="text-base font-semibold">Bought Tokens (sampled)</h2>
            <p className="mt-1 text-xs text-white/55">Hold time is sampled age from first observed buy in this dataset.</p>
            <div className="mt-3 space-y-2">
              {topTokens.map((item) => (
                <div key={item.mint} className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-black/25 p-3 md:grid-cols-[1.3fr_1fr_1fr_1fr_auto] md:items-center">
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
                    <div>Buys: {item.buyCount}</div>
                    <div>Amount: {item.amountTotal.toFixed(2)}</div>
                  </div>
                  <div className="text-xs text-white/70">
                    <div>Price: {usd(item.token.priceUsd)}</div>
                    <div>24h: <span className={item.token.change24h !== null && item.token.change24h >= 0 ? "text-emerald-300" : "text-red-300"}>{pct(item.token.change24h)}</span></div>
                  </div>
                  <div className="text-xs text-white/70">
                    <div>Liq: {usd(item.token.liquidityUsd)}</div>
                    <div>Hold age: {formatDuration(item.sampledHoldSeconds)}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" className="h-8 bg-emerald-400 text-black hover:bg-emerald-300">
                      <Link href={`/intel?mint=${item.mint}`}>Intel</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-8 border-white/20">
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
