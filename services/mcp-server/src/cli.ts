import { existsSync } from 'node:fs';
import { config } from 'dotenv';
import path from 'path';
import { startMcpServer } from './server.js';

function resolveEnvPath(): string {
  const cwdEnv = path.resolve(process.cwd(), '.env');
  // pnpm --filter runs package scripts with the package directory as cwd.
  const monorepoRootEnv = path.resolve(process.cwd(), '../../.env');
  if (existsSync(cwdEnv)) return cwdEnv;
  if (existsSync(monorepoRootEnv)) return monorepoRootEnv;
  return cwdEnv;
}

async function main() {
  // Load ignored root .env (or package-local .env when present). No secrets in MCP JSON.
  config({ path: resolveEnvPath() });

  const apiKey = process.env.QUESTOROS_MEMORY_API_KEY;
  if (!apiKey) {
    console.error('ERROR: QUESTOROS_MEMORY_API_KEY is not set.');
    console.error(
      'Run the bootstrap script first: pnpm --filter @questoros-memory/database auth:bootstrap-local -- --write-env',
    );
    process.exit(1);
  }

  // Operational logs go to stderr
  console.error('Starting QuestorOS Memory MCP server v0.3.0...');
  console.error('MCP transport: stdio (stdout)');

  await startMcpServer(apiKey);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
