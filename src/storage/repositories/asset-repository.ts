import { randomUUID } from 'node:crypto';

import { BaseRepository } from './base';

import type { Asset, AssetType, CreateAssetRequest, UpdateAssetRequest } from '@/shared/types';

export interface AssetFilters {
  type?: AssetType;
  currency?: string;
  symbols?: string[];
}

export class AssetRepository extends BaseRepository {
  /**
   * Create a new asset
   */
  public create(request: CreateAssetRequest): Asset {
    this.ensureDatabase();

    const asset: Asset = {
      id: randomUUID(),
      symbol: request.symbol,
      name: request.name,
      type: request.type,
      currency: request.currency,
      decimals: request.decimals || 0,
      metadata: request.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO assets (
        id, symbol, name, type, currency, decimals, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      asset.id,
      asset.symbol,
      asset.name,
      asset.type,
      asset.currency,
      asset.decimals,
      JSON.stringify(asset.metadata || {}),
      asset.createdAt.toISOString(),
      asset.updatedAt.toISOString(),
    );

    return asset;
  }

  /**
   * Get asset by ID
   */
  public getById(id: string): Asset | null {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT * FROM assets WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    return row ? this.mapRowToAsset(row) : null;
  }

  /**
   * Get asset by symbol
   */
  public getBySymbol(symbol: string): Asset | null {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT * FROM assets WHERE symbol = ?
    `);

    const row = stmt.get(symbol) as any;
    return row ? this.mapRowToAsset(row) : null;
  }

  /**
   * List all assets with optional filters
   */
  public list(filters?: AssetFilters, limit?: number, offset?: number): Asset[] {
    this.ensureDatabase();

    let query = 'SELECT * FROM assets WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.currency) {
      query += ' AND currency = ?';
      params.push(filters.currency);
    }

    if (filters?.symbols?.length) {
      query += ` AND symbol IN (${filters.symbols.map(() => '?').join(',')})`;
      params.push(...filters.symbols);
    }

    query += ' ORDER BY symbol ASC';

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

    return rows.map((row) => this.mapRowToAsset(row));
  }

  /**
   * Update an existing asset
   */
  public update(id: string, request: UpdateAssetRequest): Asset | null {
    this.ensureDatabase();

    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const updated: Asset = {
      ...existing,
      ...request,
      id, // Keep original ID
      updatedAt: new Date(),
    };

    const stmt = this.db.prepare(`
      UPDATE assets SET
        symbol = ?,
        name = ?,
        type = ?,
        currency = ?,
        decimals = ?,
        metadata = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.symbol,
      updated.name,
      updated.type,
      updated.currency,
      updated.decimals,
      JSON.stringify(updated.metadata || {}),
      updated.updatedAt.toISOString(),
      id,
    );

    return updated;
  }

  /**
   * Delete an asset
   */
  public delete(id: string): boolean {
    this.ensureDatabase();

    const stmt = this.db.prepare('DELETE FROM assets WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  }

  /**
   * Check if asset exists by symbol
   */
  public existsBySymbol(symbol: string): boolean {
    this.ensureDatabase();

    const stmt = this.db.prepare('SELECT 1 FROM assets WHERE symbol = ? LIMIT 1');
    const result = stmt.get(symbol);

    return !!result;
  }

  /**
   * Count total assets with optional filters
   */
  public count(filters?: AssetFilters): number {
    this.ensureDatabase();

    let query = 'SELECT COUNT(*) as count FROM assets WHERE 1=1';
    const params: any[] = [];

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.currency) {
      query += ' AND currency = ?';
      params.push(filters.currency);
    }

    if (filters?.symbols?.length) {
      query += ` AND symbol IN (${filters.symbols.map(() => '?').join(',')})`;
      params.push(...filters.symbols);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };

    return result.count;
  }

  /**
   * Map database row to Asset object
   */
  private mapRowToAsset(row: any): Asset {
    return {
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      type: row.type as AssetType,
      currency: row.currency,
      decimals: row.decimals,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
