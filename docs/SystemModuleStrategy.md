# System Module Strategy – Crypto & Traditional Asset Manager

> Goal:  
> Build a modular, loosely coupled system that:
>
> - Tracks **crypto + traditional assets** (e.g. Rakuten Securities).
> - Computes **statistics & performance**.
> - Eventually runs **automatic DCA / rebalancing**.
> - Supports **auth/authz** in later phases.

---

## 0. Design Principles

- **Low coupling, high cohesion**
  - Data ingestion, storage, analytics, execution, presentation = separate modules.
- **Unidirectional dependencies**
  - `Ingestion → Storage → Analytics → Portfolio → Execution → Presentation`
- **Analytics ≠ Visualization**
  - Statistics & performance live in **Analytics**.
  - UI only **reads** and renders data.
- **Crypto & traditional assets unified**
  - Common `Asset` / `Account` / `Position` / `Transaction` model.

---

## 1. Ingestion Layer (Data Fetching & Import)

### 1.1 `CryptoMarketDataFetcher`

**Responsibility**

- Fetch OHLCV (e.g. daily candles) for crypto assets from exchanges (e.g. via CCXT).
- Normalize data into a canonical format and push into storage.

**Notes**

- No dependency on analytics or UI.
- Only cares about “symbol, timeframe, OHLCV”.

---

### 1.2 `TraditionalMarketDataFetcher` (High Priority)

**Responsibility**

- Fetch price data (stocks, ETFs, mutual funds, FX, etc.) from traditional data sources  
  (Rakuten Securities, Yahoo Finance, etc.).
- Normalize to the same OHLCV schema as crypto.

**Notes**

- Enables a unified analytics layer over crypto + traditional assets.
- Can start with CSV/manual import if no API is available.

---

### 1.3 `HoldingsCollectorCrypto`

**Responsibility**

- Fetch **current balances** from:
  - CEX accounts (via API).
  - On-chain wallets (via chain explorers or node APIs).
- Save results into `positions` (per account, per asset, quantity).

**Notes**

- Does _not_ compute valuations or P&L; only quantity & location.

---

### 1.4 `HoldingsCollectorTraditional` (High Priority)

**Responsibility**

- Fetch **current holdings** from Rakuten Securities and other brokers:
  - Symbols, quantities, cash balances.
- Store in `positions` with account references.

**Notes**

- Implementation may be:
  - API (if available).
  - CSV export adapter.
  - Scraping as a last resort (wrapped behind a clean interface).

---

### 1.5 `TransactionImporterCSV`

**Responsibility**

- Import trade & cashflow history from CSVs (crypto exchanges, brokers, apps).
- Normalize into a canonical `transactions` schema:
  - timestamp, account, asset (from/to), quantity, price, fees, type (buy/sell/deposit/withdraw/transfer).

**Notes**

- Handles CSV quirks per source (headers, date formats, decimals) as adapters.
- Upstream modules never deal with raw CSV formats.

---

## 2. Storage Layer (Core Data & Models)

### 2.1 `CoreDataStore`

**Responsibility**

- Define and manage persistent schemas:
  - `assets`, `accounts`, `positions`, `transactions`, `ohlcv`, `fx_rates`, etc.
- Provide repository-style APIs:
  - Query methods for upper layers (e.g. `get_positions()`, `get_ohlcv(asset, timeframe)`).

**Notes**

- Central write point to DB (SQLite/Postgres, etc.).
- Higher layers interact only through this API, not raw SQL.

---

### 2.2 `AssetModel` & `AccountModel`

**Responsibility**

- Model **all assets** (crypto, stocks, funds, cash, stablecoins, etc.) with a unified abstraction:
  - `Asset`: id, symbol, type (crypto, equity, fund, cash, etc.), currency, metadata.
- Model **all accounts** (CEX, wallets, brokers, banks) uniformly:
  - `Account`: id, provider type, name, metadata.

**Notes**

- Enables generic portfolio logic: “operate on Asset/Account”, not “if crypto else”.

---

## 3. Analytics Layer (Statistics & Performance)

> This layer handles **calculation only**.  
> UI, strategy, and execution just consume its outputs.

### 3.1 `TimeSeriesStatisticsEngine`

**Responsibility**

- Given price / value time series, compute:
  - Returns, cumulative returns.
  - Mean return, variance, standard deviation (volatility).
  - Correlations between assets / portfolios.
  - Drawdowns and max drawdown.

**Notes**

- Input: arrays/DataFrames (from `CoreDataStore`).
- Output: pure numeric/statistical results (DTOs, not views).

---

### 3.2 `PerformanceMetricsEngine`

**Responsibility**

- Given transactions + valuation series, compute:
  - Win rate.
  - Average R/R (risk-reward).
  - Profit factor.
  - Sharpe ratio (and potentially Sortino, etc.).

**Notes**

- Uses common formulas; independent from visualization.
- Reused for:
  - Backtests.
  - Live performance summaries.

---

### 3.3 `PortfolioBacktestEngine`

**Responsibility**

- Run simulations over historical data using **strategy rules**:
  - e.g. weekly rebalance, monthly DCA, target allocations.
- Produce simulated portfolio value series and performance metrics.

**Notes**

- Purely historical; no real orders.
- Integration with `TimeSeriesStatisticsEngine` & `PerformanceMetricsEngine`.

---

## 4. Portfolio Layer (Aggregation & Allocation Logic)

### 4.1 `PortfolioSnapshotBuilder` (High Priority)

**Responsibility**

- Build a **point-in-time snapshot** of total wealth:
  - Aggregate `positions` across all accounts.
  - Use latest prices (crypto + traditional) and FX rates.
  - Compute per-asset, per-asset-class, per-account values and weights.

