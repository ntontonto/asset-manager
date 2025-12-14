import { randomUUID } from 'node:crypto';

import { BaseRepository } from './base';

import type {
  Account,
  AccountProvider,
  AccountType,
  CreateAccountRequest,
  UpdateAccountRequest,
} from '@/shared/types';

interface AccountRow {
  id: string;
  name: string;
  provider: AccountProvider;
  type: AccountType;
  currency: string;
  is_active: number;
  api_credentials: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountFilters {
  provider?: AccountProvider;
  type?: AccountType;
  isActive?: boolean;
  currency?: string;
}

export class AccountRepository extends BaseRepository {
  /**
   * Create a new account
   */
  public create(request: CreateAccountRequest): Account {
    this.ensureDatabase();

    const now = new Date();
    const apiCredentials = this.normalizeApiCredentials(request.apiCredentials);

    const account: Account = {
      id: randomUUID(),
      name: request.name,
      provider: request.provider,
      type: request.type,
      currency: request.currency,
      isActive: request.isActive ?? true,
      apiCredentials,
      metadata: request.metadata,
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO accounts (
        id, name, provider, type, currency, is_active, 
        api_credentials, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      account.id,
      account.name,
      account.provider,
      account.type,
      account.currency,
      account.isActive ? 1 : 0,
      this.serializeJson(apiCredentials),
      this.serializeJson(account.metadata),
      now.toISOString(),
      now.toISOString(),
    );

    return account;
  }

  /**
   * Get account by ID
   */
  public getById(id: string): Account | undefined {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT * FROM accounts WHERE id = ?
    `);

    const row = stmt.get(id) as AccountRow | undefined;
    return row ? this.mapRowToAccount(row) : undefined;
  }

  /**
   * List all accounts with optional filters
   */
  public list(filters?: AccountFilters, limit?: number, offset?: number): Account[] {
    this.ensureDatabase();

    let query = 'SELECT * FROM accounts WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.provider) {
      query += ' AND provider = ?';
      params.push(filters.provider);
    }

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.isActive !== undefined) {
      query += ' AND is_active = ?';
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters?.currency) {
      query += ' AND currency = ?';
      params.push(filters.currency);
    }

    query += ' ORDER BY name ASC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    if (offset) {
      query += ' OFFSET ?';
      params.push(offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as AccountRow[];

    return rows.map((row) => this.mapRowToAccount(row));
  }

  /**
   * Get active accounts only
   */
  public getActive(): Account[] {
    return this.list({ isActive: true });
  }

  /**
   * Update an existing account
   */
  public update(id: string, request: UpdateAccountRequest): Account | undefined {
    this.ensureDatabase();

    const existing = this.getById(id);
    if (!existing) {
      return undefined;
    }

    const updatedAt = this.nextTimestamp(existing.updatedAt);
    const apiCredentials = request.apiCredentials
      ? this.normalizeApiCredentials(request.apiCredentials)
      : existing.apiCredentials;

    const updated: Account = {
      ...existing,
      ...request,
      apiCredentials,
      id, // Keep original ID
      updatedAt,
    };

    const stmt = this.db.prepare(`
      UPDATE accounts SET
        name = ?,
        provider = ?,
        type = ?,
        currency = ?,
        is_active = ?,
        api_credentials = ?,
        metadata = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.name,
      updated.provider,
      updated.type,
      updated.currency,
      updated.isActive ? 1 : 0,
      this.serializeJson(apiCredentials),
      this.serializeJson(updated.metadata),
      updated.updatedAt.toISOString(),
      id,
    );

    return updated;
  }

  /**
   * Activate/deactivate an account
   */
  public setActive(id: string, isActive: boolean): boolean {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      UPDATE accounts SET 
        is_active = ?,
        updated_at = ?
      WHERE id = ?
    `);

    const result = stmt.run(isActive ? 1 : 0, new Date().toISOString(), id);
    return result.changes > 0;
  }

  /**
   * Delete an account
   */
  public delete(id: string): boolean {
    this.ensureDatabase();

    const stmt = this.db.prepare('DELETE FROM accounts WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  }

  /**
   * Count total accounts with optional filters
   */
  public count(filters?: AccountFilters): number {
    this.ensureDatabase();

    let query = 'SELECT COUNT(*) as count FROM accounts WHERE 1=1';
    const params: unknown[] = [];

    if (filters?.provider) {
      query += ' AND provider = ?';
      params.push(filters.provider);
    }

    if (filters?.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters?.isActive !== undefined) {
      query += ' AND is_active = ?';
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters?.currency) {
      query += ' AND currency = ?';
      params.push(filters.currency);
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };

    return result.count;
  }

  /**
   * Map database row to Account object
   */
  private mapRowToAccount(row: AccountRow): Account {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider as AccountProvider,
      type: row.type as AccountType,
      currency: row.currency,
      isActive: !!row.is_active,
      apiCredentials: this.deserializeApiCredentials(row.api_credentials),
      metadata: this.deserializeJson(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private normalizeApiCredentials(
    credentials?: CreateAccountRequest['apiCredentials'],
  ): Record<string, unknown> | undefined {
    if (!credentials) {
      return undefined;
    }

    if (typeof credentials === 'object' && 'metadata' in credentials && credentials.metadata) {
      return credentials.metadata as Record<string, unknown>;
    }

    return credentials as Record<string, unknown>;
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
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && Object.keys(parsed).length > 0 ? parsed : undefined;
      } catch {
        return undefined;
      }
    }
    if (typeof value === 'object' && value !== null) {
      return Object.keys(value as object).length > 0
        ? (value as Record<string, unknown>)
        : undefined;
    }
    return undefined;
  }

  private deserializeApiCredentials(value: unknown): Record<string, unknown> | undefined {
    const parsed = this.deserializeJson(value);
    if (!parsed) {
      return undefined;
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'metadata' in parsed &&
      (parsed as { metadata?: unknown }).metadata
    ) {
      const metadata = (parsed as { metadata?: unknown }).metadata;
      return typeof metadata === 'object' && metadata !== null
        ? (metadata as Record<string, unknown>)
        : undefined;
    }

    return parsed;
  }

  private nextTimestamp(previous: Date): Date {
    const now = new Date();
    if (now.getTime() > previous.getTime()) {
      return now;
    }
    return new Date(previous.getTime() + 1);
  }
}
