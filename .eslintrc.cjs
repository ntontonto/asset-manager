/** ESLint configuration with layered boundaries aligned to the system design */
module.exports = {
  root: true,
  env: {
    es2024: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import', 'unused-imports', 'boundaries'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:prettier/recommended',
  ],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
      typescript: {},
    },
    boundaries: {
      defaultBoundary: 'shared',
      ignore: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
      types: [
        { type: 'shared', pattern: 'src/shared/**' },
        { type: 'ingestion', pattern: 'src/ingestion/**' },
        { type: 'storage', pattern: 'src/storage/**' },
        { type: 'analytics', pattern: 'src/analytics/**' },
        { type: 'portfolio', pattern: 'src/portfolio/**' },
        { type: 'execution', pattern: 'src/execution/**' },
        { type: 'presentation', pattern: 'src/presentation/**' },
        { type: 'security', pattern: 'src/security/**' },
      ],
    },
  },
  rules: {
    'import/order': [
      'warn',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
          'object',
          'type',
        ],
        alphabetize: { order: 'asc', caseInsensitive: true },
        'newlines-between': 'always',
      },
    ],
    'unused-imports/no-unused-imports': 'error',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    'boundaries/no-unknown-files': 'error',
    'boundaries/allowed-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          { from: 'shared', allow: ['shared'] },
          { from: 'ingestion', allow: ['shared', 'storage'] },
          { from: 'storage', allow: ['shared'] },
          { from: 'analytics', allow: ['storage', 'shared'] },
          { from: 'portfolio', allow: ['analytics', 'storage', 'shared'] },
          { from: 'execution', allow: ['portfolio', 'analytics', 'storage', 'shared'] },
          { from: 'presentation', allow: ['portfolio', 'analytics', 'storage', 'shared'] },
          { from: 'security', allow: ['shared'] },
        ],
      },
    ],
  },
  ignorePatterns: ['node_modules', 'dist', 'coverage'],
};
