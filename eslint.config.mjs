// @ts-check

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // Global ignore patterns
  {
    ignores: [
      '**/node_modules/**',
      '**/.turbo/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/prisma/generated/**',
      '**/migrations/**',
    ],
  },

  // Base JavaScript + TypeScript recommended rules
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Type-aware rules — apply only to monorepo package source files
  {
    files: ['packages/*/src/**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked.map((cfg) => ({ ...cfg, files: undefined })),
    ],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [],
        },
      },
    },
  },

  // Prisma client wrapper — generated client types are not available in CI
  // without `prisma generate`, causing false-positive errors.
  {
    files: ['packages/database/src/client.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },

  // Test files — base TS rules only (no type-aware linting)
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Test files use dynamic assertions and loose types
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  // Root-level config files (not type-checked)
  {
    files: ['*.config.mjs', '*.config.ts', 'vitest.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Config files use dynamic imports and Node globals
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // Node environment for scripts and infrastructure code
  {
    files: [
      'packages/database/scripts/**/*.ts',
      'packages/*/scripts/**/*.{js,mjs,cjs,ts}',
      'services/*/scripts/**/*.{js,mjs,cjs,ts}',
      'infra/*/scripts/**/*.{js,mjs,cjs,ts}',
      'infra/*/src/**/*.ts',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // The gated Phase 8 demo deliberately materializes sequential checkpoint
  // variables so a partial run can persist state and still execute exact cleanup.
  {
    files: ['services/mcp-server/scripts/phase8-demo.ts'],
    rules: {
      'no-useless-assignment': 'off',
    },
  },

  // Limit to zero warnings
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-unused-vars': 'off',
    },
  },
);
