import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { CoreDataStore } from '@/storage/core-data-store';

import { OHLCVIngestionService } from '../market-data/ohlcv-ingestion-service';

import type { CryptoMarketDataFetcher } from '@/ingestion/market-data/crypto-market-data-fetcher';
import type { OHLCVTimeframe } from '@/shared/types';

const createCandle = (timestamp: string, close: string) => ({
  timestamp: new Date(timestamp),
  open: close,
  high: close,
  low: close,
  close,
  volume: '1',
  symbol: 'BTC/USDT',
  provider: 'binance' as const,
  timeframe: '1h',
});

describe('OHLCVIngestionService', () => {
  let dataStore: CoreDataStore;
  let fetcher: jest.Mocked<CryptoMarketDataFetcher>;
  let service: OHLCVIngestionService;
  let btcAssetId: string;
  let ethAssetId: string;
  const timeframe: OHLCVTimeframe = '1h';

  beforeEach(async () => {
    dataStore = new CoreDataStore({ databasePath: ':memory:', memory: true, readonly: false });
    await dataStore.initialize();

    fetcher = {
      fetchOHLCV: jest.fn(),
      addProvider: jest.fn(),
      initialize: jest.fn(),
      removeProvider: jest.fn(),
      fetchOHLCVMultiple: jest.fn(),
      getAvailableSymbols: jest.fn(),
      getExchangeInfo: jest.fn(),
    } as unknown as jest.Mocked<CryptoMarketDataFetcher>;

    service = new OHLCVIngestionService(fetcher, dataStore);

    btcAssetId = dataStore.assets.create({
      symbol: 'BTC/USDT',
      name: 'Bitcoin',
      type: 'crypto',
      currency: 'USD',
      decimals: 8,
    }).id;
    ethAssetId = dataStore.assets.create({
      symbol: 'ETH/USDT',
      name: 'Ethereum',
      type: 'crypto',
      currency: 'USD',
      decimals: 8,
    }).id;
  });

  it('stores fetched candles for multiple symbols and ignores duplicates', async () => {
    const duplicateTimestamp = new Date('2024-01-01T00:00:00Z');
    dataStore.ohlcv.create({
      assetId: btcAssetId,
      timeframe,
      timestamp: duplicateTimestamp,
      open: '100',
      high: '100',
      low: '100',
      close: '100',
      volume: '1',
      source: 'seed',
    });

    fetcher.fetchOHLCV.mockImplementation(async (_provider, request) => {
      if (request.symbol === 'BTC/USDT') {
        return [
          createCandle('2024-01-01T00:00:00Z', '100'), // duplicate
          createCandle('2024-01-01T01:00:00Z', '110'),
        ];
      }
      return [
        {
          ...createCandle('2024-01-01T00:30:00Z', '50'),
          symbol: 'ETH/USDT',
        },
      ];
    });

    const result = await service.syncOHLCV({
      provider: 'binance',
      symbols: ['BTC/USDT', 'ETH/USDT'],
      timeframe,
    });

    expect(fetcher.fetchOHLCV).toHaveBeenCalledTimes(2);
    const btcTimeSeries = dataStore.ohlcv.getTimeSeries({ assetId: btcAssetId, timeframe });
    const ethTimeSeries = dataStore.ohlcv.getTimeSeries({ assetId: ethAssetId, timeframe });
    expect(btcTimeSeries).toHaveLength(2);
    expect(ethTimeSeries).toHaveLength(1);
    expect(result.totalInserted).toBe(2); // duplicate ignored
    expect(result.summaries.find((s) => s.symbol === 'BTC/USDT')?.inserted).toBe(1);
    expect(result.summaries.find((s) => s.symbol === 'ETH/USDT')?.inserted).toBe(1);
  });

  it('uses latest stored timestamp when autoSinceLatest is enabled', async () => {
    const latest = new Date('2024-01-02T00:00:00Z');
    dataStore.ohlcv.create({
      assetId: btcAssetId,
      timeframe,
      timestamp: latest,
      open: '200',
      high: '200',
      low: '200',
      close: '200',
      volume: '1',
      source: 'seed',
    });

    fetcher.fetchOHLCV.mockResolvedValue([createCandle('2024-01-02T01:00:00Z', '210')]);

    await service.syncOHLCV({
      provider: 'binance',
      symbols: ['BTC/USDT'],
      timeframe,
      autoSinceLatest: true,
    });

    expect(fetcher.fetchOHLCV).toHaveBeenCalledWith(
      'binance',
      expect.objectContaining({
        symbol: 'BTC/USDT',
        timeframe,
        since: latest,
      }),
    );
  });

  it('reports asset-not-found error and skips fetching', async () => {
    fetcher.fetchOHLCV.mockResolvedValue([]);

    const result = await service.syncOHLCV({
      provider: 'binance',
      symbols: ['UNKNOWN/USDT'],
      timeframe,
    });

    expect(fetcher.fetchOHLCV).not.toHaveBeenCalled();
    expect(result.summaries[0]?.error).toMatch(/asset not found/i);
    expect(result.totalInserted).toBe(0);
  });
});
