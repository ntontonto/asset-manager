import { randomUUID } from 'node:crypto';

import { BaseRepository } from './base';

import type {
  CreateOHLCVRequest,
  OHLCVData,
  OHLCVTimeframe,
  UpdateOHLCVRequest,
} from '@/shared/types';

export interface OHLCVFilters {
  assetId?: string;
  assetIds?: string[];
  timeframe?: OHLCVTimeframe;
  timeframes?: OHLCVTimeframe[];
  timestampFrom?: Date;
  timestampTo?: Date;
  source?: string;
}

export interface OHLCVPageOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp_asc' | 'timestamp_desc';
}

export class OHLCVRepository extends BaseRepository {
  /**
   * Insert a single OHLCV record
   */
  public create(request: CreateOHLCVRequest): OHLCVData {
    this.ensureDatabase();

    const ohlcv: OHLCVData = {
      id: randomUUID(),
      assetId: request.assetId,
      timeframe: request.timeframe,
      timestamp: request.timestamp,
      open: request.open,
      high: request.high,
      low: request.low,
      close: request.close,
      volume: request.volume,
      source: request.source,
      createdAt: new Date(),
    };

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO ohlcv_data (
        id, asset_id, timeframe, timestamp, open, high, low, close, volume, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      ohlcv.id,
      ohlcv.assetId,
      ohlcv.timeframe,
      ohlcv.timestamp.toISOString(),
      ohlcv.open,
      ohlcv.high,
      ohlcv.low,
      ohlcv.close,
      ohlcv.volume,
      ohlcv.source || null,
      ohlcv.createdAt.toISOString(),
    );

    // If insertion was ignored due to unique constraint, fetch existing record
    if (result.changes === 0) {
      const existing = this.getByAssetTimeframeTimestamp(
        request.assetId,
        request.timeframe,
        request.timestamp,
      );
      if (existing) {
        return existing;
      }
      throw new Error('Failed to insert or retrieve OHLCV data');
    }

    return ohlcv;
  }

  /**
   * Bulk insert OHLCV data (efficient for large datasets)
   */
  public bulkCreate(requests: CreateOHLCVRequest[]): number {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO ohlcv_data (
        id, asset_id, timeframe, timestamp, open, high, low, close, volume, source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((requests: CreateOHLCVRequest[]) => {
      let insertedCount = 0;

      for (const request of requests) {
        const ohlcv: OHLCVData = {
          id: randomUUID(),
          assetId: request.assetId,
          timeframe: request.timeframe,
          timestamp: request.timestamp,
          open: request.open,
          high: request.high,
          low: request.low,
          close: request.close,
          volume: request.volume,
          source: request.source,
          createdAt: new Date(),
        };

        const result = stmt.run(
          ohlcv.id,
          ohlcv.assetId,
          ohlcv.timeframe,
          ohlcv.timestamp.toISOString(),
          ohlcv.open,
          ohlcv.high,
          ohlcv.low,
          ohlcv.close,
          ohlcv.volume,
          ohlcv.source || null,
          ohlcv.createdAt.toISOString(),
        );

        if (result.changes > 0) {
          insertedCount++;
        }
      }

      return insertedCount;
    });

    return insertMany(requests);
  }

  /**
   * Get OHLCV data by unique combination
   */
  public getByAssetTimeframeTimestamp(
    assetId: string,
    timeframe: OHLCVTimeframe,
    timestamp: Date,
  ): OHLCVData | null {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT * FROM ohlcv_data 
      WHERE asset_id = ? AND timeframe = ? AND timestamp = ?
    `);

    const row = stmt.get(assetId, timeframe, timestamp.toISOString()) as any;
    return row ? this.mapRowToOHLCV(row) : null;
  }

  /**
   * Get time series data with optional filtering and pagination
   */
  public getTimeSeries(filters?: OHLCVFilters, options?: OHLCVPageOptions): OHLCVData[] {
    this.ensureDatabase();

    let query = 'SELECT * FROM ohlcv_data WHERE 1=1';
    const params: any[] = [];

    if (filters?.assetId) {
      query += ' AND asset_id = ?';
      params.push(filters.assetId);
    }

    if (filters?.assetIds?.length) {
      query += ` AND asset_id IN (${filters.assetIds.map(() => '?').join(',')})`;
      params.push(...filters.assetIds);
    }

    if (filters?.timeframe) {
      query += ' AND timeframe = ?';
      params.push(filters.timeframe);
    }

    if (filters?.timeframes?.length) {
      query += ` AND timeframe IN (${filters.timeframes.map(() => '?').join(',')})`;
      params.push(...filters.timeframes);
    }

    if (filters?.timestampFrom) {
      query += ' AND timestamp >= ?';
      params.push(filters.timestampFrom.toISOString());
    }

    if (filters?.timestampTo) {
      query += ' AND timestamp <= ?';
      params.push(filters.timestampTo.toISOString());
    }

    if (filters?.source) {
      query += ' AND source = ?';
      params.push(filters.source);
    }

    // Order by timestamp
    const orderBy = options?.orderBy || 'timestamp_desc';
    if (orderBy === 'timestamp_asc') {
      query += ' ORDER BY timestamp ASC';
    } else {
      query += ' ORDER BY timestamp DESC';
    }

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => this.mapRowToOHLCV(row));
  }

  /**
   * Get latest OHLCV data for an asset and timeframe
   */
  public getLatest(assetId: string, timeframe: OHLCVTimeframe): OHLCVData | null {
    const results = this.getTimeSeries(
      { assetId, timeframe },
      { limit: 1, orderBy: 'timestamp_desc' },
    );

    return results.length > 0 ? results[0]! : null;
  }

  /**
   * Get earliest OHLCV data for an asset and timeframe
   */
  public getEarliest(assetId: string, timeframe: OHLCVTimeframe): OHLCVData | null {
    const results = this.getTimeSeries(
      { assetId, timeframe },
      { limit: 1, orderBy: 'timestamp_asc' },
    );

    return results.length > 0 ? results[0]! : null;
  }

  /**
   * Get date range for available data
   */
  public getDateRange(
    assetId: string,
    timeframe: OHLCVTimeframe,
  ): {
    earliest: Date | null;
    latest: Date | null;
    count: number;
  } {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT 
        MIN(timestamp) as earliest,
        MAX(timestamp) as latest,
        COUNT(*) as count
      FROM ohlcv_data 
      WHERE asset_id = ? AND timeframe = ?
    `);

    const result = stmt.get(assetId, timeframe) as any;

    return {
      earliest: result.earliest ? new Date(result.earliest) : null,
      latest: result.latest ? new Date(result.latest) : null,
      count: result.count || 0,
    };
  }

