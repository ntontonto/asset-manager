import { CoreDataStore } from '@/storage';

import { PortfolioSnapshotBuilder } from '../portfolio-snapshot-builder';

import type {
  Asset,
  Account,
  Position,
  CreateAssetRequest,
  CreateAccountRequest,
  CreatePosition,
} from '@/shared/types';

describe('PortfolioSnapshotBuilder', () => {
  let dataStore: CoreDataStore;
  let builder: PortfolioSnapshotBuilder;

  beforeEach(async () => {
    dataStore = new CoreDataStore({
      databasePath: ':memory:',
      memory: true,
      readonly: false,
    });
    await dataStore.initialize();

    builder = new PortfolioSnapshotBuilder(dataStore);
  });

  afterEach(() => {
    dataStore.close();
  });

  describe('buildSnapshot', () => {
    it('should create snapshot with no positions when accounts are empty', async () => {
      const snapshot = await builder.buildSnapshot();

      expect(snapshot.totalMarketValue).toBe('0');
      expect(snapshot.assets).toHaveLength(0);
      expect(snapshot.baseCurrency).toBe('USD');
      expect(snapshot.allocationByType).toEqual({});
      expect(snapshot.allocationByAccount).toEqual({});
    });

    it('should calculate correct market values and allocations with single asset', async () => {
      // Setup test data
      const asset = await createTestAsset(dataStore, {
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
      });

      const account = await createTestAccount(dataStore, {
        name: 'Binance Account',
        provider: 'binance',
        type: 'exchange',
        currency: 'USD',
      });

      await createTestPosition(dataStore, {
        accountId: account.id,
        assetId: asset.id,
        quantity: '1.5',
        lastUpdated: new Date(),
      });

      // Mock current price - in real implementation this would come from market data
      const mockPrice = '50000.00';
      jest.spyOn(builder as any, 'getCurrentPrice').mockResolvedValue(mockPrice);

      const snapshot = await builder.buildSnapshot();

      expect(snapshot.totalMarketValue).toBe('75000.00');
      expect(snapshot.assets).toHaveLength(1);

      const assetItem = snapshot.assets[0];
      expect(assetItem.symbol).toBe('BTC');
      expect(assetItem.quantity).toBe('1.5');
      expect(assetItem.currentPrice).toBe(mockPrice);
      expect(assetItem.marketValue).toBe('75000.00');
      expect(assetItem.weight).toBe('100.00');

      expect(snapshot.allocationByType).toEqual({ crypto: '100.00' });
      expect(snapshot.allocationByAccount).toEqual({ [account.id]: '100.00' });
    });

    it('should aggregate positions across multiple accounts for same asset', async () => {
      // Setup test data
      const asset = await createTestAsset(dataStore, {
        symbol: 'ETH',
        name: 'Ethereum',
        type: 'crypto',
        currency: 'USD',
      });

      const account1 = await createTestAccount(dataStore, {
        name: 'Binance',
        provider: 'binance',
        type: 'exchange',
        currency: 'USD',
      });

      const account2 = await createTestAccount(dataStore, {
        name: 'Coinbase',
        provider: 'coinbase',
        type: 'exchange',
        currency: 'USD',
      });

      await createTestPosition(dataStore, {
        accountId: account1.id,
        assetId: asset.id,
        quantity: '10.0',
        lastUpdated: new Date(),
      });

      await createTestPosition(dataStore, {
        accountId: account2.id,
        assetId: asset.id,
        quantity: '5.0',
        lastUpdated: new Date(),
      });

      const mockPrice = '3000.00';
      jest.spyOn(builder as any, 'getCurrentPrice').mockResolvedValue(mockPrice);

      const snapshot = await builder.buildSnapshot();

      expect(snapshot.totalMarketValue).toBe('45000.00');
      expect(snapshot.assets).toHaveLength(1);

      const assetItem = snapshot.assets[0];
      expect(assetItem.quantity).toBe('15'); // 10 + 5
      expect(assetItem.marketValue).toBe('45000.00'); // 15 * 3000
      expect(assetItem.accounts).toHaveLength(2);

      // Check account breakdown
      const accountBreakdown = assetItem.accounts.find((acc) => acc.accountId === account1.id);
      expect(accountBreakdown?.quantity).toBe('10');
      expect(accountBreakdown?.marketValue).toBe('30000.00');
    });

    it('should handle multiple asset types and calculate correct allocations', async () => {
      // Create crypto asset
      const btc = await createTestAsset(dataStore, {
        symbol: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        currency: 'USD',
      });

      // Create stock asset
      const aapl = await createTestAsset(dataStore, {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'stock',
        currency: 'USD',
      });

      const account = await createTestAccount(dataStore, {
        name: 'Mixed Portfolio',
        provider: 'other',
        type: 'brokerage',
        currency: 'USD',
      });

      await createTestPosition(dataStore, {
        accountId: account.id,
        assetId: btc.id,
        quantity: '0.5',
        lastUpdated: new Date(),
      });

      await createTestPosition(dataStore, {
        accountId: account.id,
        assetId: aapl.id,
        quantity: '100',
        lastUpdated: new Date(),
      });

      // Mock prices
      jest.spyOn(builder as any, 'getCurrentPrice').mockImplementation(async (symbol: string) => {
        switch (symbol) {
          case 'BTC':
            return '60000.00';
          case 'AAPL':
            return '150.00';
          default:
            throw new Error(`Unknown symbol: ${symbol}`);
        }
      });

      const snapshot = await builder.buildSnapshot();

      // Total: (0.5 * 60000) + (100 * 150) = 30000 + 15000 = 45000
      expect(snapshot.totalMarketValue).toBe('45000.00');
      expect(snapshot.assets).toHaveLength(2);

      // Check allocations by type
      expect(snapshot.allocationByType).toEqual({
        crypto: '66.67', // 30000 / 45000 = 66.67%
        stock: '33.33', // 15000 / 45000 = 33.33%
      });

      expect(snapshot.allocationByAccount).toEqual({
        [account.id]: '100.00',
      });
    });

    it('should use custom asOfDate when provided', async () => {
      const customDate = new Date('2023-12-01T10:00:00Z');
      const snapshot = await builder.buildSnapshot(customDate);

      expect(snapshot.timestamp).toEqual(customDate);
    });
  });
});

// Helper functions for test data creation
async function createTestAsset(
  dataStore: CoreDataStore,
  request: CreateAssetRequest,
): Promise<Asset> {
  return dataStore.assets.create(request);
}

async function createTestAccount(
  dataStore: CoreDataStore,
  request: CreateAccountRequest,
): Promise<Account> {
  return dataStore.accounts.create(request);
}

async function createTestPosition(
  dataStore: CoreDataStore,
  request: CreatePosition,
): Promise<Position> {
  return dataStore.positions.upsert(request.accountId, request.assetId, {
    quantity: request.quantity,
    averagePrice: request.averagePrice,
    lastPrice: request.lastPrice,
    metadata: request.metadata,
  });
}
