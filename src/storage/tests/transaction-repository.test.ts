import { beforeEach, describe, expect, it } from '@jest/globals';

import { DatabaseConnection } from '../database/connection';
import { AccountRepository } from '../repositories/account-repository';
import { AssetRepository } from '../repositories/asset-repository';
import { TransactionRepository } from '../repositories/transaction-repository';

import type { CreateTransactionRequest, Asset, Account } from '@/shared/types';

describe('TransactionRepository', () => {
  let repository: TransactionRepository;
  let assetRepository: AssetRepository;
  let accountRepository: AccountRepository;
  let dbConnection: DatabaseConnection;
  let testAsset: Asset;
  let testAccount: Account;

  beforeEach(async () => {
    dbConnection = new DatabaseConnection({ path: ':memory:', memory: true, readonly: false });
    await dbConnection.connect();
    const db = dbConnection.getDatabase();
    repository = new TransactionRepository();
    repository.setDatabase(db);
    assetRepository = new AssetRepository();
    assetRepository.setDatabase(db);
    accountRepository = new AccountRepository();
    accountRepository.setDatabase(db);

    // Create test asset and account
    testAsset = assetRepository.create({
      symbol: 'BTC',
      name: 'Bitcoin',
      type: 'crypto',
      currency: 'USD',
      decimals: 8,
    });

    testAccount = accountRepository.create({
      name: 'Test Account',
      provider: 'binance',
      type: 'exchange',
      currency: 'USD',
      isActive: true,
    });
  });

  describe('create', () => {
    it('should create a new transaction successfully', () => {
      const createRequest: CreateTransactionRequest = {
        accountId: testAccount.id,
        assetId: testAsset.id,
        type: 'buy',
        status: 'completed',
        quantity: '1.5',
        price: '50000.00',
        totalValue: '75000.00',
        fee: '10.00',
        feeCurrency: 'USD',
        timestamp: new Date('2024-01-01T10:00:00Z'),
        externalId: 'binance-12345',
        notes: 'Test purchase',
        metadata: { exchange: 'binance' },
      };

      const transaction = repository.create(createRequest);

      expect(transaction.id).toBeDefined();
      expect(transaction.accountId).toBe(testAccount.id);
      expect(transaction.assetId).toBe(testAsset.id);
      expect(transaction.type).toBe('buy');
      expect(transaction.status).toBe('completed');
      expect(transaction.quantity).toBe('1.5');
      expect(transaction.price).toBe('50000.00');
      expect(transaction.totalValue).toBe('75000.00');
      expect(transaction.fee).toBe('10.00');
      expect(transaction.feeCurrency).toBe('USD');
      expect(transaction.timestamp.toISOString()).toBe('2024-01-01T10:00:00.000Z');
      expect(transaction.externalId).toBe('binance-12345');
      expect(transaction.notes).toBe('Test purchase');
      expect(transaction.metadata).toEqual({ exchange: 'binance' });
      expect(transaction.createdAt).toBeInstanceOf(Date);
      expect(transaction.updatedAt).toBeInstanceOf(Date);
    });

    it('should create transaction with minimal required fields', () => {
      const createRequest: CreateTransactionRequest = {
        accountId: testAccount.id,
        assetId: testAsset.id,
        type: 'deposit',
        status: 'completed',
        quantity: '1.0',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      };

      const transaction = repository.create(createRequest);

      expect(transaction.id).toBeDefined();
      expect(transaction.status).toBe('completed'); // default value
      expect(transaction.price).toBeUndefined();
      expect(transaction.fee).toBeUndefined();
    });
  });

  describe('getById', () => {
    it('should retrieve transaction by id', () => {
      const createRequest: CreateTransactionRequest = {
        accountId: testAccount.id,
        assetId: testAsset.id,
        type: 'buy',
        quantity: '1.0',
        timestamp: new Date(),
      };

      const created = repository.create(createRequest);
      const retrieved = repository.getById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.type).toBe('buy');
    });

    it('should return undefined for non-existent id', () => {
      const retrieved = repository.getById('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      // Create additional test data
      const asset2 = assetRepository.create({
        symbol: 'ETH',
        name: 'Ethereum',
        type: 'crypto',
        currency: 'USD',
        decimals: 18,
      });

      const account2 = accountRepository.create({
        name: 'Account 2',
        provider: 'coinbase',
        type: 'exchange',
        currency: 'USD',
        isActive: true,
      });

      const transactions: CreateTransactionRequest[] = [
        {
          accountId: testAccount.id,
          assetId: testAsset.id,
          type: 'buy',
          quantity: '1.0',
          price: '50000.00',
          timestamp: new Date('2024-01-01T10:00:00Z'),
        },
        {
          accountId: testAccount.id,
          assetId: asset2.id,
          type: 'buy',
          quantity: '10.0',
          price: '3000.00',
          timestamp: new Date('2024-01-02T10:00:00Z'),
        },
        {
          accountId: account2.id,
          assetId: testAsset.id,
          type: 'sell',
          quantity: '0.5',
          price: '51000.00',
          timestamp: new Date('2024-01-03T10:00:00Z'),
        },
        {
          accountId: testAccount.id,
          assetId: testAsset.id,
          type: 'deposit',
          quantity: '0.1',
          timestamp: new Date('2024-01-04T10:00:00Z'),
        },
      ];

      transactions.forEach((tx) => repository.create(tx));
    });

    it('should list all transactions without filters', () => {
      const transactions = repository.list();
      expect(transactions).toHaveLength(4);
    });

    it('should filter by account', () => {
      const accountTxs = repository.list({ accountId: testAccount.id });
      expect(accountTxs).toHaveLength(3);
      expect(accountTxs.every((tx) => tx.accountId === testAccount.id)).toBe(true);
    });

    it('should filter by asset', () => {
      const assetTxs = repository.list({ assetId: testAsset.id });
      expect(assetTxs).toHaveLength(3);
      expect(assetTxs.every((tx) => tx.assetId === testAsset.id)).toBe(true);
    });

    it('should filter by transaction type', () => {
      const buyTxs = repository.list({ type: 'buy' });
      expect(buyTxs).toHaveLength(2);
      expect(buyTxs.every((tx) => tx.type === 'buy')).toBe(true);

      const sellTxs = repository.list({ type: 'sell' });
      expect(sellTxs).toHaveLength(1);
    });

    it('should filter by date range', () => {
      const recentTxs = repository.list({
        fromDate: new Date('2024-01-02T00:00:00Z'),
        toDate: new Date('2024-01-03T23:59:59Z'),
      });
      expect(recentTxs).toHaveLength(2);
    });

    it('should limit results', () => {
      const limitedTxs = repository.list({ limit: 2 });
      expect(limitedTxs).toHaveLength(2);
    });

    it('should sort by timestamp descending by default', () => {
      const transactions = repository.list();
      expect(transactions).toHaveLength(4);

      // Check that timestamps are in descending order
      for (let i = 0; i < transactions.length - 1; i++) {
        expect(transactions[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          transactions[i + 1].timestamp.getTime(),
        );
      }
    });
  });

  describe('getAccountHistory', () => {
    beforeEach(() => {
      const transactions: CreateTransactionRequest[] = [
        {
          accountId: testAccount.id,
          assetId: testAsset.id,
          type: 'buy',
          quantity: '1.0',
          price: '50000.00',
          timestamp: new Date('2024-01-01T10:00:00Z'),
        },
        {
          accountId: testAccount.id,
          assetId: testAsset.id,
          type: 'sell',
          quantity: '0.5',
          price: '52000.00',
          timestamp: new Date('2024-01-02T10:00:00Z'),
        },
      ];

      transactions.forEach((tx) => repository.create(tx));
    });

    it('should get transaction history for account', () => {
      const history = repository.getAccountHistory(testAccount.id);
      expect(history).toHaveLength(2);
      expect(history.every((tx) => tx.accountId === testAccount.id)).toBe(true);
    });

    it('should respect limit parameter', () => {
      const history = repository.getAccountHistory(testAccount.id, 1);
      expect(history).toHaveLength(1);
    });
  });

  describe('getAssetHistory', () => {
    beforeEach(() => {
      const transactions: CreateTransactionRequest[] = [
        {
          accountId: testAccount.id,
          assetId: testAsset.id,
          type: 'buy',
          quantity: '1.0',
          price: '50000.00',
          timestamp: new Date('2024-01-01T10:00:00Z'),
        },
        {
          accountId: testAccount.id,
          assetId: testAsset.id,
          type: 'sell',
          quantity: '0.5',
          price: '52000.00',
          timestamp: new Date('2024-01-02T10:00:00Z'),
        },
      ];

      transactions.forEach((tx) => repository.create(tx));
    });

    it('should get transaction history for asset', () => {
      const history = repository.getAssetHistory(testAsset.id);
      expect(history).toHaveLength(2);
      expect(history.every((tx) => tx.assetId === testAsset.id)).toBe(true);
    });

    it('should respect limit parameter', () => {
      const history = repository.getAssetHistory(testAsset.id, 1);
      expect(history).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update existing transaction', () => {
      const createRequest: CreateTransactionRequest = {
        accountId: testAccount.id,
        assetId: testAsset.id,
        type: 'buy',
        status: 'pending',
        quantity: '1.0',
        timestamp: new Date('2024-01-01T10:00:00Z'),
      };

      const created = repository.create(createRequest);
      const updateRequest = {
        status: 'completed' as const,
        price: '50000.00',
        totalValue: '50000.00',
        notes: 'Completed transaction',
      };

      const updated = repository.update(created.id, updateRequest);

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('completed');
      expect(updated!.price).toBe('50000.00');
      expect(updated!.totalValue).toBe('50000.00');
      expect(updated!.notes).toBe('Completed transaction');
      expect(updated!.type).toBe('buy'); // unchanged
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(created.createdAt.getTime());
    });

    it('should return undefined for non-existent transaction', () => {
      const result = repository.update('non-existent', { notes: 'Test' });
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete existing transaction', () => {
      const createRequest: CreateTransactionRequest = {
        accountId: testAccount.id,
        assetId: testAsset.id,
        type: 'buy',
        quantity: '1.0',
        timestamp: new Date(),
      };

      const created = repository.create(createRequest);
      const deleted = repository.delete(created.id);

      expect(deleted).toBe(true);
      expect(repository.getById(created.id)).toBeUndefined();
    });

    it('should return false for non-existent transaction', () => {
      const result = repository.delete('non-existent');
      expect(result).toBe(false);
    });
  });
});
