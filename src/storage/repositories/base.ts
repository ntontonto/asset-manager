import type { Database } from 'better-sqlite3';

export interface Repository {
  setDatabase(db: Database): void;
}

export abstract class BaseRepository implements Repository {
  protected db!: Database;

  public setDatabase(db: Database): void {
    this.db = db;
  }

  protected ensureDatabase(): void {
    if (!this.db) {
      throw new Error('Database not initialized. Call setDatabase() first.');
    }
  }
}
