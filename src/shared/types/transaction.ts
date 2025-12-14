import { z } from 'zod';

export const TransactionTypeSchema = z.enum([
  'buy',
  'sell',
  'deposit',
  'withdrawal',
  'transfer_in',
  'transfer_out',
  'dividend',
  'interest',
  'fee',
  'split',
  'merger',
  'airdrop',
  'staking_reward',
  'other',
] as const);

export const TransactionStatusSchema = z.enum([
  'pending',
  'completed',
  'failed',
  'cancelled',
] as const);

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  assetId: z.string().uuid(),
  type: TransactionTypeSchema,
  status: TransactionStatusSchema.default('completed'),
  quantity: z.string(), // Amount of asset
  price: z.string().optional(), // Price per unit (null for transfers, deposits, etc.)
  totalValue: z.string().optional(), // Total transaction value
  fee: z.string().optional(), // Transaction fee
  feeCurrency: z.string().length(3).optional(),
  timestamp: z.date(),
  externalId: z.string().optional(), // Exchange/broker transaction ID
  relatedTransactionId: z.string().uuid().optional(), // For transfer pairs
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TransactionType = z.infer<typeof TransactionTypeSchema>;
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;

export const CreateTransactionSchema = TransactionSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateTransaction = z.infer<typeof CreateTransactionSchema>;
