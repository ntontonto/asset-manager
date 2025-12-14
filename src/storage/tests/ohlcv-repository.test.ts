import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { DatabaseConnection } from '../database/connection';
import { AssetRepository } from '../repositories/asset-repository';
import { OHLCVRepository } from '../repositories/ohlcv-repository';

import type { CreateOHLCVRequest } from '@/shared/types';

let assetId: string;
let otherAssetId: string;
const BASE_TIME = new Date('2024-01-01T00:00:00Z');

const minutesFromBase = (minutes: number): Date =>
  new Date(BASE_TIME.getTime() + minutes * 60 * 1000);

const buildRequest = (
  minutesOffset: number,
  overrides: Partial<CreateOHLCVRequest> = {},
): CreateOHLCVRequest => ({
  assetId,
  timeframe: '1h',
  timestamp: minutesFromBase(minutesOffset),
  open: '100',
  high: '110',
  low: '90',
  close: '105',
  volume: '1000',
  source: 'binance',
  ...overrides,
});

const buildMinuteRequest = (
  minutesOffset: number,
  overrides: Partial<CreateOHLCVRequest> = {},
): CreateOHLCVRequest => ({
  assetId,
  timeframe: '1m',
  timestamp: minutesFromBase(minutesOffset),
  open: '10',
  high: '10',
  low: '10',
  close: '10',
  volume: '1',
  source: 'binance',
  ...overrides,
});

describe('OHLCVRepository', () => {
  let repository: OHLCVRepository;
  let dbConnection: DatabaseConnection;
  let assetRepository: AssetRepository;

  beforeEach(async () => {
    dbConnection = new DatabaseConnection({ path: ':memory:', memory: true, readonly: false });
    await dbConnection.connect();
    assetRepository = new AssetRepository();
    assetRepository.setDatabase(dbConnection.getDatabase());
    assetId = assetRepository.create({
      symbol: 'BTC',
      name: 'Bitcoin',
      type: 'crypto',
      currency: 'USD',
      decimals: 8,
    }).id;
    otherAssetId = assetRepository.create({
      symbol: 'ETH',
      name: 'Ethereum',
      type: 'crypto',
      currency: 'USD',
      decimals: 18,
    }).id;
    repository = new OHLCVRepository();
    repository.setDatabase(dbConnection.getDatabase());
  });

  afterEach(() => {
    dbConnection.close();
  });

  it('returns existing record when inserting duplicate timestamp for same asset/timeframe', () => {
    const createRequest = buildRequest(0, { close: '100', volume: '10' });
    const first = repository.create(createRequest);
    const duplicate = repository.create({ ...createRequest, close: '200', volume: '20' });

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.close).toBe('100');
    expect(duplicate.volume).toBe('10');
    expect(repository.count({ assetId, timeframe: '1h' })).toBe(1);
  });

  it('bulkCreate ignores duplicates and returns inserted count', () => {
    const inserted = repository.bulkCreate([
      buildRequest(0),
      buildRequest(60),
      buildRequest(0, { volume: '999' }),
    ]);

    expect(inserted).toBe(2);
    expect(repository.count({ assetId, timeframe: '1h' })).toBe(2);
  });

  it('supports time range filtering and pagination for time series retrieval', () => {
    repository.bulkCreate([
      buildRequest(0, { close: '10' }),
      buildRequest(60, { close: '20' }),
      buildRequest(120, { close: '30' }),
      buildRequest(180, { close: '40' }),
      buildRequest(0, { assetId: otherAssetId, close: '999' }),
    ]);

    const from = minutesFromBase(60);
    const to = minutesFromBase(180);

    const page1 = repository.getTimeSeries(
      { assetId, timeframe: '1h', timestampFrom: from, timestampTo: to },
      { limit: 2, orderBy: 'timestamp_desc' },
    );
    const page2 = repository.getTimeSeries(
      { assetId, timeframe: '1h', timestampFrom: from, timestampTo: to },
      { limit: 2, offset: 2, orderBy: 'timestamp_desc' },
    );

    expect(page1.map((o) => o.close)).toEqual(['40', '30']);
    expect(page2.map((o) => o.close)).toEqual(['20']);

    const latest = repository.getLatest(assetId, '1h');
    const earliest = repository.getEarliest(assetId, '1h');
    expect(latest?.close).toBe('40');
    expect(earliest?.close).toBe('10');
  });

  it('detects gaps between expected intervals', () => {
    repository.bulkCreate([buildRequest(0), buildRequest(60), buildRequest(240)]);

    const gaps = repository.findDataGaps(assetId, '1h', 60);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.from.toISOString()).toBe(minutesFromBase(120).toISOString());
    expect(gaps[0]!.to.toISOString()).toBe(minutesFromBase(180).toISOString());
  });

  it('archives historical data and removes it from primary table', () => {
    repository.bulkCreate([buildRequest(0), buildRequest(60), buildRequest(180)]);

    const result = repository.archiveDataBeforeDate(minutesFromBase(90));

    expect(result.archived).toBe(2);
    expect(result.deleted).toBe(2);
    expect(repository.count({ assetId, timeframe: '1h' })).toBe(1);
    expect(repository.getArchivedDataCount()).toBe(2);
  });

  it('compresses lower timeframe data into a higher timeframe bucket', () => {
    repository.bulkCreate([
      buildMinuteRequest(0, { open: '10', high: '15', low: '9', close: '12', volume: '5' }),
      buildMinuteRequest(1, { open: '12', high: '14', low: '11', close: '13', volume: '3' }),
      buildMinuteRequest(2, { open: '13', high: '16', low: '12', close: '14', volume: '2' }),
    ]);

    const compressed = repository.compressDataToTimeframe(assetId, '1m', '1h', minutesFromBase(60));

    expect(compressed).toBe(1);

    const hourly = repository.getTimeSeries({ assetId, timeframe: '1h' });
    expect(hourly).toHaveLength(1);
    expect(hourly[0]).toMatchObject({
      timestamp: minutesFromBase(0),
      open: '10',
      high: '16',
      low: '9',
      close: '14',
      volume: '10',
      source: 'compressed_from_1m',
    });
  });

  it('calculates statistics within the specified date range', () => {
    repository.bulkCreate([
      buildRequest(0, { open: '10', high: '15', low: '9', close: '11', volume: '100' }),
      buildRequest(60, { open: '20', high: '25', low: '19', close: '21', volume: '200' }),
      buildRequest(120, { open: '30', high: '35', low: '29', close: '31', volume: '300' }),
      buildRequest(180, { open: '40', high: '45', low: '39', close: '41', volume: '400' }),
    ]);

    const stats = repository.getStatistics(
      assetId,
      '1h',
      minutesFromBase(60),
      minutesFromBase(150),
    );

    expect(stats.count).toBe(2);
    expect(stats.avgVolume).toBeCloseTo(250);
    expect(stats.maxHigh).toBe(35);
    expect(stats.minLow).toBe(19);
    expect(stats.firstOpen).toBe(20);
    expect(stats.lastClose).toBe(31);
  });
});
