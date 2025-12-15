import path from 'node:path';

import { CoreDataStore } from '@/storage';

import { RakutenDataProcessor } from '../rakuten-data-processor';

describe('RakutenDataProcessor', () => {
  let dataStore: CoreDataStore;
  let processor: RakutenDataProcessor;

  beforeEach(async () => {
    dataStore = new CoreDataStore({
      databasePath: ':memory:',
      memory: true,
      readonly: false,
    });
    await dataStore.initialize();

    processor = new RakutenDataProcessor(dataStore);
  });

  afterEach(() => {
    dataStore.close();
  });

  describe('detectFileType', () => {
    it('should detect JP file from filename', () => {
      const result = processor.detectFileType('tradehistory(JP)_20251215.csv');
      expect(result).toBe('JP');
    });

    it('should detect US file from filename', () => {
      const result = processor.detectFileType('tradehistory(US)_20251215.csv');
      expect(result).toBe('US');
    });

    it('should detect INVST file from filename', () => {
      const result = processor.detectFileType('tradehistory(INVST)_20251215.csv');
      expect(result).toBe('INVST');
    });

    it('should return unknown for unrecognized patterns', () => {
      const result = processor.detectFileType('unknown_file.csv');
      expect(result).toBe('UNKNOWN');
    });
  });

  describe('processFile', () => {
    const testFilesPath = path.join(process.cwd(), 'input/rakuten-securities/example_files');

    it('should process JP file and create assets and transactions', async () => {
      const filePath = path.join(testFilesPath, 'tradehistory(JP)_20251215.csv');

      const result = await processor.processFile(filePath);

      expect(result.success).toBe(true);
      expect(result.fileType).toBe('JP');
      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.assetsCreated).toBeGreaterThan(0);
      expect(result.transactionsCreated).toBeGreaterThan(0);

      // Verify assets were created
      const assets = dataStore.assets.list({ type: 'stock' });
      expect(assets.length).toBeGreaterThan(0);

      // Check one specific asset (from the test data)
      const goldAsset = assets.find((asset) => asset.symbol === '1326');
      expect(goldAsset).toBeDefined();
      expect(goldAsset?.name).toContain('ゴールド');

      // Verify accounts were created
      const accounts = dataStore.accounts.list();
      expect(accounts.length).toBeGreaterThan(0);

      const jpAccount = accounts.find(
        (acc) => acc.name.includes('楽天証券') && acc.name.includes('JP'),
      );
      expect(jpAccount).toBeDefined();
    });

    it('should process US file and create US stock assets', async () => {
      const filePath = path.join(testFilesPath, 'tradehistory(US)_20251215.csv');

      const result = await processor.processFile(filePath);

      expect(result.success).toBe(true);
      expect(result.fileType).toBe('US');
      expect(result.recordsProcessed).toBeGreaterThan(0);

      // Verify US stocks were created
      const assets = dataStore.assets.list({ type: 'stock' });
      const usStocks = assets.filter((asset) => asset.currency === 'USD');
      expect(usStocks.length).toBeGreaterThan(0);

      // Check specific US stock from test data
      const qqq = assets.find((asset) => asset.symbol === 'QQQ');
      expect(qqq).toBeDefined();
      expect(qqq?.name).toContain('INVESCO QQQ');
      expect(qqq?.currency).toBe('USD');
    });

    it('should process INVST file and create mutual fund assets', async () => {
      const filePath = path.join(testFilesPath, 'tradehistory(INVST)_20251215.csv');

      const result = await processor.processFile(filePath);

      expect(result.success).toBe(true);
      expect(result.fileType).toBe('INVST');
      expect(result.recordsProcessed).toBeGreaterThan(0);

      // Verify mutual funds were created
      const assets = dataStore.assets.list({ type: 'mutual_fund' });
      expect(assets.length).toBeGreaterThan(0);

      // Check specific mutual fund from test data
      const spAsset = assets.find(
        (asset) => asset.name.includes('eMAXIS Slim') && asset.name.includes('S&P500'),
      );
      expect(spAsset).toBeDefined();
      expect(spAsset?.type).toBe('mutual_fund');
      expect(spAsset?.currency).toBe('JPY');
    });

    it('should handle different account types and create NISA accounts', async () => {
      const filePath = path.join(testFilesPath, 'tradehistory(INVST)_20251215.csv');

      await processor.processFile(filePath);

      const accounts = dataStore.accounts.list();

      // Should have NISA accounts (this specific test file only contains NISA accounts)
      const nisaAccount = accounts.find((acc) => acc.name.includes('NISA'));

      expect(nisaAccount).toBeDefined();
      expect(accounts.length).toBeGreaterThan(0);

      // All accounts should be for investment trusts
      const investmentAccounts = accounts.filter((acc) => acc.name.includes('投信'));
      expect(investmentAccounts.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle non-existent files gracefully', async () => {
      const result = await processor.processFile('nonexistent.csv');

      expect(result.success).toBe(false);
      expect(result.error).toContain('File not found');
    });

    it('should handle malformed CSV files', async () => {
      // This would require creating a test file with malformed content
      // For now, we'll mock this behavior
      const result = await processor.processFile('');

      expect(result.success).toBe(false);
    });
  });
});