  /**
   * Check if data exists for specific time range
   */
  public hasDataInRange(assetId: string, timeframe: OHLCVTimeframe, from: Date, to: Date): boolean {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT 1 FROM ohlcv_data 
      WHERE asset_id = ? AND timeframe = ? 
        AND timestamp >= ? AND timestamp <= ?
      LIMIT 1
    `);

    const result = stmt.get(assetId, timeframe, from.toISOString(), to.toISOString());
    return !!result;
  }

  /**
   * Find gaps in time series data
   */
  public findDataGaps(
    assetId: string,
    timeframe: OHLCVTimeframe,
    expectedInterval: number, // in minutes
  ): Array<{ from: Date; to: Date }> {
    this.ensureDatabase();

    const stmt = this.db.prepare(`
      SELECT timestamp FROM ohlcv_data 
      WHERE asset_id = ? AND timeframe = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(assetId, timeframe) as any[];
    const gaps: Array<{ from: Date; to: Date }> = [];

    if (rows.length < 2) {
      return gaps;
    }

    for (let i = 0; i < rows.length - 1; i++) {
      const current = new Date(rows[i].timestamp);
      const next = new Date(rows[i + 1].timestamp);
      const expectedNext = new Date(current.getTime() + expectedInterval * 60 * 1000);

      if (next.getTime() > expectedNext.getTime()) {
        gaps.push({
          from: expectedNext,
          to: new Date(next.getTime() - expectedInterval * 60 * 1000),
        });
      }
    }

    return gaps;
  }

