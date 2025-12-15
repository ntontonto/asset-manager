import { randomUUID } from 'node:crypto';

import { Decimal } from 'decimal.js';

import type { PortfolioSnapshot } from '@/shared/types';
import type { CoreDataStore } from '@/storage';

export class PortfolioSnapshotBuilder {
  constructor(private readonly dataStore: CoreDataStore) {}

  public async buildSnapshot(asOfDate?: Date): Promise<PortfolioSnapshot> {
    const timestamp = asOfDate || new Date();

    // Get all positions from all accounts
    const positions = this.dataStore.positions.list();

    if (positions.length === 0) {
      return this.createEmptySnapshot(timestamp);
    }

    // Get all assets and accounts for position data
    const assets = this.dataStore.assets.list();
    const accounts = this.dataStore.accounts.list();

    // Create maps for quick lookup
    const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    // Group positions by asset
    const positionsByAsset = this.groupPositionsByAsset(positions);

    // Calculate snapshot items for each asset
    const snapshotAssets = [];
    let totalMarketValue = new Decimal(0);

    for (const [assetId, assetPositions] of positionsByAsset.entries()) {
      const asset = assetMap.get(assetId);
      if (!asset) continue;

      // Get current price for this asset
      const currentPrice = await this.getCurrentPrice(asset.symbol);
      const priceDecimal = new Decimal(currentPrice);

      // Calculate total quantity and market value
      const totalQuantity = assetPositions.reduce(
        (sum, pos) => sum.plus(pos.quantity),
        new Decimal(0),
      );

      const assetMarketValue = totalQuantity.mul(priceDecimal);
      totalMarketValue = totalMarketValue.plus(assetMarketValue);

      // Create account breakdown
      const accountBreakdown = assetPositions.map((position) => {
        const account = accountMap.get(position.accountId);
        const positionValue = new Decimal(position.quantity).mul(priceDecimal);

        return {
          accountId: position.accountId,
          accountName: account?.name || 'Unknown Account',
          quantity: this.formatQuantity(new Decimal(position.quantity), asset.decimals || 8),
          marketValue: positionValue.toFixed(2),
        };
      });

      snapshotAssets.push({
        assetId: asset.id,
        symbol: asset.symbol,
        assetType: asset.type,
        quantity: this.formatQuantity(totalQuantity, asset.decimals || 8),
        currentPrice: currentPrice,
        marketValue: assetMarketValue.toFixed(2),
        weight: '0', // Will be calculated after total is known
        accounts: accountBreakdown,
      });
    }

    // Calculate weights now that we have total market value
    const totalMarketValueStr = totalMarketValue.toFixed(2);

    for (const assetItem of snapshotAssets) {
      const weight = totalMarketValue.isZero()
        ? new Decimal(0)
        : new Decimal(assetItem.marketValue).div(totalMarketValue).mul(100);

      assetItem.weight = weight.toFixed(2);
    }

    // Calculate allocation by type
    const allocationByType: Record<string, string> = {};
    for (const assetItem of snapshotAssets) {
      const currentTypeAllocation = new Decimal(allocationByType[assetItem.assetType] || 0);
      const assetWeight = new Decimal(assetItem.weight);
      allocationByType[assetItem.assetType] = currentTypeAllocation.plus(assetWeight).toFixed(2);
    }

    // Calculate allocation by account
    const allocationByAccount: Record<string, string> = {};
    for (const assetItem of snapshotAssets) {
      for (const accountBreakdown of assetItem.accounts) {
        const currentAccountAllocation = new Decimal(
          allocationByAccount[accountBreakdown.accountId] || 0,
        );
        const accountValue = new Decimal(accountBreakdown.marketValue);
        const accountWeight = totalMarketValue.isZero()
          ? new Decimal(0)
          : accountValue.div(totalMarketValue).mul(100);

        allocationByAccount[accountBreakdown.accountId] = currentAccountAllocation
          .plus(accountWeight)
          .toFixed(2);
      }
    }

    return {
      id: randomUUID(),
      timestamp,
      totalMarketValue: totalMarketValueStr,
      baseCurrency: 'USD',
      assets: snapshotAssets,
      allocationByType,
      allocationByAccount,
      createdAt: new Date(),
    };
  }

  private createEmptySnapshot(timestamp: Date): PortfolioSnapshot {
    return {
      id: randomUUID(),
      timestamp,
      totalMarketValue: '0',
      baseCurrency: 'USD',
      assets: [],
      allocationByType: {},
      allocationByAccount: {},
      createdAt: new Date(),
    };
  }

  private groupPositionsByAsset(positions: any[]) {
    const grouped = new Map();

    for (const position of positions) {
      const existing = grouped.get(position.assetId) || [];
      existing.push(position);
      grouped.set(position.assetId, existing);
    }

    return grouped;
  }

  private async getCurrentPrice(symbol: string): Promise<string> {
    // This is a mock implementation for testing
    // In real implementation, this would fetch from market data
    throw new Error('getCurrentPrice not implemented - should be mocked in tests');
  }

  private formatQuantity(decimal: Decimal, maxDecimals: number): string {
    // Remove trailing zeros and format nicely
    const fixed = decimal.toFixed();
    const number = parseFloat(fixed);

    // If the number is a whole number, return it as is
    if (number % 1 === 0) {
      return number.toString();
    }

    // Otherwise, remove trailing zeros but respect maxDecimals
    return parseFloat(decimal.toFixed(maxDecimals)).toString();
  }
}
