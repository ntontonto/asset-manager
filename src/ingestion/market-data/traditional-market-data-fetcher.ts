import yahooFinance from 'yahoo-finance2';

import { RateLimiter } from './rate-limiter';
import {
  type TraditionalProviderConfig,
  type TraditionalDataRequest,
  type TraditionalOHLCVData,
  type TraditionalDataProvider,
  TraditionalMarketDataError,
  TraditionalRateLimitError,
  TraditionalAPIError,
  type ImportResult,
  type CSVImportFormat,
  DataImportError,
  type Market,
} from './traditional-types';

/**
 * Traditional market data fetcher for stocks, ETFs, mutual funds, and FX
 * Supports Yahoo Finance, Rakuten Securities, and other traditional data providers
 */
export class TraditionalMarketDataFetcher {
  private providerClients: Map<TraditionalDataProvider, unknown> = new Map();
  private rateLimiters: Map<TraditionalDataProvider, RateLimiter> = new Map();
  private retryConfig: Map<TraditionalDataProvider, { attempts: number; delay: number }> =
    new Map();

  /**
   * Initialize market data fetcher with provider configurations
   */
  public async initialize(configs: TraditionalProviderConfig[]): Promise<void> {
    for (const config of configs) {
      await this.addProvider(config);
    }
  }

