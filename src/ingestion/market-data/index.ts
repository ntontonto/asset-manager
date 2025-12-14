export { CryptoMarketDataFetcher } from './crypto-market-data-fetcher';
export { RateLimiter } from './rate-limiter';
export * from './types';

// Default provider configurations
export const DEFAULT_RATE_LIMITS = {
  binance: { requestsPerSecond: 10, requestsPerMinute: 1200 },
  coinbase: { requestsPerSecond: 5, requestsPerMinute: 300 },
  kraken: { requestsPerSecond: 1, requestsPerMinute: 60 },
  bitflyer: { requestsPerSecond: 3, requestsPerMinute: 180 },
  okx: { requestsPerSecond: 20, requestsPerMinute: 1200 },
  bybit: { requestsPerSecond: 10, requestsPerMinute: 600 },
} as const;

// Helper function to create provider config with defaults
export function createProviderConfig(
  provider: string,
  options: {
    apiKey?: string;
    apiSecret?: string;
    apiPassphrase?: string;
    sandbox?: boolean;
  } = {}
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