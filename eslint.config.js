import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import boundariesPlugin from 'eslint-plugin-boundaries';
import importPlugin from 'eslint-plugin-import';
import js from '@eslint/js';
import prettierPlugin from 'eslint-plugin-prettier';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';
import globals from 'globals';

const tsRecommendedRules = tsPlugin.configs.recommended?.rules ?? {};
const importRecommendedRules = importPlugin.configs.recommended?.rules ?? {};
const importTypescriptRules = importPlugin.configs.typescript?.rules ?? {};
const prettierRecommendedRules = prettierPlugin.configs.recommended?.rules ?? {};

const baseLanguageOptions = {
  parser: tsParser,
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  globals: {
    ...globals.es2024,
    ...globals.node,
  },
};

const basePlugins = {
  '@typescript-eslint': tsPlugin,
  import: importPlugin,
  'unused-imports': unusedImportsPlugin,
  prettier: prettierPlugin,
};

const baseSettings = {
  'import/resolver': {
    node: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    typescript: {},
  },
};

const baseRules = {
  ...js.configs.recommended.rules,
  ...tsRecommendedRules,
  ...importRecommendedRules,
  ...importTypescriptRules,
  ...prettierRecommendedRules,
  'import/order': [
    'warn',
    {
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
      alphabetize: { order: 'asc', caseInsensitive: true },
      'newlines-between': 'always',
    },
  ],
  'unused-imports/no-unused-imports': 'error',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
};

export default [
  {
    ignores: ['node_modules', 'dist', 'coverage', 'eslint.config.js'],
  },
  {
    ...js.configs.recommended,
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: baseLanguageOptions,
    plugins: { ...basePlugins, boundaries: boundariesPlugin },
    settings: {
      ...baseSettings,
      'boundaries/elements': [
        { type: 'shared', pattern: 'src/shared/**' },
        { type: 'ingestion', pattern: 'src/ingestion/**' },
        { type: 'storage', pattern: 'src/storage/**' },
        { type: 'analytics', pattern: 'src/analytics/**' },
        { type: 'portfolio', pattern: 'src/portfolio/**' },
        { type: 'execution', pattern: 'src/execution/**' },
        { type: 'presentation', pattern: 'src/presentation/**' },
        { type: 'security', pattern: 'src/security/**' },
      ],
      'boundaries/ignore': ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    },
    rules: {
      ...baseRules,
      'boundaries/no-unknown-files': 'error',
      'boundaries/element-types': [
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
  },
  {
    ...js.configs.recommended,
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/**/*'],
    languageOptions: baseLanguageOptions,
    plugins: basePlugins,
    settings: baseSettings,
    rules: baseRules,
  },
];
