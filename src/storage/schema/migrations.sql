-- Asset Manager Database Schema
-- Version: 1.0.0
-- Database: SQLite

-- Assets table: 資産マスターテーブル
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('crypto', 'stock', 'etf', 'mutual_fund', 'bond', 'commodity', 'cash', 'fx')),
    currency TEXT NOT NULL,
    decimals INTEGER NOT NULL DEFAULT 0,
    metadata TEXT, -- JSON string
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create unique index on symbol for faster lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_symbol ON assets(symbol);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
CREATE INDEX IF NOT EXISTS idx_assets_currency ON assets(currency);

-- Accounts table: アカウント管理テーブル
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL CHECK(provider IN ('binance', 'coinbase', 'kraken', 'bitflyer', 'sbi_securities', 'rakuten_securities', 'matsui_securities', 'metamask', 'hardware_wallet', 'manual', 'other')),
    type TEXT NOT NULL CHECK(type IN ('exchange', 'wallet', 'brokerage', 'bank', 'manual')),
    currency TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    api_credentials TEXT, -- JSON string (encrypted)
    metadata TEXT, -- JSON string
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for active accounts lookup
CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider);

-- Positions table: 現在のポジション保持テーブル
CREATE TABLE IF NOT EXISTS positions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    quantity TEXT NOT NULL, -- Decimal as string to avoid precision issues
    average_price TEXT, -- Cost basis per unit
    last_price TEXT, -- Current market price
    last_updated DATETIME NOT NULL,
    metadata TEXT, -- JSON string
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (asset_id) REFERENCES assets(id)
);

-- Ensure unique position per account-asset pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_account_asset ON positions(account_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_positions_asset ON positions(asset_id);
CREATE INDEX IF NOT EXISTS idx_positions_last_updated ON positions(last_updated);

-- Transactions table: 取引履歴テーブル
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('buy', 'sell', 'deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'dividend', 'interest', 'fee', 'split', 'merger', 'airdrop', 'staking_reward', 'other')),
    status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'failed', 'cancelled')) DEFAULT 'completed',
    quantity TEXT NOT NULL, -- Amount of asset
    price TEXT, -- Price per unit
    total_value TEXT, -- Total transaction value
    fee TEXT, -- Transaction fee
    fee_currency TEXT,
    timestamp DATETIME NOT NULL,
    external_id TEXT, -- Exchange/broker transaction ID
    related_transaction_id TEXT, -- For transfer pairs
    notes TEXT,
    metadata TEXT, -- JSON string
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (asset_id) REFERENCES assets(id),
    FOREIGN KEY (related_transaction_id) REFERENCES transactions(id)
);

-- Create indexes for transaction queries
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_asset ON transactions(asset_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(external_id);

-- OHLCV data table: 価格履歴テーブル
CREATE TABLE IF NOT EXISTS ohlcv_data (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    timeframe TEXT NOT NULL CHECK(timeframe IN ('1m', '5m', '15m', '30m', '1h', '4h', '6h', '12h', '1d', '3d', '1w', '1M')),
    timestamp DATETIME NOT NULL,
    open TEXT NOT NULL,
    high TEXT NOT NULL,
    low TEXT NOT NULL,
    close TEXT NOT NULL,
    volume TEXT NOT NULL,
    source TEXT, -- Exchange or data provider
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (asset_id) REFERENCES assets(id)
);

-- Ensure unique OHLCV entry per asset-timeframe-timestamp combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_ohlcv_unique ON ohlcv_data(asset_id, timeframe, timestamp);
CREATE INDEX IF NOT EXISTS idx_ohlcv_asset_timeframe ON ohlcv_data(asset_id, timeframe);
CREATE INDEX IF NOT EXISTS idx_ohlcv_timestamp ON ohlcv_data(timestamp);

-- Portfolio snapshots table: ポートフォリオスナップショットテーブル
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    total_market_value TEXT NOT NULL,
    total_cost_basis TEXT,
    total_unrealized_pnl TEXT,
    total_unrealized_pnl_percent TEXT,
    base_currency TEXT NOT NULL,
    assets_data TEXT NOT NULL, -- JSON string with asset breakdown
    allocation_by_type TEXT NOT NULL, -- JSON string
    allocation_by_account TEXT NOT NULL, -- JSON string
    metadata TEXT, -- JSON string
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index for timeline queries
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_timestamp ON portfolio_snapshots(timestamp);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_currency ON portfolio_snapshots(base_currency);

-- Migration metadata table: マイグレーション履歴
CREATE TABLE IF NOT EXISTS migration_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version TEXT NOT NULL,
    description TEXT NOT NULL,
    executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert initial migration record
INSERT OR IGNORE INTO migration_history (version, description) 
VALUES ('1.0.0', 'Initial schema creation');