import { randomUUID } from 'node:crypto';

import { BaseRepository } from './base';

import type {
  CreateTransactionRequest,
  Transaction,
  TransactionStatus,
  TransactionType,
  UpdateTransactionRequest,
} from '@/shared/types';

export interface TransactionFilters {
  accountId?: string;
  assetId?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  accountIds?: string[];
  assetIds?: string[];
  types?: TransactionType[];
  dateFrom?: Date;
  dateTo?: Date;
  externalId?: string;
}

export class TransactionRepository extends BaseRepository {
  /**
   * Create a new transaction
   */
  public create(request: CreateTransactionRequest): Transaction {
    this.ensureDatabase();

    const transaction: Transaction = {
      id: randomUUID(),
      accountId: request.accountId,
      assetId: request.assetId,
      type: request.type,
      status: request.status || 'completed',
      quantity: request.quantity,
      price: request.price,
      totalValue: request.totalValue,
      fee: request.fee,
      feeCurrency: request.feeCurrency,
      timestamp: request.timestamp,
      externalId: request.externalId,
      relatedTransactionId: request.relatedTransactionId,
      notes: request.notes,
      metadata: request.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const stmt = this.db.prepare(`
      INSERT INTO transactions (
        id, account_id, asset_id, type, status, quantity, price, total_value,
        fee, fee_currency, timestamp, external_id, related_transaction_id,
        notes, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      transaction.id,
      transaction.accountId,
      transaction.assetId,
      transaction.type,
      transaction.status,
      transaction.quantity,
      transaction.price || null,
      transaction.totalValue || null,
      transaction.fee || null,
      transaction.feeCurrency || null,
      transaction.timestamp.toISOString(),
      transaction.externalId || null,
      transaction.relatedTransactionId || null,
      transaction.notes || null,
      JSON.stringify(transaction.metadata || {}),
      transaction.createdAt.toISOString(),
      transaction.updatedAt.toISOString(),
    );

    return transaction;
  }

  /**
   * Get transaction by ID
   */
  public getById(id: string): Transaction | null {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT * FROM transactions WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    return row ? this.mapRowToTransaction(row) : null;
  }

  /**
   * Get transaction by external ID
   */
  public getByExternalId(externalId: string): Transaction | null {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT * FROM transactions WHERE external_id = ?
    `);

    const row = stmt.get(externalId) as any;
    return row ? this.mapRowToTransaction(row) : null;
  }

  /**
   * List transactions with optional filters
   */
  public list(filters?: TransactionFilters, limit?: number, offset?: number): Transaction[] {
    this.ensureDatabase();

    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params: any[] = [];

    if (filters?.accountId) {
      query += ' AND account_id = ?';
      params.push(filters.accountId);
    }

    if (filters?.assetId) {
      query += ' AND asset_id = ?';
      params.push(filters.assetId);
    }

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters?.accountIds?.length) {
      query += ` AND account_id IN (${filters.accountIds.map(() => '?').join(',')})`;
      params.push(...filters.accountIds);
    }

    if (filters?.assetIds?.length) {
      query += ` AND asset_id IN (${filters.assetIds.map(() => '?').join(',')})`;
      params.push(...filters.assetIds);
    }

    if (filters?.types?.length) {
      query += ` AND type IN (${filters.types.map(() => '?').join(',')})`;
      params.push(...filters.types);
    }

    if (filters?.dateFrom) {
      query += ' AND timestamp >= ?';
      params.push(filters.dateFrom.toISOString());
    }

    if (filters?.dateTo) {
      query += ' AND timestamp <= ?';
      params.push(filters.dateTo.toISOString());
    }

    if (filters?.externalId) {
      query += ' AND external_id = ?';
      params.push(filters.externalId);
    }

    query += ' ORDER BY timestamp DESC';

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

    return rows.map((row) => this.mapRowToTransaction(row));
  }

  /**
   * Get transaction history for an account
   */
  public getAccountHistory(accountId: string, limit?: number, offset?: number): Transaction[] {
    return this.list({ accountId }, limit, offset);
  }

  /**
   * Get transaction history for an asset
   */
  public getAssetHistory(assetId: string, limit?: number, offset?: number): Transaction[] {
    return this.list({ assetId }, limit, offset);
  }

  /**
   * Get transactions within a date range
   */
  public getByDateRange(
    dateFrom: Date,
    dateTo: Date,
    filters?: Omit<TransactionFilters, 'dateFrom' | 'dateTo'>,
  ): Transaction[] {
    return this.list({ ...filters, dateFrom, dateTo });
  }

