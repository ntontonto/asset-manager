import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { CryptoMarketDataFetcher } from '../market-data/crypto-market-data-fetcher';
import { RateLimiter } from '../market-data/rate-limiter';

import type { ProviderConfig, MarketDataRequest } from '../market-data/types';

// Mock CCXT
jest.mock('ccxt', () => {
  const mockExchange = {
    loadMarkets: jest.fn().mockResolvedValue({
      'BTC/USDT': { symbol: 'BTC/USDT' },
      'ETH/USDT': { symbol: 'ETH/USDT' },
    }),
    fetchOHLCV: jest.fn().mockResolvedValue([
      [1640995200000, 47000, 48000, 46500, 47500, 1.5], // Mock OHLCV data
      [1641001200000, 47500, 48500, 47000, 48000, 2.1],
    ]),
    close: jest.fn().mockResolvedValue(undefined),
    name: 'Mock Exchange',
    countries: ['US'],
    rateLimit: 1000,
    has: { fetchOHLCV: true },
    timeframes: { '1h': '1h' },
  };

  return {
    __esModule: true,
    default: {},
    binance: jest.fn(() => mockExchange),
    coinbase: jest.fn(() => mockExchange),
    kraken: jest.fn(() => mockExchange),
    bitflyer: jest.fn(() => mockExchange),
    okx: jest.fn(() => mockExchange),
    bybit: jest.fn(() => mockExchange),
  };
});

