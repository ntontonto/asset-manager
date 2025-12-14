import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { DatabaseConfig } from './connection';

export const DEFAULT_DB_DIR = join(homedir(), '.asset-manager');
export const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'asset-manager.db');

/**
 * Get default database configuration
 */
export function getDefaultDatabaseConfig(): DatabaseConfig {
  // Ensure database directory exists
  try {
    mkdirSync(DEFAULT_DB_DIR, { recursive: true });
  } catch {
    // Directory might already exist, which is fine
  }

  return {
    path: DEFAULT_DB_PATH,
    readonly: false,
    memory: false,
  };
}

/**
 * Get test database configuration (in-memory)
 */
export function getTestDatabaseConfig(): DatabaseConfig {
  return {
    path: ':memory:',
    readonly: false,
    memory: true,
  };
}

/**
 * Get database configuration from environment variables
 */
export function getDatabaseConfigFromEnv(): DatabaseConfig {
  const dbPath = process.env['ASSET_MANAGER_DB_PATH'] || DEFAULT_DB_PATH;
  const readonly = process.env['ASSET_MANAGER_DB_READONLY'] === 'true';
  const memory = process.env['ASSET_MANAGER_DB_MEMORY'] === 'true';

  return {
    path: memory ? ':memory:' : dbPath,
    readonly,
    memory,
  };
}
