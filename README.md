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
API_KEYS=key1,key2
INTERNAL_API_KEY=
NEXT_PUBLIC_RPC_URL=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_TREASURY_PUBKEY=CSJc1VcNJUHJHj199sVSa8XJ66rvEpf4sHbpeQj7N6vA
NEXT_PUBLIC_VOTE_FEE_LAMPORTS=1000000
NEXT_PUBLIC_SUBMIT_FEE_LAMPORTS=10000000
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

Cron endpoint (protected):

- `GET /api/cron/refresh`
- Header: `Authorization: Bearer $CRON_SECRET`

## Vercel Cron

`vercel.json` runs refresh every 2 minutes:

- `*/2 * * * *` on `/api/cron/refresh`

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
