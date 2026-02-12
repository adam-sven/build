"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AnimatedUsd from "@/components/trencher/animated-usd";
import AnimatedSol from "@/components/trencher/animated-sol";
import AnimatedNumber from "@/components/trencher/animated-number";
import type { DiscoverResponse, TokenResponse } from "@/lib/trencher/types";
import { readSessionJson, writeSessionJson } from "@/lib/client-cache";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DASHBOARD_POLL_MS = Math.max(20_000, Number(process.env.NEXT_PUBLIC_DASHBOARD_POLL_MS || "45000"));

type SmartWalletSnapshot = {
  ok: boolean;
  timestamp: string;
  stats?: {
    totalWallets: number;
    activeWallets: number;
    totalBuys: number;
    totalTrackedMints: number;
  };
  topWallets: Array<{
    wallet: string;
    buyCount: number;
    sampledPnlSol: number;
    uniqueMints: number;
    totalPnlSol?: number;
    profile?: {
      rank: number | null;
      name: string | null;
      accountUrl: string | null;
      twitter: string | null;
      telegram: string | null;
      website: string | null;
    } | null;
  }>;
  topMints: Array<{
    mint: string;
    walletCount: number;
    buyCount: number;
    token: {
      name: string | null;
      symbol: string | null;
      image: string | null;
      change24h: number | null;
      volume24h: number | null;
      liquidityUsd: number | null;
    };
  }>;
};

type PumpfunTrendingResponse = {
  ok: boolean;
  generatedAt?: string;
  items: Array<{
    mint: string;
    name: string | null;
    symbol: string | null;
    image: string | null;
    priceUsd: number | null;
    marketCapUsd: number | null;
    volume24hUsd: number | null;
    liquidityUsd: number | null;
    change24h: number | null;
    pairUrl: string | null;
    bonded: boolean;
  }>;
};

type SourceFilter = "all" | "pumpfun" | "bagsapp" | "other";
const SOURCE_META: Record<Exclude<SourceFilter, "all">, { label: string; icon: string }> = {
  pumpfun: { label: "Pumpfun", icon: "/source-pumpfun-v2.png" },
  bagsapp: { label: "BagsApp", icon: "/source-bagsapp.svg" },
  other: { label: "Solana", icon: "/source-solana.svg" },
};

function short(v: string, left = 6, right = 6) {
  return `${v.slice(0, left)}...${v.slice(-right)}`;
}