  /**
   * Update existing OHLCV record
   */
  public update(id: string, request: UpdateOHLCVRequest): OHLCVData | null {
    this.ensureDatabase();

    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const updated: OHLCVData = {
      ...existing,
      ...request,
      id, // Keep original ID
    };

    const stmt = this.db.prepare(`
      UPDATE ohlcv_data SET
        open = ?,
        high = ?,
        low = ?,
        close = ?,
        volume = ?,
        source = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.open,
      updated.high,
      updated.low,
      updated.close,
      updated.volume,
      updated.source || null,
      id,
    );

    return updated;
  }

  /**
   * Delete OHLCV data by ID
   */
  public delete(id: string): boolean {
    this.ensureDatabase();

    const stmt = this.db.prepare('DELETE FROM ohlcv_data WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  }

  /**
   * Delete old data before a specific date (for data archiving)
   */
  public deleteBeforeDate(beforeDate: Date): number {
    this.ensureDatabase();

    const stmt = this.db.prepare('DELETE FROM ohlcv_data WHERE timestamp < ?');
    const result = stmt.run(beforeDate.toISOString());

    return result.changes;
  }

  /**
   * Archive old data to a different table or export format
   * This moves old data to an archive table instead of deleting it
   */
  public archiveDataBeforeDate(beforeDate: Date): { archived: number; deleted: number } {
    this.ensureDatabase();

    // First create archive table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ohlcv_data_archive (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        timestamp DATETIME NOT NULL,
        open TEXT NOT NULL,
        high TEXT NOT NULL,
        low TEXT NOT NULL,
        close TEXT NOT NULL,
        volume TEXT NOT NULL,
        source TEXT,
        created_at DATETIME NOT NULL,
        archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on archive table
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ohlcv_archive_asset_timeframe_timestamp 
      ON ohlcv_data_archive(asset_id, timeframe, timestamp)
    `);

    return this.db.transaction(() => {
      // Insert old data into archive table
      const archiveStmt = this.db.prepare(`
        INSERT OR IGNORE INTO ohlcv_data_archive 
        (id, asset_id, timeframe, timestamp, open, high, low, close, volume, source, created_at)
        SELECT id, asset_id, timeframe, timestamp, open, high, low, close, volume, source, created_at
        FROM ohlcv_data 
        WHERE timestamp < ?
      `);
      const archiveResult = archiveStmt.run(beforeDate.toISOString());

      // Delete archived data from main table
      const deleteStmt = this.db.prepare('DELETE FROM ohlcv_data WHERE timestamp < ?');
      const deleteResult = deleteStmt.run(beforeDate.toISOString());

      return {
        archived: archiveResult.changes,
        deleted: deleteResult.changes,
      };
    })();
  }

  /**
   * Compress data by aggregating to higher timeframes
   * For example, compress 1m data to 1h data for old periods
   */
  public compressDataToTimeframe(
    assetId: string,
    fromTimeframe: OHLCVTimeframe,
    toTimeframe: OHLCVTimeframe,
    beforeDate: Date,
  ): number {
    this.ensureDatabase();

    // Define timeframe intervals in minutes
    const timeframeMinutes: Record<OHLCVTimeframe, number> = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '4h': 240,
      '6h': 360,
      '12h': 720,
      '1d': 1440,
      '3d': 4320,
      '1w': 10080,
      '1M': 43200, // approximate
    };

    const fromInterval = timeframeMinutes[fromTimeframe];
    const toInterval = timeframeMinutes[toTimeframe];

    if (toInterval <= fromInterval) {
      throw new Error('Target timeframe must be larger than source timeframe');
    }

    return this.db.transaction(() => {
      // Get data to compress
      const selectStmt = this.db.prepare(`
        SELECT 
          timestamp,
          open,
          high,
          low,
          close,
          volume
        FROM ohlcv_data
        WHERE asset_id = ? AND timeframe = ? AND timestamp < ?
        ORDER BY timestamp ASC
      `);

      const rawData = selectStmt.all(assetId, fromTimeframe, beforeDate.toISOString()) as Array<{
        timestamp: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume: string;
      }>;

      if (rawData.length === 0) {
        return 0;
      }

      // Group data into target timeframe buckets
      const buckets = new Map<string, typeof rawData>();
      const bucketSize = toInterval * 60 * 1000; // Convert to milliseconds

      for (const row of rawData) {
        const timestamp = new Date(row.timestamp).getTime();
        const bucketTime = Math.floor(timestamp / bucketSize) * bucketSize;
        const bucketKey = new Date(bucketTime).toISOString();

        if (!buckets.has(bucketKey)) {
          buckets.set(bucketKey, []);
        }
        buckets.get(bucketKey)!.push(row);
      }

      // Create compressed OHLCV data
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO ohlcv_data 
        (id, asset_id, timeframe, timestamp, open, high, low, close, volume, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let compressedCount = 0;

      for (const [bucketTimestamp, bucketData] of buckets) {
        if (bucketData.length === 0) continue;

        // Calculate OHLCV for the bucket
        const open = bucketData[0]!.open;
        const close = bucketData[bucketData.length - 1]!.close;
        const high = Math.max(...bucketData.map((d) => parseFloat(d.high))).toString();
        const low = Math.min(...bucketData.map((d) => parseFloat(d.low))).toString();
        const volume = bucketData
          .reduce((sum, d) => sum + parseFloat(d.volume), 0)
          .toString();

        const result = insertStmt.run(
          randomUUID(),
          assetId,
          toTimeframe,
          bucketTimestamp,
          open,
          high,
          low,
          close,
          volume,
          `compressed_from_${fromTimeframe}`,
          new Date().toISOString(),
        );

        if (result.changes > 0) {
          compressedCount++;
        }
      }

      // Optionally delete the original data after compression
      // Uncomment the next lines if you want to delete the source data
      // const deleteStmt = this.db.prepare('DELETE FROM ohlcv_data WHERE asset_id = ? AND timeframe = ? AND timestamp < ?');
      // deleteStmt.run(assetId, fromTimeframe, beforeDate.toISOString());

      return compressedCount;
    })();
  }