**Notes**

- Core for “What do I own right now?”.
- Inputs: `positions`, `ohlcv`/latest prices, `fx_rates`.

---

### 4.2 `AllocationAnalyzer`

**Responsibility**

- Compare current portfolio snapshot to **target allocations**:
  - e.g. `crypto 30% / equities 50% / cash 20%`.
- Identify overweight / underweight segments.

**Notes**

- Does _not_ plan specific trades.
- Outputs “delta vs target” in value/percentage by asset class or group.

---

### 4.3 `RebalancePlanner` (Later)

**Responsibility**

- Convert allocation deltas into **concrete rebalance plans**:
  - Which asset to buy/sell, how much, in which account.
- Consider:
  - Transaction costs (fees, spreads).
  - Tax assumptions (simple model at first).
  - Minimum trade sizes.

**Notes**

- Produces an **order proposal list**, not real orders.
- Execution layer decides if/when to actually place them.

---

## 5. Execution Layer (Automated Trading & Scheduling)

> Planned for later phases, after analytics & asset visibility are solid.

### 5.1 `OrderBuilder`

**Responsibility**

- Transform rebalance / DCA plans into **exchange-specific order objects**:
  - Side, quantity, price, order type (market/limit), symbol format, etc.

**Notes**

- Can run in:
  - **Dry-run mode** (log-only).
  - **Live mode** (ready for sending).

---

### 5.2 `ExecutionAdapter`

**Responsibility**

- Send orders to exchanges/brokers (e.g. via CCXT or broker API).
- Track order statuses:
  - New, partially filled, filled, canceled, error.

**Notes**

- Abstracts provider-specific APIs and error handling.
- Updates `transactions` / `positions` via `CoreDataStore`.

---

### 5.3 `JobScheduler`

**Responsibility**

- Schedule recurring jobs:
  - Daily price ingestion.
  - Weekly rebalance calc.
  - Monthly DCA execution.
- Trigger appropriate layer operations at defined times.

**Notes**

- Could start with simple `cron`, later move to a task queue (Celery, Temporal, etc.).

---

## 6. Presentation Layer (UI & Reporting)

> Purely **read-only** against lower layers (plus user actions → strategy config).

### 6.1 `DashboardUI`

**Responsibility**

- Display:
  - Portfolio snapshot (total value, allocations, per-account breakdown).
  - Time series charts (portfolio value, P&L).
  - Metrics from analytics (volatility, Sharpe, etc.).
- Expose simple controls for:
  - Changing target allocations.
  - Triggering backtests.
  - Switching between views (crypto-only, traditional-only, combined).

**Notes**

- Should call APIs that wrap Analytics & Portfolio, not do math itself.

---

### 6.2 `ReportGenerator & Exporter`

**Responsibility**

- Generate:
  - CSV/Excel exports for transactions, positions, performance.
  - Optional PDF/HTML summaries for periods (e.g. monthly report).

**Notes**

- Acts as an adapter from internal models → external formats.
- Supports integration with other tools (tax, spreadsheets, etc.).

---

## 7. Security Layer (Authentication & Authorization) – Later Phase

> This layer wraps access to all “user-dependent” operations and data.

### 7.1 `AuthService` (Authentication)

**Responsibility**

- Handle user identity:
  - Sign-up / login (password, OAuth, etc.).
  - Session / token management (JWT, session cookies).
- Bind users to:
  - Accounts, API keys, strategy configs, dashboards.

**Notes**

- All APIs that expose personal data or trigger actions must require a valid identity.
- Can start as a single-user/local mode, then expand to multi-user auth.

---

### 7.2 `AuthorizationService` (RBAC / Permissions)

**Responsibility**

- Define what each user (or role) can do:
  - Read-only vs read/write.
  - Access to specific accounts, strategies, or API keys.
- Enforce access control on:
  - Portfolio views.
  - Strategy configurations.
  - Execution operations (placing orders).

**Notes**

- Internally, a simple Role-Based Access Control (RBAC) is likely enough:
  - E.g. `admin`, `self`, `read_only`.
- Integrates with API layer and UI (e.g. hiding buttons user can’t use).

---

### 7.3 `SecretManager`

**Responsibility**

- Securely store and retrieve:
  - Exchange API keys.
  - Broker credentials.
  - Possibly encryption keys for local DB.

**Notes**

- Ensures secrets are never stored in plain text in source control.
- May leverage:
  - Local encrypted storage for dev.
  - Cloud KMS (if deployed to cloud later).

---

## 8. Phase Priorities

### Phase 1 – **Visibility First (High Priority on Traditional Assets)**

- Implement:
  - `CryptoMarketDataFetcher`
  - `TraditionalMarketDataFetcher`
  - `HoldingsCollectorCrypto`
  - `HoldingsCollectorTraditional`
  - `TransactionImporterCSV`
  - `CoreDataStore` + `AssetModel` / `AccountModel`
  - `PortfolioSnapshotBuilder`
- Minimal analytics:
  - Simple value time series + basic stats (e.g. daily returns, basic volatility).

### Phase 2 – **Analytics & Decision Support**

- Implement:
  - `TimeSeriesStatisticsEngine`
  - `PerformanceMetricsEngine`
  - `PortfolioBacktestEngine`
  - `AllocationAnalyzer`
  - `DashboardUI`
  - `ReportGenerator & Exporter`

### Phase 3 – **Automation & Auth**

- Implement:
  - `RebalancePlanner`
  - `OrderBuilder`
  - `ExecutionAdapter`
  - `JobScheduler`
  - `AuthService`, `AuthorizationService`, `SecretManager`

---
