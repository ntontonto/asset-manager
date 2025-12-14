import { randomUUID } from 'node:crypto';

import { BaseRepository } from './base';

import type {
  CreateTransactionRequest,
  Transaction,
  TransactionStatus,
  TransactionType,
  UpdateTransactionRequest,
} from '@/shared/types';

interface TransactionRow {
  id: string;
  account_id: string;
  asset_id: string;
  type: TransactionType;
  status: TransactionStatus;
  quantity: string;
  price: string | null;
  total_value: string | null;
  fee: string | null;
  fee_currency: string | null;
  timestamp: string;
  external_id: string | null;
  related_transaction_id: string | null;
  notes: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

interface TransactionWithDetailsRow extends TransactionRow {
  asset_symbol: string;
  asset_name: string;
  asset_type: string;
  asset_currency: string;
  account_name: string;
  account_provider: string;
}

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
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
  externalId?: string;
}

export class TransactionRepository extends BaseRepository {
  /**
   * Create a new transaction
   */
  public create(request: CreateTransactionRequest): Transaction {
    this.ensureDatabase();

    const now = new Date();

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
      createdAt: now,
      updatedAt: now,
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
      transaction.price ?? null,
      transaction.totalValue ?? null,
      transaction.fee ?? null,
      transaction.feeCurrency ?? null,
      transaction.timestamp.toISOString(),
      transaction.externalId ?? null,
      transaction.relatedTransactionId ?? null,
      transaction.notes ?? null,
      this.serializeJson(transaction.metadata),
      now.toISOString(),
      now.toISOString(),
    );

