// @ts-check

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // Global ignore patterns
  {
    ignores: [
      'node_modules',
      '.turbo',
      '.next',
      'dist',
      'build',
      'coverage',
      '**/prisma/generated/**',
      '**/migrations/**',
    ],
  },

  // Base JavaScript + TypeScript recommended rules
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Type-aware rules — apply only to monorepo packages
  {
    files: ['packages/*/src/**/*.ts', 'packages/*/tests/**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked.map(
        (cfg) => ({ ...cfg, files: undefined }), // remove file filters from individual configs
      ),
    ],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [],
        },
      },
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

  // Node environment for scripts
  {
    files: ['packages/database/scripts/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Test files
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
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
