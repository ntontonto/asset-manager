import { z } from 'zod';

// Traditional data provider types
export const TraditionalDataProviderSchema = z.enum([
  'yahoo-finance',
  'rakuten-securities',
  'sbi-securities',
  'alpha-vantage',
] as const);

export type TraditionalDataProvider = z.infer<typeof TraditionalDataProviderSchema>;

// Market types
export const MarketSchema = z.enum([
  'US', // United States
  'JP', // Japan
  'EU', // Europe
  'UK', // United Kingdom
  'CA', // Canada
  'AU', // Australia
] as const);

export type Market = z.infer<typeof MarketSchema>;

// Asset types for traditional markets
export const AssetTypeSchema = z.enum([
  'equity', // Stocks
  'fund', // Mutual funds, ETFs
  'bond', // Government/Corporate bonds
  'forex', // Foreign exchange
  'commodity', // Gold, oil, etc.
] as const);

export type AssetType = z.infer<typeof AssetTypeSchema>;

// Rate limit configuration for traditional markets
export const TraditionalRateLimitConfigSchema = z.object({
  requestsPerSecond: z.number().positive(),
  requestsPerMinute: z.number().positive(),
  burstLimit: z.number().positive().optional(),
});

export type TraditionalRateLimitConfig = z.infer<typeof TraditionalRateLimitConfigSchema>;

// Traditional provider configuration
export const TraditionalProviderConfigSchema = z.object({
  provider: TraditionalDataProviderSchema,
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  rateLimit: TraditionalRateLimitConfigSchema.optional(),
  timeout: z.number().positive().default(30000),
  retryAttempts: z.number().nonnegative().default(3),
  retryDelay: z.number().nonnegative().default(1000),
  baseUrl: z.string().url().optional(),
});

export type TraditionalProviderConfig = z.infer<typeof TraditionalProviderConfigSchema>;

// Traditional data request types
export const TraditionalDataRequestSchema = z.object({
  symbol: z.string(),
  market: MarketSchema,
  timeframe: z.enum(['1d', '1w', '1M']), // Traditional markets typically daily/weekly/monthly
  assetType: AssetTypeSchema.default('equity'),
  since: z.date().optional(),
  limit: z.number().positive().max(1000).optional(),
});

export type TraditionalDataRequest = z.infer<typeof TraditionalDataRequestSchema>;

// Traditional OHLCV data structure (compatible with crypto OHLCV)
export const TraditionalOHLCVDataSchema = z.object({
  timestamp: z.date(),
  open: z.string(),
  high: z.string(),
  low: z.string(),
  close: z.string(),
  volume: z.string(),
  symbol: z.string(),
  provider: TraditionalDataProviderSchema,
  timeframe: z.string(),
  market: MarketSchema,
  assetType: AssetTypeSchema.default('equity'),
});

export type TraditionalOHLCVData = z.infer<typeof TraditionalOHLCVDataSchema>;

// CSV import types
export const CSVImportFormatSchema = z.enum([
  'rakuten-securities',
  'sbi-securities',
  'matsui-securities',
  'monex-securities',
  'generic',
] as const);

export type CSVImportFormat = z.infer<typeof CSVImportFormatSchema>;

export const ImportResultSchema = z.object({
  processed: z.number().nonnegative(),
  created: z.number().nonnegative(),
  updated: z.number().nonnegative(),
  errors: z.array(z.string()),
});

export type ImportResult = z.infer<typeof ImportResultSchema>;

// Error types for traditional market data
export class TraditionalMarketDataError extends Error {
  constructor(
    message: string,
    public readonly provider: TraditionalDataProvider,
    public readonly originalError?: Error,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'TraditionalMarketDataError';
  }
}

export class TraditionalRateLimitError extends TraditionalMarketDataError {
  constructor(
    provider: TraditionalDataProvider,
    public readonly retryAfter?: number,
  ) {
    super('Rate limit exceeded', provider);
    this.name = 'TraditionalRateLimitError';
  }
}

export class TraditionalAPIError extends TraditionalMarketDataError {
  constructor(provider: TraditionalDataProvider, message: string, originalError?: Error) {
    super(`API error: ${message}`, provider, originalError);
    this.name = 'TraditionalAPIError';
  }
}

export class DataImportError extends Error {
  constructor(
    message: string,
    public readonly format: CSVImportFormat,
    public readonly row?: number,
    public readonly originalError?: Error,
  ) {
    super(`[${format}] ${message}${row ? ` at row ${row}` : ''}`);
    this.name = 'DataImportError';
  }
}
