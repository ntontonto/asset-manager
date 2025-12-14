import { z } from 'zod';

export const AssetTypeSchema = z.enum([
  'crypto',
  'stock',
  'etf',
  'mutual_fund',
  'bond',
  'commodity',
  'cash',
  'fx',
] as const);

export const AssetSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string().min(1),
  name: z.string().min(1),
  type: AssetTypeSchema,
  currency: z.string().length(3), // ISO 4217 (USD, JPY, BTC, etc.)
  decimals: z.number().int().min(0).max(18),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AssetType = z.infer<typeof AssetTypeSchema>;
export type Asset = z.infer<typeof AssetSchema>;

// Asset creation input (without auto-generated fields)
export const CreateAssetSchema = AssetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateAsset = z.infer<typeof CreateAssetSchema>;
