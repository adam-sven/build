'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/lib/use-wallet';

// Token-gate configuration
const TOKEN_GATE_ENABLED = false;
// Future: Add TOKEN_MINT = 'your-spl-token-mint-here' when token is live

export default function Page() {
  const { connected, publicKey, connect, disconnect, loading, phantomInstalled } = useWallet();
  const [hasAccess, setHasAccess] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openEntryId, setOpenEntryId] = useState<number | null>(4);

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
          content: 'I shipped the first usable version of Token Intel. It is a simple Solana token intelligence tool: paste a mint, get a single high-signal snapshot of the token’s current state. This is not a trading bot, signal service, or price predictor. It is a filter meant to reduce noise, not generate conviction.'
        },
        {
          heading: 'Why I built this',
          items: [
            'Most tools optimize for price, charts, alerts, and engagement loops.',
            'I wanted the opposite: a fast, static read on what a token is, not where it is going.',
            'Something both humans and agents/bots can consume easily.',
            'No scrolling, no dashboards, no dopamine hooks.',
            'Just: “What am I looking at right now?”'
          ]
        },
        {
          heading: 'What it does (v1)',
          items: [
            'Resolves token identity (name, symbol, mint)',
            'Pulls core market context: price, liquidity, volume (24h), FDV, DEX',
            'Computes lightweight heuristics: holder count, top-holder concentration, volume / liquidity ratio',
            'Basic bundle detection',
            'Basic sniper / bot risk flags',
            'Classifies the token as early / discovery / active',
            'Presents everything in one readable card',
            'Exposes the same data as structured JSON for agents'
          ]
        },
        {
          heading: 'What it deliberately does not do',
          items: [
            'No buy/sell signals',
            'No targets',
            'No predictions',
            'No “alpha” framing',
            'If this tool tells you what to buy, it has failed.'
          ]
        },
        {
          heading: 'Design choices',
          items: [
            'Snapshot over stream',
            'Explanation over charts',
            'Flags over scores',
            'Human-readable first, machine-readable second',
            'The UI is intentionally calm. If something looks risky, it should feel obvious, not urgent.'
          ]
        },
        {
          heading: 'Current limitations',
          items: [
            'No scan/feed yet',
            'No historical charts',
            'No wallet-level behavior analysis',
            'Heuristics are intentionally conservative',
            'This is a foundation, not a finished product.'
          ]
        },
        {
          heading: 'Status',
          content: 'Shipped and live. Usable. Early.'
        },
        {
          heading: 'What’s next',
          items: [
            'Validate whether this snapshot format is actually useful for manual filtering',
            'Validate whether it is useful for bots (Clawdbot-style)',
            'Test early-stage discovery without chart addiction'
          ]
        },
        {
          heading: 'If you want, next we can',
          items: [
            'Write Experiment #3 (Scan feed / agent API)',
            'Tighten the wording even more (more austere / more technical)',
            'Turn this into a pinned README-style “what this is / isn’t” page'
          ]
        },
        {
          heading: 'Big picture',
          content: 'This is a real product now. Not finished, but coherent.'
        }
      ]
    },
    {
      id: 3,
      title: 'Experiment #3 — Smart Wallet Feed (v1)',
      date: '2026-02-09',
      sections: [
        {
          heading: 'What shipped',
          items: [
            'Shipped `/smart` as a two-column discovery view: wallet leaderboard on the left, top bought tokens on the right.',
            'Added `/api/smart-wallets` with wallet and token aggregates for both UI and bot consumers.',
            'Added 5-minute refresh + stale-while-revalidate caching and a manual refresh action.'
          ]
        },
        {
          heading: 'Why',
          content: 'Copy/paste-only flow created too much friction. This tests whether a passive discovery surface improves daily usage and gives agents a reliable candidate generator.'
        },
        {
          heading: 'How it works',
          items: [
            'Reads a curated wallet set from `data/smart-wallets.json`.',
            'Pulls wallet activity from Solana RPC (Helius if configured) and falls back to holdings when transaction parsing is sparse.',
            'Aggregates to `topWallets` and `topMints` with wallet overlap, buy counts, and sampled SOL net flow.',
            'Enriches top mints using Dexscreener metadata (name, symbol, liquidity, volume, 24h change, pair URL).',
            'Exposes one response contract via `/api/smart-wallets` and protects refresh via `/api/smart-wallets/refresh` + `CRON_SECRET`.',
            'UI auto-polls and stays responsive even when upstream calls are slow through stale-cache delivery.'
          ]
        },
        {
          heading: 'What it is NOT',
          items: [
            'Not a copy-trading engine.',
            'Not a guaranteed PnL oracle.',
            'Not real-time tick streaming.'
          ]
        },
        {
          heading: 'Known limitations',
          items: [
            'PnL is a sampled proxy (recent SOL net flow), not a full realized/unrealized ledger.',
            'Coverage depends on RPC limits and wallet behavior complexity.',
            'Token metadata quality depends on available Dexscreener pairs.',
            'Current feed is near-real-time via polling/caching, not websocket streaming.'
          ]
        },
        {
          heading: 'Next step',
          content: 'Add an incremental events endpoint (`/api/smart-wallets/events?since=...`) so bots can consume deltas instead of full snapshots.'
        },
        {
          heading: 'Link(s)',
          items: [
            '/smart',
            '/api/smart-wallets',
            '/api/smart-wallets/refresh'
          ]
        }
      ]
    },
    {
      id: 4,
      title: 'Experiment #4 — Trencher UX + Intel Routing (v1.1)',
      date: '2026-02-09',
      sections: [
        {
          heading: 'What shipped',
          items: [
            'Added shared navigation so moving between Build Log, Discover, Smart Wallets, Intel, Submit, and API Docs is one click.',
            'Reworked Intel actions to use `Buy Now` (platform chooser) plus `Copy CA` instead of raw market links.',
            'Integrated GMGN chart embed on Intel, plus token image and socials metadata rendering when available.',
            'Expanded Submit with clear process panels (fee, requirements, flow, treasury destination, and post-submit behavior).',
            'Added duplicate-submit guard: if mint already exists, user is routed to `/intel?mint=...` instead of paying fee again.',
            'Added post-submit share flow that generates a copyable Intel link for voting/discussion.',
            'Added brand mark as favicon and header logo, and replaced default wallet button look with project-matched styling.'
          ]
        },
        {
          heading: 'Why',
          content: 'Navigation friction and dead-end token pages were slowing usage. The goal was to make Intel usable as a decision surface: inspect token, open a trader destination, or copy contract address quickly.'
        },
        {
          heading: 'How it works',
          items: [
            'Top navigation is rendered globally in layout so all pages keep the same route model and wallet actions.',
            'Intel `Buy Now` uses a dropdown with platform links (GMGN, FOMO, Axiom, Photon, BullX, Dexscreener if present).',
            'GMGN chart is embedded directly with mint + interval params; interval tabs remap to provider-supported chart periods.',
            'Token identity now includes optional socials (`website`, `twitter`, `telegram`) and image fallback enrichment from Jupiter token metadata when Dex data is incomplete.',
            'Search logging now accepts resolved mint from symbol/name matches so search-interest metrics can accumulate even when user input is not a raw mint.',
            'Submit challenge/confirm APIs check existing submissions and return `token_already_submitted` to stop repeated token spam.',
            'Submit UI handles that response by redirecting to Intel so users can vote/discuss instead of re-submitting.',
            'Discover and token snapshots remain cached (KV-backed when configured) to reduce repeated provider/RPC calls.',
            'Intel no-mint state now shows a functional explainer with quick examples and expected workflow.'
          ]
        },
        {
          heading: 'What it is NOT',
          items: [
            'Not a prediction engine.',
            'Not guaranteed chart coverage for every token pair.',
            'Not execution/copy-trading automation.'
          ]
        },
        {
          heading: 'Known limitations',
          items: [
            'GMGN embed availability can vary by browser/session and token support.',
            'Some tokens still have missing logos/socials if neither Dex metadata nor Jupiter metadata contains them.',
            'Without Postgres + KV configured, persistence and cache durability fall back to in-memory behavior.',
            'Platform deep links are best-effort and can change when third-party route formats change.',
            'FOMO currently links through referral landing; direct mint deep-linking depends on platform URL support.'
          ]
        },
        {
          heading: 'Next step',
          content: 'Add a deploy-time health check (`/api/health`) that reports Postgres/KV/Helius status so infra readiness is visible before usage.'
        },
        {
          heading: 'Link(s)',
          items: [
            '/build-log',
            '/discover',
            '/intel',
            '/smart',
            '/submit',
            '/api/ui/submit/challenge',
            '/api/ui/submit/confirm',
            '/api/ui/token?chain=solana&mint=<mint>'
          ]
        }
      ]
    }
  ];

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return entries;

    return entries.filter((entry) => {
      const haystack = [
        entry.title,
        entry.date,
        ...entry.sections.map((section) => section.heading),
        ...entry.sections
          .map((section) => section.content || '')
          .filter(Boolean),
        ...entry.sections.flatMap((section) => section.items || []),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [entries, searchQuery]);

  useEffect(() => {
    if (filteredEntries.length === 0) {
      setOpenEntryId(null);
      return;
    }
    if (!filteredEntries.some((entry) => entry.id === openEntryId)) {
      setOpenEntryId(filteredEntries[0].id);
    }
  }, [filteredEntries, openEntryId]);

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

        <div className="mb-8 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <label htmlFor="log-search" className="text-xs uppercase tracking-widest text-muted-foreground">
              Search logs
            </label>
            <p className="text-xs text-muted-foreground">
              Showing {filteredEntries.length} of {entries.length}
            </p>
          </div>
          <input
            id="log-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by keyword, topic, endpoint, experiment..."
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
          />
        </div>

        <div className="space-y-4 mb-12">
          {filteredEntries.map((entry) => {
            const isOpen = openEntryId === entry.id;
            return (
            <article 
              key={entry.id}
              className="rounded-lg border border-border bg-card/40"
            >
              <button
                type="button"
                onClick={() => setOpenEntryId(isOpen ? null : entry.id)}
                className="w-full text-left px-4 py-4 border-b border-border/50 hover:bg-card/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <time className="text-xs text-muted-foreground uppercase tracking-widest">
                      {new Date(entry.date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </time>
                    <h2 className="text-lg md:text-xl font-semibold mt-2">
                      {entry.title}
                    </h2>
                  </div>
                  <span className="font-mono text-xs text-foreground/70 border border-border rounded px-2 py-1">
                    {isOpen ? '[-]' : '[+]'}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="space-y-6 px-4 py-4">
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
              )}
            </article>
            );
          })}
          {filteredEntries.length === 0 && (
            <div className="rounded-lg border border-border bg-card/30 px-4 py-6 text-sm text-muted-foreground">
              No logs matched your search.
            </div>
          )}
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