describe('CryptoMarketDataFetcher', () => {
  let fetcher: CryptoMarketDataFetcher;

  beforeEach(() => {
    fetcher = new CryptoMarketDataFetcher();
    jest.clearAllMocks();
  });

  describe('Provider Management', () => {
    it('should initialize with multiple providers', async () => {
      const configs: ProviderConfig[] = [
        {
          provider: 'binance',
          sandbox: true,
          rateLimit: { requestsPerSecond: 10, requestsPerMinute: 600 },
          retryAttempts: 3,
          retryDelay: 1000,
          timeout: 30000,
        },
        {
          provider: 'coinbase',
          sandbox: true,
          rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
          retryAttempts: 3,
          retryDelay: 1000,
          timeout: 30000,
        },
      ];

      await expect(fetcher.initialize(configs)).resolves.not.toThrow();
    });

    it('should add a single provider', async () => {
      const config: ProviderConfig = {
        provider: 'binance',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        sandbox: true,
        rateLimit: { requestsPerSecond: 10, requestsPerMinute: 600 },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      };

      await expect(fetcher.addProvider(config)).resolves.not.toThrow();
    });

    it('should remove a provider', async () => {
      const config: ProviderConfig = {
        provider: 'binance',
        sandbox: true,
        rateLimit: { requestsPerSecond: 10, requestsPerMinute: 600 },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      };

      await fetcher.addProvider(config);
      await expect(fetcher.removeProvider('binance')).resolves.not.toThrow();
    });

    it('should get exchange info', async () => {
      const config: ProviderConfig = {
        provider: 'binance',
        sandbox: true,
        rateLimit: { requestsPerSecond: 10, requestsPerMinute: 600 },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      };

      await fetcher.addProvider(config);
      const info = fetcher.getExchangeInfo('binance');

      expect(info).toBeDefined();
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('countries');
    });
  });

  describe('Market Data Fetching', () => {
    beforeEach(async () => {
      const config: ProviderConfig = {
        provider: 'binance',
        sandbox: true,
        rateLimit: { requestsPerSecond: 10, requestsPerMinute: 600 },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      };
      await fetcher.addProvider(config);
    });

    it('should fetch OHLCV data successfully', async () => {
      const request: MarketDataRequest = {
        symbol: 'BTC/USDT',
        timeframe: '1h',
        limit: 100,
      };

      const data = await fetcher.fetchOHLCV('binance', request);

      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(2);
      expect(data[0]).toMatchObject({
        symbol: 'BTC/USDT',
        provider: 'binance',
        timeframe: '1h',
        open: '47000',
        high: '48000',
        low: '46500',
        close: '47500',
        volume: '1.5',
      });
      expect(data[0].timestamp).toBeInstanceOf(Date);
    });

    it('should fetch from multiple providers', async () => {
      const coinbaseConfig: ProviderConfig = {
        provider: 'coinbase',
        sandbox: true,
        rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
        retryAttempts: 3,
        retryDelay: 1000,
        timeout: 30000,
      };
      await fetcher.addProvider(coinbaseConfig);

      const request: MarketDataRequest = {
        symbol: 'BTC/USDT',
        timeframe: '1h',
        limit: 50,
      };

      const results = await fetcher.fetchOHLCVMultiple(['binance', 'coinbase'], request);

      expect(results.size).toBe(2);
      expect(results.has('binance')).toBe(true);
      expect(results.has('coinbase')).toBe(true);

      const binanceData = results.get('binance');
      expect(Array.isArray(binanceData)).toBe(true);
    });

    it('should throw error for uninitialized provider', async () => {
      const request: MarketDataRequest = {
        symbol: 'BTC/USDT',
        timeframe: '1h',
      };

      await expect(fetcher.fetchOHLCV('kraken', request)).rejects.toThrow(
        'Provider kraken not initialized',
      );
    });

    it('should get available symbols', async () => {
      const symbols = await fetcher.getAvailableSymbols('binance');

      expect(Array.isArray(symbols)).toBe(true);
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols).toContain('BTC/USDT');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      const config: ProviderConfig = {
        provider: 'binance',
        sandbox: true,
        rateLimit: { requestsPerSecond: 1, requestsPerMinute: 60 },
        retryAttempts: 2,
        retryDelay: 100,
        timeout: 30000,
      };
      await fetcher.addProvider(config);
    });

    it('should handle exchange errors gracefully', async () => {
      // Mock exchange to throw error
      const ccxt = await import('ccxt');
      const mockExchange = new ccxt.binance();
      mockExchange.fetchOHLCV = jest.fn().mockRejectedValue(new Error('Network error'));

      const request: MarketDataRequest = {
        symbol: 'INVALID/SYMBOL',
        timeframe: '1h',
      };

      await expect(fetcher.fetchOHLCV('binance', request)).rejects.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all resources', async () => {
      const configs: ProviderConfig[] = [
        {
          provider: 'binance',
          sandbox: true,
          rateLimit: { requestsPerSecond: 10, requestsPerMinute: 600 },
          retryAttempts: 3,
          retryDelay: 1000,
          timeout: 30000,
        },
        {
          provider: 'coinbase',
          sandbox: true,
          rateLimit: { requestsPerSecond: 5, requestsPerMinute: 300 },
          retryAttempts: 3,
          retryDelay: 1000,
          timeout: 30000,
        },
      ];

      await fetcher.initialize(configs);
      await expect(fetcher.cleanup()).resolves.not.toThrow();
    });
  });
});

describe('RateLimiter', () => {
  it('should allow requests within rate limit', () => {
    const limiter = new RateLimiter({
      requestsPerSecond: 10,
      requestsPerMinute: 600,
    });

    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.getAvailableTokens()).toBeGreaterThanOrEqual(0);
  });

  it('should block requests when rate limit exceeded', () => {
    const limiter = new RateLimiter({
      requestsPerSecond: 1,
      requestsPerMinute: 60,
      burstLimit: 1,
    });

    // First request should succeed
    expect(limiter.tryAcquire()).toBe(true);

    // Second immediate request should fail
    expect(limiter.tryAcquire()).toBe(false);
    expect(limiter.getWaitTime()).toBeGreaterThan(0);
  });

  it('should wait for token availability', async () => {
    const limiter = new RateLimiter({
      requestsPerSecond: 100, // High rate for test speed
      requestsPerMinute: 6000,
    });

    // This should resolve quickly since rate is high
    await expect(limiter.waitForToken()).resolves.not.toThrow();
  }, 1000);
});