  /**
   * Add a new traditional market data provider
   */
  public async addProvider(config: TraditionalProviderConfig): Promise<void> {
    try {
      const client = await this.createProviderClient(config);

      // Test connection based on provider
      await this.testConnection(config.provider, client);

      this.providerClients.set(config.provider, client);

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
      throw new TraditionalAPIError(
        config.provider,
        `Failed to initialize provider: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Remove a provider
   */
  public async removeProvider(provider: TraditionalDataProvider): Promise<void> {
    this.providerClients.delete(provider);
    this.rateLimiters.delete(provider);
    this.retryConfig.delete(provider);
  }

  /**
   * Fetch stock price data from a specific provider
   */
  public async fetchStockPrice(
    provider: TraditionalDataProvider,
    request: TraditionalDataRequest,
  ): Promise<TraditionalOHLCVData[]> {
    const client = this.providerClients.get(provider);
    if (!client) {
      throw new TraditionalMarketDataError(`Provider ${provider} not initialized`, provider);
    }

    // Check rate limiter
    await this.checkRateLimit(provider);

    return this.executeWithRetry(provider, async () => {
      try {
        switch (provider) {
          case 'yahoo-finance':
            return await this.fetchFromYahooFinance(request);
          case 'rakuten-securities':
            return await this.fetchFromRakutenSecurities(request, client);
          default:
            throw new TraditionalMarketDataError(`Unsupported provider: ${provider}`, provider);
        }
      } catch (error) {
        if (this.isRateLimitError(error)) {
          const retryAfter = this.extractRetryAfter(error);
          throw new TraditionalRateLimitError(provider, retryAfter);
        }

        throw new TraditionalAPIError(
          provider,
          error instanceof Error ? error.message : 'Unknown API error',
          error instanceof Error ? error : undefined,
        );
      }
    });
  }

  /**
   * Fetch FX rate from a specific provider
   */
  public async fetchFXRate(
    provider: TraditionalDataProvider,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<number> {
    const client = this.providerClients.get(provider);
    if (!client) {
      throw new TraditionalMarketDataError(`Provider ${provider} not initialized`, provider);
    }

    // Check rate limiter
    await this.checkRateLimit(provider);

    return this.executeWithRetry(provider, async () => {
      try {
        switch (provider) {
          case 'yahoo-finance':
            return await this.fetchFXFromYahooFinance(fromCurrency, toCurrency);
          case 'rakuten-securities':
            return await this.fetchFXFromRakutenSecurities(fromCurrency, toCurrency, client);
          default:
            throw new TraditionalMarketDataError(
              `FX rate not supported by provider: ${provider}`,
              provider,
            );
        }
      } catch (error) {
        if (this.isRateLimitError(error)) {
          const retryAfter = this.extractRetryAfter(error);
          throw new TraditionalRateLimitError(provider, retryAfter);
        }

        throw new TraditionalAPIError(
          provider,
          error instanceof Error ? error.message : 'Unknown FX API error',
          error instanceof Error ? error : undefined,
        );
      }
    });
  }

  /**
   * Fetch mutual fund NAV from a specific provider
   */
  public async fetchMutualFundNav(
    provider: TraditionalDataProvider,
    request: TraditionalDataRequest,
  ): Promise<TraditionalOHLCVData> {
    const client = this.providerClients.get(provider);
    if (!client) {
      throw new TraditionalMarketDataError(`Provider ${provider} not initialized`, provider);
    }

    // Check rate limiter
    await this.checkRateLimit(provider);

    return this.executeWithRetry(provider, async () => {
      try {
        switch (provider) {
          case 'yahoo-finance':
            return await this.fetchMutualFundFromYahooFinance(request);
          case 'rakuten-securities':
            return await this.fetchMutualFundFromRakutenSecurities(request, client);
          default:
            throw new TraditionalMarketDataError(
              `Mutual fund data not supported by provider: ${provider}`,
              provider,
            );
        }
      } catch (error) {
        if (this.isRateLimitError(error)) {
          const retryAfter = this.extractRetryAfter(error);
          throw new TraditionalRateLimitError(provider, retryAfter);
        }

        throw new TraditionalAPIError(
          provider,
          error instanceof Error ? error.message : 'Unknown mutual fund API error',
          error instanceof Error ? error : undefined,
        );
      }
    });
  }

  /**
   * Fetch stock price data from multiple providers (parallel execution)
   */
  public async fetchStockPriceMultiple(
    providers: TraditionalDataProvider[],
    request: TraditionalDataRequest,
  ): Promise<Map<TraditionalDataProvider, TraditionalOHLCVData[] | Error>> {
    const promises = providers.map(async (provider) => {
      try {
        const data = await this.fetchStockPrice(provider, request);
        return [provider, data] as const;
      } catch (error) {
        return [provider, error instanceof Error ? error : new Error('Unknown error')] as const;
      }
    });

    const results = await Promise.allSettled(promises);
    const resultMap = new Map<TraditionalDataProvider, TraditionalOHLCVData[] | Error>();

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const [provider, data] = result.value;
        resultMap.set(provider, data);
      }
    }

    return resultMap;
  }

  /**
   * Import data from CSV format
   */
  public async importFromCSV(csvContent: string, format: CSVImportFormat): Promise<ImportResult> {
    try {
      switch (format) {
        case 'rakuten-securities':
          return await this.importRakutenSecuritiesCSV(csvContent);
        case 'sbi-securities':
          return await this.importSBISecuritiesCSV(csvContent);
        case 'generic':
          return await this.importGenericCSV(csvContent);
        default:
          throw new DataImportError(`Unsupported CSV format: ${format}`, format);
      }
    } catch (error) {
      throw new DataImportError(
        error instanceof Error ? error.message : 'Unknown import error',
        format,
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get list of supported markets for a provider
   */
  public async getSupportedMarkets(provider: TraditionalDataProvider): Promise<Market[]> {
    switch (provider) {
      case 'yahoo-finance':
        return ['US', 'JP', 'EU', 'UK', 'CA', 'AU'];
      case 'rakuten-securities':
        return ['JP', 'US'];
      case 'sbi-securities':
        return ['JP', 'US'];
      default:
        return [];
    }
  }

  /**
   * Clean up all resources
   */
  public async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.providerClients.keys()).map((provider) =>
      this.removeProvider(provider),
    );

    await Promise.allSettled(cleanupPromises);
  }

  // Private helper methods

  private async createProviderClient(config: TraditionalProviderConfig): Promise<unknown> {
    switch (config.provider) {
      case 'yahoo-finance':
        // Yahoo Finance doesn't need explicit client initialization
        return yahooFinance;
      case 'rakuten-securities':
        // Placeholder for future Rakuten Securities API integration
        return { apiKey: config.apiKey };
      case 'sbi-securities':
        // Placeholder for future SBI Securities API integration
        return { apiKey: config.apiKey };
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  private async testConnection(provider: TraditionalDataProvider, client: unknown): Promise<void> {
    switch (provider) {
      case 'yahoo-finance':
        // Test with a simple quote request
        await yahooFinance.quote('AAPL');
        break;
      case 'rakuten-securities':
      case 'sbi-securities':
        // For now, just validate client has API key
        if (!(client as { apiKey?: string }).apiKey) {
          throw new Error('API key required');
        }
        break;
      default:
        // No test needed for unknown providers
        break;
    }
  }

  private async fetchFromYahooFinance(
    request: TraditionalDataRequest,
  ): Promise<TraditionalOHLCVData[]> {
    const symbol = this.normalizeYahooSymbol(request.symbol, request.market);

    const historicalData = await yahooFinance.historical(symbol, {
      period1: request.since || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Default to 1 year ago
      period2: new Date(),
      interval: this.mapTimeframeToYahooInterval(request.timeframe) as any,
    });

    return (historicalData as any[]).slice(0, request.limit || 100).map(
      (item: any): TraditionalOHLCVData => ({
        timestamp: item.date,
        open: item.open?.toString() || '0',
        high: item.high?.toString() || '0',
        low: item.low?.toString() || '0',
        close: item.close?.toString() || '0',
        volume: item.volume?.toString() || '0',
        symbol: request.symbol,
        provider: 'yahoo-finance',
        timeframe: request.timeframe,
        market: request.market,
        assetType: request.assetType,
      }),
    );
  }

  private async fetchFromRakutenSecurities(
    _request: TraditionalDataRequest,
    _client: unknown,
  ): Promise<TraditionalOHLCVData[]> {
    // Placeholder implementation - would integrate with actual Rakuten Securities API
    throw new TraditionalAPIError(
      'rakuten-securities',
      'Rakuten Securities API integration not yet implemented',
    );
  }

  private async fetchFXFromYahooFinance(fromCurrency: string, toCurrency: string): Promise<number> {
    const symbol = `${fromCurrency}${toCurrency}=X`;
    const quote = await yahooFinance.quote(symbol) as any;

    if (!quote.regularMarketPrice) {
      throw new Error(`Failed to get FX rate for ${fromCurrency}/${toCurrency}`);
    }

    return quote.regularMarketPrice;
  }

  private async fetchFXFromRakutenSecurities(
    _fromCurrency: string,
    _toCurrency: string,
    _client: unknown,
  ): Promise<number> {
    // Placeholder implementation - would integrate with actual Rakuten Securities FX API
    throw new TraditionalAPIError(
      'rakuten-securities',
      'Rakuten Securities FX API integration not yet implemented',
    );
  }

  private async fetchMutualFundFromYahooFinance(
    request: TraditionalDataRequest,
  ): Promise<TraditionalOHLCVData> {
    const symbol = this.normalizeYahooSymbol(request.symbol, request.market);
    const quote = await yahooFinance.quote(symbol) as any;

    return {
      timestamp: quote.regularMarketTime || new Date(),
      open: quote.regularMarketOpen?.toString() || '0',
      high: quote.regularMarketDayHigh?.toString() || '0',
      low: quote.regularMarketDayLow?.toString() || '0',
      close: quote.regularMarketPrice?.toString() || '0',
      volume: quote.regularMarketVolume?.toString() || '0',
      symbol: request.symbol,
      provider: 'yahoo-finance',
      timeframe: request.timeframe,
      market: request.market,
      assetType: request.assetType,
    };
  }

  private async fetchMutualFundFromRakutenSecurities(
    _request: TraditionalDataRequest,
    _client: unknown,
  ): Promise<TraditionalOHLCVData> {
    // Placeholder implementation - would integrate with actual Rakuten Securities mutual fund API
    throw new TraditionalAPIError(
      'rakuten-securities',
      'Rakuten Securities mutual fund API integration not yet implemented',
    );
  }

  private async importRakutenSecuritiesCSV(csvContent: string): Promise<ImportResult> {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new DataImportError('CSV file is empty or has no data rows', 'rakuten-securities');
    }

    const _header = lines[0];
    const dataLines = lines.slice(1);

    // Simple implementation - in real implementation would parse each field properly
    return {
      processed: dataLines.length,
      created: dataLines.length,
      updated: 0,
      errors: [],
    };
  }

  private async importSBISecuritiesCSV(csvContent: string): Promise<ImportResult> {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new DataImportError('CSV file is empty or has no data rows', 'sbi-securities');
    }

    const _header = lines[0];
    const dataLines = lines.slice(1);

    // Simple implementation - in real implementation would parse each field properly
    return {
      processed: dataLines.length,
      created: dataLines.length,
      updated: 0,
      errors: [],
    };
  }

  private async importGenericCSV(csvContent: string): Promise<ImportResult> {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new DataImportError('CSV file is empty or has no data rows', 'generic');
    }

    const _header = lines[0];
    const dataLines = lines.slice(1);

    // Simple implementation - in real implementation would parse each field properly
    return {
      processed: dataLines.length,
      created: dataLines.length,
      updated: 0,
      errors: [],
    };
  }

  private normalizeYahooSymbol(symbol: string, market: Market): string {
    switch (market) {
      case 'JP':
        // Add .T suffix for Tokyo Stock Exchange
        return symbol.includes('.') ? symbol : `${symbol}.T`;
      case 'UK':
        // Add .L suffix for London Stock Exchange
        return symbol.includes('.') ? symbol : `${symbol}.L`;
      case 'US':
      default:
        // US symbols typically don't need suffixes
        return symbol;
    }
  }

  private mapTimeframeToYahooInterval(timeframe: string): string {
    switch (timeframe) {
      case '1d':
        return '1d';
      case '1w':
        return '1wk';
      case '1M':
        return '1mo';
      default:
        return '1d';
    }
  }

  private async checkRateLimit(provider: TraditionalDataProvider): Promise<void> {
    const rateLimiter = this.rateLimiters.get(provider);
    if (rateLimiter) {
      if (!rateLimiter.tryAcquire()) {
        const waitTime = rateLimiter.getWaitTime();
        throw new TraditionalRateLimitError(provider, waitTime);
      }
    }
  }

  private async executeWithRetry<T>(
    provider: TraditionalDataProvider,
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
        if (error instanceof TraditionalRateLimitError || this.isRateLimitError(error)) {
          throw error;
        }

        // Wait before retry (except on last attempt)
        if (attempt < maxAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  private isRateLimitError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('429')
      );
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
