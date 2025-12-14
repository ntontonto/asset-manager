/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/ingestion/(.*)$': '<rootDir>/src/ingestion/$1',
    '^@/storage/(.*)$': '<rootDir>/src/storage/$1',
    '^@/analytics/(.*)$': '<rootDir>/src/analytics/$1',
    '^@/portfolio/(.*)$': '<rootDir>/src/portfolio/$1',
    '^@/presentation/(.*)$': '<rootDir>/src/presentation/$1',
    '^@/execution/(.*)$': '<rootDir>/src/execution/$1',
    '^@/security/(.*)$': '<rootDir>/src/security/$1',
  },
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
