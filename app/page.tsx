'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/lib/use-wallet';

// Token-gate configuration
const TOKEN_GATE_ENABLED = false;
// Future: Add TOKEN_MINT = 'your-spl-token-mint-here' when token is live

export default function Page() {
  const { connected, publicKey, connect, disconnect, loading, phantomInstalled } = useWallet();
  const [hasAccess, setHasAccess] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Check token access in one place for easy future SPL token balance check
  const checkAccess = async (wallet: string): Promise<boolean> => {
    if (!TOKEN_GATE_ENABLED) {
      return true;
    }
    // TODO: Add SPL token balance check here when TOKEN_GATE_ENABLED is true
    return false;
  };

  useEffect(() => {
    if (connected && publicKey) {
      checkAccess(publicKey).then((access) => setHasAccess(access));
    }
  }, [connected, publicKey]);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      await connect();
    } catch (err) {
      console.error('Connection failed:', err);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    setHasAccess(false);
  };

  const entries = [
    {
      id: 1,
      title: 'Experiment #1 — Token-gated access as alignment',
      date: '2026-02-07',
      sections: [
        {
          heading: 'Goal',
          content: 'Explore whether token-gated access can be used as an alignment tool rather than a speculative incentive.'
        },
        {
          heading: 'Context',
          content: 'Most tokens lead with price, emissions, or rewards. I\'m interested in the opposite: using a token as a key to context, work-in-progress, and early thinking.'
        },
        {
          heading: 'What I\'m testing',
          items: [
            'Whether access alone can be meaningful without rewards',
            'If documenting work builds stronger alignment than announcing outcomes',
            'How early supporters engage when expectations are intentionally minimal'
          ]
        },
        {
          heading: 'Current thinking',
          items: [
            'Gating should unlock information, not extract value',
            'Access > incentives at the earliest stage',
            'Structure should follow usage, not precede it'
          ]
        },
        {
          heading: 'Status',
          content: 'Early exploration. This log will evolve as assumptions are tested.'
        }
      ]
    }
    ,
    {
      id: 2,
      title: 'Experiment #2 — Token Intel v1 (Snapshot, not signals)',
      date: '2026-02-08',
      sections: [
        {
          heading: 'What shipped',
          content: 'I shipped the first usable version of Token Intel. It’s a simple Solana token intelligence tool: paste a mint → get a single, high-signal snapshot of what the token is, not where price might go. The same data is exposed in a structured format so agents (bots, scripts, Clawdbot-style tooling) can consume it directly.'
        },
        {
          heading: 'What it does',
          items: [
            'Resolves token identity (name, symbol, mint)',
            'Pulls core market context (price, liquidity, volume, FDV, dex)',
            'Computes lightweight risk/context signals',
            'Holder count & top-holder concentration',
            'Volume / liquidity ratio',
            'Basic bundle & sniper heuristics',
            'Early/late stage classification',
            'Presents everything in one readable card for humans',
            'Exposes the same output as JSON for agents'
          ]
        },
        {
          heading: 'What it does not do',
          items: [
            'It does not predict price',
            'It does not tell you to buy or sell',
            'It does not compete with charting tools',
            'This is a filter, not a trading oracle',
            'The goal is to answer: “Is this token worth attention at all?” before you open charts, Twitter, or a terminal.'
          ]
        },
        {
          heading: 'Why this exists',
          items: [
            'Most tools either overwhelm with raw data, or collapse everything into a fake “score”.',
            'I’m testing whether a small number of clearly explained signals, shown together, is more useful than either.'
          ]
        },
        {
          heading: 'Current limitations',
          items: [
            'Signals are intentionally coarse (v1)',
            'No discovery feed yet (copy/paste required)',
            'No historical trends or charts yet',
            'This is a snapshot, not a dashboard.'
          ]
        },
        {
          heading: 'What’s next',
          items: [
            '/scan feed for passive discovery',
            'Better explanations/tooltips for each signal',
            'Hardening the API so agents can rely on it without UI'
          ]
        },
        {
          heading: 'Status',
          content: 'Shipped, early, iterating.'
        }
      ]
    }
  ];

  // Loading state
  if (loading) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="border border-border rounded-lg p-8 space-y-6 bg-card">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Build Log</h1>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Loading wallet connection...
            </p>
          </div>
        </div>
      </main>
    );
  }

    if (!connected) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="border border-border rounded-lg p-8 space-y-6 bg-card">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Build Log</h1>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Connect your wallet to check access.
            </p>
            <Button 
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full bg-primary text-primary-foreground hover:opacity-90"
            >
              {isConnecting ? 'Connecting...' : 'Connect Phantom'}
            </Button>
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              This is a living build log. No timelines. No promises.
            </p>
            {!phantomInstalled && (
              <Button
                onClick={() => window.open('https://phantom.app/', '_blank')}
                variant="outline"
                className="w-full bg-transparent"
              >
                Install Phantom
              </Button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Connected but no access state (placeholder for future token check)
  if (connected && !hasAccess) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="border border-border rounded-lg p-8 space-y-6 bg-card">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Access Locked</h1>
            </div>
            <div className="space-y-3">
              <p className="text-foreground text-sm">
                This build log is gated for early supporters.
              </p>
              <p className="text-muted-foreground text-sm">
                Hold the ecosystem token to unlock access.
              </p>
            </div>
            
            <div className="space-y-3 pt-4 border-t border-border">
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground/70">
                Inside
              </p>
              <ul className="space-y-2">
                <li className="text-sm text-foreground/80">
                  • Experiments & notes
                </li>
                <li className="text-sm text-foreground/80">
                  • Decisions & tradeoffs
                </li>
                <li className="text-sm text-foreground/80">
                  • What worked / what didn't
                </li>
              </ul>
            </div>

            <Button 
              onClick={handleDisconnect}
              variant="outline"
              className="w-full bg-transparent"
            >
              Disconnect
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // Access granted state
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">
              Build Log
            </h1>
            <p className="text-lg text-base">Experiments & Notes</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Connected</p>
            <p className="text-sm font-mono text-foreground/80 break-all">
              {publicKey?.slice(0, 8)}...{publicKey?.slice(-8)}
            </p>
          </div>
        </div>

        <div className="mb-12 text-muted-foreground leading-relaxed space-y-4">
          <p>
            This is a living log of experiments, ideas, and technical notes from building in the Solana ecosystem.
          </p>
          <p>
            Some things work. Some don't. Everything is documented.
          </p>
        </div>

        <div className="space-y-12 mb-12">
          {entries.map((entry) => (
            <article 
              key={entry.id}
              className="border-l-2 border-border pl-6 py-4"
            >
              <time className="text-xs text-muted-foreground uppercase tracking-widest">
                {new Date(entry.date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
              <h2 className="text-2xl font-semibold mt-4 mb-6">
                {entry.title}
              </h2>
              <div className="space-y-6">
                {entry.sections.map((section, idx) => (
                  <div key={idx}>
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground/70 mb-2">
                      {section.heading}
                    </h3>
                    {section.content && (
                      <p className="text-foreground/80 text-sm leading-relaxed">
                        {section.content}
                      </p>
                    )}
                    {section.items && (
                      <ul className="space-y-2 mt-2">
                        {section.items.map((item, i) => (
                          <li key={i} className="text-foreground/80 text-sm leading-relaxed">
                            • {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="flex justify-end pt-8 border-t border-border">
          <Button 
            onClick={handleDisconnect}
            variant="outline"
            className="text-xs uppercase tracking-widest bg-transparent"
          >
            Disconnect Wallet
          </Button>
        </div>
      </div>
    </main>
  );
}
