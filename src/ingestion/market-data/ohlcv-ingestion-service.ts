import type { CryptoMarketDataFetcher } from './crypto-market-data-fetcher';
import type { MarketDataProvider } from './types';
import type { CreateOHLCVRequest, OHLCVTimeframe } from '@/shared/types';
import type { CoreDataStore } from '@/storage/core-data-store';

export interface SyncOHLCVRequest {
  provider: MarketDataProvider;
  symbols: string[];
  timeframe: OHLCVTimeframe;
  since?: Date;
  limit?: number;
  autoSinceLatest?: boolean;
}

export interface SyncOHLCVSummary {
  symbol: string;
  assetId?: string;
  fetched: number;
  inserted: number;
  error?: string;
}

export interface SyncOHLCVResult {
  totalInserted: number;
  summaries: SyncOHLCVSummary[];
}

/**
 * Service to fetch and persist OHLCV data with normalization and duplicate handling.
 */
export class OHLCVIngestionService {
  constructor(
    private readonly fetcher: CryptoMarketDataFetcher,
    private readonly dataStore: CoreDataStore,
  ) {}

  public async syncOHLCV(request: SyncOHLCVRequest): Promise<SyncOHLCVResult> {
    const summaries: SyncOHLCVSummary[] = [];
    let totalInserted = 0;

    const tasks = request.symbols.map(async (symbol) => {
      const asset = this.dataStore.assets.getBySymbol(symbol);
      if (!asset) {
        summaries.push({
          symbol,
          fetched: 0,
          inserted: 0,
          error: `Asset not found for symbol ${symbol}`,
        });
        return;
      }

      let since = request.since;
      if (!since && request.autoSinceLatest) {
        const latest = this.dataStore.ohlcv.getLatest(asset.id, request.timeframe);
        if (latest?.timestamp) {
          since = latest.timestamp;
        }
      }

      try {
        const candles = await this.fetcher.fetchOHLCV(request.provider, {
          symbol,
          timeframe: request.timeframe,
          since,
          limit: request.limit,
        });

        const normalized: CreateOHLCVRequest[] = candles.map((candle) => ({
          assetId: asset.id,
          timeframe: request.timeframe,
          timestamp: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          source: candle.provider,
        }));

        const inserted = normalized.length > 0 ? this.dataStore.ohlcv.bulkCreate(normalized) : 0;
        totalInserted += inserted;

        summaries.push({
          symbol,
          assetId: asset.id,
          fetched: candles.length,
          inserted,
        });
      } catch (error) {
        summaries.push({
          symbol,
          assetId: asset.id,
          fetched: 0,
          inserted: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    await Promise.all(tasks);

    return {
      totalInserted,
      summaries,
    };
  }
}
