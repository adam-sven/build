'use client';

import React from "react"

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type AnalysisResult = {
  ok: boolean;
  mint: string;
  token: {
    name: string | null;
    symbol: string | null;
    image: string | null;
    decimals: number | null;
    totalSupply: string | null;
  };
  pump: {
    bondingCurvePda: string | null;
    progressPct: number | null;
    isComplete: boolean | null;
  };
  lifecycle: {
    stage: 'early' | 'mid' | 'late' | 'unknown';
    confidence: 'low' | 'medium' | 'high';
    buysPerMin: number | null;
    sellsPerMin: number | null;
    uniqueWallets5m: number | null;
    explanation: string;
  };
  links: {
    pumpfun: string;
    solscan: string;
    dexscreener: string;
  };
  error?: string;
};

function shortMint(mint: string, start = 6, end = 6): string {
  if (mint.length <= start + end) return mint;
  return `${mint.slice(0, start)}...${mint.slice(-end)}`;
}

function stageBadgeColor(stage: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (stage === 'early') return 'secondary';
  if (stage === 'mid') return 'outline';
  if (stage === 'late') return 'destructive';
  return 'default';
}

function stageEmoji(stage: string): string {
  if (stage === 'early') return '🟢';
  if (stage === 'mid') return '🟡';
  if (stage === 'late') return '🔴';
  return '⚪';
}

export default function PumpAnalyzerPage() {
  const [mint, setMint] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!mint.trim()) {
      setError('Please enter a mint address');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(`/api/pump/analyze?mint=${encodeURIComponent(mint.trim())}`);
      const data: AnalysisResult = await res.json();

      if (!data.ok) {
        setError(data.error || 'Failed to analyze token');
      } else {
        setResult(data);
      }
    } catch (err) {
      console.error('[pump analyzer]', err);
      setError('Request failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">
            Pump.fun Lifecycle
          </h1>
          <p className="text-lg text-base">Context, not advice.</p>
        </div>

        {/* Input Section */}
        <Card className="mb-12 bg-card border-border">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Mint Address
              </label>
              <Input
                type="text"
                placeholder="EPjFWaLb3odccccLLcxyiCDhZ9gfQfq5KoXWJx3Jxcf"
                value={mint}
                onChange={(e) => setMint(e.target.value)}
                onKeyDown={handleKeyDown}
                className="font-mono text-sm"
                disabled={loading}
              />
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:opacity-90"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </Button>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="mb-12 border-destructive bg-card">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {result && result.ok && (
          <div className="space-y-6">
            {/* Section A: Token Header */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  {result.token.image ? (
                    <img
                      src={result.token.image || "/placeholder.svg"}
                      alt="token"
                      className="w-16 h-16 rounded-full"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      No image
                    </div>
                  )}
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold">
                      {result.token.name || 'Unknown'} {result.token.symbol ? `(${result.token.symbol})` : ''}
                    </h2>
                    <p className="text-sm font-mono text-muted-foreground mt-1">
                      {shortMint(result.mint)}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <a
                        href={result.links.pumpfun}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline text-muted-foreground hover:text-foreground transition-colors"
                      >
                        pump.fun
                      </a>
                      <a
                        href={result.links.solscan}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Solscan
                      </a>
                      <a
                        href={result.links.dexscreener}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Dexscreener
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section B: Lifecycle Verdict */}
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge variant={stageBadgeColor(result.lifecycle.stage)}>
                    {stageEmoji(result.lifecycle.stage)} {result.lifecycle.stage.charAt(0).toUpperCase() + result.lifecycle.stage.slice(1)}
                  </Badge>
                  <span className="text-xs text-muted-foreground uppercase tracking-widest">
                    Confidence: {result.lifecycle.confidence}
                  </span>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {result.lifecycle.explanation}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Curve Progress */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Curve Progress
                      </span>
                      <span className="text-sm font-mono text-foreground">
                        {(result.pump.progressPct ?? 0).toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(result.pump.progressPct ?? 0, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Grid of metrics */}
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Buys / min</p>
                      <p className="text-lg font-semibold">{result.lifecycle.buysPerMin ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Sells / min</p>
                      <p className="text-lg font-semibold">{result.lifecycle.sellsPerMin ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Unique Wallets (5m)</p>
                      <p className="text-lg font-semibold">{result.lifecycle.uniqueWallets5m ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Status</p>
                      <p className="text-lg font-semibold">
                        {result.pump.isComplete ? 'Graduated' : 'Active'}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Info disclaimer */}
            <div className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-4">
              <p>
                This is a lifecycle/context view (early/mid/late), not financial advice.
              </p>
            </div>

            {/* Section C: Advanced (collapsible) */}
            <details className="rounded-lg border border-border bg-card">
              <summary className="cursor-pointer px-6 py-4 text-sm text-muted-foreground font-medium hover:text-foreground transition-colors">
                Advanced
              </summary>
              <div className="px-6 pb-6 border-t border-border space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    Raw Data
                  </p>
                  <pre className="text-xs overflow-auto bg-black/30 rounded-md p-4">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    Execution / Routing
                  </p>
                  <div className="text-xs text-muted-foreground border border-border rounded-md p-3">
                    <p>Jupiter route integration (coming soon)</p>
                  </div>
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </main>
  );
}
