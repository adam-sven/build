'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type QuoteSummary = {
  side: 'buy' | 'sell';
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct?: number;
  routeFound: boolean;
  error?: string;
};

type AnalysisResult = {
  mint: string;
  ok: boolean;
  timestamp: number;
  buy: QuoteSummary;
  sell: QuoteSummary;
  spreadPct: number | null;
  warnings: string[];
};

const WSOL = 'So11111111111111111111111111111111111111112';

function short(addr: string, left = 4, right = 4) {
  if (!addr || addr.length < left + right + 3) return addr;
  return `${addr.slice(0, left)}…${addr.slice(-right)}`;
}

function lamportsToSol(lamportsStr: string) {
  const lamports = Number(lamportsStr || '0');
  return lamports / 1e9;
}

function fmtPct(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return `${(Math.round(n * 10000) / 100).toFixed(2)}%`;
}

function fmtSpread(n: number | null) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function warningLabel(w: string) {
  switch (w) {
    case 'invalid_mint': return 'Invalid mint';
    case 'no_buy_route': return 'No buy route';
    case 'no_sell_route': return 'No sell route';
    case 'sell_amount_zero': return 'Sell amount zero';
    case 'high_spread': return 'High spread';
    case 'high_buy_impact': return 'High buy impact';
    case 'high_sell_impact': return 'High sell impact';
    default: return w;
  }
}

export default function AnalyzePage() {
  const [mint, setMint] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAnalyze = useMemo(() => mint.trim().length > 0 && !loading, [mint, loading]);

  const run = async () => {
    const m = mint.trim();
    if (!m) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`/api/analyze?mint=${encodeURIComponent(m)}`, { method: 'GET' });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? 'Request failed');
        return;
      }

      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-16 space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Token Analyzer</h1>
          <p className="text-sm text-muted-foreground">
            Paste a Solana mint. We'll quote buy/sell on Jupiter and flag obvious risk signals.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mint</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={mint}
                onChange={(e) => setMint(e.target.value)}
                placeholder="Token mint address (base58)"
                className="font-mono"
              />
              <Button onClick={run} disabled={!canAnalyze}>
                {loading ? 'Analyzing…' : 'Analyze'}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              v1 checks: buy/sell route, effective spread, price impact, basic warnings.
            </div>

            {error && (
              <div className="text-sm text-red-400">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="space-y-2">
                <CardTitle className="text-base">Verdict</CardTitle>
                {(() => {
                  const noRoute = !result.buy?.routeFound || !result.sell?.routeFound;
                  if (noRoute) {
                    return (
                      <div className="flex items-start gap-2">
                        <Badge variant="destructive" className="text-xs">
                          Non-tradable
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          No reliable buy/sell route found via Jupiter for this mint.
                        </span>
                      </div>
                    );
                  }

                  const highSpread = (result.spreadPct ?? 0) > 5;
                  const highImpact =
                    (result.buy.priceImpactPct ?? 0) > 3 || (result.sell.priceImpactPct ?? 0) > 3;

                  if (highSpread || highImpact) {
                    return (
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="text-xs">
                          Risky
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Route exists, but spread/impact suggests poor execution or thin liquidity.
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary" className="text-xs">
                        Tradable
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Route exists with acceptable spread/impact (for this quote size).
                      </span>
                    </div>
                  );
                })()}
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Based on Jupiter quotes for a small test size. Not financial advice.
                </div>

                {result.warnings?.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                      Why it's flagged
                    </div>
                    <ul className="list-disc pl-5 text-sm text-foreground/80 space-y-1">
                      {result.warnings.map((w) => (
                        <li key={w}>{warningLabel(w)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <a
                    className="text-xs underline text-muted-foreground hover:text-foreground transition-colors"
                    href={`https://solscan.io/token/${result.mint}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Solscan
                  </a>
                  <a
                    className="text-xs underline text-muted-foreground hover:text-foreground transition-colors"
                    href={`https://jup.ag/swap/SOL-${result.mint}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Jupiter
                  </a>
                  <a
                    className="text-xs underline text-muted-foreground hover:text-foreground transition-colors"
                    href={`https://dexscreener.com/solana/${result.mint}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Dexscreener
                  </a>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="text-base">Summary</CardTitle>
                <div className="text-xs text-muted-foreground font-mono">
                  Mint: {short(result.mint, 6, 6)}
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3 items-center">
                <Badge variant="secondary">
                  Spread: {fmtSpread(result.spreadPct)}
                </Badge>

                <Badge variant="secondary">
                  Buy impact: {fmtPct(result.buy.priceImpactPct)}
                </Badge>

                <Badge variant="secondary">
                  Sell impact: {fmtPct(result.sell.priceImpactPct)}
                </Badge>

                {result.warnings?.length > 0 ? (
                  result.warnings.map((w) => (
                    <Badge key={w} variant="destructive">
                      {warningLabel(w)}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="secondary">No warnings</Badge>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Buy Quote</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Route</span>
                  <span>{result.buy.routeFound ? 'Found' : 'Not found'}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input</span>
                  <span className="font-mono">
                    {lamportsToSol(result.buy.inAmount).toFixed(4)} SOL
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Output</span>
                  <span className="font-mono">
                    {result.buy.outAmount} (raw)
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Impact</span>
                  <span>{fmtPct(result.buy.priceImpactPct)}</span>
                </div>

                <div className="text-xs text-muted-foreground font-mono">
                  {short(WSOL)} → {short(result.mint)}
                </div>

                {result.buy.error && (
                  <div className="text-xs text-red-400">{result.buy.error}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sell Quote</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Route</span>
                  <span>{result.sell.routeFound ? 'Found' : 'Not found'}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Input</span>
                  <span className="font-mono">
                    {result.sell.inAmount} (raw)
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Output</span>
                  <span className="font-mono">
                    {lamportsToSol(result.sell.outAmount).toFixed(6)} SOL
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Impact</span>
                  <span>{fmtPct(result.sell.priceImpactPct)}</span>
                </div>

                <div className="text-xs text-muted-foreground font-mono">
                  {short(result.mint)} → {short(WSOL)}
                </div>

                {result.sell.error && (
                  <div className="text-xs text-red-400">{result.sell.error}</div>
                )}
              </CardContent>
            </Card>

            <details className="rounded-lg border border-border bg-card">
              <summary className="cursor-pointer px-6 py-4 text-sm text-muted-foreground font-medium hover:text-foreground transition-colors">
                Advanced (raw JSON)
              </summary>
              <div className="px-6 pb-6 border-t border-border">
                <pre className="text-xs overflow-auto bg-black/30 rounded-md p-4">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}
