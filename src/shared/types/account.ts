import { z } from 'zod';

export const AccountProviderSchema = z.enum([
  'binance',
  'coinbase',
  'kraken',
  'bitflyer',
  'sbi_securities',
  'rakuten_securities',
  'matsui_securities',
  'metamask',
  'hardware_wallet',
  'manual',
  'other',
] as const);

export const AccountTypeSchema = z.enum([
  'exchange',
  'wallet',
  'brokerage',
  'bank',
  'manual',
] as const);

export const AccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  provider: AccountProviderSchema,
  type: AccountTypeSchema,
  currency: z.string().length(3), // Base currency for the account
  isActive: z.boolean().default(true),
  apiCredentials: z
    .object({
      encrypted: z.boolean(),
      keyId: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type AccountProvider = z.infer<typeof AccountProviderSchema>;
export type AccountType = z.infer<typeof AccountTypeSchema>;
export type Account = z.infer<typeof AccountSchema>;

export const CreateAccountSchema = AccountSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateAccount = z.infer<typeof CreateAccountSchema>;

// Request types for API
export type CreateAccountRequest = CreateAccount;

export const UpdateAccountSchema = AccountSchema.partial().omit({
  id: true,
  createdAt: true,
});

export type UpdateAccountRequest = z.infer<typeof UpdateAccountSchema>;
