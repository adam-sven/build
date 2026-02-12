CREATE TABLE IF NOT EXISTS smart_wallet_trades (
  wallet TEXT NOT NULL,
  tx_signature TEXT NOT NULL,
  mint TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  amount_token DOUBLE PRECISION NOT NULL DEFAULT 0,
  sol_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  block_time TIMESTAMP NULL,
  snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (wallet, tx_signature, mint, side)
);

CREATE INDEX IF NOT EXISTS smart_wallet_trades_wallet_block_idx
  ON smart_wallet_trades (wallet, block_time DESC);

CREATE INDEX IF NOT EXISTS smart_wallet_trades_mint_block_idx
  ON smart_wallet_trades (mint, block_time DESC);
