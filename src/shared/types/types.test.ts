import { validateData, ValidationError } from '../utils/validation';

import {
  AssetSchema,
  CreateAssetSchema,
  AccountSchema,
  CreateAccountSchema,
  PositionSchema,
  TransactionSchema,
  OHLCVDataSchema,
  PortfolioSnapshotSchema,
} from './index';

describe('Data Model Validation', () => {
  describe('Asset Schema', () => {
    it('should validate a complete asset', () => {
      const validAsset = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
        decimals: 8,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => validateData(AssetSchema, validAsset)).not.toThrow();
    });

    it('should reject invalid asset type', () => {
      const invalidAsset = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'invalid_type',
        currency: 'USD',
        decimals: 8,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => validateData(AssetSchema, invalidAsset)).toThrow(ValidationError);
    });

    it('should validate create asset schema without auto-generated fields', () => {
      const createAssetData = {
        symbol: 'ETH',
        name: 'Ethereum',
        type: 'crypto',
        currency: 'USD',
        decimals: 18,
      };

      expect(() => validateData(CreateAssetSchema, createAssetData)).not.toThrow();
    });
  });

  describe('Account Schema', () => {
    it('should validate a complete account', () => {
      const validAccount = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Binance Main',
        provider: 'binance',
        type: 'exchange',
        currency: 'USD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => validateData(AccountSchema, validAccount)).not.toThrow();
    });

    it('should validate create account schema', () => {
      const createAccountData = {
        name: 'Coinbase Pro',
        provider: 'coinbase',
        type: 'exchange',
        currency: 'USD',
      };

      expect(() => validateData(CreateAccountSchema, createAccountData)).not.toThrow();
    });
  });

  describe('Position Schema', () => {
    it('should validate a position with decimal quantities as strings', () => {
      const validPosition = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        accountId: '550e8400-e29b-41d4-a716-446655440001',
        assetId: '550e8400-e29b-41d4-a716-446655440002',
        quantity: '1.23456789',
        averagePrice: '45000.50',
        lastPrice: '46000.00',
        lastUpdated: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => validateData(PositionSchema, validPosition)).not.toThrow();
    });
  });

  describe('Transaction Schema', () => {
    it('should validate a buy transaction', () => {
      const validTransaction = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        accountId: '550e8400-e29b-41d4-a716-446655440001',
        assetId: '550e8400-e29b-41d4-a716-446655440002',
        type: 'buy',
        status: 'completed',
        quantity: '0.1',
        price: '45000.00',
        totalValue: '4500.00',
        fee: '10.00',
        feeCurrency: 'USD',
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => validateData(TransactionSchema, validTransaction)).not.toThrow();
    });
  });

  describe('OHLCV Schema', () => {
    it('should validate OHLCV data', () => {
      const validOHLCV = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        assetId: '550e8400-e29b-41d4-a716-446655440001',
        timeframe: '1d',
        timestamp: new Date(),
        open: '45000.00',
        high: '46000.00',
        low: '44500.00',
        close: '45800.00',
        volume: '1234.567',
        source: 'binance',
        createdAt: new Date(),
      };

      expect(() => validateData(OHLCVDataSchema, validOHLCV)).not.toThrow();
    });
  });

  describe('Portfolio Snapshot Schema', () => {
    it('should validate a complete portfolio snapshot', () => {
      const validSnapshot = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: new Date(),
        totalMarketValue: '100000.00',
        totalCostBasis: '95000.00',
        totalUnrealizedPnl: '5000.00',
        totalUnrealizedPnlPercent: '5.26',
        baseCurrency: 'USD',
        assets: [
          {
            assetId: '550e8400-e29b-41d4-a716-446655440001',
            symbol: 'BTC',
            assetType: 'crypto',
            quantity: '1.0',
            averagePrice: '45000.00',
            currentPrice: '46000.00',
            marketValue: '46000.00',
            costBasis: '45000.00',
            unrealizedPnl: '1000.00',
            unrealizedPnlPercent: '2.22',
            weight: '46.0',
            accounts: [
              {
                accountId: '550e8400-e29b-41d4-a716-446655440002',
                accountName: 'Binance Main',
                quantity: '1.0',
                marketValue: '46000.00',
              },
            ],
          },
        ],
        allocationByType: {
          crypto: '60.0',
          stock: '40.0',
        },
        allocationByAccount: {
          binance_main: '60.0',
          sbi_securities: '40.0',
        },
        createdAt: new Date(),
      };

      const result = validateData(PortfolioSnapshotSchema, validSnapshot);
      expect(result).toBeDefined();
      expect(result.id).toBe(validSnapshot.id);
    });
  });
});
