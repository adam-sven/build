CREATE TABLE IF NOT EXISTS tokens (
  mint TEXT NOT NULL,
  chain TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  first_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  peak_rank INT NOT NULL DEFAULT 0,
  peak_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  peak_upvotes_24h INT NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (mint, chain)
);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY,
  chain TEXT NOT NULL,
  mint TEXT NOT NULL,
  voter TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('up','down')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  fee_tx_sig TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS votes_chain_mint_created_idx ON votes (chain, mint, created_at DESC);
CREATE INDEX IF NOT EXISTS votes_chain_voter_created_idx ON votes (chain, voter, created_at DESC);

CREATE TABLE IF NOT EXISTS vote_aggregates (
  chain TEXT NOT NULL,
  mint TEXT NOT NULL,
  up_24h INT NOT NULL DEFAULT 0,
  down_24h INT NOT NULL DEFAULT 0,
  score_24h INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain, mint)
);

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY,
  chain TEXT NOT NULL,
  mint TEXT NOT NULL,
  submitter TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  fee_tx_sig TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS submissions_chain_created_idx ON submissions (chain, created_at DESC);

CREATE TABLE IF NOT EXISTS searches (
  id UUID PRIMARY KEY,
  chain TEXT NOT NULL,
  query TEXT NOT NULL,
  resolved_mint TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS searches_chain_resolved_created_idx ON searches (chain, resolved_mint, created_at DESC);

CREATE TABLE IF NOT EXISTS api_keys (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP NULL
);
