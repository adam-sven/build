'use client';

import React from "react"

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TokenIntelResponse } from '@/lib/types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function IntelPage() {
  const [mint, setMint] = useState('');
  const [data, setData] = useState<TokenIntelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!mint.trim()) {
      setError('Please enter a mint address');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`/api/token?mint=${encodeURIComponent(mint)}`);
      
      // Check if response is ok before parsing JSON
      if (!res.ok) {
        const text = await res.text();
        setError(`API Error: ${res.status} ${text}`);
        return;
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const text = await res.text();
        setError('Invalid response format from server');
        console.error('[v0] Non-JSON response:', text.substring(0, 200));
        return;
      }

      const result: TokenIntelResponse = await res.json();

      console.log('[v0] API Response:', {
        ok: result.ok,
        holders: result.holders?.holderCount,
        candles: result.candles?.items?.length,
        signals: result.signals,
        sources: result.sources,
      });

      if (!result.ok) {
        setError(result.error || 'Failed to fetch token data');
        return;
      }

      setData(result);
    } catch (err) {
      setError('Error fetching token data');
      console.error('[v0] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFetch();
  };

  const formatUsd = (val: number | null) => {
    if (val === null) return '-';
    if (val < 0.01) return `$${val.toFixed(6)}`;
    if (val < 1) return `$${val.toFixed(4)}`;
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}m`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
    return `$${val.toFixed(2)}`;
  };

  const formatPct = (val: number | null) => {
    return val === null ? '-' : `${val.toFixed(2)}%`;
  };

  const shortAddr = (addr: string, start = 6, end = 4) => {
    return `${addr.slice(0, start)}...${addr.slice(-end)}`;
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">Token Intel</h1>
          <p className="text-lg text-muted-foreground">Fetch comprehensive token data from multiple sources.</p>
        </div>

        <div className="flex gap-2 mb-8">
          <input
            type="text"
            placeholder="Enter mint address"
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 px-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/50"
          />
          <Button
            onClick={handleFetch}
            disabled={loading}
            className="bg-primary text-primary-foreground hover:opacity-90"
          >
            {loading ? 'Loading...' : 'Fetch Intel'}
          </Button>
        </div>

        {error && (
          <Card className="mb-8 border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {data && data.ok && (
          <div className="space-y-6">
            <Card className="border-2 border-foreground/20">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Verdict</CardTitle>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{data.verdict.confidence}%</div>
                    <div className="text-xs text-muted-foreground">Confidence</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge className="text-base px-3 py-1">
                    {data.verdict.stage === 'early' && 'Early'}
                    {data.verdict.stage === 'mid' && 'Mid'}
                    {data.verdict.stage === 'late' && 'Late'}
                  </Badge>
                  <span className="text-sm text-muted-foreground capitalize">
                    {data.verdict.stage === 'early' && 'Recently listed, high risk'}
                    {data.verdict.stage === 'mid' && 'Established, moderate risk'}
                    {data.verdict.stage === 'late' && 'Mature token, lower risk'}
                  </span>
                </div>

                {data.verdict.riskFlags.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Risk Flags</div>
                    <ul className="space-y-1">
                      {data.verdict.riskFlags.map((flag) => (
                        <li key={flag} className="text-sm text-foreground/70">
                          • {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-2xl">{data.identity.name || 'Unknown'}</CardTitle>
                  <div className="text-sm text-muted-foreground font-mono mt-2">{shortAddr(data.mint, 8, 8)}</div>
                </div>
                {data.identity.image && (
                  <img
                    src={data.identity.image || "/placeholder.svg"}
                    alt={data.identity.name || 'Token'}
                    className="w-16 h-16 rounded-lg bg-card border border-border"
                  />
                )}
              </CardHeader>

              <CardContent className="space-y-4">
                {data.identity.symbol && (
                  <div className="inline-block">
                    <Badge variant="secondary">{data.identity.symbol}</Badge>
                  </div>
                )}

                {(data.socials.twitter || data.socials.website || data.socials.telegram) && (
                  <div className="flex gap-3">
                    {data.socials.twitter && (
                      <a href={data.socials.twitter} target="_blank" rel="noreferrer" className="text-xs underline text-muted-foreground hover:text-foreground transition-colors">
                        Twitter
                      </a>
                    )}
                    {data.socials.website && (
                      <a href={data.socials.website} target="_blank" rel="noreferrer" className="text-xs underline text-muted-foreground hover:text-foreground transition-colors">
                        Website
                      </a>
                    )}
                    {data.socials.telegram && (
                      <a href={data.socials.telegram} target="_blank" rel="noreferrer" className="text-xs underline text-muted-foreground hover:text-foreground transition-colors">
                        Telegram
                      </a>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Market</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Price</div>
                    <div className="text-lg font-semibold">{formatUsd(data.market.priceUsd)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Liquidity</div>
                    <div className="text-lg font-semibold">{formatUsd(data.market.liquidityUsd)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Vol 24h</div>
                    <div className="text-lg font-semibold">{formatUsd(data.market.volume24hUsd)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">FDV</div>
                    <div className="text-lg font-semibold">{formatUsd(data.market.fdvUsd)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">DEX</div>
                    <div className="text-lg font-semibold">{data.market.dex || '-'}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Live Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Holders</div>
                    <div className="text-lg font-semibold">{data.holders?.holderCount ? data.holders.holderCount.toLocaleString() : '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Liquidity/FDV</div>
                    <div className="text-lg font-semibold">{data.market?.liquidityUsd && data.market?.fdvUsd ? `${((data.market.liquidityUsd / data.market.fdvUsd) * 100).toFixed(2)}%` : '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Volume/Liq</div>
                    <div className="text-lg font-semibold">{data.market?.volume24hUsd && data.market?.liquidityUsd ? `${(data.market.volume24hUsd / data.market.liquidityUsd).toFixed(1)}x` : '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Bot Risk</div>
                    <div className="text-lg font-semibold capitalize">
                      {data.signals.snipers === 'high' ? 'High' : data.signals.snipers === 'med' ? 'Med' : 'Low'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Overall Risk</div>
                    <div className="text-lg font-semibold">
                      {data.signals.bundles === 'high' || data.signals.snipers === 'high' ? 'High' : data.signals.bundles === 'med' || data.signals.snipers === 'med' ? 'Med' : 'Low'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {(() => {
              console.log('[v0] Candles length:', data.candles.items.length);
              return data.candles.items.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Price Action ({data.candles.interval})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={data.candles.items}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                          dataKey="t"
                          tickFormatter={(t) => new Date(t * 1000).toLocaleTimeString()}
                          stroke="var(--muted-foreground)"
                          style={{ fontSize: '12px' }}
                        />
                        <YAxis stroke="var(--muted-foreground)" style={{ fontSize: '12px' }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)' }}
                          formatter={(v: number) => `$${v.toFixed(6)}`}
                        />
                        <Line type="monotone" dataKey="c" stroke="var(--primary)" dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              ) : null;
            })()}

            {(data.signals.bundles !== 'unknown' || data.signals.snipers !== 'unknown' || data.signals.whaleNetBuy5m !== null) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Signals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Bundles</div>
                      <Badge variant={data.signals.bundles === 'high' ? 'destructive' : 'secondary'}>
                        {data.signals.bundles}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Snipers</div>
                      <Badge variant={data.signals.snipers === 'high' ? 'destructive' : 'secondary'}>
                        {data.signals.snipers}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Whale Net 5m</div>
                      <div className="text-sm font-semibold">
                        {data.signals.whaleNetBuy5m ? `$${(data.signals.whaleNetBuy5m / 1000).toFixed(1)}k` : '-'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <details className="rounded-lg border border-border bg-card">
              <summary className="cursor-pointer px-6 py-4 text-sm text-muted-foreground font-medium hover:text-foreground transition-colors">
                Advanced (raw JSON)
              </summary>
              <div className="px-6 pb-6 border-t border-border">
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
