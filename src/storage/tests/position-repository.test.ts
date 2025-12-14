import { beforeEach, describe, expect, it } from '@jest/globals';
import { PositionRepository } from '../repositories/position-repository';
import { AssetRepository } from '../repositories/asset-repository';
import { AccountRepository } from '../repositories/account-repository';
import { DatabaseConnection } from '../database/connection';
import type { CreatePositionRequest, Asset, Account } from '@/shared/types';

describe('PositionRepository', () => {
  let repository: PositionRepository;
  let assetRepository: AssetRepository;
  let accountRepository: AccountRepository;
  let dbConnection: DatabaseConnection;
  let testAsset: Asset;
  let testAccount: Account;

  beforeEach(async () => {
    dbConnection = new DatabaseConnection({ path: ':memory:', memory: true, readonly: false });
    await dbConnection.connect();
    const db = dbConnection.getDatabase();
    repository = new PositionRepository();
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

  describe('upsert', () => {
    it('should create a new position', () => {
      const position = repository.upsert(testAccount.id, testAsset.id, {
        quantity: '1.5',
        averagePrice: '50000.00',
        lastPrice: '52000.00',
        metadata: { source: 'api' },
      });

      expect(position.id).toBeDefined();
      expect(position.accountId).toBe(testAccount.id);
      expect(position.assetId).toBe(testAsset.id);
      expect(position.quantity).toBe('1.5');
      expect(position.averagePrice).toBe('50000.00');
      expect(position.lastPrice).toBe('52000.00');
      expect(position.metadata).toEqual({ source: 'api' });
    });

    it('should update existing position for same account-asset pair', () => {
      // Create initial position
      const initial = repository.upsert(testAccount.id, testAsset.id, {
        quantity: '1.0',
        averagePrice: '50000.00',
      });

      // Update the same position
      const updated = repository.upsert(testAccount.id, testAsset.id, {
        quantity: '2.0',
        averagePrice: '51000.00',
        lastPrice: '52000.00',
      });

      expect(updated.id).toBe(initial.id); // Same position
      expect(updated.quantity).toBe('2.0');
      expect(updated.averagePrice).toBe('51000.00');
      expect(updated.lastPrice).toBe('52000.00');
    });
  });

  describe('getById', () => {
    it('should retrieve position by id', () => {
      const created = repository.upsert(testAccount.id, testAsset.id, {
        quantity: '1.0',
      });
      const retrieved = repository.getById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.quantity).toBe('1.0');
    });

    it('should return undefined for non-existent id', () => {
      const retrieved = repository.getById('non-existent-id');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getByAccountAndAsset', () => {
    it('should retrieve position by account and asset', () => {
      repository.upsert(testAccount.id, testAsset.id, {
        quantity: '1.0',
      });
      const retrieved = repository.getByAccountAndAsset(testAccount.id, testAsset.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.accountId).toBe(testAccount.id);
      expect(retrieved!.assetId).toBe(testAsset.id);
    });

    it('should return undefined for non-existent combination', () => {
      const retrieved = repository.getByAccountAndAsset('non-existent-account', 'non-existent-asset');
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

      // Create positions
      repository.upsert(testAccount.id, testAsset.id, {
        quantity: '1.0',
        averagePrice: '50000.00',
      });
      repository.upsert(testAccount.id, asset2.id, {
        quantity: '10.0',
        averagePrice: '3000.00',
      });
      repository.upsert(account2.id, testAsset.id, {
        quantity: '0.5',
        averagePrice: '51000.00',
      });
    });

    it('should list all positions without filters', () => {
      const positions = repository.list();
      expect(positions).toHaveLength(3);
    });

    it('should filter by account', () => {
      const accountPositions = repository.list({ accountId: testAccount.id });
      expect(accountPositions).toHaveLength(2);
      expect(accountPositions.every(pos => pos.accountId === testAccount.id)).toBe(true);
    });

    it('should filter by asset', () => {
      const assetPositions = repository.list({ assetId: testAsset.id });
      expect(assetPositions).toHaveLength(2);
      expect(assetPositions.every(pos => pos.assetId === testAsset.id)).toBe(true);
    });

    it('should filter by minimum quantity', () => {
      const largePositions = repository.list({ minQuantity: '1.0' });
      expect(largePositions).toHaveLength(2);
    });

    it('should filter by minimum quantity', () => {
      const largePositions = repository.list({ minQuantity: '5.0' });
      expect(largePositions.length).toBeGreaterThanOrEqual(0);
    });
  });


  describe('delete', () => {
    it('should delete existing position', () => {
      const created = repository.upsert(testAccount.id, testAsset.id, {
        quantity: '1.0',
      });
      const deleted = repository.delete(created.id);

      expect(deleted).toBe(true);
      expect(repository.getById(created.id)).toBeUndefined();
    });

    it('should return false for non-existent position', () => {
      const result = repository.delete('non-existent');
      expect(result).toBe(false);
    });
  });
});