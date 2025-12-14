import { z } from 'zod';

// Market data provider types
export const MarketDataProviderSchema = z.enum([
  'binance',
  'coinbase',
  'kraken',
  'bitflyer',
  'okx',
  'bybit',
] as const);

export type MarketDataProvider = z.infer<typeof MarketDataProviderSchema>;

// Rate limit configuration
export const RateLimitConfigSchema = z.object({
  requestsPerSecond: z.number().positive(),
  requestsPerMinute: z.number().positive(),
  burstLimit: z.number().positive().optional(),
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

// Provider configuration
export const ProviderConfigSchema = z.object({
  provider: MarketDataProviderSchema,
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  apiPassphrase: z.string().optional(),
  sandbox: z.boolean().default(false),
  rateLimit: RateLimitConfigSchema.optional(),
  timeout: z.number().positive().default(30000),
  retryAttempts: z.number().nonnegative().default(3),
  retryDelay: z.number().nonnegative().default(1000),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// Market data request types
export const MarketDataRequestSchema = z.object({
  symbol: z.string(),
  timeframe: z.enum(['1m', '5m', '15m', '30m', '1h', '4h', '6h', '12h', '1d', '3d', '1w', '1M']),
  since: z.date().optional(),
  limit: z.number().positive().max(1000).optional(),
});

export type MarketDataRequest = z.infer<typeof MarketDataRequestSchema>;

// OHLCV data structure
export const OHLCVDataSchema = z.object({
  timestamp: z.date(),
  open: z.string(),
  high: z.string(),
  low: z.string(),
  close: z.string(),
  volume: z.string(),
  symbol: z.string(),
  provider: MarketDataProviderSchema,
  timeframe: z.string(),
});

export type OHLCVData = z.infer<typeof OHLCVDataSchema>;

// Error types
export class MarketDataError extends Error {
  constructor(
    message: string,
    public readonly provider: MarketDataProvider,
    public readonly originalError?: Error,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'MarketDataError';
  }
}

export class RateLimitError extends MarketDataError {
  constructor(
    provider: MarketDataProvider,
    public readonly retryAfter?: number,
  ) {
    super('Rate limit exceeded', provider);
    this.name = 'RateLimitError';
  }
}

export class ExchangeError extends MarketDataError {
  constructor(provider: MarketDataProvider, message: string, originalError?: Error) {
    super(`Exchange error: ${message}`, provider, originalError);
    this.name = 'ExchangeError';
  }
}
