import { beforeEach, describe, expect, it } from '@jest/globals';
import { AccountRepository } from '../repositories/account-repository';
import { DatabaseConnection } from '../database/connection';
import type { CreateAccountRequest } from '@/shared/types';

describe('AccountRepository', () => {
  let repository: AccountRepository;
  let dbConnection: DatabaseConnection;

  beforeEach(async () => {
    dbConnection = new DatabaseConnection({ path: ':memory:', memory: true, readonly: false });
    await dbConnection.connect();
    repository = new AccountRepository();
    repository.setDatabase(dbConnection.getDatabase());
  });

  describe('create', () => {
    it('should create a new account successfully', () => {
      const createRequest: CreateAccountRequest = {
        name: 'Binance Main',
        provider: 'binance',
        type: 'exchange',
        currency: 'USD',
        isActive: true,
        apiCredentials: { encrypted: false, metadata: { key: 'test', secret: 'secret' } },
        metadata: { region: 'global' },
      };

      const account = repository.create(createRequest);

      expect(account.id).toBeDefined();
      expect(account.name).toBe('Binance Main');
      expect(account.provider).toBe('binance');
      expect(account.type).toBe('exchange');
      expect(account.currency).toBe('USD');
      expect(account.isActive).toBe(true);
      expect(account.apiCredentials).toEqual({ key: 'test', secret: 'secret' });
      expect(account.metadata).toEqual({ region: 'global' });
      expect(account.createdAt).toBeInstanceOf(Date);
      expect(account.updatedAt).toBeInstanceOf(Date);
    });

    it('should create account with minimal required fields', () => {
      const createRequest: CreateAccountRequest = {
        name: 'Manual Portfolio',
        provider: 'manual',
        type: 'manual',
        currency: 'USD',
        isActive: true,
      };

      const account = repository.create(createRequest);

      expect(account.id).toBeDefined();
      expect(account.name).toBe('Manual Portfolio');
      expect(account.isActive).toBe(true); // default value
      expect(account.apiCredentials).toBeUndefined();
      expect(account.metadata).toBeUndefined();
    });
  });

  describe('getById', () => {
    it('should retrieve account by id', () => {
      const createRequest: CreateAccountRequest = {
        name: 'Test Account',
        provider: 'coinbase',
        type: 'exchange',
        currency: 'USD',
        isActive: true,
      };

      const created = repository.create(createRequest);
      const retrieved = repository.getById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.name).toBe('Test Account');
    });

    it('should return undefined for non-existent id', () => {
      const retrieved = repository.getById('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      const accounts: CreateAccountRequest[] = [
        { name: 'Binance', provider: 'binance', type: 'exchange', currency: 'USD', isActive: true },
        { name: 'Coinbase', provider: 'coinbase', type: 'exchange', currency: 'USD', isActive: true },
        { name: 'Old Account', provider: 'kraken', type: 'exchange', currency: 'USD', isActive: false },
        { name: 'Manual Portfolio', provider: 'manual', type: 'manual', currency: 'JPY', isActive: true },
      ];
      accounts.forEach(account => repository.create(account));
    });

    it('should list all accounts without filters', () => {
      const accounts = repository.list();
      expect(accounts).toHaveLength(4);
    });

    it('should filter by active status', () => {
      const activeAccounts = repository.list({ isActive: true });
      expect(activeAccounts).toHaveLength(3);
      expect(activeAccounts.every(account => account.isActive)).toBe(true);

      const inactiveAccounts = repository.list({ isActive: false });
      expect(inactiveAccounts).toHaveLength(1);
      expect(inactiveAccounts[0].name).toBe('Old Account');
    });

    it('should filter by provider', () => {
      const binanceAccounts = repository.list({ provider: 'binance' });
      expect(binanceAccounts).toHaveLength(1);
      expect(binanceAccounts[0].provider).toBe('binance');
    });

    it('should filter by type', () => {
      const exchangeAccounts = repository.list({ type: 'exchange' });
      expect(exchangeAccounts).toHaveLength(3);

      const manualAccounts = repository.list({ type: 'manual' });
      expect(manualAccounts).toHaveLength(1);
    });

    it('should filter by currency', () => {
      const usdAccounts = repository.list({ currency: 'USD' });
      expect(usdAccounts).toHaveLength(3);

      const jpyAccounts = repository.list({ currency: 'JPY' });
      expect(jpyAccounts).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update existing account', () => {
      const createRequest: CreateAccountRequest = {
        name: 'Original Name',
        provider: 'binance',
        type: 'exchange',
        currency: 'USD',
        isActive: true,
      };

      const created = repository.create(createRequest);
      const updateRequest = {
        name: 'Updated Name',
        isActive: false,
        metadata: { note: 'Updated account' },
      };

      const updated = repository.update(created.id, updateRequest);

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.isActive).toBe(false);
      expect(updated!.metadata).toEqual({ note: 'Updated account' });
      expect(updated!.provider).toBe('binance'); // unchanged
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(created.createdAt.getTime());
    });

    it('should return undefined for non-existent account', () => {
      const result = repository.update('non-existent', { name: 'Test' });
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete existing account', () => {
      const createRequest: CreateAccountRequest = {
        name: 'Test Account',
        provider: 'manual',
        type: 'manual',
        currency: 'USD',
        isActive: true,
      };

      const created = repository.create(createRequest);
      const deleted = repository.delete(created.id);

      expect(deleted).toBe(true);
      expect(repository.getById(created.id)).toBeUndefined();
    });

    it('should return false for non-existent account', () => {
      const result = repository.delete('non-existent');
      expect(result).toBe(false);
    });
  });
});