export interface RateLimit {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  cooldownMs?: number;
}

export interface FetcherConfig {
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  baseUrl?: string;
  rateLimit?: RateLimit;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface MarketDataError extends Error {
  code?: string;
  statusCode?: number;
  exchange?: string;
  symbol?: string;
  retryAfter?: number;
}

export interface FetchProgress {
  total: number;
  completed: number;
  failed: number;
  currentSymbol?: string;
  eta?: number;
}

export type ProgressCallback = (progress: FetchProgress) => void;

// Exchange-specific types
export interface ExchangeInfo {
  id: string;
  name: string;
  countries: string[];
  urls: {
    logo: string;
    api: string;
    www: string;
    doc: string;
    fees?: string;
  };
  has: {
    [key: string]: boolean;
  };
  timeframes: {
    [key: string]: string;
  };
  rateLimit: number;
  fees?: {
    trading: {
      maker: number;
      taker: number;
    };
  };
}

export interface MarketTicker {
  symbol: string;
  last: number;
  bid?: number;
  ask?: number;
  high?: number;
  low?: number;
  volume?: number;
  change?: number;
  changePercent?: number;
  timestamp: Date;
}