    return transaction;
  }

  /**
   * Get transaction by ID
   */
  public getById(id: string): Transaction | undefined {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT * FROM transactions WHERE id = ?
    `);

    const row = stmt.get(id) as TransactionRow | undefined;
    return row ? this.mapRowToTransaction(row) : undefined;
  }

  /**
   * Get transaction by external ID
   */
  public getByExternalId(externalId: string): Transaction | undefined {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT * FROM transactions WHERE external_id = ?
    `);

    const row = stmt.get(externalId) as TransactionRow | undefined;
    return row ? this.mapRowToTransaction(row) : undefined;
  }

  /**
   * List transactions with optional filters
   */
  public list(filters: TransactionFilters = {}, limit?: number, offset?: number): Transaction[] {
    this.ensureDatabase();

    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params: unknown[] = [];
    const fromDate = filters.fromDate ?? filters.dateFrom;
    const toDate = filters.toDate ?? filters.dateTo;
    const resolvedLimit = filters.limit ?? limit;
    const resolvedOffset = filters.offset ?? offset;

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

    if (fromDate) {
      query += ' AND timestamp >= ?';
      params.push(fromDate.toISOString());
    }

    if (toDate) {
      query += ' AND timestamp <= ?';
      params.push(toDate.toISOString());
    }

    if (filters?.externalId) {
      query += ' AND external_id = ?';
      params.push(filters.externalId);
    }

    query += ' ORDER BY timestamp DESC';

    if (resolvedLimit !== undefined) {
      query += ' LIMIT ?';
      params.push(resolvedLimit);
    }

    if (resolvedOffset !== undefined) {
      query += ' OFFSET ?';
      params.push(resolvedOffset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as TransactionRow[];

    return rows.map((row) => this.mapRowToTransaction(row));
  }

  /**
   * Get transaction history for an account
   */
  public getAccountHistory(accountId: string, limit?: number, offset?: number): Transaction[] {
    return this.list({ accountId, limit, offset });
  }

  /**
   * Get transaction history for an asset
   */
  public getAssetHistory(assetId: string, limit?: number, offset?: number): Transaction[] {
    return this.list({ assetId, limit, offset });
  }

  /**
   * Get transactions within a date range
   */
  public getByDateRange(
    dateFrom: Date,
    dateTo: Date,
    filters?: Omit<TransactionFilters, 'dateFrom' | 'dateTo'>,
  ): Transaction[] {
    return this.list({ ...filters, fromDate: dateFrom, toDate: dateTo });
  }

  /**
   * Update an existing transaction
   */
  public update(id: string, request: UpdateTransactionRequest): Transaction | undefined {
    this.ensureDatabase();

    const existing = this.getById(id);
    if (!existing) {
      return undefined;
    }

    const updatedAt = this.nextTimestamp(existing.updatedAt);

    const updated: Transaction = {
      ...existing,
      ...request,
      id, // Keep original ID
      updatedAt,
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
      updated.price ?? null,
      updated.totalValue ?? null,
      updated.fee ?? null,
      updated.feeCurrency ?? null,
      updated.timestamp.toISOString(),
      updated.externalId ?? null,
      updated.relatedTransactionId ?? null,
      updated.notes ?? null,
      this.serializeJson(updated.metadata),
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
        const now = new Date();
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
          createdAt: now,
          updatedAt: now,
        };

        stmt.run(
          transaction.id,
          transaction.accountId,
          transaction.assetId,
          transaction.type,
          transaction.status,
          transaction.quantity,
          transaction.price ?? null,
          transaction.totalValue ?? null,
          transaction.fee ?? null,
          transaction.feeCurrency ?? null,
          transaction.timestamp.toISOString(),
          transaction.externalId ?? null,
          transaction.relatedTransactionId ?? null,
          transaction.notes ?? null,
          this.serializeJson(transaction.metadata),
          now.toISOString(),
          now.toISOString(),
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

    const fromDate = filters?.fromDate ?? filters?.dateFrom;
    const toDate = filters?.toDate ?? filters?.dateTo;
    const resolvedLimit = filters?.limit ?? limit;
    const resolvedOffset = filters?.offset ?? offset;

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
    const params: unknown[] = [];

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

    if (fromDate) {
      query += ' AND t.timestamp >= ?';
      params.push(fromDate.toISOString());
    }

    if (toDate) {
      query += ' AND t.timestamp <= ?';
      params.push(toDate.toISOString());
    }

    query += ' ORDER BY t.timestamp DESC';

    if (resolvedLimit !== undefined) {
      query += ' LIMIT ?';
      params.push(resolvedLimit);
    }

    if (resolvedOffset !== undefined) {
      query += ' OFFSET ?';
      params.push(resolvedOffset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as TransactionWithDetailsRow[];

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
    const params: unknown[] = [];
    const fromDate = filters?.fromDate ?? filters?.dateFrom;
    const toDate = filters?.toDate ?? filters?.dateTo;

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

    if (fromDate) {
      query += ' AND timestamp >= ?';
      params.push(fromDate.toISOString());
    }

    if (toDate) {
      query += ' AND timestamp <= ?';
      params.push(toDate.toISOString());
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };

    return result.count;
  }

  /**
   * Map database row to Transaction object
   */
  private mapRowToTransaction(row: TransactionRow): Transaction {
    return {
      id: row.id,
      accountId: row.account_id,
      assetId: row.asset_id,
      type: row.type as TransactionType,
      status: row.status as TransactionStatus,
      quantity: row.quantity,
      price: row.price ?? undefined,
      totalValue: row.total_value ?? undefined,
      fee: row.fee ?? undefined,
      feeCurrency: row.fee_currency ?? undefined,
      timestamp: new Date(row.timestamp),
      externalId: row.external_id ?? undefined,
      relatedTransactionId: row.related_transaction_id ?? undefined,
      notes: row.notes ?? undefined,
      metadata: this.deserializeJson(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private serializeJson(value?: Record<string, unknown>): string | null {
    if (!value) {
      return null;
    }
    return JSON.stringify(value);
  }

  private deserializeJson(value: unknown): Record<string, unknown> | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      if (parsed && typeof parsed === 'object') {
        return Object.keys(parsed as object).length > 0
          ? (parsed as Record<string, unknown>)
          : undefined;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private nextTimestamp(previous: Date): Date {
    const now = new Date();
    if (now.getTime() > previous.getTime()) {
      return now;
    }
    return new Date(previous.getTime() + 1);
  }
}