function usd(v: number | null) {
  if (v === null) return "-";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}m`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

function pct(v: number | null) {
  if (v === null) return "-";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtPct(v: number) {
  if (!Number.isFinite(v)) return "-";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function normalizeTsSeconds(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return t > 10_000_000_000 ? Math.floor(t / 1000) : Math.floor(t);
}

function SourceIcon({ source }: { source: "pumpfun" | "bagsapp" | "other" }) {
  const meta = SOURCE_META[source];
  return (
    <span className="h-5 w-5 shrink-0 overflow-hidden rounded-md bg-black/40">
      <img src={meta.icon} alt={meta.label} className="h-full w-full object-cover" />
    </span>
  );
}

export default function DashboardClient() {
  const [discover, setDiscover] = useState<DiscoverResponse | null>(null);
  const [smart, setSmart] = useState<SmartWalletSnapshot | null>(null);
  const [pump, setPump] = useState<PumpfunTrendingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [mintInput, setMintInput] = useState("");
  const [intel, setIntel] = useState<TokenResponse | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionKey = "trencher:dashboard:v1";
  const smartLocalKey = "trencher:smart:snapshot:persist:v1";

  const snapshotRows = (s: SmartWalletSnapshot | null | undefined) =>
    (s?.topWallets?.length || 0) + (s?.topMints?.length || 0);
  const hasSmartRows = (s: SmartWalletSnapshot | null | undefined) => snapshotRows(s) > 0;

  async function fetchJsonWithTimeout(url: string, timeoutMs = 12_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const loadDashboard = async (silent = false) => {
    const cached = readSessionJson<{ discover: DiscoverResponse | null; smart: SmartWalletSnapshot | null; pump: PumpfunTrendingResponse | null }>(sessionKey);
    let smartPersisted: SmartWalletSnapshot | null = null;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(smartLocalKey);
        if (raw) {
          const parsed = JSON.parse(raw) as SmartWalletSnapshot;
          smartPersisted = parsed?.ok ? parsed : null;
        }
      } catch {
        // ignore parse errors
      }
    }
    if (!silent && !cached?.discover && !cached?.smart && !cached?.pump) setLoading(true);
    if (!silent && (cached || smartPersisted)) {
      if (cached?.discover?.ok) setDiscover(cached.discover);
      if (cached?.smart?.ok) setSmart(cached.smart);
      else if (smartPersisted?.ok) setSmart(smartPersisted);
      if (cached?.pump?.ok) setPump(cached.pump);
    }
    try {
      const [discoverRes, smartRes, pumpRes] = await Promise.allSettled([
        fetchJsonWithTimeout("/api/ui/discover?chain=solana&mode=trending", silent ? 8_000 : 20_000),
        fetchJsonWithTimeout("/api/smart-wallets", silent ? 8_000 : 20_000),
        fetchJsonWithTimeout("/api/ui/pumpfun/trending", silent ? 8_000 : 20_000),
      ]);
      const discoverJson = discoverRes.status === "fulfilled" ? discoverRes.value : null;
      const smartJson = smartRes.status === "fulfilled" ? smartRes.value : null;
      const pumpJson = pumpRes.status === "fulfilled" ? pumpRes.value : null;

      const nextDiscover = discoverJson?.ok ? discoverJson : cached?.discover || null;
      let nextSmart = smartJson?.ok ? smartJson : cached?.smart || smartPersisted || null;
      const nextPump = pumpJson?.ok ? pumpJson : cached?.pump || null;

      const prevSmart = (cached?.smart?.ok ? cached.smart : smart) || null;
      const prevRows = snapshotRows(prevSmart);
      const nextRows = snapshotRows(nextSmart);
      const severeDrop =
        prevRows >= 20 &&
        nextRows > 0 &&
        nextRows < Math.max(8, Math.floor(prevRows * 0.45));
      const hardEmptyDrop = hasSmartRows(prevSmart) && !hasSmartRows(nextSmart);
      if (hardEmptyDrop || severeDrop) {
        nextSmart = prevSmart;
      }

      // If Smart snapshot comes back empty, keep previous shared snapshot or force one rebuild.
      if (!hasSmartRows(nextSmart)) {
        if (hasSmartRows(prevSmart)) {
          nextSmart = prevSmart;
        } else {
          try {
            const forced = await fetchJsonWithTimeout("/api/smart-wallets?force=1", silent ? 10_000 : 20_000);
            if (forced?.ok && hasSmartRows(forced)) {
              nextSmart = forced;
            }
          } catch {
            // keep existing fallback
          }
        }
      }

      if (nextDiscover?.ok) setDiscover(nextDiscover);
      if (nextSmart?.ok) setSmart(nextSmart);
      if (nextPump?.ok) setPump(nextPump);

      if (discoverJson?.ok || smartJson?.ok || pumpJson?.ok) {
        setError(null);
      } else if (!silent) {
        setError("Dashboard data timeout. Retry in a few seconds.");
      }

      writeSessionJson(sessionKey, { discover: nextDiscover, smart: nextSmart, pump: nextPump });
      if (nextSmart?.ok && typeof window !== "undefined") {
        try {
          window.localStorage.setItem(smartLocalKey, JSON.stringify(nextSmart));
        } catch {
          // ignore local storage errors
        }
      }
    } catch {
      if (!silent) setError("Failed to load dashboard data.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadIntel = async (mint: string) => {
    if (!mint) return;
    setIntelLoading(true);
    try {
      const res = await fetch(`/api/ui/token?chain=solana&mint=${mint}&interval=1h`);
      const json = await res.json();
      if (json?.ok) setIntel(json);
    } finally {
      setIntelLoading(false);
    }
  };

  useEffect(() => {
    const cached = readSessionJson<{ discover: DiscoverResponse | null; smart: SmartWalletSnapshot | null; pump: PumpfunTrendingResponse | null }>(sessionKey);
    if (cached?.discover?.ok) setDiscover(cached.discover);
    if (cached?.smart?.ok) setSmart(cached.smart);
    else {
      try {
        const raw = window.localStorage.getItem(smartLocalKey);
        if (raw) {
          const parsed = JSON.parse(raw) as SmartWalletSnapshot;
          if (parsed?.ok) setSmart(parsed);
        }
      } catch {
        // ignore
      }
    }
    if (cached?.pump?.ok) setPump(cached.pump);
    loadDashboard();
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      loadDashboard(true);
    }, DASHBOARD_POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const topTokens = useMemo(() => (discover?.items || []).slice(0, 5), [discover]);
  const topWallets = useMemo(
    () =>
      (smart?.topWallets || [])
        .filter((w) => w.buyCount > 0)
        .filter((w) => Boolean(w.profile?.name || w.profile?.twitter || w.profile?.telegram || w.profile?.website))
        .slice(0, 5),
    [smart],
  );
  const pumpTokens = useMemo(() => (pump?.items || []).slice(0, 5), [pump]);

  const miniChart = useMemo(() => {
    if (!intel) return [];
    return (intel.candles.items || [])
      .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.c))
      .map((c) => ({
        t: normalizeTsSeconds(c.t),
        label: new Date(normalizeTsSeconds(c.t) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        close: Number(c.c),
      }));
  }, [intel]);

  return (
    <main className="w-full px-3 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-white/60">Market overview + smart wallets + quick Intel in one screen.</p>
        </div>
        <Button onClick={() => loadDashboard()} variant="outline" className="border-white/20 text-white/80">
          Refresh Data
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric title="Trending tokens" valueNode={<AnimatedNumber value={discover?.items?.length || 0} decimals={0} format={(v) => `${Math.round(v)}`} />} />
        <Metric title="Smart wallets" valueNode={<AnimatedNumber value={smart?.stats?.totalWallets || smart?.topWallets?.length || 0} decimals={0} format={(v) => `${Math.round(v)}`} />} />
        <Metric title="Tracked mints" valueNode={<AnimatedNumber value={smart?.topMints?.length || 0} decimals={0} format={(v) => `${Math.round(v)}`} />} />
        <Metric title="Updated" value={smart?.timestamp ? new Date(smart.timestamp).toLocaleTimeString() : "-"} />
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="xl:col-span-5 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Top 5 Tokens</h2>
            <Link href="/discover" className="text-xs text-emerald-300 hover:text-emerald-200">Open Discover</Link>
          </div>
          <div className="space-y-2">
            {topTokens.map((item, idx) => (
              <Link
                key={item.mint}
                href={`/intel?mint=${item.mint}`}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 p-2 hover:border-emerald-300/30"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <TokenAvatar image={item.image} symbol={item.symbol} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium inline-flex items-center gap-1.5">
                      <span>#{idx + 1} {item.name || "Unknown"}</span>
                      <SourceIcon source={item.source} />
                    </div>
                    <div className="truncate text-xs text-white/55">{short(item.mint)}</div>
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className={item.priceChange.h24 && item.priceChange.h24 > 0 ? "text-emerald-300" : "text-red-300"}>
                    <AnimatedNumber value={item.priceChange.h24} format={fmtPct} />
                  </div>
                  <div className="text-white/55">MC <AnimatedUsd value={item.marketCapUsd} /></div>
                  <div className="text-white/45">Vol <AnimatedUsd value={item.volume24hUsd} /></div>
                </div>
              </Link>
            ))}
            {!loading && topTokens.length === 0 && <p className="text-sm text-white/60">No token data yet.</p>}
            {loading && <p className="text-sm text-white/60">Loading token rankings...</p>}
          </div>
        </section>

        <section className="xl:col-span-4 rounded-2xl border border-white/10 bg-black/30 p-4 flex h-full flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Top 5 Traders</h2>
            <Link href="/smart" className="text-xs text-cyan-300 hover:text-cyan-200">Open Smart Wallets</Link>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            {topWallets.map((wallet, idx) => (
              <Link
                key={wallet.wallet}
                href={`/wallet/${wallet.wallet}`}
                className="flex min-h-[60px] flex-1 items-center justify-between rounded-lg border border-white/10 bg-black/25 p-2 hover:border-cyan-300/30"
              >
                <div>
                  <div className="text-sm font-medium">#{idx + 1} {wallet.profile?.name || short(wallet.wallet)}</div>
                  <div className="text-xs text-white/55">Buys {wallet.buyCount} • Mints {wallet.uniqueMints}</div>
                </div>
                <AnimatedSol
                  value={wallet.totalPnlSol ?? wallet.sampledPnlSol}
                  className={(wallet.totalPnlSol ?? wallet.sampledPnlSol) >= 0 ? "text-sm text-emerald-300" : "text-sm text-red-300"}
                />
              </Link>
            ))}
            {!loading && topWallets.length === 0 && <p className="text-sm text-white/60">No trader data yet.</p>}
            {loading && <p className="text-sm text-white/60">Loading trader activity...</p>}
          </div>
        </section>

        <section className="xl:col-span-3 rounded-2xl border border-white/10 bg-black/30 p-4">
          <h2 className="font-semibold">Quick Intel</h2>
          <p className="mt-1 text-xs text-white/55">Paste mint to preview chart + key stats. Full details on Intel page.</p>

          <div className="mt-3 flex gap-2">
            <Input
              value={mintInput}
              onChange={(e) => setMintInput(e.target.value.trim())}
              placeholder="Enter mint"
              className="border-white/10 bg-black/40"
            />
            <Button
              onClick={() => loadIntel(mintInput)}
              className="bg-emerald-400 text-black hover:bg-emerald-300"
              disabled={!mintInput || intelLoading}
            >
              {intelLoading ? "..." : "Load"}
            </Button>
          </div>

          {intel && (
            <div className="mt-3 space-y-3">
              <div>
                <div className="text-sm font-medium">{intel.identity.name || "Unknown"} {intel.identity.symbol ? `(${intel.identity.symbol})` : ""}</div>
                <div className="text-xs text-white/55">{short(intel.mint)}</div>
              </div>
              <div className="h-32 rounded-lg border border-white/10 bg-black/25 p-2">
                {miniChart.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={miniChart} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#122631" strokeDasharray="3 3" />
                      <XAxis dataKey="label" hide />
                      <YAxis hide domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{
                          background: "#06080d",
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: "8px",
                        }}
                        formatter={(value: number) => [`$${Number(value).toFixed(8)}`, "Close"]}
                      />
                      <Line type="monotone" dataKey="close" stroke="#34d399" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="grid h-full place-items-center text-xs text-white/55">No native chart data yet.</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <MiniStat label="Price" value={usd(intel.market.priceUsd)} />
                <MiniStat label="Liquidity" value={usd(intel.market.liquidityUsd)} />
                <MiniStat label="Volume 24h" value={usd(intel.market.volume24hUsd)} />
                <MiniStat label="Holders" value={intel.holders.holderCount === null ? "-" : String(intel.holders.holderCount)} />
              </div>
              <Link href={`/intel?mint=${intel.mint}`} className="block text-center text-xs text-emerald-300 hover:text-emerald-200">
                Open full Intel page
              </Link>
            </div>
          )}
        </section>

        <section className="xl:col-span-12 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Pump.fun Trending</h2>
            <div className="text-xs text-white/55">Profiles + market data (bonded if pair exists)</div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
            {pumpTokens.map((item, idx) => (
              <Link
                key={item.mint}
                href={`/intel?mint=${item.mint}`}
                className="rounded-lg border border-white/10 bg-black/25 p-2 hover:border-emerald-300/35"
              >
                <div className="flex items-center gap-2">
                  <TokenAvatar image={item.image} symbol={item.symbol} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">#{idx + 1} {item.symbol || short(item.mint, 4, 4)}</div>
                    <div className="truncate text-xs text-white/55">{item.name || short(item.mint)}</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-white/70">
                  <div>MC <AnimatedUsd value={item.marketCapUsd} /></div>
                  <div>Vol <AnimatedUsd value={item.volume24hUsd} /></div>
                </div>
                <div className="mt-1 text-xs">
                  <span className={item.change24h !== null && item.change24h >= 0 ? "text-emerald-300" : "text-red-300"}>
                    <AnimatedNumber value={item.change24h} format={fmtPct} />
                  </span>
                  <span className="ml-2 text-white/50">{item.bonded ? "Bonded" : "Pre-bonded"}</span>
                </div>
              </Link>
            ))}
            {!loading && pumpTokens.length === 0 && <p className="text-sm text-white/60">No Pump.fun profiles available right now.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ title, value, valueNode }: { title: string; value?: string; valueNode?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-white/50">{title}</div>
      <div className="mt-1 text-lg font-semibold">{valueNode ?? value ?? "-"}</div>
    </div>
  );
}

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
        className="h-8 w-8 rounded-full border border-white/15 object-cover"
        onError={() => setSrc("/placeholder-logo.svg")}
      />
    );
  }
  return <img src="/placeholder-logo.svg" alt={symbol || "token"} className="h-8 w-8 rounded-full border border-white/15 object-cover" />;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 p-2">
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="mt-1 text-xs font-semibold">{value}</div>
    </div>
  );
}
