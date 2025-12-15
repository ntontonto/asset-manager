import fs from 'node:fs';

import { parse } from 'csv-parse/sync';
import { Decimal } from 'decimal.js';
import iconv from 'iconv-lite';

import type { Asset, Account } from '@/shared/types';
import type { CoreDataStore } from '@/storage';

export type RakutenFileType = 'JP' | 'US' | 'INVST' | 'UNKNOWN';

export interface ProcessResult {
  success: boolean;
  fileType: RakutenFileType;
  recordsProcessed: number;
  assetsCreated: number;
  accountsCreated: number;
  transactionsCreated: number;
  error?: string;
  warnings: string[];
}

interface JPRecord {
  申込日: string;
  受渡日: string;
  銘柄コード: string;
  銘柄名: string;
  市場名: string;
  取引区分: string;
  口座区分: string;
  売買区分: string;
  信用区分: string;
  受渡区分: string;
  数量: string;
  単価: string;
  [key: string]: string;
}

interface USRecord {
  申込日: string;
  受渡日: string;
  ティッカー: string;
  銘柄名: string;
  口座: string;
  取引区分: string;
  売買区分: string;
  信用区分: string;
  受渡区分: string;
  現地通貨: string;
  数量: string;
  単価: string;
  約定金額: string;
  為替レート: string;
  [key: string]: string;
}

interface INVSTRecord {
  申込日: string;
  受渡日: string;
  ファンド名: string;
  分類名: string;
  口座: string;
  売買: string;
  売買方法: string;
  数量: string;
  単価: string;
  申込: string;
  [key: string]: string;
}

export class RakutenDataProcessor {
  private readonly dataStore: CoreDataStore;

  constructor(dataStore: CoreDataStore) {
    this.dataStore = dataStore;
  }

  public detectFileType(filename: string): RakutenFileType {
    if (filename.includes('(JP)')) return 'JP';
    if (filename.includes('(US)')) return 'US';
    if (filename.includes('(INVST)')) return 'INVST';
    return 'UNKNOWN';
  }

  public async processFile(filePath: string): Promise<ProcessResult> {
    const result: ProcessResult = {
      success: false,
      fileType: 'UNKNOWN',
      recordsProcessed: 0,
      assetsCreated: 0,
      accountsCreated: 0,
      transactionsCreated: 0,
      warnings: [],
    };

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        result.error = `File not found: ${filePath}`;
        return result;
      }

      // Detect file type from filename
      const filename = filePath.split('/').pop() || '';
      result.fileType = this.detectFileType(filename);

      if (result.fileType === 'UNKNOWN') {
        result.error = `Unknown file type for: ${filename}`;
        return result;
      }

      // Read and convert encoding from Shift-JIS to UTF-8
      const buffer = fs.readFileSync(filePath);
      const utf8Content = iconv.decode(buffer, 'shift-jis');

      // Parse CSV
      const records = parse(utf8Content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      result.recordsProcessed = records.length;

      // Process based on file type
      switch (result.fileType) {
        case 'JP':
          await this.processJPFile(records as JPRecord[], result);
          break;
        case 'US':
          await this.processUSFile(records as USRecord[], result);
          break;
        case 'INVST':
          await this.processINVSTFile(records as INVSTRecord[], result);
          break;
      }

      result.success = true;
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error occurred';
    }

