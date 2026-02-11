# Trencher

Trencher is an explainable token discovery app (Solana-first, multichain-ready) focused on fair ranking:

- votes (24h, can be negative)
- market quality
- search interest
- small risk penalty when confidence is high

No pay-to-boost. No prediction framing.

## Stack

- Next.js App Router + TypeScript
- Tailwind + shadcn/ui
- Solana wallet adapter
- Vercel KV (cache, nonce, limits, locks)
- Vercel Postgres (durable storage), with KV/in-memory fallback adapter

## Env vars

```bash
TREASURY_PUBKEY=CSJc1VcNJUHJHj199sVSa8XJ66rvEpf4sHbpeQj7N6vA
VOTE_FEE_LAMPORTS=1000000
SUBMIT_FEE_LAMPORTS=10000000
HELIUS_API_KEY=
RPC_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
CRON_SECRET=
LIVE_TICK_SECRET=
HELIUS_WEBHOOK_SECRET=
REDIS_URL=
REDIS_TLS=true
API_KEYS=key1,key2
INTERNAL_API_KEY=
SMART_REFRESH_MS=7200000
SMART_SIGNATURES_LIMIT=120
SMART_MAX_TX_PER_WALLET=80
SMART_RPC_CONCURRENCY=3
SMART_LOW_CREDIT_MODE=false
SMART_ENABLE_HOLDINGS_FALLBACK=true
SMART_TOKEN_METADATA_LIMIT=80
SMART_TOKEN_METADATA_CONCURRENCY=8
SMART_CACHE_TTL_MS=600000
SMART_HYDRATE_TTL_MS=120000
SMART_USE_WEBHOOK_EVENTS=true
SMART_EVENT_TTL_SEC=86400
SMART_EVENT_SNAPSHOT_TTL_SEC=1200
HOLDER_STATS_TTL_MS=900000
HOLDER_COUNT_MAX_PAGES=3
DISCOVER_MIN_LIQUIDITY_USD=12000
DISCOVER_MIN_VOLUME_24H_USD=40000
DISCOVER_MIN_TX_24H=80
NEXT_PUBLIC_RPC_URL=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_TREASURY_PUBKEY=CSJc1VcNJUHJHj199sVSa8XJ66rvEpf4sHbpeQj7N6vA
NEXT_PUBLIC_VOTE_FEE_LAMPORTS=1000000
NEXT_PUBLIC_SUBMIT_FEE_LAMPORTS=10000000
```

### Low-credit mode (Helius cost saver)

Set:

```bash
SMART_LOW_CREDIT_MODE=true
```

This changes defaults to cheaper values unless you explicitly override env vars:

- fewer signatures per wallet scan
- fewer transactions parsed per wallet
- lower RPC concurrency
- lower token metadata fanout
- holdings fallback disabled by default
- slower smart refresh cadence
- holder stats cached longer, fewer holder pages scanned

Recommended starting overrides with low-credit mode:

```bash
SMART_SIGNATURES_LIMIT=30
SMART_MAX_TX_PER_WALLET=12
SMART_RPC_CONCURRENCY=1
SMART_REFRESH_MS=21600000
HOLDER_COUNT_MAX_PAGES=1
HOLDER_STATS_TTL_MS=3600000
```

## Database migration

Run SQL from:

- `db/migrations/0001_trencher.sql`

## API

Public agent endpoints (require `X-API-Key`):

- `GET /api/token?chain=solana&mint=<mint>`
- `GET /api/discover?mode=trending|new|voted|quality&chain=solana`
- `GET /api/vote/challenge?...`
- `POST /api/vote/submit`
- `GET /api/votes?mint=<mint>&chain=solana`
- `GET /api/submit/challenge?...`
- `POST /api/submit/confirm`
- `POST /api/search/log`
- `GET /api/docs`

UI proxy endpoints:

- `/api/ui/*`

Ops endpoint:

- `GET /api/ops/cache-health`
- Uses `OPS_SECRET` (or `LIVE_TICK_SECRET`) when configured.

Cron endpoint (protected):

- `GET /api/cron/refresh`
- Header: `Authorization: Bearer $CRON_SECRET`

## Vercel Cron

`vercel.json` runs refresh every 2 minutes:

- `*/2 * * * *` on `/api/cron/refresh`

## Always-on Live Feed (no cron)

For GMGN-style continuous updates, run an always-on worker that hits `/api/live/tick`:

1. Set env on Vercel:
- `LIVE_TICK_SECRET=<random-long-secret>`
- `REDIS_URL=rediss://default:<password>@<host>:<port>`
- `REDIS_TLS=true`

2. Worker env (Railway/Fly/Render/VM):
- `LIVE_APP_URL=https://your-domain.com`
- `LIVE_TICK_SECRET=<same-secret-as-vercel>`
- `LIVE_INTERVAL_MS=12000`
- `LIVE_SCOPE=all`
- `LIVE_CHAIN=solana`

3. Start worker:

```bash
pnpm worker:live
```

The worker is lightweight and refreshes shared Redis cache behind a lock, so all users read the same hot data without per-user heavy RPC spikes.

## Helius webhook ingest (recommended)

Use Helius Enhanced Webhooks to push wallet events into Trencher so smart-wallet data is driven by event ingest, not repeated wallet polling.

1. Set env:
- `HELIUS_WEBHOOK_SECRET=<long-random-secret>`
- `SMART_USE_WEBHOOK_EVENTS=true`

2. In Helius, create webhook URL:

```text
https://your-domain.com/api/ingest/helius?secret=<HELIUS_WEBHOOK_SECRET>
```

3. Webhook endpoint:
- `POST /api/ingest/helius`
- Also supports `Authorization: Bearer <HELIUS_WEBHOOK_SECRET>` if you prefer header auth.

4. Result:
- Incoming events are stored in Redis.
- Smart-wallet snapshot is rebuilt from event stream and served from cache.
- RPC polling remains as fallback only if webhook snapshot is empty.

## Pages

- `/discover`
- `/submit`
- `/intel?mint=<mint>`
- `/api-docs`

## Manual test plan

1. Open `/discover`, switch modes, confirm rows and reasons render.
2. Search a mint in `/discover`; ensure `/api/ui/search/log` records and route to `/intel` works.
3. Open `/intel?mint=<mint>` and switch intervals.
4. Connect wallet and cast vote from `/discover` or `/intel`:
   - sign challenge
   - send exact 0.001 SOL treasury transfer
   - verify count updates
5. Submit from `/submit`:
   - sign challenge
   - send exact 0.01 SOL transfer
   - route to `/intel`.
6. Agent call with API key:

```bash
curl -H 'X-API-Key: <key>' 'http://localhost:3000/api/discover?mode=trending&chain=solana'
```

7. Ensure no-key calls to `/api/discover` fail with `api_key_missing`.
8. Trigger cron manually:

```bash
curl -H 'Authorization: Bearer <CRON_SECRET>' 'http://localhost:3000/api/cron/refresh'
```

## Notes

- Social is intentionally `coming soon` in v1.
- Signals are shown as `unknown` until confidence is high enough.
- This is an attention filter, not financial advice.
