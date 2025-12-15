import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { TraditionalMarketDataFetcher } from '../market-data/traditional-market-data-fetcher';

import type {
  TraditionalDataRequest,
  TraditionalProviderConfig,
} from '../market-data/traditional-types';

// Mock Yahoo Finance API
jest.mock('yahoo-finance2', () => ({
  quote: jest.fn().mockResolvedValue({
    symbol: 'AAPL',
    regularMarketPrice: 150.25,
    regularMarketOpen: 149.8,
    regularMarketDayHigh: 151.2,
    regularMarketDayLow: 149.5,
    regularMarketVolume: 50000000,
    regularMarketTime: new Date('2024-01-01T16:00:00Z'),
  }),
  historical: jest.fn().mockResolvedValue([
    {
      date: new Date('2024-01-01'),
      open: 149.8,
      high: 151.2,
      low: 149.5,
      close: 150.25,
      volume: 50000000,
    },
    {
      date: new Date('2024-01-02'),
      open: 150.25,
      high: 152.3,
      low: 150.0,
      close: 151.8,
      volume: 45000000,
    },
  ]),
}));

describe('TraditionalMarketDataFetcher', () => {
  let fetcher: TraditionalMarketDataFetcher;

  beforeEach(() => {
    fetcher = new TraditionalMarketDataFetcher();
    jest.clearAllMocks();
  });

  describe('Provider Management', () => {
    it('should initialize with Yahoo Finance provider', async () => {
      const config: TraditionalProviderConfig = {
        provider: 'yahoo-finance',
        rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      };

      await expect(fetcher.addProvider(config)).resolves.not.toThrow();
    });

    it('should initialize with multiple providers', async () => {
      const configs: TraditionalProviderConfig[] = [
        {
          provider: 'yahoo-finance',
          rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
          retryAttempts: 3,
          retryDelay: 1000,
          timeout: 30000,
        },
        {
          provider: 'rakuten-securities',
          apiKey: 'test-key',
          rateLimit: { requestsPerSecond: 2, requestsPerMinute: 120 },
          retryAttempts: 3,
          retryDelay: 2000,
          timeout: 30000,
        },
      ];

      await expect(fetcher.initialize(configs)).resolves.not.toThrow();
    });

    it('should remove a provider', async () => {
      const config: TraditionalProviderConfig = {
        provider: 'yahoo-finance',
        rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      };

      await fetcher.addProvider(config);
      await expect(fetcher.removeProvider('yahoo-finance')).resolves.not.toThrow();
    });
  });

  describe('Stock Price Fetching', () => {
    beforeEach(async () => {
      const config: TraditionalProviderConfig = {
        provider: 'yahoo-finance',
        rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      };
      await fetcher.addProvider(config);
    });

    it('should fetch stock price data successfully', async () => {
      const request: TraditionalDataRequest = {
        symbol: 'AAPL',
        market: 'US',
        timeframe: '1d',
        limit: 100,
      };

      const data = await fetcher.fetchStockPrice('yahoo-finance', request);

      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({
        symbol: 'AAPL',
        provider: 'yahoo-finance',
        timeframe: '1d',
        open: expect.any(String),
        high: expect.any(String),
        low: expect.any(String),
        close: expect.any(String),
        volume: expect.any(String),
      });
      expect(data[0].timestamp).toBeInstanceOf(Date);
    });

    it('should handle Japanese stock symbols', async () => {
      const request: TraditionalDataRequest = {
        symbol: '7203.T', // Toyota Motor Corp
        market: 'JP',
        timeframe: '1d',
        limit: 50,
      };

      const data = await fetcher.fetchStockPrice('yahoo-finance', request);

      expect(Array.isArray(data)).toBe(true);
      expect(data[0].symbol).toBe('7203.T');
    });
  });

  describe('FX Rate Fetching', () => {
    beforeEach(async () => {
      const config: TraditionalProviderConfig = {
        provider: 'yahoo-finance',
        rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      };
      await fetcher.addProvider(config);
    });

    it('should fetch FX rate successfully', async () => {
      const rate = await fetcher.fetchFXRate('yahoo-finance', 'USD', 'JPY');

      expect(typeof rate).toBe('number');
      expect(rate).toBeGreaterThan(0);
    });

    it('should handle EUR/USD rate', async () => {
      const rate = await fetcher.fetchFXRate('yahoo-finance', 'EUR', 'USD');

      expect(typeof rate).toBe('number');
      expect(rate).toBeGreaterThan(0);
    });
  });

  describe('Mutual Fund NAV Fetching', () => {
    beforeEach(async () => {
      const config: TraditionalProviderConfig = {
        provider: 'yahoo-finance',
        rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      };
      await fetcher.addProvider(config);
    });

    it('should fetch mutual fund NAV successfully', async () => {
      const request: TraditionalDataRequest = {
        symbol: 'VTSAX',
        market: 'US',
        timeframe: '1d',
        assetType: 'fund',
      };

      const data = await fetcher.fetchMutualFundNav('yahoo-finance', request);

      expect(data).toMatchObject({
        symbol: 'VTSAX',
        provider: 'yahoo-finance',
        timeframe: '1d',
        close: expect.any(String),
      });
      expect(data.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('CSV Import Functionality', () => {
    it('should import from Rakuten Securities CSV format', async () => {
      const mockCsvData = `取引日,銘柄コード,銘柄名,市場,取引,決済方法,預り,譲渡益税区分,約定数量,約定単価,約定代金,手数料,税額,受渡日,受渡金額,自己株式取得,約定番号,注文番号,銘柄コード（内部）,（NISA区分）
2023-01-01,1234,テスト株式,東証プライム,買,即日,特定,源泉,100,1000,100000,99,0,2023-01-03,-100099,,12345,67890,1234,`;

      const result = await fetcher.importFromCSV(mockCsvData, 'rakuten-securities');

      expect(result).toMatchObject({
        processed: 1,
        created: 1,
        errors: [],
      });
    });

    it('should import from SBI Securities CSV format', async () => {
      const mockCsvData = `約定日,銘柄コード,銘柄名,市場,売買,決済方法,預り区分,約定数量,約定単価,約定代金,手数料・諸経費等,受渡金額,受渡日
2023-01-01,1234,テスト株式,東証プライム,買,現物,特定,100,1000,100000,99,100099,2023-01-03`;

      const result = await fetcher.importFromCSV(mockCsvData, 'sbi-securities');

      expect(result).toMatchObject({
        processed: 1,
        created: 1,
        errors: [],
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const config: TraditionalProviderConfig = {
        provider: 'yahoo-finance',
        rateLimit: { requestsPerSecond: 1, requestsPerMinute: 60 },
        retryAttempts: 2,
        retryDelay: 100,
        timeout: 30000,
      };
      await fetcher.addProvider(config);
    });

    it('should throw error for uninitialized provider', async () => {
      const request: TraditionalDataRequest = {
        symbol: 'AAPL',
        market: 'US',
        timeframe: '1d',
      };

      await expect(fetcher.fetchStockPrice('rakuten-securities', request)).rejects.toThrow(
        'Provider rakuten-securities not initialized',
      );
    });

    // Note: API error and invalid symbol tests would require more complex mock setup
    // For now, focusing on the core functionality and provider initialization errors
  });

  describe('Multiple Provider Support', () => {
    beforeEach(async () => {
      const configs: TraditionalProviderConfig[] = [
        {
          provider: 'yahoo-finance',
          rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
          retryAttempts: 3,
          retryDelay: 1000,
          timeout: 30000,
        },
        {
          provider: 'rakuten-securities',
          apiKey: 'test-key',
          rateLimit: { requestsPerSecond: 2, requestsPerMinute: 120 },
          retryAttempts: 3,
          retryDelay: 2000,
          timeout: 30000,
        },
      ];
      await fetcher.initialize(configs);
    });

    it('should fetch from multiple providers', async () => {
      const request: TraditionalDataRequest = {
        symbol: '7203.T',
        market: 'JP',
        timeframe: '1d',
        limit: 50,
      };

      const results = await fetcher.fetchStockPriceMultiple(['yahoo-finance'], request);

      expect(results.size).toBe(1);
      expect(results.has('yahoo-finance')).toBe(true);

      const yahooData = results.get('yahoo-finance');
      expect(Array.isArray(yahooData)).toBe(true);
    });

    it('should get supported markets for a provider', async () => {
      const markets = await fetcher.getSupportedMarkets('yahoo-finance');

      expect(Array.isArray(markets)).toBe(true);
      expect(markets).toContain('US');
      expect(markets).toContain('JP');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all resources', async () => {
      const configs: TraditionalProviderConfig[] = [
        {
          provider: 'yahoo-finance',
          rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
          retryAttempts: 3,
          retryDelay: 1000,
          timeout: 30000,
        },
        {
          provider: 'rakuten-securities',
          apiKey: 'test-key',
          rateLimit: { requestsPerSecond: 2, requestsPerMinute: 120 },
          retryAttempts: 3,
          retryDelay: 2000,
          timeout: 30000,
        },
      ];

      await fetcher.initialize(configs);
      await expect(fetcher.cleanup()).resolves.not.toThrow();
    });
  });
});
