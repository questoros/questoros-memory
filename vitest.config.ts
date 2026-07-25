import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@questoros-memory/memory-core': path.resolve(__dirname, 'packages/memory-core/src/index.ts'),
      '@questoros-memory/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
      '@questoros-memory/memory-service': path.resolve(
        __dirname,
        'packages/memory-service/src/index.ts',
      ),
      '@questoros-memory/embedding-provider': path.resolve(
        __dirname,
        'packages/embedding-provider/src/index.ts',
      ),
      '@questoros-memory/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@questoros-memory/harvester-core': path.resolve(
        __dirname,
        'packages/harvester-core/src/index.ts',
      ),
      '@questoros-memory/publisher-core': path.resolve(
        __dirname,
        'packages/publisher-core/src/index.ts',
      ),
      '@questoros-memory/drive-google': path.resolve(
        __dirname,
        'packages/drive-google/src/index.ts',
      ),
      '@questoros-memory/sdk': path.resolve(__dirname, 'packages/sdk-typescript/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'build',
        'coverage',
        '**/migrations/**',
        '**/prisma/generated/**',
        '**/*.config.*',
      ],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 75,
        lines: 75,
      },
    },
  },
});
