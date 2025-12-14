import * as ccxt from 'ccxt';
import { RateLimiter } from './rate-limiter';
import {
  ProviderConfig,
  MarketDataRequest,
  OHLCVData,
  MarketDataProvider,
  MarketDataError,
  RateLimitError,
  ExchangeError,
} from './types';

/**
 * Cryptocurrency market data fetcher using CCXT library
 * Supports multiple exchanges with rate limiting and error handling
 */
export class CryptoMarketDataFetcher {
  private exchanges: Map<MarketDataProvider, ccxt.Exchange> = new Map();
  private rateLimiters: Map<MarketDataProvider, RateLimiter> = new Map();
  private retryConfig: Map<MarketDataProvider, { attempts: number; delay: number }> = new Map();

  /**
   * Initialize market data fetcher with provider configurations
   */
  public async initialize(configs: ProviderConfig[]): Promise<void> {
    for (const config of configs) {
      await this.addProvider(config);
    }
  }

  /**
   * Add a new market data provider
   */
  public async addProvider(config: ProviderConfig): Promise<void> {
    try {
      const ExchangeClass = this.getExchangeClass(config.provider);
      
      const exchangeConfig: ccxt.ExchangeConfig = {
        apiKey: config.apiKey,
        secret: config.apiSecret,
        password: config.apiPassphrase,
        sandbox: config.sandbox,
        timeout: config.timeout,
        enableRateLimit: false, // We handle rate limiting ourselves
      };

      const exchange = new ExchangeClass(exchangeConfig);
      
      // Test connection
      await exchange.loadMarkets();
      
      this.exchanges.set(config.provider, exchange);
      
      // Set up rate limiter if configured
      if (config.rateLimit) {
        this.rateLimiters.set(config.provider, new RateLimiter(config.rateLimit));
      }
      
      // Set up retry configuration
      this.retryConfig.set(config.provider, {
        attempts: config.retryAttempts,
        delay: config.retryDelay,
      });
      
    } catch (error) {
      throw new ExchangeError(
        config.provider,
        `Failed to initialize exchange: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Remove a provider
   */
  public async removeProvider(provider: MarketDataProvider): Promise<void> {
    const exchange = this.exchanges.get(provider);
    if (exchange) {
      try {
        await exchange.close();
      } catch (error) {
        // Log error but don't throw
        console.warn(`Warning: Failed to properly close exchange ${provider}:`, error);
      }
      
      this.exchanges.delete(provider);
      this.rateLimiters.delete(provider);
      this.retryConfig.delete(provider);
    }
  }

  /**
   * Fetch OHLCV data from a specific provider
   */
  public async fetchOHLCV(
    provider: MarketDataProvider,
    request: MarketDataRequest,
  ): Promise<OHLCVData[]> {
    const exchange = this.exchanges.get(provider);
    if (!exchange) {
      throw new MarketDataError(`Provider ${provider} not initialized`, provider);
    }

    // Check rate limiter
    const rateLimiter = this.rateLimiters.get(provider);
    if (rateLimiter) {
      if (!rateLimiter.tryAcquire()) {
        const waitTime = rateLimiter.getWaitTime();
        throw new RateLimitError(provider, waitTime);
      }
    }

    return this.executeWithRetry(provider, async () => {
      try {
        // Convert request parameters for CCXT
        const symbol = this.normalizeSymbol(request.symbol, provider);
        const since = request.since ? request.since.getTime() : undefined;
        
        // Fetch OHLCV data
        const ohlcvData = await exchange.fetchOHLCV(
          symbol,
          request.timeframe,
          since,
          request.limit,
        );

        // Convert to our format
        return ohlcvData.map((candle): OHLCVData => ({
          timestamp: new Date(candle[0]),
          open: candle[1].toString(),
          high: candle[2].toString(),
          low: candle[3].toString(),
          close: candle[4].toString(),
          volume: candle[5].toString(),
          symbol: request.symbol,
          provider,
          timeframe: request.timeframe,
        }));

      } catch (error) {
        if (this.isRateLimitError(error)) {
          const retryAfter = this.extractRetryAfter(error);
          throw new RateLimitError(provider, retryAfter);
        }
        
        throw new ExchangeError(
          provider,
          error instanceof Error ? error.message : 'Unknown exchange error',
          error instanceof Error ? error : undefined,
        );
      }
    });
  }

  /**
   * Fetch OHLCV data from multiple providers (parallel execution)
   */
  public async fetchOHLCVMultiple(
    providers: MarketDataProvider[],
    request: MarketDataRequest,
  ): Promise<Map<MarketDataProvider, OHLCVData[] | Error>> {
    const promises = providers.map(async (provider) => {
      try {
        const data = await this.fetchOHLCV(provider, request);
        return [provider, data] as const;
      } catch (error) {
        return [provider, error instanceof Error ? error : new Error('Unknown error')] as const;
      }
    });

    const results = await Promise.allSettled(promises);
    const resultMap = new Map<MarketDataProvider, OHLCVData[] | Error>();

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [provider, data] = result.value;
        resultMap.set(provider, data);
      }
    }

    return resultMap;
  }

  /**
   * Get list of available symbols for a provider
   */
  public async getAvailableSymbols(provider: MarketDataProvider): Promise<string[]> {
    const exchange = this.exchanges.get(provider);
    if (!exchange) {
      throw new MarketDataError(`Provider ${provider} not initialized`, provider);
    }

    try {
      const markets = await exchange.loadMarkets();
      return Object.keys(markets);
    } catch (error) {
      throw new ExchangeError(
        provider,
        `Failed to load markets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get exchange information for a provider
   */
  public getExchangeInfo(provider: MarketDataProvider): object | undefined {
    const exchange = this.exchanges.get(provider);
    return exchange ? {
      name: exchange.name,
      countries: exchange.countries,
      rateLimit: exchange.rateLimit,
      has: exchange.has,
      timeframes: exchange.timeframes,
    } : undefined;
  }

  /**
   * Clean up all resources
   */
  public async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.exchanges.keys()).map(provider => 
      this.removeProvider(provider)
    );
    
    await Promise.allSettled(cleanupPromises);
  }

  private getExchangeClass(provider: MarketDataProvider): typeof ccxt.Exchange {
    switch (provider) {
      case 'binance':
        return ccxt.binance;
      case 'coinbase':
        return ccxt.coinbase;
      case 'kraken':
        return ccxt.kraken;
      case 'bitflyer':
        return ccxt.bitflyer;
      case 'okx':
        return ccxt.okx;
      case 'bybit':
        return ccxt.bybit;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private normalizeSymbol(symbol: string, provider: MarketDataProvider): string {
    // Basic symbol normalization - can be extended per exchange
    return symbol.replace('/', '').toUpperCase();
  }

  private async executeWithRetry<T>(
    provider: MarketDataProvider,
    operation: () => Promise<T>,
  ): Promise<T> {
    const retryConfig = this.retryConfig.get(provider);
    const maxAttempts = retryConfig?.attempts || 1;
    const delay = retryConfig?.delay || 1000;

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Don't retry on rate limit errors - let caller handle
        if (error instanceof RateLimitError || this.isRateLimitError(error)) {
          throw error;
        }
        
        // Wait before retry (except on last attempt)
        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, delay * (attempt + 1)));
        }
      }
    }
    
    throw lastError || new Error('Operation failed after retries');
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') || 
             message.includes('too many requests') ||
             message.includes('429');
    }
    return false;
  }

  private extractRetryAfter(error: unknown): number | undefined {
    if (error instanceof Error) {
      const match = error.message.match(/retry.?after[:\s]*(\d+)/i);
      if (match) {
        return parseInt(match[1], 10) * 1000; // Convert to milliseconds
      }
    }
    return undefined;
  }
}
