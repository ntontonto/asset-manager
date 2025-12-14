import { z } from 'zod';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Parse and validate data using a Zod schema
 * Throws ValidationError if validation fails
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError('Data validation failed', result.error.issues);
  }

  return result.data;
}

/**
 * Safely parse data without throwing errors
 * Returns null if validation fails
 */
export function safeParseData<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}
