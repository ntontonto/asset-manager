import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import type { Database as DatabaseType } from 'better-sqlite3';

export interface DatabaseConfig {
  path: string;
  readonly?: boolean;
  memory?: boolean;
}

export class DatabaseConnection {
  private db: DatabaseType | null = null;

  constructor(private config: DatabaseConfig) {}

  /**
   * Initialize database connection and run migrations
   */
  public async connect(): Promise<void> {
    const dbPath = this.config.memory ? ':memory:' : this.config.path;

    this.db = new Database(dbPath, {
      readonly: this.config.readonly,
      fileMustExist: false,
    });

    // Enable foreign key constraints
    this.db.pragma('foreign_keys = ON');

    // Set journal mode for better performance
    this.db.pragma('journal_mode = WAL');

    // Run migrations if not readonly
    if (!this.config.readonly) {
      await this.runMigrations();
    }
  }

  /**
   * Get database instance (throws if not connected)
   */
  public getDatabase(): DatabaseType {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db;
  }

  /**
   * Close database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Check if database is connected
   */
  public isConnected(): boolean {
    return this.db !== null;
  }

  /**
   * Execute database transaction
   */
  public transaction<T>(fn: (db: DatabaseType) => T): T {
    const db = this.getDatabase();
    const transaction = db.transaction(fn);
    return transaction(db);
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    try {
      // Read migration file
      const migrationPath = join(__dirname, '../schema/migrations.sql');
      const migrationSql = readFileSync(migrationPath, 'utf-8');

      // Split by statements and execute
      const statements = migrationSql
        .split(';')
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0);

      for (const statement of statements) {
        this.db.exec(statement);
      }

      console.log('Database migrations completed successfully');
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Get current database version from migration history
   */
  public getCurrentVersion(): string | null {
    const db = this.getDatabase();

    try {
      const row = db
        .prepare('SELECT version FROM migration_history ORDER BY executed_at DESC LIMIT 1')
        .get() as { version: string } | undefined;

      return row?.version || null;
    } catch {
      // Migration table might not exist yet
      return null;
    }
  }
}
