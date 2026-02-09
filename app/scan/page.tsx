'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';


type ScanItem = {
  mint: string;
  name: string | null;
  symbol: string | null;
  image: string | null;
  dex: string | null;
  pairUrl: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  priceChangePct: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  txns24h: { buys: number | null; sells: number | null };
  pairCreatedAt: number | null;
  poolCount: number | null;
  listedAgeHours: number | null;
  stage: { value: 'early' | 'mid' | 'late'; explanation: string };
  confidence: { value: number; explanation: string };
};

type ScanResponse = {
  ok: boolean;
  timestamp: string;
  items: ScanItem[];
  source: 'dexscreener';
  error?: string;
};

const formatUsd = (val: number | null) => {
  if (val === null) return '—';
  if (val < 0.01) return `$${val.toFixed(6)}`;
  if (val < 1) return `$${val.toFixed(4)}`;
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}m`;
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val.toFixed(2)}`;
};

const formatPct = (val: number | null) => (val === null ? '—' : `${val.toFixed(2)}%`);

const formatHours = (val: number | null) => {
  if (val === null) return '—';
  if (val < 1) return `${Math.round(val * 60)}m`;
  if (val < 24) return `${val.toFixed(1)}h`;
  const days = val / 24;
  return `${days.toFixed(1)}d`;
};

const formatRatio = (num: number | null, den: number | null) => {
  if (num === null || den === null || den === 0) return '—';
  return `${(num / den).toFixed(2)}x`;
};

const stageClass = (stage: ScanItem['stage']['value']) => {
  if (stage === 'early') return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30';
  if (stage === 'mid') return 'bg-amber-500/15 text-amber-200 border-amber-400/30';
  return 'bg-red-500/15 text-red-200 border-red-400/30';
};

export default function ScanPage() {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let ignore = false;

    const fetchScan = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/scan');
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || 'Failed to fetch');
        }
        const result: ScanResponse = await res.json();
        if (!ignore) setData(result);
      } catch (err) {
        if (!ignore) setError('Failed to load scan feed');
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    fetchScan();
    const interval = setInterval(fetchScan, 60_000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  const items = useMemo(() => {
    const list = data?.items || [];
    if (!filter.trim()) return list;
    const q = filter.toLowerCase();
    return list.filter((item) =>
      [item.name, item.symbol, item.mint].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data, filter]);

  return (
    <main className="min-h-screen text-foreground bg-[radial-gradient(1200px_500px_at_10%_-10%,#14213d_0%,transparent_60%),radial-gradient(900px_400px_at_90%_10%,#1f2937_0%,transparent_55%),#05070b]">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Scan Feed</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Top 50 active Solana pairs ranked by volume. Click a row to open intel.
            </p>
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="Filter by name, symbol, or mint"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-foreground"
            />
            <Button
              onClick={() => router.push('/intel')}
              className="bg-emerald-400 text-black hover:opacity-90"
            >
              Open Intel
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {!loading && data && !data.ok && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Failed to load scan feed.
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[11px] uppercase tracking-widest text-white/40 border-b border-white/10 bg-black/30">
            <div className="col-span-4">Token</div>
            <div className="col-span-2">Price</div>
            <div className="col-span-1">5m</div>
            <div className="col-span-1">1h</div>
            <div className="col-span-1">6h</div>
            <div className="col-span-1">24h</div>
            <div className="col-span-1">Liq</div>
            <div className="col-span-1">Vol</div>
            <div className="col-span-1">Stage</div>
          </div>

          {loading && (
            <div className="px-4 py-6 text-sm text-white/60">Loading scan feed…</div>
          )}

          {!loading && items.length === 0 && (
            <div className="px-4 py-6 text-sm text-white/60">No tokens matched.</div>
          )}

          {items.map((item) => (
            <div key={item.mint} className="border-b border-white/5">
              <button
                className="w-full text-left grid grid-cols-12 gap-2 px-4 py-3 hover:bg-white/5 transition-colors"
                onClick={() => setExpanded((prev) => (prev === item.mint ? null : item.mint))}
              >
                <div className="col-span-4 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-black/40 border border-white/10 overflow-hidden">
                    {item.image ? (
                      <img src={item.image} alt={item.name || 'token'} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-[10px] text-white/50">
                        {item.symbol || 'SOL'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{item.name || 'Unknown'}</div>
                    <div className="text-xs text-white/50">
                      {item.symbol || '—'} · {item.dex || '—'} · FDV {formatUsd(item.fdvUsd)} · MCap {item.marketCapUsd ? formatUsd(item.marketCapUsd) : '—'}
                    </div>
                  </div>
                </div>
                <div className="col-span-2 text-sm text-white/80">
                  {formatUsd(item.priceUsd)}
                </div>
                <div className="col-span-1 text-sm text-white/70">{formatPct(item.priceChangePct.m5)}</div>
                <div className="col-span-1 text-sm text-white/70">{formatPct(item.priceChangePct.h1)}</div>
                <div className="col-span-1 text-sm text-white/70">{formatPct(item.priceChangePct.h6)}</div>
                <div className="col-span-1 text-sm text-white/70">{formatPct(item.priceChangePct.h24)}</div>
                <div className="col-span-1 text-sm text-white/80">{formatUsd(item.liquidityUsd)}</div>
                <div className="col-span-1 text-sm text-white/80">{formatUsd(item.volume24hUsd)}</div>
                <div className="col-span-1 text-xs">
                  <span className={`inline-flex items-center rounded-full border px-2 py-1 ${stageClass(item.stage.value)}`}>
                    {item.stage.value}
                  </span>
                </div>
              </button>

              {expanded === item.mint && (
                <div className="px-4 pb-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-white/50">Snapshot</div>
                      <div className="mt-2 text-sm text-white/80">
                        Vol/Liq {formatRatio(item.volume24hUsd, item.liquidityUsd)} · Buys {item.txns24h.buys ?? '—'} · Sells {item.txns24h.sells ?? '—'}
                      </div>
                      <div className="mt-1 text-xs text-white/50">Listed {formatHours(item.listedAgeHours)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-widest text-white/50">Stage</div>
                      <div className="mt-2 text-sm text-white/80">{item.stage.explanation}</div>
                      <div className="mt-1 text-xs text-white/50">Confidence {item.confidence.value}% · {item.confidence.explanation}</div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button className="bg-emerald-400 text-black hover:opacity-90" asChild>
                        <a href={`https://jup.ag/swap/SOL-${item.mint}`} target="_blank" rel="noreferrer">Buy now (Jupiter)</a>
                      </Button>
                      <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" asChild>
                        <a href={item.pairUrl || `https://dexscreener.com/solana/${item.mint}`} target="_blank" rel="noreferrer">Open on Dexscreener</a>
                      </Button>
                      <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => router.push(`/intel?mint=${item.mint}`)}>
                        Open Intel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-white/50">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-white/70">Ranked by volume</div>
            <div className="mt-1">Sorted by 24h volume; minimum liquidity $10k.</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-white/70">Click to open</div>
            <div className="mt-1">Each row opens /intel with the mint prefilled.</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-white/70">Refresh</div>
            <div className="mt-1">Feed updates every 60 seconds.</div>
          </div>
        </div>

        <div className="mt-6 text-xs text-white/40">Updated: {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '—'}</div>
      </div>
    </main>
  );
}
