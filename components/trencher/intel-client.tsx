"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AnimatedUsd from "@/components/trencher/animated-usd";
import AnimatedNumber from "@/components/trencher/animated-number";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import VoteModal from "@/components/trencher/vote-modal";
import type { Interval, TokenResponse } from "@/lib/trencher/types";
import { readSessionJson, writeSessionJson } from "@/lib/client-cache";
import { Globe, Twitter } from "lucide-react";
import NativeCandleChart from "@/components/trencher/native-candle-chart";

const MIN_NATIVE_CANDLES = Math.max(8, Number(process.env.NEXT_PUBLIC_INTEL_NATIVE_MIN_CANDLES || "24"));

function fmtUsd(v: number | null) {
  if (v === null) return "-";
  if (v > 1_000_000) return `$${(v / 1_000_000).toFixed(2)}m`;
  if (v > 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(4)}`;
}

function fmtNum(v: number | null) {
  if (v === null || Number.isNaN(v)) return "-";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}m`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function fmtPct(v: number | null) {
  if (v === null || Number.isNaN(v)) return "-";
  return `${v.toFixed(2)}%`;
}

function short(v: string) {
  return `${v.slice(0, 6)}...${v.slice(-6)}`;
}

function gmgnInterval(interval: Interval): string {
  if (interval === "1m") return "1";
  if (interval === "5m") return "5";
  if (interval === "1h") return "60";
  if (interval === "24h") return "240";
  return "1D";
}

function normalizeTsSeconds(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return t > 10_000_000_000 ? Math.floor(t / 1000) : Math.floor(t);
}

type TraderLink = { label: string; url: string };

function buildTraderLinks(mint: string, pairUrl: string | null): TraderLink[] {
  const links: TraderLink[] = [
    { label: "GMGN", url: `https://gmgn.ai/sol/token/${mint}?ref=l6KmuuAJ` },
    { label: "Padre", url: "https://trade.padre.gg/rk/trencherdex" },
    { label: "FOMO", url: `https://fomo.family/r/Adam_Sven_` },
    { label: "Axiom", url: "https://axiom.trade/@kingsven" },
    { label: "Photon", url: `https://photon-sol.tinyastro.io/en/lp/${mint}` },
    { label: "BullX", url: `https://neo.bullx.io/terminal?chainId=1399811149&address=${mint}` },
  ];
  if (pairUrl) links.push({ label: "Dexscreener", url: pairUrl });
  return links;
}

export default function IntelClient({ initialMint }: { initialMint: string }) {
  const router = useRouter();
  const [mint, setMint] = useState(initialMint || "");
  const [interval, setChartInterval] = useState<Interval>("1m");
  const [data, setData] = useState<TokenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [voteDirection, setVoteDirection] = useState<"up" | "down" | null>(null);
  const [showVoters, setShowVoters] = useState(false);
  const [recentVoters, setRecentVoters] = useState<string[]>([]);
  const [chartSource, setChartSource] = useState<"native" | "gmgn">("native");
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [nativeSeries, setNativeSeries] = useState<
    Array<{ t: number; close: number; open: number; high: number; low: number; volume: number }>
  >([]);
  const nativeSeriesCacheRef = useRef(
    new Map<string, Array<{ t: number; close: number; open: number; high: number; low: number; volume: number }>>(),
  );
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);
  const mintRef = useRef(mint);
  const intervalRef = useRef(interval);
  const dataRef = useRef<TokenResponse | null>(null);
  const sampleMints = [
    "So11111111111111111111111111111111111111112",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6nnaV8ZxLxmNdkq",
  ];

  const mergeTokenData = (prev: TokenResponse | null, next: TokenResponse): TokenResponse => {
    if (!prev || prev.mint !== next.mint) return next;
    const market = {
      ...prev.market,
      ...next.market,
      priceUsd: next.market?.priceUsd ?? prev.market?.priceUsd ?? null,
      liquidityUsd: next.market?.liquidityUsd ?? prev.market?.liquidityUsd ?? null,
      volume24hUsd: next.market?.volume24hUsd ?? prev.market?.volume24hUsd ?? null,
      marketCapUsd: next.market?.marketCapUsd ?? prev.market?.marketCapUsd ?? null,
      fdvUsd: next.market?.fdvUsd ?? prev.market?.fdvUsd ?? null,
      dex: next.market?.dex || prev.market?.dex || null,
      pairUrl: next.market?.pairUrl || prev.market?.pairUrl || null,
      txCount24h: next.market?.txCount24h ?? prev.market?.txCount24h ?? null,
      priceChange: {
        m5: next.market?.priceChange?.m5 ?? prev.market?.priceChange?.m5 ?? null,
        h1: next.market?.priceChange?.h1 ?? prev.market?.priceChange?.h1 ?? null,
        h24: next.market?.priceChange?.h24 ?? prev.market?.priceChange?.h24 ?? null,
      },
    };
    return {
      ...prev,
      ...next,
      identity: {
        ...prev.identity,
        ...next.identity,
        name: next.identity?.name || prev.identity?.name || null,
        symbol: next.identity?.symbol || prev.identity?.symbol || null,
        image: next.identity?.image || prev.identity?.image || null,
      },
      market,
      holders: next.holders || prev.holders,
      signals: next.signals || prev.signals,
      votes: next.votes || prev.votes,
      search: next.search || prev.search,
      candles:
        Array.isArray(next.candles?.items) && next.candles.items.length > 0
          ? next.candles
          : prev.candles,
    };
  };

  const load = async (targetMint: string, targetInterval: Interval, silent = false) => {
    if (!targetMint) return;
    const requestSeq = ++requestSeqRef.current;
    const sessionKey = `trencher:intel:${targetMint}:${targetInterval}:v1`;
    const cached = readSessionJson<TokenResponse>(sessionKey);
    if (!silent && !dataRef.current && cached?.ok) {
      setData(cached);
    }
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    if (!silent) setChartSource("native");
    try {
      const liteRes = await fetch(`/api/ui/token?chain=solana&mint=${targetMint}&interval=${targetInterval}&includeHolders=0`);
      const lite = await liteRes.json();
      const stale =
        requestSeq !== requestSeqRef.current ||
        mintRef.current !== targetMint ||
        intervalRef.current !== targetInterval;
      if (!stale && lite?.ok) {
        setData((prev) => mergeTokenData(prev, lite));
        writeSessionJson(sessionKey, lite);
        router.replace(`/intel?mint=${targetMint}`);
      } else if (!silent && !dataRef.current) {
        setError(lite?.error?.message || "Failed to load token intel");
      }
      if (!silent) setLoading(false);

      // Upgrade holders/voters in the background without blocking first paint.
      void Promise.allSettled([
        (async () => {
          const fullRes = await fetch(`/api/ui/token?chain=solana&mint=${targetMint}&interval=${targetInterval}&includeHolders=1`);
          const full = await fullRes.json();
          const fullStale =
            requestSeq !== requestSeqRef.current ||
            mintRef.current !== targetMint ||
            intervalRef.current !== targetInterval;
          if (!fullStale && full?.ok) {
            setData((prev) => mergeTokenData(prev, full));
            writeSessionJson(sessionKey, full);
          }
        })(),
        (async () => {
          const votesRes = await fetch(`/api/ui/votes?chain=solana&mint=${targetMint}`);
          const votes = await votesRes.json();
          if (votes?.ok) setRecentVoters(votes.voters || []);
        })(),
      ]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    mintRef.current = mint;
  }, [mint]);

  useEffect(() => {
    intervalRef.current = interval;
  }, [interval]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (mint) {
      const cached = readSessionJson<TokenResponse>(`trencher:intel:${mint}:${interval}:v1`);
      if (cached?.ok) setData(cached);
      load(mint, interval);
    }
  }, [interval]);

  useEffect(() => {
    if (initialMint && initialMint !== mint) {
      setMint(initialMint);
      const cached = readSessionJson<TokenResponse>(`trencher:intel:${initialMint}:${interval}:v1`);
      if (cached?.ok) setData(cached);
      load(initialMint, interval);
    }
  }, [initialMint, mint, interval]);

  useEffect(() => {
    if (!mint) return;
    const timer = globalThis.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      load(mint, interval, true);
    }, 12_000);
    return () => clearInterval(timer);
  }, [mint, interval]);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => setIsLightTheme(root.classList.contains("trencher-light"));
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!data?.mint) return;
    const key = `${data.mint}:${interval}`;
    const chartItems = Array.isArray(data.candles.items) ? data.candles.items : [];
    const candidate = chartItems
      .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.c))
      .map((c) => ({
        t: normalizeTsSeconds(c.t),
        close: Number(c.c),
        open: Number(c.o),
        high: Number(c.h),
        low: Number(c.l),
        volume: Number(c.v),
      }))
      .sort((a, b) => a.t - b.t);

    const prev = nativeSeriesCacheRef.current.get(key) || [];
    // Only accept new native data if it is at least as complete as what we already have.
    if (candidate.length >= prev.length) {
      nativeSeriesCacheRef.current.set(key, candidate);
      setNativeSeries(candidate);
    } else {
      setNativeSeries(prev);
    }
  }, [data?.mint, data?.candles, interval]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Input
          value={mint}
          onChange={(e) => setMint(e.target.value.trim())}
          placeholder="Enter mint"
          className="max-w-xl border-white/10 bg-black/40"
        />
        <Button onClick={() => load(mint, interval)} className="bg-emerald-400 text-black hover:opacity-90">
          Load Intel
        </Button>
      </div>

      {loading && <div className="text-sm text-white/60">Loading...</div>}
      {!loading && error && <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

      {!loading && !data && (
        <section className="rounded-xl border border-white/10 bg-black/30 p-5">
          <h2 className="text-lg font-semibold">Token Intel Snapshot</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/65">
            Enter a Solana mint to load one structured snapshot: chart, market context, holders, signals, and vote state.
            This page is for filtering attention, not prediction.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-sm text-white/75">
              <p className="text-xs uppercase tracking-wide text-white/50">1. Input</p>
              <p className="mt-1">Paste mint contract address.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-sm text-white/75">
              <p className="text-xs uppercase tracking-wide text-white/50">2. Review</p>
              <p className="mt-1">Check chart, liquidity, volume, holder concentration.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-sm text-white/75">
              <p className="text-xs uppercase tracking-wide text-white/50">3. Decide</p>
              <p className="mt-1">Open Buy Now menu or copy CA to your preferred terminal.</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 p-3 text-sm text-white/75">
              <p className="text-xs uppercase tracking-wide text-white/50">4. Participate</p>
              <p className="mt-1">Vote up/down and share `/intel?mint=...` with others.</p>
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-white/50">Quick examples</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {sampleMints.map((sample) => (
                <button
                  key={sample}
                  type="button"
                  className="rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white/70 hover:border-emerald-300/40 hover:text-white"
                  onClick={() => {
                    setMint(sample);
                    load(sample, interval);
                  }}
                >
                  {short(sample)}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {data && (
        <>
          {(() => {
            const chartSeries = nativeSeries;
            const nativeReady = chartSeries.length >= MIN_NATIVE_CANDLES;
            const gmgnSrc = `https://www.gmgn.cc/kline/sol/${data.mint}?interval=${encodeURIComponent(
              gmgnInterval(interval),
            )}&theme=${isLightTheme ? "light" : "dark"}&chartType=line`;
            return (
              <>
          <section className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {data.identity.image ? (
                  <img
                    src={data.identity.image}
                    alt={data.identity.symbol || data.identity.name || "token"}
                    className="h-12 w-12 rounded-full border border-white/15 object-cover"
                  />
                ) : (
                  <div className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-white/5 text-sm font-semibold text-white/70">
                    {(data.identity.symbol || "T").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                <h1 className="text-2xl font-semibold">{data.identity.name || "Unknown"} {data.identity.symbol ? `(${data.identity.symbol})` : ""}</h1>
                <div className="mt-1 text-xs text-white/50">{short(data.mint)}</div>
                <div className="mt-2 text-xs text-cyan-300">Peak rank #{data.votes.peakRank || "-"} • Peak score {data.votes.peakScore.toFixed(2)}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="bg-emerald-400 text-black hover:bg-emerald-300">
                      Buy Now
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52 border-white/10 bg-black/95 text-white">
                    {buildTraderLinks(data.mint, data.market.pairUrl).map((link) => (
                      <DropdownMenuItem key={link.label} asChild className="cursor-pointer text-sm text-white/85">
                        <a href={link.url} target="_blank" rel="noreferrer nofollow noopener">
                          {link.label}
                        </a>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  className="border-white/20"
                  onClick={() => navigator.clipboard.writeText(data.mint)}
                >
                  Copy CA
                </Button>
              </div>
            </div>
            {(data.identity.socials?.website || data.identity.socials?.twitter || data.identity.socials?.telegram) && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {data.identity.socials?.website && (
                  <a
                    href={data.identity.socials.website}
                    target="_blank"
                    rel="noreferrer nofollow noopener"
                    className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-white/75 hover:text-white"
                  >
                    <Globe className="h-3.5 w-3.5" />
                    Website
                  </a>
                )}
                {data.identity.socials?.twitter && (
                  <a
                    href={data.identity.socials.twitter}
                    target="_blank"
                    rel="noreferrer nofollow noopener"
                    className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-white/75 hover:text-white"
                  >
                    <Twitter className="h-3.5 w-3.5" />
                    X/Twitter
                  </a>
                )}
                {data.identity.socials?.telegram && (
                  <a
                    href={data.identity.socials.telegram}
                    target="_blank"
                    rel="noreferrer nofollow noopener"
                    className="rounded border border-white/15 px-2 py-1 text-white/75 hover:text-white"
                  >
                    Telegram
                  </a>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="space-y-2">
                <h2 className="font-semibold">Chart</h2>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={chartSource === "native" ? "default" : "outline"}
                    className={chartSource === "native" ? "bg-emerald-400 text-black hover:bg-emerald-300" : "border-white/20"}
                    onClick={() => setChartSource("native")}
                  >
                    Native
                  </Button>
                  <Button
                    size="sm"
                    variant={chartSource === "gmgn" ? "default" : "outline"}
                    className={chartSource === "gmgn" ? "bg-emerald-400 text-black hover:bg-emerald-300" : "border-white/20"}
                    onClick={() => setChartSource("gmgn")}
                  >
                    GMGN
                  </Button>
                </div>
              </div>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/70 md:grid-cols-4">
              <div>Price <span className="ml-1 font-semibold text-white"><AnimatedUsd value={data.market.priceUsd} /></span></div>
              <div>24h <span className="ml-1 font-semibold text-white"><AnimatedNumber value={data.market.priceChange.h24} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`} /></span></div>
              <div>Liq <span className="ml-1 font-semibold text-white"><AnimatedUsd value={data.market.liquidityUsd} /></span></div>
              <div>Vol <span className="ml-1 font-semibold text-white"><AnimatedUsd value={data.market.volume24hUsd} /></span></div>
            </div>
            <div className="relative h-[460px] overflow-hidden rounded-lg border border-white/10 bg-black/20 md:h-[540px]">
              {chartSource === "native" && (
                <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-white/10 bg-black/65 px-2 py-1 text-[11px] text-white/75">
                  {data.identity.symbol || "TOKEN"} • {fmtUsd(data.market.priceUsd)} • 5m {fmtPct(data.market.priceChange.m5)} • 1h {fmtPct(data.market.priceChange.h1)} • 24h {fmtPct(data.market.priceChange.h24)}
                </div>
              )}
              {chartSource === "gmgn" && (
                <iframe
                  key={`${data.mint}:${interval}`}
                  src={gmgnSrc}
                  title="GMGN chart"
                  className="h-full w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              )}
              {chartSource === "native" && nativeReady && (
                <NativeCandleChart symbol={data.identity.symbol || "TOKEN"} data={chartSeries} isLightTheme={isLightTheme} />
              )}
              {chartSource === "native" && !nativeReady && (
                <div className="grid h-full place-items-center px-6 text-center text-sm text-white/60">
                  <div>
                    Native OHLC quality is low for this token/interval ({chartSeries.length}/{MIN_NATIVE_CANDLES} candles).
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-white/20"
                        onClick={() => setChartSource("gmgn")}
                      >
                        Switch to GMGN chart
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {chartSource === "native" && !nativeReady && (
              <div className="mt-2 text-xs text-white/50">
                Native is shown only when enough candles are available to avoid misleading chart shapes.
              </div>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
            <Stat title="Price" value={<AnimatedUsd value={data.market.priceUsd} />} />
            <Stat
              title="Market Cap/FDV"
              value={
                <span>
                  <AnimatedUsd value={data.market.marketCapUsd} /> / <AnimatedUsd value={data.market.fdvUsd} />
                </span>
              }
            />
            <Stat title="Liquidity" value={<AnimatedUsd value={data.market.liquidityUsd} />} />
            <Stat title="Volume 24h" value={<AnimatedUsd value={data.market.volume24hUsd} />} />
            <Stat title="Tx 24h" value={<AnimatedNumber value={data.market.txCount24h} decimals={0} format={(v) => `${Math.round(v)}`} />} />
            <Stat title="Holders" value={<AnimatedNumber value={data.holders.holderCount} decimals={0} format={(v) => `${Math.round(v)}`} />} />
            <Stat title="Top 10 %" value={<AnimatedNumber value={data.holders.top10Pct} format={(v) => `${v.toFixed(2)}%`} />} />
            <Stat title="DEX" value={data.market.dex || "-"} />
            <Stat
              title="Searches 1h/24h"
              value={
                <span>
                  <AnimatedNumber value={data.search.searches1h} decimals={0} format={(v) => `${Math.round(v)}`} />
                  /
                  <AnimatedNumber value={data.search.searches24h} decimals={0} format={(v) => `${Math.round(v)}`} />
                </span>
              }
            />
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="font-semibold">Votes</h2>
            <div className="mt-2 text-sm text-white/70">
              Up <AnimatedNumber value={data.votes.up24h} decimals={0} format={(v) => `${Math.round(v)}`} /> • Down <AnimatedNumber value={data.votes.down24h} decimals={0} format={(v) => `${Math.round(v)}`} /> • Score <AnimatedNumber value={data.votes.score24h} decimals={0} format={(v) => `${Math.round(v)}`} />
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="border-white/20" onClick={() => setVoteDirection("up")}>Vote Up</Button>
              <Button variant="outline" className="border-white/20" onClick={() => setVoteDirection("down")}>Vote Down</Button>
              <Button variant="ghost" onClick={() => setShowVoters((x) => !x)}>
                {showVoters ? "Hide voters" : "Recent voters"}
              </Button>
            </div>
            {showVoters && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
                {recentVoters.slice(0, 24).map((v) => (
                  <span key={v} className="rounded border border-white/15 px-2 py-1">{short(v)}</span>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-4">
            <h2 className="font-semibold">Signals</h2>
            {data.signals.confidence >= 65 ? (
              <>
                <div className="mt-2 text-sm">Bundles: {data.signals.bundles} • Snipers: {data.signals.snipers} • Bot risk: {data.signals.botRisk}</div>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70">
                  {data.signals.explanation.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="mt-2 text-sm text-white/60">Unknown (insufficient confidence).</div>
            )}
          </section>

          <section className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
            Social: {data.identity.socials?.website || data.identity.socials?.twitter || data.identity.socials?.telegram ? "detected above" : "none detected"}
            <div className="mt-2 text-xs text-white/50">Updated: {new Date(data.updatedAt).toLocaleString()}</div>
          </section>
              </>
            );
          })()}
        </>
      )}

      {voteDirection && (
        <VoteModal
          mint={mint}
          direction={voteDirection}
          onClose={() => setVoteDirection(null)}
          onSuccess={() => {
            setVoteDirection(null);
            if (mint) load(mint, interval);
          }}
        />
      )}
    </div>
  );
}

function Stat({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
      <div className="text-xs uppercase tracking-wide text-white/50">{title}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
