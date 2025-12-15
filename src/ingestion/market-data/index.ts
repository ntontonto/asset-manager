export { CryptoMarketDataFetcher } from './crypto-market-data-fetcher';
export { TraditionalMarketDataFetcher } from './traditional-market-data-fetcher';
export { RateLimiter } from './rate-limiter';

// Export crypto types
export type {
  ProviderConfig,
  MarketDataRequest,
  OHLCVData,
  MarketDataProvider,
  MarketDataError,
  RateLimitError,
  ExchangeError,
  RateLimitConfig,
  RateLimitConfigSchema,
} from './types';

// Export traditional types
export type {
  TraditionalProviderConfig,
  TraditionalDataRequest,
  TraditionalOHLCVData,
  TraditionalDataProvider,
  TraditionalMarketDataError,
  TraditionalRateLimitError,
  TraditionalAPIError,
  ImportResult,
  CSVImportFormat,
  DataImportError,
  Market,
  AssetType,
  TraditionalRateLimitConfig,
} from './traditional-types';

// Default provider configurations
export const DEFAULT_RATE_LIMITS = {
  binance: { requestsPerSecond: 10, requestsPerMinute: 1200 },
  coinbase: { requestsPerSecond: 5, requestsPerMinute: 300 },
  kraken: { requestsPerSecond: 1, requestsPerMinute: 60 },
  bitflyer: { requestsPerSecond: 3, requestsPerMinute: 180 },
  okx: { requestsPerSecond: 20, requestsPerMinute: 1200 },
  bybit: { requestsPerSecond: 10, requestsPerMinute: 600 },
} as const;

// Default rate limits for traditional data providers
export const DEFAULT_TRADITIONAL_RATE_LIMITS = {
  'yahoo-finance': { requestsPerSecond: 5, requestsPerMinute: 300 },
  'rakuten-securities': { requestsPerSecond: 2, requestsPerMinute: 120 },
  'sbi-securities': { requestsPerSecond: 3, requestsPerMinute: 180 },
  'alpha-vantage': { requestsPerSecond: 1, requestsPerMinute: 60 },
} as const;

// Helper function to create provider config with defaults
export function createProviderConfig(
  provider: string,
  options: {
    apiKey?: string;
    apiSecret?: string;
    apiPassphrase?: string;
    sandbox?: boolean;
  } = {},
) {
  const defaultRateLimit = DEFAULT_RATE_LIMITS[provider as keyof typeof DEFAULT_RATE_LIMITS];

  return {
    provider,
    ...options,
    rateLimit: defaultRateLimit,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  };
}

// Helper function to create traditional provider config with defaults
export function createTraditionalProviderConfig(
  provider: string,
  options: {
    apiKey?: string;
    apiSecret?: string;
    baseUrl?: string;
  } = {},
) {
  const defaultRateLimit =
    DEFAULT_TRADITIONAL_RATE_LIMITS[provider as keyof typeof DEFAULT_TRADITIONAL_RATE_LIMITS];

  return {
    provider,
    ...options,
    rateLimit: defaultRateLimit,
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  };
}
