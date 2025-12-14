import { beforeEach, describe, expect, it } from '@jest/globals';

import { DatabaseConnection } from '../database/connection';
import { AssetRepository } from '../repositories/asset-repository';

import type { CreateAssetRequest } from '@/shared/types';

describe('AssetRepository', () => {
  let repository: AssetRepository;
  let dbConnection: DatabaseConnection;

  beforeEach(async () => {
    dbConnection = new DatabaseConnection({ path: ':memory:', memory: true, readonly: false });
    await dbConnection.connect();
    repository = new AssetRepository();
    repository.setDatabase(dbConnection.getDatabase());
  });

  describe('create', () => {
    it('should create a new asset successfully', () => {
      const createRequest: CreateAssetRequest = {
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        decimals: 8,
        metadata: { exchange: 'binance' },
      };

      const asset = repository.create(createRequest);

      expect(asset.id).toBeDefined();
      expect(asset.symbol).toBe('BTC');
      expect(asset.name).toBe('Bitcoin');
      expect(asset.type).toBe('crypto');
      expect(asset.currency).toBe('USD');
      expect(asset.decimals).toBe(8);
      expect(asset.metadata).toEqual({ exchange: 'binance' });
      expect(asset.createdAt).toBeInstanceOf(Date);
      expect(asset.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw error for duplicate symbol', () => {
      const createRequest: CreateAssetRequest = {
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        decimals: 8,
      };

      repository.create(createRequest);

      expect(() => repository.create(createRequest)).toThrow();
    });
  });

  describe('getById', () => {
    it('should retrieve asset by id', () => {
      const createRequest: CreateAssetRequest = {
        symbol: 'ETH',
        name: 'Ethereum',
        type: 'crypto',
        currency: 'USD',
        decimals: 18,
      };

      const created = repository.create(createRequest);
      const retrieved = repository.getById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.symbol).toBe('ETH');
    });

    it('should return undefined for non-existent id', () => {
      const retrieved = repository.getById('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('getBySymbol', () => {
    it('should retrieve asset by symbol', () => {
      const createRequest: CreateAssetRequest = {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'stock',
        currency: 'USD',
        decimals: 2,
      };

      repository.create(createRequest);
      const retrieved = repository.getBySymbol('AAPL');

      expect(retrieved).toBeDefined();
      expect(retrieved!.symbol).toBe('AAPL');
      expect(retrieved!.name).toBe('Apple Inc.');
    });

    it('should return undefined for non-existent symbol', () => {
      const retrieved = repository.getBySymbol('NONEXISTENT');
      expect(retrieved).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      const assets: CreateAssetRequest[] = [
        { symbol: 'BTC', name: 'Bitcoin', type: 'crypto', currency: 'USD', decimals: 8 },
        { symbol: 'ETH', name: 'Ethereum', type: 'crypto', currency: 'USD', decimals: 18 },
        { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', currency: 'USD', decimals: 2 },
        { symbol: 'USDT', name: 'Tether', type: 'crypto', currency: 'USD', decimals: 6 },
      ];
      assets.forEach((asset) => repository.create(asset));
    });

    it('should list all assets without filters', () => {
      const assets = repository.list();
      expect(assets).toHaveLength(4);
    });

    it('should filter by type', () => {
      const cryptoAssets = repository.list({ type: 'crypto' });
      expect(cryptoAssets).toHaveLength(3);
      expect(cryptoAssets.every((asset) => asset.type === 'crypto')).toBe(true);

      const stockAssets = repository.list({ type: 'stock' });
      expect(stockAssets).toHaveLength(1);
      expect(stockAssets[0].symbol).toBe('AAPL');
    });

    it('should filter by currency', () => {
      const usdAssets = repository.list({ currency: 'USD' });
      expect(usdAssets).toHaveLength(4);
    });

    it('should filter by symbols', () => {
      const specificAssets = repository.list({ symbols: ['BTC', 'AAPL'] });
      expect(specificAssets).toHaveLength(2);
      expect(specificAssets.map((a) => a.symbol).sort()).toEqual(['AAPL', 'BTC']);
    });
  });

  describe('update', () => {
    it('should update existing asset', () => {
      const createRequest: CreateAssetRequest = {
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        decimals: 8,
      };

      const created = repository.create(createRequest);
      const updateRequest = {
        name: 'Bitcoin Updated',
        decimals: 10,
        metadata: { updated: true },
      };

      const updated = repository.update(created.id, updateRequest);

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Bitcoin Updated');
      expect(updated!.decimals).toBe(10);
      expect(updated!.metadata).toEqual({ updated: true });
      expect(updated!.symbol).toBe('BTC'); // unchanged
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(created.createdAt.getTime());
    });

    it('should return undefined for non-existent asset', () => {
      const result = repository.update('non-existent', { name: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete existing asset', () => {
      const createRequest: CreateAssetRequest = {
        symbol: 'TEST',
        name: 'Test Asset',
        type: 'crypto',
        currency: 'USD',
        decimals: 8,
      };

      const created = repository.create(createRequest);
      const deleted = repository.delete(created.id);

      expect(deleted).toBe(true);
      expect(repository.getById(created.id)).toBeNull();
    });

    it('should return false for non-existent asset', () => {
      const result = repository.delete('non-existent');
      expect(result).toBe(false);
    });
  });
});
