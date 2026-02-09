"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import type { DiscoverMode, DiscoverResponse, TokenRowSummary } from "@/lib/trencher/types";
import VoteModal from "@/components/trencher/vote-modal";

const MODES: DiscoverMode[] = ["trending", "new", "voted", "quality"];

function shortMint(mint: string) {
  return `${mint.slice(0, 5)}...${mint.slice(-5)}`;
}

function TokenAvatar({ image, symbol }: { image: string | null; symbol: string | null }) {
  if (image) {
    return (
      <img
        src={image}
        alt={symbol || "token"}
        className="h-8 w-8 rounded-full border border-white/15 object-cover"
      />
    );
  }

  return (
    <div className="grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-white/5 text-[10px] font-semibold text-white/70">
      {(symbol || "T").slice(0, 1).toUpperCase()}
    </div>
  );
}

function usd(v: number | null) {
  if (v === null) return "-";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}m`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

function pct(v: number | null) {
  if (v === null) return "-";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}

type SourceFilter = "all" | "pumpfun" | "bagsapp" | "other";

const SOURCE_META: Record<SourceFilter, { label: string; icon: string }> = {
  all: { label: "All", icon: "/source-all.svg" },
  pumpfun: { label: "Pumpfun", icon: "/source-pumpfun.svg" },
  bagsapp: { label: "BagsApp", icon: "/source-bagsapp.svg" },
  other: { label: "Solana", icon: "/source-solana.svg" },
};

function SourceIcon({ source, className = "h-5 w-5" }: { source: SourceFilter; className?: string }) {
  const meta = SOURCE_META[source];
  return <img src={meta.icon} alt={meta.label} className={`${className} shrink-0 object-contain`} />;
}

export default function DiscoverClient() {
  const router = useRouter();

  const [mode, setMode] = useState<DiscoverMode>("trending");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TokenRowSummary[]>([]);
  const [voteTarget, setVoteTarget] = useState<{ mint: string; direction: "up" | "down" } | null>(null);

  const load = async (m: DiscoverMode, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/ui/discover?chain=solana&mode=${m}`);
      const json: DiscoverResponse = await res.json();
      if (json?.ok) setItems(json.items);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load(mode);
  }, [mode]);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        await fetch(`/api/live/tick?chain=solana&scope=discover`, { cache: "no-store" });
      } catch {
        // ignore
      }
      await load(mode, true);
    }, 12_000);

    return () => clearInterval(timer);
  }, [mode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (sourceFilter !== "all" && i.source !== sourceFilter) return false;
      if (!q) return true;
      return `${i.name || ""} ${i.symbol || ""} ${i.mint}`.toLowerCase().includes(q);
    });
  }, [items, query, sourceFilter]);

  const onSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const qLower = q.toLowerCase();
    const matched = items.find((i) => {
      const symbol = (i.symbol || "").toLowerCase();
      const name = (i.name || "").toLowerCase();
      const mint = i.mint.toLowerCase();
      return symbol === qLower || name === qLower || mint === qLower;
    });
    const resolvedMint = /^[1-9A-HJ-NP-Za-km-z]{32,50}$/.test(q) ? q : matched?.mint ?? null;

    await fetch("/api/ui/search/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain: "solana", query: q, resolvedMint }),
    });

    if (resolvedMint) {
      router.push(`/intel?mint=${resolvedMint}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs value={mode} onValueChange={(v) => setMode(v as DiscoverMode)}>
          <TabsList className="bg-white/5">
            {MODES.map((m) => (
              <TabsTrigger key={m} value={m} className="capitalize">
                {m}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <form onSubmit={onSearchSubmit} className="flex w-full max-w-2xl gap-2">
          <div className="flex items-center gap-1 overflow-x-auto rounded-md border border-white/10 bg-black/40 p-1">
            {(Object.keys(SOURCE_META) as SourceFilter[]).map((src) => {
              const active = sourceFilter === src;
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => setSourceFilter(src)}
                  className={`inline-flex min-w-max items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition ${
                    active ? "bg-emerald-400 text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-black/40">
                    <SourceIcon source={src} className="h-4 w-4" />
                  </span>
                  <span>{SOURCE_META[src].label}</span>
                </button>
              );
            })}
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mint or symbol..."
            className="border-white/10 bg-black/40"
          />
          <Button type="submit" className="bg-emerald-400 text-black hover:opacity-90">
            Search
          </Button>
        </form>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-white/10 md:block">
        <div className="grid grid-cols-12 bg-black/40 px-3 py-2 text-[11px] uppercase tracking-wide text-white/50">
          <div className="col-span-3">Token</div>
          <div className="col-span-2">Market</div>
          <div className="col-span-2">Change</div>
          <div className="col-span-1">Search</div>
          <div className="col-span-2">Votes</div>
          <div className="col-span-1">Why</div>
          <div className="col-span-1">Flags</div>
        </div>
        {filtered.map((item) => (
          <div key={item.mint} className="grid grid-cols-12 items-start border-t border-white/5 px-3 py-3 text-sm">
            <div className="col-span-3">
              <div className="flex items-start gap-2">
                <TokenAvatar image={item.image} symbol={item.symbol} />
                <div>
                  <Link href={`/intel?mint=${item.mint}`} className="inline-flex items-center gap-2 font-semibold hover:text-emerald-300">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-black/40">
                      <SourceIcon source={item.source as SourceFilter} className="h-5 w-5" />
                    </span>
                    <span>{item.name || "Unknown"} <span className="text-white/50">{item.symbol || ""}</span></span>
                  </Link>
                  <div className="text-xs text-white/45">{shortMint(item.mint)}</div>
                  {item.peakRank > 0 && <div className="mt-1 text-xs text-cyan-300">Peak #{item.peakRank}</div>}
                </div>
              </div>
            </div>
            <div className="col-span-2 text-xs text-white/70">
              <div>MC/FDV {usd(item.marketCapUsd)}/{usd(item.fdvUsd)}</div>
              <div>Liq {usd(item.liquidityUsd)}</div>
              <div>Vol {usd(item.volume24hUsd)}</div>
            </div>
            <div className="col-span-2 text-xs">
              <div>{pct(item.priceChange.m5)}</div>
              <div>{pct(item.priceChange.h1)}</div>
              <div>{pct(item.priceChange.h24)}</div>
            </div>
            <div className="col-span-1 text-xs">{item.search.trending ? "🔍" : "-"}</div>
            <div className="col-span-2 text-xs">
              <div className="mb-1">{item.votes.up24h}/{item.votes.down24h} ({item.votes.score24h})</div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 border-white/20" onClick={() => setVoteTarget({ mint: item.mint, direction: "up" })}>▲</Button>
                <Button size="sm" variant="outline" className="h-7 border-white/20" onClick={() => setVoteTarget({ mint: item.mint, direction: "down" })}>▼</Button>
              </div>
            </div>
            <div className="col-span-1 text-[11px] text-white/65">{item.why.slice(0, 2).map((x, idx) => <div key={idx}>• {x}</div>)}</div>
            <div className="col-span-1 text-[11px] text-white/65">
              {item.flags.confidence >= 65 ? (
                <>
                  <div>B:{item.flags.bundles}</div>
                  <div>R:{item.flags.botRisk}</div>
                </>
              ) : (
                <div>Unknown</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 md:hidden">
        {filtered.map((item) => (
          <div key={item.mint} className="rounded-xl border border-white/10 bg-black/35 p-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <TokenAvatar image={item.image} symbol={item.symbol} />
                <div>
                <Link href={`/intel?mint=${item.mint}`} className="inline-flex items-center gap-2 font-semibold hover:text-emerald-300">
                  <span className="grid h-6 w-6 place-items-center rounded-md bg-black/40">
                    <SourceIcon source={item.source as SourceFilter} className="h-5 w-5" />
                  </span>
                  <span>{item.name || "Unknown"} {item.symbol ? `(${item.symbol})` : ""}</span>
                </Link>
                <div className="text-xs text-white/45">{shortMint(item.mint)}</div>
                </div>
              </div>
              <div className="text-xs">{item.votes.score24h}</div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/70">
              <div>Liq {usd(item.liquidityUsd)}</div>
              <div>Vol {usd(item.volume24hUsd)}</div>
              <div>MC {usd(item.marketCapUsd)}</div>
            </div>
            <div className="mt-2 text-xs text-white/65">{item.why.slice(0, 2).map((x, idx) => <div key={idx}>• {x}</div>)}</div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" className="h-7 border-white/20" onClick={() => setVoteTarget({ mint: item.mint, direction: "up" })}>Upvote</Button>
              <Button size="sm" variant="outline" className="h-7 border-white/20" onClick={() => setVoteTarget({ mint: item.mint, direction: "down" })}>Downvote</Button>
            </div>
          </div>
        ))}
      </div>

      {loading && <p className="text-sm text-white/60">Loading feed...</p>}
      {!loading && filtered.length === 0 && <p className="text-sm text-white/60">No tokens yet.</p>}

      {voteTarget && (
        <VoteModal
          mint={voteTarget.mint}
          direction={voteTarget.direction}
          onClose={() => setVoteTarget(null)}
          onSuccess={() => {
            setVoteTarget(null);
            load(mode);
          }}
        />
      )}
    </div>
  );
}
