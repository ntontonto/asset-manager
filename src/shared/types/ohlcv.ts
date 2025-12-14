import { z } from 'zod';

export const TimeframeSchema = z.enum([
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '6h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M',
] as const);

export const OHLCVDataSchema = z.object({
  id: z.string().uuid(),
  assetId: z.string().uuid(),
  timeframe: TimeframeSchema,
  timestamp: z.date(),
  open: z.string(),
  high: z.string(),
  low: z.string(),
  close: z.string(),
  volume: z.string(),
  source: z.string().optional(), // Exchange or data provider
  createdAt: z.date(),
});

export type Timeframe = z.infer<typeof TimeframeSchema>;
export type OHLCVData = z.infer<typeof OHLCVDataSchema>;

export const CreateOHLCVDataSchema = OHLCVDataSchema.omit({
  id: true,
  createdAt: true,
});

export type CreateOHLCVData = z.infer<typeof CreateOHLCVDataSchema>;

// Bulk insert schema for performance
export const BulkCreateOHLCVDataSchema = z.array(CreateOHLCVDataSchema);
export type BulkCreateOHLCVData = z.infer<typeof BulkCreateOHLCVDataSchema>;
