/**
 * Cockroach + Prisma migrate-diff gate.
 *
 * Prisma PSL cannot represent Cockroach vector/cspann indexes. Against a live
 * DATABASE_URL, migrate diff therefore always proposes dropping
 * memory_embeddings_scope_cosine_idx even when schema, migrations, and
 * db:verify agree. This script runs the required from-url drift comparison and
 * fails on any residual other than that known vector-index drop.
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = path.join(root, 'prisma', 'schema.prisma');

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is required for drift check.');
  process.exit(1);
}

const result = spawnSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  [
    'exec',
    'prisma',
    'migrate',
    'diff',
    '--from-url',
    process.env.DATABASE_URL,
    '--to-schema-datamodel',
    schema,
    '--script',
  ],
  {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    shell: process.platform === 'win32',
  },
);

// Fail closed when Prisma did not execute successfully. Do not inspect stdout
// as a successful drift result after a spawn, connection, or command failure.
// Avoid echoing stderr because provider errors can contain environment details.
if (result.error || result.signal || result.status !== 0) {
  console.error('Prisma drift command failed to execute successfully.');
  process.exit(1);
}

const script = `${result.stdout ?? ''}`;
const lines = script
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('--'));

const allowed = new Set([
  'DROP INDEX "memory_embeddings_scope_cosine_idx";',
  'DROP INDEX IF EXISTS "memory_embeddings_scope_cosine_idx";',
]);

const unexpected = lines.filter((line) => !allowed.has(line));

if (unexpected.length > 0) {
  console.error('Prisma drift check FAILED. Unexpected statements:');
  for (const line of unexpected) {
    console.error(`  ${line}`);
  }
  process.exit(2);
}

if (lines.length === 0) {
  console.log('Prisma drift check: no drift (exit 0).');
} else {
  console.log(
    'Prisma drift check: no application drift (sole residual is unsupported Cockroach vector index memory_embeddings_scope_cosine_idx).',
  );
}
process.exit(0);