  /**
   * Update an existing transaction
   */
  public update(id: string, request: UpdateTransactionRequest): Transaction | null {
    this.ensureDatabase();

    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const updated: Transaction = {
      ...existing,
      ...request,
      id, // Keep original ID
      updatedAt: new Date(),
    };

    const stmt = this.db.prepare(`
      UPDATE transactions SET
        account_id = ?,
        asset_id = ?,
        type = ?,
        status = ?,
        quantity = ?,
        price = ?,
        total_value = ?,
        fee = ?,
        fee_currency = ?,
        timestamp = ?,
        external_id = ?,
        related_transaction_id = ?,
        notes = ?,
        metadata = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.accountId,
      updated.assetId,
      updated.type,
      updated.status,
      updated.quantity,
      updated.price || null,
      updated.totalValue || null,
      updated.fee || null,
      updated.feeCurrency || null,
      updated.timestamp.toISOString(),
      updated.externalId || null,
      updated.relatedTransactionId || null,
      updated.notes || null,
      JSON.stringify(updated.metadata || {}),
      updated.updatedAt.toISOString(),
      id,
    );

    return updated;
  }

  /**
   * Delete a transaction
   */
  public delete(id: string): boolean {
    this.ensureDatabase();

    const stmt = this.db.prepare('DELETE FROM transactions WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  }

  /**
   * Check if external ID already exists
   */
  public existsByExternalId(externalId: string): boolean {
    this.ensureDatabase();

    const stmt = this.db.prepare('SELECT 1 FROM transactions WHERE external_id = ? LIMIT 1');
    const result = stmt.get(externalId);

    return !!result;
  }

  /**
   * Bulk insert transactions (more efficient for large imports)
   */
  public bulkCreate(requests: CreateTransactionRequest[]): Transaction[] {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      INSERT INTO transactions (
        id, account_id, asset_id, type, status, quantity, price, total_value,
        fee, fee_currency, timestamp, external_id, related_transaction_id,
        notes, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((requests: CreateTransactionRequest[]) => {
      const transactions: Transaction[] = [];

      for (const request of requests) {
        const transaction: Transaction = {
          id: randomUUID(),
          accountId: request.accountId,
          assetId: request.assetId,
          type: request.type,
          status: request.status || 'completed',
          quantity: request.quantity,
          price: request.price,
          totalValue: request.totalValue,
          fee: request.fee,
          feeCurrency: request.feeCurrency,
          timestamp: request.timestamp,
          externalId: request.externalId,
          relatedTransactionId: request.relatedTransactionId,
          notes: request.notes,
          metadata: request.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        stmt.run(
          transaction.id,
          transaction.accountId,
          transaction.assetId,
          transaction.type,
          transaction.status,
          transaction.quantity,
          transaction.price || null,
          transaction.totalValue || null,
          transaction.fee || null,
          transaction.feeCurrency || null,
          transaction.timestamp.toISOString(),
          transaction.externalId || null,
          transaction.relatedTransactionId || null,
          transaction.notes || null,
          JSON.stringify(transaction.metadata || {}),
          transaction.createdAt.toISOString(),
          transaction.updatedAt.toISOString(),
        );

        transactions.push(transaction);
      }

      return transactions;
    });

    return insertMany(requests);
  }

  /**
   * Get transactions with their asset and account details
   */
  public getWithDetails(
    filters?: TransactionFilters,
    limit?: number,
    offset?: number,
  ): Array<
    Transaction & {
      asset: { symbol: string; name: string; type: string; currency: string };
      account: { name: string; provider: string };
    }
  > {
    this.ensureDatabase();

    let query = `
      SELECT 
        t.*,
        a.symbol as asset_symbol,
        a.name as asset_name,
        a.type as asset_type,
        a.currency as asset_currency,
        acc.name as account_name,
        acc.provider as account_provider
      FROM transactions t
      JOIN assets a ON t.asset_id = a.id
      JOIN accounts acc ON t.account_id = acc.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.accountId) {
      query += ' AND t.account_id = ?';
      params.push(filters.accountId);
    }

    if (filters?.assetId) {
      query += ' AND t.asset_id = ?';
      params.push(filters.assetId);
    }

    if (filters?.type) {
      query += ' AND t.type = ?';
      params.push(filters.type);
    }

    if (filters?.dateFrom) {
      query += ' AND t.timestamp >= ?';
      params.push(filters.dateFrom.toISOString());
    }

    if (filters?.dateTo) {
      query += ' AND t.timestamp <= ?';
      params.push(filters.dateTo.toISOString());
    }

    query += ' ORDER BY t.timestamp DESC';

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

    return rows.map((row) => ({
      ...this.mapRowToTransaction(row),
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
   * Count total transactions with optional filters
   */
  public count(filters?: TransactionFilters): number {
    this.ensureDatabase();

    let query = 'SELECT COUNT(*) as count FROM transactions WHERE 1=1';
    const params: any[] = [];

    if (filters?.accountId) {
      query += ' AND account_id = ?';
      params.push(filters.accountId);
    }

    if (filters?.assetId) {
      query += ' AND asset_id = ?';
      params.push(filters.assetId);
    }

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters?.dateFrom) {
      query += ' AND timestamp >= ?';
      params.push(filters.dateFrom.toISOString());
    }

    if (filters?.dateTo) {
      query += ' AND timestamp <= ?';
      params.push(filters.dateTo.toISOString());
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };

    return result.count;
  }

  /**
   * Map database row to Transaction object
   */
  private mapRowToTransaction(row: any): Transaction {
    return {
      id: row.id,
      accountId: row.account_id,
      assetId: row.asset_id,
      type: row.type as TransactionType,
      status: row.status as TransactionStatus,
      quantity: row.quantity,
      price: row.price,
      totalValue: row.total_value,
      fee: row.fee,
      feeCurrency: row.fee_currency,
      timestamp: new Date(row.timestamp),
      externalId: row.external_id,
      relatedTransactionId: row.related_transaction_id,
      notes: row.notes,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
