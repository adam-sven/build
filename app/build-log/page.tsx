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
  const [openEntryId, setOpenEntryId] = useState<number | null>(11);

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
      id: 11,
      title: 'Experiment #11 — UX Hardening + 24h PnL Window + Hot-Mint Fast Lane (v1.8)',
      date: '2026-02-11',
      sections: [
        {
          heading: 'What shipped',
          items: [
            'Added strict rolling 24h filter for Smart Wallet PnL computation (`SMART_PNL_WINDOW_SEC`).',
            'Added hot-mint fast lane refresh in Smart Wallet API so top tracked tokens react faster to rug/volatility moves.',
            'Aligned Dashboard Top Traders with Smart Wallet filtering logic so both surfaces show consistent wallet sets.',
            'Added full-site animated market-cap tickers and a clickable live terminal status panel in the bottom-right badge.',
            'Improved mobile header/search layout (wallet/menu/search controls no longer overlap).',
            'Removed global max-width caps on core Trencher pages to use full available width.'
          ]
        },
        {
          heading: 'Why',
          content: 'Users reported inconsistent trader lists between pages, stale-looking token reactions during fast rug events, and cramped/overlapping controls on mobile. This update focused on trust in metrics + responsive UI clarity + faster perceived market updates.'
        },
        {
          heading: 'How it works',
          items: [
            'Smart wallet transaction parsing now skips wallet transactions older than `now - SMART_PNL_WINDOW_SEC` before PnL aggregation.',
            'Hot lane refreshes top N Smart Wallet mints using Dexscreener token batches with short TTL, updating MC/liq/vol/change without forcing heavier wallet-RPC recomputation.',
            'Dashboard trader panel now reuses the same identity/activity filter semantics as Smart Wallet leaderboard.',
            'Live status badge now records rolling poll lines (latency + age) and exposes a terminal-style panel for quick health checks.',
            'Global layout now keeps a single clear mobile control row and full-width content containers across dashboard/discover/smart/intel.'
          ]
        },
        {
          heading: 'What it is NOT',
          items: [
            'Not full trade-ledger accounting for every high-frequency wallet.',
            'Not sub-second tick streaming for all mints.',
            'Not complete elimination of provider-lag when upstream endpoints are degraded.'
          ]
        },
        {
          heading: 'Known limitations',
          items: [
            'PnL remains sample-bounded by signature/transaction caps per wallet under extreme volume.',
            'Fast lane improves top-mint reaction speed but still depends on external market-data freshness.',
            'Named/social-only leaderboard mode intentionally hides unidentified wallets from default view.'
          ]
        },
        {
          heading: 'Next step',
          content: 'Add explicit leaderboard mode toggles (`named only` vs `all active`) and expose a snapshot diagnostics row (tracked/active/shown/recent-events) directly in Smart Wallet header.'
        },
        {
          heading: 'Link(s)',
          items: [
            '/smart',
            '/dashboard',
            '/discover',
            '/api/smart-wallets',
            '/api/ui/live-status',
            'lib/smart-wallets.ts',
            'app/api/smart-wallets/route.ts'
          ]
        }
      ]
    },
    {
      id: 10,
      title: 'Experiment #10 — Webhook Health + Smart Token Meta Fill (v1.7)',
      date: '2026-02-10',
      sections: [
        {
          heading: 'What shipped',
          items: [
            'Added webhook health endpoint for Helius ingest visibility.',
            'Extended Smart Wallet token metadata pipeline with market cap / FDV propagation.',
            'Added Dex search fallback in market provider to reduce Intel cards with missing market fields.'
          ]
        },
        {
          heading: 'Why',
          content: 'The system needed an explicit way to verify webhook ingestion and a stronger metadata path so Smart Wallet and Intel views show fewer blank market fields during provider lag.'
        },
        {
          heading: 'How it works',
          items: [
            '`/api/ingest/helius/health` returns event count, last ingest time/count, and snapshot freshness stats.',
            'Webhook ingest now stores last-ingest metrics in Redis/KV for operational checks.',
            'Top-mint token objects now include `marketCapUsd` and `fdvUsd` through ingest + API hydration.',
            'Smart Wallet top-token UI now prints market cap directly in list + expanded panel.',
            'Dex provider now tries `/latest/dex/search` when token endpoint is empty.'
          ]
        },
        {
          heading: 'What it is NOT',
          items: [
            'Not full exchange-grade tick reconstruction.',
            'Not guaranteed full metadata for every fresh mint instantly.'
          ]
        },
        {
          heading: 'Known limitations',
          items: [
            'Some mints still have sparse data when all upstreams return null simultaneously.',
            'Native chart still depends on available OHLC stream depth for the selected pool/interval.'
          ]
        },
        {
          heading: 'Next step',
          content: 'Add webhook-status badge in Smart Wallet header and backfill-only queue for unresolved mints so missing fields are retried in the background.'
        },
        {
          heading: 'Link(s)',
          items: [
            '/api/ingest/helius/health',
            '/api/smart-wallets',
            '/smart',
            '/intel'
          ]
        }
      ]
    },
    {
      id: 9,
      title: 'Experiment #9 — Live Worker + Redis Pipeline (v1.6)',
      date: '2026-02-10',
      sections: [
        {
          heading: 'What shipped',
          items: [
            'Moved refresh workload to an always-on live worker path and confirmed stable `updated/fresh/locked` tick behavior.',
            'Added Redis-backed shared cache + lock flow for feed and smart-wallet freshness.',
            'Added Helius webhook sync tooling so watched wallets can be managed without manual dashboard edits.'
          ]
        },
        {
          heading: 'Why',
          content: 'Polling from user page-loads created bursty latency and unnecessary RPC burn. This iteration tests a warm-cache pipeline: one updater, many readers.'
        },
        {
          heading: 'How it works',
          items: [
            'Worker calls `/api/live/tick` on interval using `LIVE_TICK_SECRET`.',
            'Tick endpoint acquires distributed lock in Redis before expensive refresh work.',
            'UI endpoints serve cached snapshots with stale-while-revalidate behavior.',
            'Webhook ingest stores wallet events for smart-wallet views and leaderboard derivation.',
            '`pnpm helius:sync-wallets` updates webhook wallet set from local tracked-wallet config.'
          ]
        },
        {
          heading: 'What it is NOT',
          items: [
            'Not a full real-time chain indexer.',
            'Not guaranteed complete metadata on every mint instantly.',
            'Not a replacement for dedicated chart terminals.'
          ]
        },
        {
          heading: 'Known limitations',
          items: [
            'Native OHLC remains sparse for some pairs; GMGN chart still needed as primary view in those cases.',
            'Wallet sampled PnL is directional and not a full accounting ledger.',
            'Webhook quality depends on wallet set + selected transaction types.'
          ]
        },
        {
          heading: 'Next step',
          content: 'Shift Discover candidate generation to webhook/event deltas first, with strict quality gates before any fallback scans.'
        },
        {
          heading: 'Link(s)',
          items: [
            '/api/live/tick',
            '/api/ingest/helius',
            '/smart',
            'scripts/live-worker.mjs',
            'scripts/helius-sync-webhook.mjs'
          ]
        }
      ]
    },
    {
      id: 8,
      title: 'Experiment #8 — Live Pipeline Hardening + Feed Quality Gates (v1.5)',
      date: '2026-02-09',
      sections: [
        {
          heading: 'What shipped',
          items: [
            'Moved live refresh into an always-on worker path with lock-protected `/api/live/tick` calls.',
            'Connected Redis-backed shared cache/lock flow so all users read warm snapshots instead of forcing per-user refresh spikes.',
            'Tightened Discover quality defaults and reduced fallback candidate breadth to cut obvious rugs/dead pairs from default feed.'
          ]
        },
        {
          heading: 'Why',
          content: 'The app felt slow during cold loads and RPC usage was too bursty. This update tests a push/warm-cache model: one background refresh loop, many cheap readers.'
        },
        {
          heading: 'How it works',
          items: [
            'Background worker calls `/api/live/tick?chain=solana&scope=all` on interval with `LIVE_TICK_SECRET` auth.',
            'Live tick uses Redis NX lock to prevent duplicate expensive refreshes (`reason=fresh/locked/updated`).',
            'Discover refreshes are mode-specific by staleness window (`trending` fastest, heavier modes slower).',
            'Smart-wallet refresh cadence default moved to 2-hour windows to reduce repeated sampled-PnL recalculation.',
            'Webhook ingest path now validates mints before persisting to avoid junk token rows in wallet-derived views.',
            'Intel native chart fallback now uses proper time-based x-axis points instead of mixed categorical labels.'
          ]
        },
        {
          heading: 'What it is NOT',
          items: [
            'Not a full-chain indexer.',
            'Not true tick-level websocket streaming.',
            'Not complete metadata coverage for every mint in all market states.'
          ]
        },
        {
          heading: 'Known limitations',
          items: [
            'If upstream providers return sparse OHLC, native chart still falls back to synthetic trend points.',
            'Wallet-token enrichment is still best-effort and can lag if third-party metadata endpoints throttle.',
            'Webhook quality depends on selecting the right transaction scope and watched addresses.'
          ]
        },
        {
          heading: 'Next step',
          content: 'Switch Discover candidate generation from broad scans to webhook/event deltas plus a small quality-qualified backfill set.'
        },
        {
          heading: 'Link(s)',
          items: [
            '/api/live/tick',
            '/api/ingest/helius',
            '/discover',
            '/smart',
            'scripts/live-worker.mjs'
          ]
        }
      ]
    },
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
    },
    {
      id: 5,
      title: 'Experiment #5 — Always-on live cache loop (v1.2)',
      date: '2026-02-09',
      sections: [
        {
          heading: 'What shipped',
          items: [
            'Added Redis-first cache/lock support through `REDIS_URL` so shared state is no longer limited to in-memory fallback.',
            'Shipped a protected live refresh endpoint (`/api/live/tick`) plus a Redis lock coordinator to prevent refresh stampedes.',
            'Shipped an always-on worker (`pnpm worker:live`) and deployed it on Railway to keep data hot without user-triggered refreshes.'
          ]
        },
        {
          heading: 'Why',
          content: 'Page freshness depended too much on user traffic. This experiment tests whether a continuous background updater can make the app feel live while keeping RPC usage controlled and predictable.'
        },
        {
          heading: 'How it works',
          items: [
            'Worker calls `/api/live/tick?chain=solana&scope=all` on a fixed interval (`LIVE_INTERVAL_MS`).',
            'Live tick acquires a Redis NX lock and refreshes discover/smart caches only when stale.',
            'When cache is still fresh, tick returns quickly with `reason=fresh` and skips expensive provider calls.',
            'When another process holds the lock, tick returns `reason=locked` and avoids duplicate refresh work.',
            'UI routes (`/api/ui/discover`, `/api/smart-wallets`) read shared cached snapshots so all users consume the same warm data.',
            'Security: live tick can require `LIVE_TICK_SECRET` via bearer auth for non-public background workers.'
          ]
        },
        {
          heading: 'What it is NOT',
          items: [
            'Not full websocket market streaming.',
            'Not direct DEX-level tick ingestion.',
            'Not a replacement for a dedicated indexer pipeline.'
          ]
        },
        {
          heading: 'Known limitations',
          items: [
            'First refresh cycle can still be slow if upstream providers are slow or cold.',
            'Metadata completeness depends on provider coverage (Dex/Jupiter/Helius availability per mint).',
            'Current system is near-real-time polling, not sub-second push updates.',
            'Secrets were rotated after setup due to manual testing exposure.'
          ]
        },
        {
          heading: 'Next step',
          content: 'Split refresh cadence by cost: refresh `trending` more frequently and defer heavier modes (`new/voted/quality`) to slower intervals to reduce latency spikes.'
        },
        {
          heading: 'Link(s)',
          items: [
            '/api/live/tick',
            '/discover',
            '/smart',
            '/dashboard',
            'scripts/live-worker.mjs'
          ]
        }
      ]
    },
    {
      id: 6,
      title: 'Experiment #6 — Feed latency + quality gates (v1.3)',
      date: '2026-02-09',
      sections: [
        {
          heading: 'What shipped',
          items: [
            'Split live refresh cadence by cost: `trending` refreshes fastest, while `new/voted/quality` refresh on slower intervals.',
            'Added stale feed fallback so Discover can return previous good data when a refresh lock is held or upstream providers are slow.',
            'Added stricter Discover eligibility gates (liq/vol/tx/h24 collapse checks) to reduce rugged/dead pairs in ranked output.'
          ]
        },
        {
          heading: 'Why',
          content: 'The page felt slow during cold refreshes and surfaced too many low-quality pairs. This update focuses on perceived speed and better default feed quality.'
        },
        {
          heading: 'How it works',
          items: [
            'Live refresh now tracks per-mode timestamps instead of refreshing all modes on every tick.',
            'Discover cache writes both fresh and stale snapshots; readers prefer fresh but fall back to stale if needed.',
            'Fallback candidate seeding now includes PumpSwap/Pump.fun-oriented queries and enforces minimum liq/vol/tx checks.',
            'Discover ranking now applies mode-specific eligibility filters before final list output.',
            'Dex/Jupiter metadata and chart fetches use tighter timeouts to prevent long blocking waits.',
            'Smart-wallet token metadata fetch now uses batched concurrency + local cache to reduce missing name/icon rows from provider throttling.'
          ]
        },
        {
          heading: 'What it is NOT',
          items: [
            'Not perfect rug detection.',
            'Not full tick-by-tick websocket indexing.',
            'Not guaranteed metadata coverage for every token mint.'
          ]
        },
        {
          heading: 'Known limitations',
          items: [
            'If a mint has no reliable pool/metadata source, it may still show as unknown in wallet-heavy views.',
            'Native chart quality still depends on third-party OHLC coverage per pool/interval.',
            'Quality gates are heuristic and will need periodic tuning as market conditions change.'
          ]
        },
        {
          heading: 'Next step',
          content: 'Add a dedicated pool-resolution layer (mint -> best pool map) persisted in Redis/Postgres so chart and metadata lookups are consistent across pages.'
        },
        {
          heading: 'Link(s)',
          items: [
            '/discover',
            '/dashboard',
            '/smart',
            '/api/ui/discover',
            '/api/live/tick'
          ]
        }
      ]
    },
    {
      id: 7,
      title: 'Experiment #7 — Helius webhook ingest + always-on worker (v1.4)',
      date: '2026-02-09',
      sections: [
        {
          heading: 'What shipped',
          items: [
            'Added secure webhook ingest endpoint `/api/ingest/helius` for pushed wallet activity events.',
            'Added Redis-backed event store + webhook-derived smart snapshot cache for Smart Wallets.',
            'Updated live tick path to prefer webhook snapshot refresh and use RPC polling only as fallback.',
          ]
        },
        {
          heading: 'Why',
          content: 'Polling many wallets directly against RPC was burning credits too fast. This update moves toward push-first ingestion so refreshes are cheaper and more stable under traffic.'
        },
        {
          heading: 'How it works',
          items: [
            'Helius webhook payloads are parsed into normalized buy events (`wallet`, `mint`, `signature`, `solDelta`, `blockTime`).',
            'Events are deduplicated and stored in Redis with TTL.',
            'Smart-wallet snapshot is rebuilt from stored events and cached in Redis for UI/API reads.',
            '`/api/smart-wallets` and `/api/smart-wallets/wallet/:wallet` now prefer webhook snapshot data first.',
            'Live worker (`pnpm worker:live`) keeps discover/smart caches warm and lock-protected without per-user refresh spikes.',
            'Endpoint supports `HELIUS_WEBHOOK_SECRET` via bearer header or `?secret=` query for provider integration.'
          ]
        },
        {
          heading: 'What it is NOT',
          items: [
            'Not full on-chain indexing of all Solana activity.',
            'Not guaranteed complete metadata for every fresh mint.',
            'Not sub-second websocket UX yet.'
          ]
        },
        {
          heading: 'Known limitations',
          items: [
            'If webhook is misconfigured or silent, system falls back to older polling path.',
            'Metadata/chart quality still depends on external market data provider coverage.',
            'Wallet PnL remains sampled proxy logic, not full accounting.'
          ]
        },
        {
          heading: 'Next step',
          content: 'Move discovery candidate generation to webhook-driven mint deltas so refresh cycles only score changed tokens instead of broad rescans.'
        },
        {
          heading: 'Link(s)',
          items: [
            '/api/ingest/helius',
            '/api/smart-wallets',
            '/api/live/tick',
            'scripts/live-worker.mjs'
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
