import { randomUUID } from 'node:crypto';

import { BaseRepository } from './base';

import type { Position, UpdatePositionRequest } from '@/shared/types';

export interface PositionFilters {
  accountId?: string;
  assetId?: string;
  accountIds?: string[];
  assetIds?: string[];
  minQuantity?: string;
  hasValue?: boolean;
}

export class PositionRepository extends BaseRepository {
  /**
   * Update or create a position
   */
  public upsert(accountId: string, assetId: string, request: UpdatePositionRequest): Position {
    this.ensureDatabase();

    const existing = this.getByAccountAndAsset(accountId, assetId);

    if (existing) {
      return this.update(existing.id, request)!;
    } else {
      return this.create(accountId, assetId, request);
    }
  }

  /**
   * Create a new position
   */
  private create(accountId: string, assetId: string, request: UpdatePositionRequest): Position {
    const position: Position = {
      id: randomUUID(),
      accountId,
      assetId,
      quantity: request.quantity || '0',
      averagePrice: request.averagePrice,
      lastPrice: request.lastPrice,
      lastUpdated: new Date(),
      metadata: request.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO positions (
        id, account_id, asset_id, quantity, average_price, 
        last_price, last_updated, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      position.id,
      position.accountId,
      position.assetId,
      position.quantity,
      position.averagePrice || null,
      position.lastPrice || null,
      position.lastUpdated.toISOString(),
      JSON.stringify(position.metadata || {}),
      position.createdAt.toISOString(),
      position.updatedAt.toISOString(),
    );

    return position;
  }

  /**
   * Get position by ID
   */
  public getById(id: string): Position | undefined {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT * FROM positions WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    return row ? this.mapRowToPosition(row) : undefined;
  }

  /**
   * Get position by account and asset
   */
  public getByAccountAndAsset(accountId: string, assetId: string): Position | undefined {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT * FROM positions WHERE account_id = ? AND asset_id = ?
    `);

    const row = stmt.get(accountId, assetId) as any;
    return row ? this.mapRowToPosition(row) : undefined;
  }

  /**
   * Get all positions for an account
   */
  public getByAccount(accountId: string): Position[] {
    return this.list({ accountId });
  }

  /**
   * Get all positions for an asset across all accounts
   */
  public getByAsset(assetId: string): Position[] {
    return this.list({ assetId });
  }

  /**
   * List positions with optional filters
   */
  public list(filters?: PositionFilters, limit?: number, offset?: number): Position[] {
    this.ensureDatabase();

    let query = 'SELECT * FROM positions WHERE 1=1';
    const params: any[] = [];

    if (filters?.accountId) {
      query += ' AND account_id = ?';
      params.push(filters.accountId);
    }

    if (filters?.assetId) {
      query += ' AND asset_id = ?';
      params.push(filters.assetId);
    }

    if (filters?.accountIds?.length) {
      query += ` AND account_id IN (${filters.accountIds.map(() => '?').join(',')})`;
      params.push(...filters.accountIds);
    }

    if (filters?.assetIds?.length) {
      query += ` AND asset_id IN (${filters.assetIds.map(() => '?').join(',')})`;
      params.push(...filters.assetIds);
    }

    if (filters?.minQuantity !== undefined) {
      query += ' AND CAST(quantity AS REAL) >= ?';
      params.push(parseFloat(filters.minQuantity));
    }

    if (filters?.hasValue) {
      query += ' AND last_price IS NOT NULL AND CAST(quantity AS REAL) > 0';
    }

    query += ' ORDER BY last_updated DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    if (offset) {
      query += ' OFFSET ?';
      params.push(offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => this.mapRowToPosition(row));
  }

  /**
   * Update an existing position
   */
  public update(id: string, request: UpdatePositionRequest): Position | null {
    this.ensureDatabase();

    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const updated: Position = {
      ...existing,
      ...request,
      id, // Keep original ID
      lastUpdated: new Date(),
      updatedAt: new Date(),
    };

    const stmt = this.db.prepare(`
      UPDATE positions SET
        quantity = ?,
        average_price = ?,
        last_price = ?,
        last_updated = ?,
        metadata = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.quantity,
      updated.averagePrice || null,
      updated.lastPrice || null,
      updated.lastUpdated.toISOString(),
      JSON.stringify(updated.metadata || {}),
      updated.updatedAt.toISOString(),
      id,
    );

    return updated;
  }

  /**
   * Update last price for multiple positions
   */
  public updateLastPrices(updates: Array<{ id: string; lastPrice: string }>): number {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      UPDATE positions SET 
        last_price = ?,
        last_updated = ?,
        updated_at = ?
      WHERE id = ?
    `);

    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const update of updates) {
      const result = stmt.run(update.lastPrice, now, now, update.id);
      if (result.changes > 0) {
        updatedCount++;
      }
    }

    return updatedCount;
  }

  /**
   * Delete a position
   */
  public delete(id: string): boolean {
    this.ensureDatabase();

    const stmt = this.db.prepare('DELETE FROM positions WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  }

  /**
   * Delete positions with zero quantity
   */
  public deleteZeroQuantityPositions(): number {
    this.ensureDatabase();

    const stmt = this.db.prepare('DELETE FROM positions WHERE CAST(quantity AS REAL) = 0');
    const result = stmt.run();

    return result.changes;
  }

  /**
   * Get positions with their asset and account details
   */
  public getWithDetails(filters?: PositionFilters): Array<
    Position & {
      asset: { symbol: string; name: string; type: string; currency: string };
      account: { name: string; provider: string };
    }
  > {
    this.ensureDatabase();

    let query = `
      SELECT 
        p.*,
        a.symbol as asset_symbol,
        a.name as asset_name,
        a.type as asset_type,
        a.currency as asset_currency,
        acc.name as account_name,
        acc.provider as account_provider
      FROM positions p
      JOIN assets a ON p.asset_id = a.id
      JOIN accounts acc ON p.account_id = acc.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.accountId) {
      query += ' AND p.account_id = ?';
      params.push(filters.accountId);
    }

    if (filters?.assetId) {
      query += ' AND p.asset_id = ?';
      params.push(filters.assetId);
    }

    query += ' ORDER BY p.last_updated DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => ({
      ...this.mapRowToPosition(row),
      asset: {
        symbol: row.asset_symbol,
        name: row.asset_name,
        type: row.asset_type,
        currency: row.asset_currency,
      },
      account: {
        name: row.account_name,
        provider: row.account_provider,
      },
    }));
  }

  /**
   * Count total positions with optional filters
   */
  public count(filters?: PositionFilters): number {
    this.ensureDatabase();

    let query = 'SELECT COUNT(*) as count FROM positions WHERE 1=1';
    const params: any[] = [];

    if (filters?.accountId) {
      query += ' AND account_id = ?';
      params.push(filters.accountId);
    }

    if (filters?.assetId) {
      query += ' AND asset_id = ?';
      params.push(filters.assetId);
    }

    if (filters?.hasValue) {
      query += ' AND last_price IS NOT NULL AND CAST(quantity AS REAL) > 0';
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };

    return result.count;
  }

  /**
   * Map database row to Position object
   */
  private mapRowToPosition(row: any): Position {
    return {
      id: row.id,
      accountId: row.account_id,
      assetId: row.asset_id,
      quantity: row.quantity,
      averagePrice: row.average_price ?? undefined,
      lastPrice: row.last_price ?? undefined,
      lastUpdated: new Date(row.last_updated),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
