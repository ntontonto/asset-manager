import { z } from 'zod';

export const PositionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  assetId: z.string().uuid(),
  quantity: z.string(), // Use string to avoid precision issues with decimals
  averagePrice: z.string().optional(), // Cost basis per unit
  lastPrice: z.string().optional(), // Current market price
  lastUpdated: z.date(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Position = z.infer<typeof PositionSchema>;

export const CreatePositionSchema = PositionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreatePosition = z.infer<typeof CreatePositionSchema>;

export const UpdatePositionSchema = PositionSchema.partial().extend({
  id: z.string().uuid(),
  updatedAt: z.date(),
});

export type UpdatePosition = z.infer<typeof UpdatePositionSchema>;

// Request types for API
export const UpdatePositionRequestSchema = PositionSchema.partial().omit({
  id: true,
  accountId: true,
  assetId: true,
  createdAt: true,
  updatedAt: true,
});

export type UpdatePositionRequest = z.infer<typeof UpdatePositionRequestSchema>;
