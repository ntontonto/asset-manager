import { z } from 'zod';

export const PortfolioSnapshotItemSchema = z.object({
  assetId: z.string().uuid(),
  symbol: z.string(),
  assetType: z.string(),
  quantity: z.string(),
  averagePrice: z.string().optional(),
  currentPrice: z.string(),
  marketValue: z.string(),
  costBasis: z.string().optional(),
  unrealizedPnl: z.string().optional(),
  unrealizedPnlPercent: z.string().optional(),
  weight: z.string(), // Allocation percentage
  accounts: z.array(
    z.object({
      accountId: z.string().uuid(),
      accountName: z.string(),
      quantity: z.string(),
      marketValue: z.string(),
    }),
  ),
});

export const PortfolioSnapshotSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.date(),
  totalMarketValue: z.string(),
  totalCostBasis: z.string().optional(),
  totalUnrealizedPnl: z.string().optional(),
  totalUnrealizedPnlPercent: z.string().optional(),
  baseCurrency: z.string().length(3),
  assets: z.array(PortfolioSnapshotItemSchema),
  allocationByType: z.record(z.string()), // asset type -> weight %
  allocationByAccount: z.record(z.string()), // account -> weight %
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

export type PortfolioSnapshotItem = z.infer<typeof PortfolioSnapshotItemSchema>;
export type PortfolioSnapshot = z.infer<typeof PortfolioSnapshotSchema>;

export const CreatePortfolioSnapshotSchema = PortfolioSnapshotSchema.omit({
  id: true,
  createdAt: true,
});

export type CreatePortfolioSnapshot = z.infer<typeof CreatePortfolioSnapshotSchema>;
