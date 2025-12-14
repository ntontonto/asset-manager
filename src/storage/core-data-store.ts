import { DatabaseConnection } from './database/connection';
import {
  AccountRepository,
  AssetRepository,
  OHLCVRepository,
  PositionRepository,
  TransactionRepository,
} from './repositories';

export interface CoreDataStoreConfig {
  databasePath: string;
  readonly?: boolean;
  memory?: boolean;
}

/**
 * Core data store that provides unified access to all repositories
 */
export class CoreDataStore {
  private connection: DatabaseConnection;
  private _assets: AssetRepository;
  private _accounts: AccountRepository;
  private _positions: PositionRepository;
  private _transactions: TransactionRepository;
  private _ohlcv: OHLCVRepository;

  constructor(config: CoreDataStoreConfig) {
    this.connection = new DatabaseConnection({
      path: config.databasePath,
      readonly: config.readonly,
      memory: config.memory,
    });

    // Initialize repositories
    this._assets = new AssetRepository();
    this._accounts = new AccountRepository();
    this._positions = new PositionRepository();
    this._transactions = new TransactionRepository();
    this._ohlcv = new OHLCVRepository();
  }

  /**
   * Initialize the data store and connect to database
   */
  public async initialize(): Promise<void> {
    await this.connection.connect();

    const db = this.connection.getDatabase();

    // Set database reference for all repositories
    this._assets.setDatabase(db);
    this._accounts.setDatabase(db);
    this._positions.setDatabase(db);
    this._transactions.setDatabase(db);
    this._ohlcv.setDatabase(db);
  }

  /**
   * Close the data store connection
   */
  public close(): void {
    this.connection.close();
  }

  /**
   * Check if data store is connected
   */
  public isConnected(): boolean {
    return this.connection.isConnected();
  }

  /**
   * Execute a transaction across multiple operations
   */
  public transaction<T>(fn: () => T): T {
    return this.connection.transaction(() => fn());
  }

  /**
   * Get current database version
   */
  public getCurrentVersion(): string | null {
    return this.connection.getCurrentVersion();
  }

  // Repository getters
  public get assets(): AssetRepository {
    return this._assets;
  }

  public get accounts(): AccountRepository {
    return this._accounts;
  }

  public get positions(): PositionRepository {
    return this._positions;
  }

  public get transactions(): TransactionRepository {
    return this._transactions;
  }

  public get ohlcv(): OHLCVRepository {
    return this._ohlcv;
  }

  /**
   * Health check - verify all repositories are functional
   */
  public async healthCheck(): Promise<{
    connected: boolean;
    version: string | null;
    repositoryStatus: {
      assets: boolean;
      accounts: boolean;
      positions: boolean;
      transactions: boolean;
      ohlcv: boolean;
    };
  }> {
    const connected = this.isConnected();
    const version = connected ? this.getCurrentVersion() : null;

    const repositoryStatus = {
      assets: false,
      accounts: false,
      positions: false,
      transactions: false,
      ohlcv: false,
    };

    if (connected) {
      try {
        // Test each repository with a simple count operation
        this._assets.count();
        repositoryStatus.assets = true;
      } catch {
        // Repository not functional
      }

      try {
        this._accounts.count();
        repositoryStatus.accounts = true;
      } catch {
        // Repository not functional
      }

      try {
        this._positions.count();
        repositoryStatus.positions = true;
      } catch {
        // Repository not functional
      }

      try {
        this._transactions.count();
        repositoryStatus.transactions = true;
      } catch {
        // Repository not functional
      }

      try {
        this._ohlcv.count();
        repositoryStatus.ohlcv = true;
      } catch {
        // Repository not functional
      }
    }

    return {
      connected,
      version,
      repositoryStatus,
    };
  }
}
