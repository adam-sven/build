CREATE TABLE IF NOT EXISTS smart_snapshots (
  scope TEXT PRIMARY KEY,
  snapshot_json JSONB NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  wallet_count INT NOT NULL DEFAULT 0,
  top_wallet_count INT NOT NULL DEFAULT 0,
  top_mint_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS smart_wallet_pnl_hourly (
  bucket_at TIMESTAMP NOT NULL,
  wallet TEXT NOT NULL,
  realized_pnl_sol DOUBLE PRECISION NOT NULL DEFAULT 0,
  unrealized_pnl_sol DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_pnl_sol DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_basis_sol DOUBLE PRECISION NOT NULL DEFAULT 0,
  current_value_sol DOUBLE PRECISION NOT NULL DEFAULT 0,
  closed_trades INT NOT NULL DEFAULT 0,
  winning_trades INT NOT NULL DEFAULT 0,
  buy_count INT NOT NULL DEFAULT 0,
  unique_mints INT NOT NULL DEFAULT 0,
  tx_count INT NOT NULL DEFAULT 0,
  win_rate DOUBLE PRECISION NULL,
  price_coverage_pct DOUBLE PRECISION NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bucket_at, wallet)
);

CREATE INDEX IF NOT EXISTS smart_wallet_pnl_wallet_bucket_idx
  ON smart_wallet_pnl_hourly (wallet, bucket_at DESC);
