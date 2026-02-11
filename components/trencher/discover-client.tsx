"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DiscoverMode, DiscoverResponse, TokenRowSummary } from "@/lib/trencher/types";
import VoteModal from "@/components/trencher/vote-modal";
import { readSessionJson, writeSessionJson } from "@/lib/client-cache";

const MODES: DiscoverMode[] = ["trending", "new", "voted", "quality"];

function shortMint(mint: string) {
  return `${mint.slice(0, 5)}...${mint.slice(-5)}`;
}

function TokenAvatar({ image, symbol }: { image: string | null; symbol: string | null }) {
  const [src, setSrc] = useState<string | null>(image);

  useEffect(() => {
    setSrc(image);
  }, [image]);

  if (src) {
    return (
      <img
        src={src}
        alt={symbol || "token"}
        className="h-8 w-8 rounded-full border border-white/15 object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setSrc(null)}
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

function fmtPrice(item: TokenRowSummary) {
  const v = item.priceUsd;
  if (v === null || v <= 0) return "-";
  if (v < 0.0001) return `$${v.toFixed(8)}`;
  if (v < 1) return `$${v.toFixed(6)}`;
  return `$${v.toFixed(4)}`;
}

function fmtTx(v: number | null) {
  if (v === null) return "-";
  if (v > 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
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
  const [copiedMint, setCopiedMint] = useState<string | null>(null);
  const sessionKey = `trencher:discover:${mode}:v1`;

  const copyMint = async (mint: string) => {
    try {
      await navigator.clipboard.writeText(mint);
      setCopiedMint(mint);
      setTimeout(() => setCopiedMint((v) => (v === mint ? null : v)), 1200);
    } catch {
      // ignore clipboard failure
    }
  };

  const load = async (m: DiscoverMode, silent = false) => {
    const cached = readSessionJson<DiscoverResponse>(`trencher:discover:${m}:v1`);
    if (!silent && !cached?.ok) setLoading(true);
    if (!silent && cached?.ok) {
      setItems(cached.items || []);
    }
    try {
      const res = await fetch(`/api/ui/discover?chain=solana&mode=${m}`);
      const json: DiscoverResponse = await res.json();
      if (json?.ok) {
        setItems((prev) => (json.items?.length === 0 && prev.length > 0 ? prev : json.items));
        writeSessionJson(`trencher:discover:${m}:v1`, json);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    const cached = readSessionJson<DiscoverResponse>(sessionKey);
    if (cached?.ok) {
      setItems(cached.items || []);
    }
    load(mode);
  }, [mode]);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
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
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
            <SelectTrigger className="w-[150px] border-white/10 bg-black/40 text-white">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-black/95 text-white">
              {(Object.keys(SOURCE_META) as SourceFilter[]).map((src) => (
                <SelectItem key={src} value={src} className="focus:bg-white/10">
                  <span className="inline-flex items-center gap-2">
                    <SourceIcon source={src} className="h-5 w-5" />
                    {SOURCE_META[src].label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <div className="col-span-4">Token</div>
          <div className="col-span-1">Price</div>
          <div className="col-span-1">Txns</div>
          <div className="col-span-1">5m</div>
          <div className="col-span-1">1h</div>
          <div className="col-span-1">24h</div>
          <div className="col-span-1">Liq</div>
          <div className="col-span-1">Mcap</div>
          <div className="col-span-1">Votes</div>
        </div>
        {filtered.map((item) => (
          <div key={item.mint} className="grid grid-cols-12 items-center border-t border-white/5 px-3 py-2 text-sm">
            <div className="col-span-4">
              <div className="flex items-start gap-2">
                <TokenAvatar image={item.image} symbol={item.symbol} />
                <div>
                  <Link href={`/intel?mint=${item.mint}`} className="inline-flex items-center gap-2 font-semibold hover:text-emerald-300">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-black/20">
                      <SourceIcon source={item.source as SourceFilter} className="h-7 w-7" />
                    </span>
                    <span>{item.name || "Unknown"} <span className="text-white/50">{item.symbol || ""}</span></span>
                  </Link>
                  <button
                    type="button"
                    className="text-xs text-white/45 hover:text-emerald-300"
                    onClick={() => copyMint(item.mint)}
                    title="Copy contract address"
                  >
                    {shortMint(item.mint)} {copiedMint === item.mint ? "Copied" : ""}
                  </button>
                </div>
              </div>
            </div>
            <div className="col-span-1 text-xs">{fmtPrice(item)}</div>
            <div className="col-span-1 text-xs">{fmtTx(item.txCount24h)}</div>
            <div className="col-span-1 text-xs">{pct(item.priceChange.m5)}</div>
            <div className="col-span-1 text-xs">{pct(item.priceChange.h1)}</div>
            <div className="col-span-1 text-xs">{pct(item.priceChange.h24)}</div>
            <div className="col-span-1 text-xs">{usd(item.liquidityUsd)}</div>
            <div className="col-span-1 text-xs">{usd(item.marketCapUsd)}</div>
            <div className="col-span-1 text-xs">
              <div className="mb-1">{item.votes.score24h}</div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 border-white/20 px-2" onClick={() => setVoteTarget({ mint: item.mint, direction: "up" })}>▲</Button>
                <Button size="sm" variant="outline" className="h-7 border-white/20 px-2" onClick={() => setVoteTarget({ mint: item.mint, direction: "down" })}>▼</Button>
              </div>
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
                  <span className="grid h-7 w-7 place-items-center rounded-md bg-black/40">
                    <SourceIcon source={item.source as SourceFilter} className="h-6 w-6" />
                  </span>
                  <span>{item.name || "Unknown"} {item.symbol ? `(${item.symbol})` : ""}</span>
                </Link>
                <button
                  type="button"
                  className="text-xs text-white/45 hover:text-emerald-300"
                  onClick={() => copyMint(item.mint)}
                  title="Copy contract address"
                >
                  {shortMint(item.mint)} {copiedMint === item.mint ? "Copied" : ""}
                </button>
                </div>
              </div>
              <div className="text-xs">{item.votes.score24h}</div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/70">
              <div>Price {fmtPrice(item)}</div>
              <div>Liq {usd(item.liquidityUsd)}</div>
              <div>Vol {usd(item.volume24hUsd)}</div>
              <div>MC {usd(item.marketCapUsd)}</div>
            </div>
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
