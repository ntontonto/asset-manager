import { getTestDatabaseConfig } from './config';
import { DatabaseConnection } from './connection';

describe('DatabaseConnection', () => {
  let connection: DatabaseConnection;

  beforeEach(() => {
    connection = new DatabaseConnection(getTestDatabaseConfig());
  });

  afterEach(() => {
    if (connection.isConnected()) {
      connection.close();
    }
  });

  describe('connection management', () => {
    it('should connect to in-memory database', async () => {
      await connection.connect();
      expect(connection.isConnected()).toBe(true);
    });

    it('should close database connection', async () => {
      await connection.connect();
      connection.close();
      expect(connection.isConnected()).toBe(false);
    });

    it('should throw error when getting database before connecting', () => {
      expect(() => connection.getDatabase()).toThrow(
        'Database not connected. Call connect() first.',
      );
    });
  });

  describe('migrations', () => {
    it('should run migrations on connect', async () => {
      await connection.connect();

      const db = connection.getDatabase();

      // Check that tables were created
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('assets');
      expect(tableNames).toContain('accounts');
      expect(tableNames).toContain('positions');
      expect(tableNames).toContain('transactions');
      expect(tableNames).toContain('ohlcv_data');
      expect(tableNames).toContain('portfolio_snapshots');
      expect(tableNames).toContain('migration_history');
    });

    it('should record migration version', async () => {
      await connection.connect();

      const version = connection.getCurrentVersion();
      expect(version).toBe('1.0.0');
    });
  });

  describe('transactions', () => {
    beforeEach(async () => {
      await connection.connect();
    });

    it('should execute transaction successfully', () => {
      const result = connection.transaction((db) => {
        // Insert test data
        db.prepare(
          `INSERT INTO assets (id, symbol, name, type, currency, decimals) 
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run('test-id', 'BTC', 'Bitcoin', 'crypto', 'USD', 8);

        // Query the data back
        return db.prepare('SELECT symbol FROM assets WHERE id = ?').get('test-id') as {
          symbol: string;
        };
      });

      expect(result.symbol).toBe('BTC');
    });

    it('should rollback transaction on error', () => {
      expect(() => {
        connection.transaction((db) => {
          // Insert valid data
          db.prepare(
            `INSERT INTO assets (id, symbol, name, type, currency, decimals) 
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).run('test-id-1', 'BTC', 'Bitcoin', 'crypto', 'USD', 8);

          // This should fail due to duplicate key
          db.prepare(
            `INSERT INTO assets (id, symbol, name, type, currency, decimals) 
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).run('test-id-1', 'ETH', 'Ethereum', 'crypto', 'USD', 18);
        });
      }).toThrow();

      // Verify no data was inserted
      const db = connection.getDatabase();
      const count = db.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number };
      expect(count.count).toBe(0);
    });
  });

  describe('database constraints', () => {
    beforeEach(async () => {
      await connection.connect();
    });

    it('should enforce foreign key constraints', () => {
      const db = connection.getDatabase();

      // Try to insert position without valid account/asset
      expect(() => {
        db.prepare(
          `INSERT INTO positions (id, account_id, asset_id, quantity, last_updated) 
           VALUES (?, ?, ?, ?, ?)`,
        ).run('pos-id', 'invalid-account', 'invalid-asset', '1.0', new Date().toISOString());
      }).toThrow();
    });

    it('should enforce check constraints on asset type', () => {
      const db = connection.getDatabase();

      // Try to insert asset with invalid type
      expect(() => {
        db.prepare(
          `INSERT INTO assets (id, symbol, name, type, currency, decimals) 
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run('test-id', 'BTC', 'Bitcoin', 'invalid-type', 'USD', 8);
      }).toThrow();
    });

    it('should enforce unique constraints', () => {
      const db = connection.getDatabase();

      // Insert first asset
      db.prepare(
        `INSERT INTO assets (id, symbol, name, type, currency, decimals) 
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('test-id-1', 'BTC', 'Bitcoin', 'crypto', 'USD', 8);

      // Try to insert duplicate symbol
      expect(() => {
        db.prepare(
          `INSERT INTO assets (id, symbol, name, type, currency, decimals) 
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run('test-id-2', 'BTC', 'Bitcoin Copy', 'crypto', 'USD', 8);
      }).toThrow();
    });
  });
});