    return result;
  }

  private async processJPFile(records: JPRecord[], result: ProcessResult): Promise<void> {
    const createdAssets = new Set<string>();
    const createdAccounts = new Set<string>();

    for (const record of records) {
      try {
        // Create or get asset
        const asset = await this.getOrCreateJPAsset(record);
        if (asset && !createdAssets.has(asset.id)) {
          createdAssets.add(asset.id);
          result.assetsCreated++;
        }

        // Create or get account
        const account = await this.getOrCreateJPAccount(record);
        if (account && !createdAccounts.has(account.id)) {
          createdAccounts.add(account.id);
          result.accountsCreated++;
        }

        // Create transaction
        if (asset && account) {
          await this.createJPTransaction(record, asset, account);
          result.transactionsCreated++;
        }
      } catch (error) {
        result.warnings.push(`Failed to process record: ${error}`);
      }
    }
  }

  private async processUSFile(records: USRecord[], result: ProcessResult): Promise<void> {
    const createdAssets = new Set<string>();
    const createdAccounts = new Set<string>();

    for (const record of records) {
      try {
        const asset = await this.getOrCreateUSAsset(record);
        if (asset && !createdAssets.has(asset.id)) {
          createdAssets.add(asset.id);
          result.assetsCreated++;
        }

        const account = await this.getOrCreateUSAccount(record);
        if (account && !createdAccounts.has(account.id)) {
          createdAccounts.add(account.id);
          result.accountsCreated++;
        }

        if (asset && account) {
          await this.createUSTransaction(record, asset, account);
          result.transactionsCreated++;
        }
      } catch (error) {
        result.warnings.push(`Failed to process US record: ${error}`);
      }
    }
  }

  private async processINVSTFile(records: INVSTRecord[], result: ProcessResult): Promise<void> {
    const createdAssets = new Set<string>();
    const createdAccounts = new Set<string>();

    for (const record of records) {
      try {
        const asset = await this.getOrCreateMutualFundAsset(record);
        if (asset && !createdAssets.has(asset.id)) {
          createdAssets.add(asset.id);
          result.assetsCreated++;
        }

        const account = await this.getOrCreateMutualFundAccount(record);
        if (account && !createdAccounts.has(account.id)) {
          createdAccounts.add(account.id);
          result.accountsCreated++;
        }

        if (asset && account) {
          await this.createMutualFundTransaction(record, asset, account);
          result.transactionsCreated++;
        }
      } catch (error) {
        result.warnings.push(`Failed to process INVST record: ${error}`);
      }
    }
  }

  private async getOrCreateJPAsset(record: JPRecord): Promise<Asset | null> {
    const symbol = record.銘柄コード;
    const name = record.銘柄名;

    if (!symbol || !name) return null;

    // Check if asset exists
    const existing = this.dataStore.assets.getBySymbol(symbol);
    if (existing) return existing;

    // Create new asset
    return this.dataStore.assets.create({
      symbol,
      name,
      type: 'stock',
      currency: 'JPY',
      decimals: 0,
      metadata: {
        market: record.市場名,
        source: 'rakuten-jp',
      },
    });
  }

  private async getOrCreateUSAsset(record: USRecord): Promise<Asset | null> {
    const symbol = record.ティッカー;
    const name = record.銘柄名;

    if (!symbol || !name) return null;

    const existing = this.dataStore.assets.getBySymbol(symbol);
    if (existing) return existing;

    return this.dataStore.assets.create({
      symbol,
      name,
      type: 'stock',
      currency: 'USD',
      decimals: 4,
      metadata: {
        source: 'rakuten-us',
      },
    });
  }

  private async getOrCreateMutualFundAsset(record: INVSTRecord): Promise<Asset | null> {
    const name = record.ファンド名;
    if (!name) return null;

    // Use name as symbol for mutual funds since they don't have ticker symbols
    const symbol = this.generateMutualFundSymbol(name);

    const existing = this.dataStore.assets.getBySymbol(symbol);
    if (existing) return existing;

    return this.dataStore.assets.create({
      symbol,
      name,
      type: 'mutual_fund',
      currency: 'JPY',
      decimals: 0,
      metadata: {
        category: record.分類名,
        source: 'rakuten-invst',
      },
    });
  }

  private async getOrCreateJPAccount(record: JPRecord): Promise<Account | null> {
    const accountType = record.口座区分 || '一般口座';
    const accountName = `楽天証券 - ${accountType} (JP)`;

    const existing = this.dataStore.accounts.list().find((acc) => acc.name === accountName);
    if (existing) return existing;

    return this.dataStore.accounts.create({
      name: accountName,
      provider: 'rakuten_securities',
      type: 'brokerage',
      currency: 'JPY',
      metadata: {
        accountType,
        market: 'JP',
      },
    });
  }

  private async getOrCreateUSAccount(record: USRecord): Promise<Account | null> {
    const accountType = record.口座 || '一般口座';
    const accountName = `楽天証券 - ${accountType} (US)`;

    const existing = this.dataStore.accounts.list().find((acc) => acc.name === accountName);
    if (existing) return existing;

    return this.dataStore.accounts.create({
      name: accountName,
      provider: 'rakuten_securities',
      type: 'brokerage',
      currency: 'USD',
      metadata: {
        accountType,
        market: 'US',
      },
    });
  }

  private async getOrCreateMutualFundAccount(record: INVSTRecord): Promise<Account | null> {
    const accountType = record.口座 || '一般口座';
    const accountName = `楽天証券 - ${accountType} (投信)`;

    const existing = this.dataStore.accounts.list().find((acc) => acc.name === accountName);
    if (existing) return existing;

    return this.dataStore.accounts.create({
      name: accountName,
      provider: 'rakuten_securities',
      type: 'brokerage',
      currency: 'JPY',
      metadata: {
        accountType,
        market: 'INVST',
      },
    });
  }

  private async createJPTransaction(
    record: JPRecord,
    asset: Asset,
    account: Account,
  ): Promise<void> {
    const quantity = this.parseDecimal(record.数量);
    const price = this.parseDecimal(record.単価);

    if (quantity.isZero() || price.isZero()) return;

    const transactionType = this.mapJPTransactionType(record.売買区分);
    const timestamp = this.parseJapaneseDate(record.受渡日);

    this.dataStore.transactions.create({
      accountId: account.id,
      assetId: asset.id,
      type: transactionType,
      quantity: quantity.toString(),
      price: price.toString(),
      fees: '0', // JP files don't seem to have separate fee columns
      timestamp,
      metadata: {
        source: 'rakuten-jp',
        originalRecord: {
          申込日: record.申込日,
          取引区分: record.取引区分,
          信用区分: record.信用区分,
        },
      },
    });
  }

  private async createUSTransaction(
    record: USRecord,
    asset: Asset,
    account: Account,
  ): Promise<void> {
    const quantity = this.parseDecimal(record.数量);
    const price = this.parseDecimal(record.単価);

    if (quantity.isZero() || price.isZero()) return;

    const transactionType = this.mapUSTransactionType(record.売買区分);
    const timestamp = this.parseJapaneseDate(record.受渡日);

    this.dataStore.transactions.create({
      accountId: account.id,
      assetId: asset.id,
      type: transactionType,
      quantity: quantity.toString(),
      price: price.toString(),
      fees: '0',
      timestamp,
      metadata: {
        source: 'rakuten-us',
        exchangeRate: record.為替レート,
        originalRecord: {
          申込日: record.申込日,
          現地通貨: record.現地通貨,
        },
      },
    });
  }

  private async createMutualFundTransaction(
    record: INVSTRecord,
    asset: Asset,
    account: Account,
  ): Promise<void> {
    const quantity = this.parseDecimal(record.数量);
    const price = this.parseDecimal(record.単価);

    if (quantity.isZero() || price.isZero()) return;

    const transactionType = this.mapMutualFundTransactionType(record.売買);
    const timestamp = this.parseJapaneseDate(record.受渡日);

    this.dataStore.transactions.create({
      accountId: account.id,
      assetId: asset.id,
      type: transactionType,
      quantity: quantity.toString(),
      price: price.toString(),
      fees: '0',
      timestamp,
      metadata: {
        source: 'rakuten-invst',
        method: record.売買方法,
        originalRecord: {
          申込日: record.申込日,
          分類名: record.分類名,
        },
      },
    });
  }

  private parseDecimal(value: string): Decimal {
    if (!value || value === '-' || value === '') return new Decimal(0);
    // Remove commas and parse
    const cleaned = value.replace(/,/g, '');
    return new Decimal(cleaned);
  }

  private parseJapaneseDate(dateStr: string): Date {
    if (!dateStr) return new Date();

    // Convert YYYY/MM/DD format to ISO date
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    }

    return new Date(dateStr);
  }

  private mapJPTransactionType(type: string): 'buy' | 'sell' | 'deposit' | 'withdraw' | 'transfer' {
    switch (type) {
      case '買付':
      case '買':
        return 'buy';
      case '売付':
      case '売':
        return 'sell';
      default:
        return 'buy'; // Default fallback
    }
  }

  private mapUSTransactionType(type: string): 'buy' | 'sell' | 'deposit' | 'withdraw' | 'transfer' {
    switch (type) {
      case '買':
        return 'buy';
      case '売':
        return 'sell';
      default:
        return 'buy';
    }
  }

  private mapMutualFundTransactionType(
    type: string,
  ): 'buy' | 'sell' | 'deposit' | 'withdraw' | 'transfer' {
    switch (type) {
      case '積立':
      case '買付':
        return 'buy';
      case '売却':
        return 'sell';
      default:
        return 'buy';
    }
  }

  private generateMutualFundSymbol(name: string): string {
    // Create a normalized symbol from fund name
    const normalized = name
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]/g, '')
      .toUpperCase();

    return `MF-${normalized.substring(0, 20)}`;
  }
}