  /**
   * Get archived data count
   */
  public getArchivedDataCount(): number {
    this.ensureDatabase();

    try {
      const stmt = this.db.prepare('SELECT COUNT(*) as count FROM ohlcv_data_archive');
      const result = stmt.get() as { count: number };
      return result.count;
    } catch {
      // Archive table doesn't exist yet
      return 0;
    }
  }

  /**
   * Get data by ID
   */
  private getById(id: string): OHLCVData | null {
    this.ensureDatabase();

    const stmt = this.db.prepare('SELECT * FROM ohlcv_data WHERE id = ?');
    const row = stmt.get(id) as any;

    return row ? this.mapRowToOHLCV(row) : null;
  }

  /**
   * Count total records with optional filters
   */
  public count(filters?: OHLCVFilters): number {
    this.ensureDatabase();

    let query = 'SELECT COUNT(*) as count FROM ohlcv_data WHERE 1=1';
    const params: any[] = [];

    if (filters?.assetId) {
      query += ' AND asset_id = ?';
      params.push(filters.assetId);
    }

    if (filters?.timeframe) {
      query += ' AND timeframe = ?';
      params.push(filters.timeframe);
    }

    if (filters?.timestampFrom) {
      query += ' AND timestamp >= ?';
      params.push(filters.timestampFrom.toISOString());
    }

    if (filters?.timestampTo) {
      query += ' AND timestamp <= ?';
      params.push(filters.timestampTo.toISOString());
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as { count: number };

    return result.count;
  }

  /**
   * Get aggregated statistics for time series data
   */
  public getStatistics(
    assetId: string,
    timeframe: OHLCVTimeframe,
    from?: Date,
    to?: Date,
  ): {
    count: number;
    avgVolume: number;
    maxHigh: number;
    minLow: number;
    firstOpen: number | null;
    lastClose: number | null;
  } {
    this.ensureDatabase();

    let query = `
      SELECT 
        COUNT(*) as count,
        AVG(CAST(volume AS REAL)) as avg_volume,
        MAX(CAST(high AS REAL)) as max_high,
        MIN(CAST(low AS REAL)) as min_low
      FROM ohlcv_data 
      WHERE asset_id = ? AND timeframe = ?
    `;
    const params: any[] = [assetId, timeframe];

    if (from) {
      query += ' AND timestamp >= ?';
      params.push(from.toISOString());
    }

    if (to) {
      query += ' AND timestamp <= ?';
      params.push(to.toISOString());
    }

    const stmt = this.db.prepare(query);
    const result = stmt.get(...params) as any;

    // Get first and last prices separately
    const firstStmt = this.db.prepare(`
      SELECT open FROM ohlcv_data 
      WHERE asset_id = ? AND timeframe = ? 
      ORDER BY timestamp ASC LIMIT 1
    `);
    const firstResult = firstStmt.get(assetId, timeframe) as any;

    const lastStmt = this.db.prepare(`
      SELECT close FROM ohlcv_data 
      WHERE asset_id = ? AND timeframe = ? 
      ORDER BY timestamp DESC LIMIT 1
    `);
    const lastResult = lastStmt.get(assetId, timeframe) as any;

    return {
      count: result.count || 0,
      avgVolume: result.avg_volume || 0,
      maxHigh: result.max_high || 0,
      minLow: result.min_low || 0,
      firstOpen: firstResult ? parseFloat(firstResult.open) : null,
      lastClose: lastResult ? parseFloat(lastResult.close) : null,
    };
  }

  /**
   * Map database row to OHLCVData object
   */
  private mapRowToOHLCV(row: any): OHLCVData {
    return {
      id: row.id,
      assetId: row.asset_id,
      timeframe: row.timeframe as OHLCVTimeframe,
      timestamp: new Date(row.timestamp),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      source: row.source,
      createdAt: new Date(row.created_at),
    };
  }
}
